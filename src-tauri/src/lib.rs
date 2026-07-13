use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::ipc::Response;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const MAX_MODEL_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct Vec3 {
    x: f32,
    y: f32,
    z: f32,
}
impl From<[f32; 3]> for Vec3 {
    fn from(v: [f32; 3]) -> Self {
        Self {
            x: v[0],
            y: v[1],
            z: v[2],
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BoundingBox {
    min: Vec3,
    max: Vec3,
    size: Vec3,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Confidence {
    bed_contact: f32,
    overhang: f32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrientationCandidate {
    id: String,
    label: String,
    height_mm: f32,
    bed_contact_area_mm2: f32,
    overhang_ratio: f32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeModelAnalysis {
    file_name: String,
    triangle_count: usize,
    bounding_box: BoundingBox,
    height_mm: f32,
    bed_contact_area_mm2: f32,
    overhang_area_mm2: f32,
    overhang_ratio: f32,
    confidence: Confidence,
    orientations: Vec<OrientationCandidate>,
    orientation_label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SlicerAdapterStatus {
    target: String,
    label: String,
    available: bool,
    executable_path: Option<String>,
    capability: String,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManufacturingPackageResult {
    path: String,
    target: String,
    validated: bool,
    applied_settings: Vec<String>,
    warnings: Vec<String>,
}
#[derive(Deserialize)]
struct RecommendationInput {
    setting: String,
    value: Value,
}

fn validate_model_path(path: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("Cannot access model: {e}"))?;
    let ext = canonical
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "stl" {
        return Err("Check Make Desktop MVP currently accepts STL files only.".into());
    }
    let size = fs::metadata(&canonical).map_err(|e| e.to_string())?.len();
    if size > MAX_MODEL_BYTES {
        return Err("The model exceeds the 100 MB Desktop MVP limit.".into());
    }
    Ok(canonical)
}
fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn transform(v: [f32; 3], kind: usize) -> [f32; 3] {
    match kind {
        0 => v,
        1 => [v[0], -v[1], -v[2]],
        2 => [v[2], v[1], -v[0]],
        3 => [-v[2], v[1], v[0]],
        4 => [v[0], v[2], -v[1]],
        _ => [v[0], -v[2], v[1]],
    }
}
fn orientation_kind(id: &str) -> usize {
    match id {
        "flip-z" => 1,
        "right-side" => 2,
        "left-side" => 3,
        "front-side" => 4,
        "back-side" => 5,
        _ => 0,
    }
}
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn analyze_path(path: &Path) -> Result<NativeModelAnalysis, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mesh =
        stl_io::read_stl(&mut BufReader::new(file)).map_err(|e| format!("Invalid STL: {e}"))?;
    if mesh.vertices.is_empty() || mesh.faces.is_empty() {
        return Err("The STL contains no printable triangles.".into());
    }
    let labels = [
        "As imported",
        "Flip upside down",
        "Place right side down",
        "Place left side down",
        "Place front side down",
        "Place back side down",
    ];
    let ids = [
        "as-imported",
        "flip-z",
        "right-side",
        "left-side",
        "front-side",
        "back-side",
    ];
    let mut candidates = Vec::new();
    let mut imported_area = 0.0;
    let mut imported_overhang = 0.0;
    let mut imported_contact = 0.0;
    for kind in 0..6 {
        let transformed: Vec<[f32; 3]> = mesh
            .vertices
            .iter()
            .map(|v| transform([v[0], v[1], v[2]], kind))
            .collect();
        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];
        for v in &transformed {
            for axis in 0..3 {
                min[axis] = min[axis].min(v[axis]);
                max[axis] = max[axis].max(v[axis])
            }
        }
        let height = max[2] - min[2];
        let epsilon = (height * 0.002).max(0.05);
        let mut total = 0.0;
        let mut overhang = 0.0;
        let mut contact = 0.0;
        for face in &mesh.faces {
            let a = transformed[face.vertices[0]];
            let b = transformed[face.vertices[1]];
            let c = transformed[face.vertices[2]];
            let n = cross(sub(b, a), sub(c, a));
            let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
            if len == 0.0 {
                continue;
            }
            let area = len / 2.0;
            let nz = n[2] / len;
            total += area;
            if nz < -std::f32::consts::FRAC_1_SQRT_2 {
                overhang += area
            }
            if a[2].max(b[2]).max(c[2]) <= min[2] + epsilon && nz.abs() > 0.9 {
                contact += area
            }
        }
        if kind == 0 {
            imported_area = total;
            imported_overhang = overhang;
            imported_contact = contact
        }
        candidates.push(OrientationCandidate {
            id: ids[kind].into(),
            label: labels[kind].into(),
            height_mm: height,
            bed_contact_area_mm2: contact,
            overhang_ratio: if total > 0.0 { overhang / total } else { 0.0 },
        })
    }
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for v in &mesh.vertices {
        for axis in 0..3 {
            min[axis] = min[axis].min(v[axis]);
            max[axis] = max[axis].max(v[axis])
        }
    }
    let size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    Ok(NativeModelAnalysis {
        file_name: path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("model.stl")
            .into(),
        triangle_count: mesh.faces.len(),
        bounding_box: BoundingBox {
            min: min.into(),
            max: max.into(),
            size: size.into(),
        },
        height_mm: size[2],
        bed_contact_area_mm2: imported_contact,
        overhang_area_mm2: imported_overhang,
        overhang_ratio: if imported_area > 0.0 {
            imported_overhang / imported_area
        } else {
            0.0
        },
        confidence: Confidence {
            bed_contact: 0.65,
            overhang: 0.78,
        },
        orientations: candidates,
        orientation_label: "As imported".into(),
    })
}

#[tauri::command]
fn pick_model_path() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("3D model", &["stl"])
        .pick_file()
        .map(|p| p.to_string_lossy().into_owned())
}
#[tauri::command]
fn read_model_bytes(path: String) -> Result<Response, String> {
    let path = validate_model_path(&path)?;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}
#[tauri::command]
fn analyze_stl_native(path: String) -> Result<NativeModelAnalysis, String> {
    let path = validate_model_path(&path)?;
    analyze_path(&path)
}
#[tauri::command]
async fn analyze_model_with_openai(
    api_key: String,
    model: String,
    context: String,
    preview_image: Option<String>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("An OpenAI API key is required.".into());
    }
    let prompt = format!(
        r#"You are Check Make's 3D-print engineering analyst. Identify what the model is likely to be and how it is likely used from the rendered view and deterministic mesh measurements. Never claim certainty that the evidence does not support. Ask zero to three concise follow-up questions only when their answers could materially change material, orientation, strength, fit, support, or surface recommendations.

Return ONLY one JSON object with exactly these fields:
objectName (string), likelyPurpose (string), confidence (0..1 number), evidence (string array), assumptions (string array), questions (array of objects with id, question, why), environment (indoor|outdoor), load (none|static|cyclic), impact (none|medium|high), heat (normal|warm|hot), priority (strength|accuracy|finish|speed|flexibility), supportsAllowed (boolean), materialHint (PLA|PETG|ASA|TPU|PA-CF).

Mesh context and any prior user answers:
{}"#,
        context
    );
    let mut content = vec![json!({"type":"input_text","text":prompt})];
    if let Some(image) = preview_image.filter(|v| v.starts_with("data:image/")) {
        content.push(json!({"type":"input_image","image_url":image,"detail":"high"}))
    }
    let body = json!({"model":model,"input":[{"role":"user","content":content}],"store":false});
    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach OpenAI: {e}"))?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|e| format!("Invalid OpenAI response: {e}"))?;
    if !status.is_success() {
        return Err(value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("OpenAI analysis failed.")
            .to_string());
    }
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Ok(text.to_string());
    }
    value
        .get("output")
        .and_then(Value::as_array)
        .and_then(|items| {
            items.iter().find_map(|item| {
                item.get("content")
                    .and_then(Value::as_array)
                    .and_then(|parts| {
                        parts
                            .iter()
                            .find_map(|part| part.get("text").and_then(Value::as_str))
                    })
            })
        })
        .map(str::to_string)
        .ok_or_else(|| "OpenAI returned no analysis text.".into())
}

fn write_3mf(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
) -> Result<usize, String> {
    let mesh = stl_io::read_stl(&mut BufReader::new(
        File::open(source).map_err(|e| e.to_string())?,
    ))
    .map_err(|e| format!("Invalid STL: {e}"))?;
    let kind = orientation_kind(orientation_id);
    let mut vertices: Vec<[f32; 3]> = mesh
        .vertices
        .iter()
        .map(|v| transform([v[0], v[1], v[2]], kind))
        .collect();
    let mut min = [f32::INFINITY; 3];
    for v in &vertices {
        for axis in 0..3 {
            min[axis] = min[axis].min(v[axis])
        }
    }
    for v in &mut vertices {
        for axis in 0..3 {
            v[axis] -= min[axis]
        }
    }
    let valid_faces: Vec<_> = mesh
        .faces
        .iter()
        .filter(|face| {
            let a = vertices[face.vertices[0]];
            let b = vertices[face.vertices[1]];
            let c = vertices[face.vertices[2]];
            let n = cross(sub(b, a), sub(c, a));
            n[0] * n[0] + n[1] * n[1] + n[2] * n[2] > 1e-12
        })
        .collect();
    let removed = mesh.faces.len() - valid_faces.len();
    let title = xml_escape(
        source
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or("Check Make model"),
    );
    let metadata = xml_escape(metadata_json);
    let mut model_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Title">{title}</metadata>
 <metadata name="Application">Check Make 0.2.0</metadata>
 <metadata name="checkmake:analysis">{metadata}</metadata>
 <metadata name="checkmake:orientation">{}</metadata>
 <metadata name="checkmake:degenerate-triangles-removed">{removed}</metadata>
 <resources><object id="1" type="model"><mesh><vertices>
"#,
        xml_escape(orientation_id)
    );
    for v in &vertices {
        model_xml.push_str(&format!(
            "<vertex x=\"{}\" y=\"{}\" z=\"{}\"/>\n",
            v[0], v[1], v[2]
        ))
    }
    model_xml.push_str("</vertices><triangles>\n");
    for face in valid_faces {
        model_xml.push_str(&format!(
            "<triangle v1=\"{}\" v2=\"{}\" v3=\"{}\"/>\n",
            face.vertices[0], face.vertices[1], face.vertices[2]
        ))
    }
    model_xml.push_str(
        "</triangles></mesh></object></resources><build><item objectid=\"1\"/></build></model>",
    );
    let content_types = r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>"#;
    let rels = r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>"#;
    let file = File::create(target).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("[Content_Types].xml", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(content_types.as_bytes())
        .map_err(|e| e.to_string())?;
    zip.start_file("_rels/.rels", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(rels.as_bytes()).map_err(|e| e.to_string())?;
    zip.start_file("3D/3dmodel.model", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(model_xml.as_bytes())
        .map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(removed)
}

fn executable_candidates(target: &str) -> Vec<PathBuf> {
    match target {
        "bambu" => vec![
            PathBuf::from("/Applications/BambuStudio.app/Contents/MacOS/BambuStudio"),
            PathBuf::from(r"C:\Program Files\Bambu Studio\bambu-studio.exe"),
        ],
        "orca" => vec![
            PathBuf::from("/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer"),
            PathBuf::from(r"C:\Program Files\OrcaSlicer\orca-slicer.exe"),
        ],
        "prusa" => vec![
            PathBuf::from("/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer"),
            PathBuf::from(r"C:\Program Files\Prusa3D\PrusaSlicer\prusa-slicer-console.exe"),
        ],
        "cura" => vec![
            PathBuf::from("/Applications/UltiMaker Cura.app/Contents/MacOS/UltiMaker-Cura"),
            PathBuf::from(r"C:\Program Files\UltiMaker Cura\UltiMaker-Cura.exe"),
        ],
        _ => Vec::new(),
    }
}
fn find_executable(target: &str) -> Option<PathBuf> {
    executable_candidates(target)
        .into_iter()
        .find(|path| path.is_file())
}
#[tauri::command]
fn detect_slicer_adapters() -> Vec<SlicerAdapterStatus> {
    let mut adapters = vec![SlicerAdapterStatus {
        target: "generic".into(),
        label: "Generic Core 3MF".into(),
        available: true,
        executable_path: None,
        capability: "core-3mf".into(),
        detail:
            "Portable corrected mesh and Check Make metadata; process settings remain advisory."
                .into(),
    }];
    for (target, label) in [
        ("bambu", "Bambu Studio"),
        ("orca", "OrcaSlicer"),
        ("prusa", "PrusaSlicer"),
        ("cura", "UltiMaker Cura"),
    ] {
        let executable = find_executable(target);
        let available = executable.is_some();
        let (capability, detail) = if target == "bambu" && available {
            (
                "project-3mf",
                "Installed. Check Make can create and validate a Bambu Studio project 3MF.",
            )
        } else if available {
            (
                "planned",
                "Installed, but this project adapter is not implemented yet.",
            )
        } else {
            (
                "planned",
                "Not detected. This project adapter is not available yet.",
            )
        };
        adapters.push(SlicerAdapterStatus {
            target: target.into(),
            label: label.into(),
            available: target == "bambu" && available,
            executable_path: executable.map(|path| path.to_string_lossy().into_owned()),
            capability: capability.into(),
            detail: detail.into(),
        });
    }
    adapters
}

fn merge_json(base: &mut Value, overlay: &Value) {
    match (base, overlay) {
        (Value::Object(base), Value::Object(overlay)) => {
            for (key, value) in overlay {
                base.insert(key.clone(), value.clone());
            }
        }
        (base, overlay) => *base = overlay.clone(),
    }
}
fn resolve_profile(
    dir: &Path,
    name: &str,
    visiting: &mut HashSet<String>,
) -> Result<Value, String> {
    if !visiting.insert(name.to_string()) {
        return Err(format!("Circular Bambu profile dependency: {name}"));
    }
    let path = dir.join(format!("{name}.json"));
    let child: Value = serde_json::from_reader(BufReader::new(
        File::open(&path)
            .map_err(|e| format!("Cannot open Bambu profile {}: {e}", path.display()))?,
    ))
    .map_err(|e| format!("Invalid Bambu profile {}: {e}", path.display()))?;
    let mut result = json!({});
    if let Some(parent) = child.get("inherits").and_then(Value::as_str) {
        merge_json(&mut result, &resolve_profile(dir, parent, visiting)?)
    }
    if let Some(includes) = child.get("include").and_then(Value::as_array) {
        for include in includes.iter().filter_map(Value::as_str) {
            merge_json(&mut result, &resolve_profile(dir, include, visiting)?);
        }
    }
    merge_json(&mut result, &child);
    if let Some(object) = result.as_object_mut() {
        object.remove("inherits");
        object.remove("include");
    }
    visiting.remove(name);
    Ok(result)
}
fn set_profile_value(profile: &mut Value, key: &str, value: impl Into<Value>) {
    if let Some(object) = profile.as_object_mut() {
        object.insert(key.into(), value.into());
    }
}
fn value_text(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => {
            if *value {
                "true".into()
            } else {
                "false".into()
            }
        }
        _ => value.to_string(),
    }
}
fn numeric_text(value: &Value) -> String {
    value_text(value)
        .split_whitespace()
        .next()
        .unwrap_or("0")
        .to_string()
}
fn apply_bambu_recommendations(
    process: &mut Value,
    filament: &mut Value,
    recommendations: &[RecommendationInput],
) -> Vec<String> {
    let mut applied = Vec::new();
    for item in recommendations {
        let raw = value_text(&item.value);
        let numeric = numeric_text(&item.value);
        if item.setting == "nozzle_temperature" {
            let value = Value::Array(vec![Value::String(numeric)]);
            set_profile_value(filament, "nozzle_temperature", value.clone());
            set_profile_value(filament, "nozzle_temperature_initial_layer", value);
            applied.push(item.setting.clone());
            continue;
        }
        if item.setting == "bed_temperature" {
            let value = Value::Array(vec![Value::String(numeric)]);
            for key in [
                "hot_plate_temp",
                "hot_plate_temp_initial_layer",
                "textured_plate_temp",
                "textured_plate_temp_initial_layer",
            ] {
                set_profile_value(filament, key, value.clone())
            }
            applied.push(item.setting.clone());
            continue;
        }
        let mapped = match item.setting.as_str() {
            "layer_height" => Some(("process", "layer_height", numeric)),
            "wall_loops" => Some(("process", "wall_loops", numeric)),
            "top_layers" => Some(("process", "top_shell_layers", numeric)),
            "bottom_layers" => Some(("process", "bottom_shell_layers", numeric)),
            "infill_type" => Some(("process", "sparse_infill_pattern", raw.to_ascii_lowercase())),
            "infill_percent" => Some((
                "process",
                "sparse_infill_density",
                format!("{}%", numeric.trim_end_matches('%')),
            )),
            "support" => Some((
                "process",
                "enable_support",
                if raw.to_ascii_lowercase().starts_with("off") {
                    "0".into()
                } else {
                    "1".into()
                },
            )),
            "brim" => {
                let off = raw.eq_ignore_ascii_case("off");
                Some((
                    "process",
                    if off { "brim_type" } else { "brim_width" },
                    if off { "no_brim".into() } else { numeric },
                ))
            }
            "wall_generator" => Some(("process", "wall_generator", raw.to_ascii_lowercase())),
            "wall_order" => Some((
                "process",
                "wall_infill_order",
                if raw.to_ascii_lowercase().starts_with("outer") {
                    "outer wall/inner wall/infill".into()
                } else {
                    "inner wall/outer wall/infill".into()
                },
            )),
            "seam" => Some((
                "process",
                "seam_position",
                if raw.to_ascii_lowercase().contains("back") {
                    "back".into()
                } else if raw.to_ascii_lowercase().contains("nearest") {
                    "nearest".into()
                } else {
                    "aligned".into()
                },
            )),
            _ => None,
        };
        if let Some((kind, key, value)) = mapped {
            let target = if kind == "filament" {
                &mut *filament
            } else {
                &mut *process
            };
            set_profile_value(target, key, Value::String(value));
            applied.push(item.setting.clone());
        }
    }
    applied
}

fn expected_bambu_project_values(
    process: &Value,
    filament: &Value,
    recommendations: &[RecommendationInput],
) -> Vec<(String, String, Value)> {
    recommendations
        .iter()
        .filter_map(|item| {
            let (profile, key) = match item.setting.as_str() {
                "layer_height" => (process, "layer_height"),
                "wall_loops" => (process, "wall_loops"),
                "top_layers" => (process, "top_shell_layers"),
                "bottom_layers" => (process, "bottom_shell_layers"),
                "infill_type" => (process, "sparse_infill_pattern"),
                "infill_percent" => (process, "sparse_infill_density"),
                "support" => (process, "enable_support"),
                "brim" => {
                    if value_text(&item.value).eq_ignore_ascii_case("off") {
                        (process, "brim_type")
                    } else {
                        (process, "brim_width")
                    }
                }
                "wall_generator" => (process, "wall_generator"),
                "wall_order" => (process, "wall_infill_order"),
                "seam" => (process, "seam_position"),
                "nozzle_temperature" => (filament, "nozzle_temperature"),
                "bed_temperature" => (filament, "hot_plate_temp"),
                _ => return None,
            };
            profile
                .get(key)
                .cloned()
                .map(|value| (item.setting.clone(), key.to_string(), value))
        })
        .collect()
}

fn read_bambu_project_settings(path: &Path) -> Result<Value, String> {
    let file = File::open(path).map_err(|e| {
        format!(
            "Cannot open generated Bambu project {}: {e}",
            path.display()
        )
    })?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Generated Bambu project is not a valid 3MF archive: {e}"))?;
    let mut content = String::new();
    archive
        .by_name("Metadata/project_settings.config")
        .map_err(|_| {
            "Bambu Studio created a geometry-only 3MF without embedded process settings."
                .to_string()
        })?
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot read embedded Bambu process settings: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Embedded Bambu process settings are invalid: {e}"))
}

fn equivalent_project_value(actual: &Value, expected: &Value) -> bool {
    match (actual, expected) {
        (Value::String(actual), Value::String(expected)) => {
            actual == expected
                || match (actual.parse::<f64>(), expected.parse::<f64>()) {
                    (Ok(actual), Ok(expected)) => (actual - expected).abs() < f64::EPSILON,
                    _ => false,
                }
        }
        (Value::Array(actual), Value::Array(expected)) => {
            actual.len() == expected.len()
                && actual
                    .iter()
                    .zip(expected)
                    .all(|(actual, expected)| equivalent_project_value(actual, expected))
        }
        _ => actual == expected,
    }
}

fn validate_bambu_project_settings(
    path: &Path,
    expected: &[(String, String, Value)],
) -> Result<Vec<String>, String> {
    let settings = read_bambu_project_settings(path)?;
    let mut applied = Vec::new();
    for (canonical, key, expected_value) in expected {
        let actual = settings.get(key).ok_or_else(|| {
            format!("Bambu project is missing the embedded process setting '{key}' ({canonical}).")
        })?;
        if !equivalent_project_value(actual, expected_value) {
            return Err(format!(
                "Bambu project did not preserve {canonical}: expected {}, found {}.",
                expected_value, actual
            ));
        }
        if !applied.contains(canonical) {
            applied.push(canonical.clone());
        }
    }
    Ok(applied)
}
fn bambu_profile_names(
    printer_id: &str,
    material: &str,
) -> Result<(&'static str, &'static str, &'static str), String> {
    let (machine, process) = match printer_id {
        "bambu-x1c" => ("Bambu Lab X1 Carbon 0.4 nozzle", "0.20mm Standard @BBL X1C"),
        "bambu-p1s" => ("Bambu Lab P1S 0.4 nozzle", "0.20mm Standard @BBL P1P"),
        "bambu-a1" => ("Bambu Lab A1 0.4 nozzle", "0.20mm Standard @BBL A1"),
        "bambu-a1-mini" => ("Bambu Lab A1 mini 0.4 nozzle", "0.20mm Standard @BBL A1M"),
        _ => {
            return Err(
                "Bambu project export requires a supported Bambu Lab printer profile.".into(),
            )
        }
    };
    let filament = match material {
        "PLA" => "Generic PLA",
        "PETG" => "Generic PETG",
        "ASA" => "Generic ASA",
        "TPU" => "Generic TPU",
        "PA-CF" => "Generic PA-CF",
        _ => "Generic PLA",
    };
    Ok((machine, process, filament))
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let file = File::create(path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, value).map_err(|e| e.to_string())
}
fn bambu_resources(executable: &Path) -> Result<PathBuf, String> {
    let parent = executable
        .parent()
        .ok_or_else(|| "Bambu Studio installation path is invalid.".to_string())?;
    [
        parent.join("resources/profiles/BBL"),
        parent.join("Resources/profiles/BBL"),
        parent
            .parent()
            .unwrap_or(parent)
            .join("Resources/profiles/BBL"),
    ]
    .into_iter()
    .find(|path| path.is_dir())
    .ok_or_else(|| "Bambu Studio profile resources could not be located.".into())
}
fn unique_temp_dir() -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let path =
        std::env::temp_dir().join(format!("check-make-export-{}-{stamp}", std::process::id()));
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn export_bambu_project(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    printer_id: &str,
    recommendations: &[RecommendationInput],
) -> Result<ManufacturingPackageResult, String> {
    let executable = find_executable("bambu").ok_or_else(|| {
        "Bambu Studio was not detected. Install it to create a Bambu project 3MF.".to_string()
    })?;
    let resources = bambu_resources(&executable)?;
    let material = recommendations
        .iter()
        .find(|item| item.setting == "material")
        .map(|item| value_text(&item.value))
        .unwrap_or_else(|| "PLA".into());
    let (machine_name, process_name, filament_name) = bambu_profile_names(printer_id, &material)?;
    let temp = unique_temp_dir()?;
    let core = temp.join("corrected-core.3mf");
    let machine_path = temp.join("machine.json");
    let process_path = temp.join("process.json");
    let filament_path = temp.join("filament.json");
    let generated_project = temp.join("bambu-project.3mf");
    let result = (|| {
        write_3mf(source, &core, orientation_id, metadata_json)?;
        let machine = resolve_profile(
            &resources.join("machine"),
            machine_name,
            &mut HashSet::new(),
        )?;
        let mut process = resolve_profile(
            &resources.join("process"),
            process_name,
            &mut HashSet::new(),
        )?;
        let mut filament = resolve_profile(
            &resources.join("filament"),
            filament_name,
            &mut HashSet::new(),
        )?;
        apply_bambu_recommendations(&mut process, &mut filament, recommendations);
        let expected = expected_bambu_project_values(&process, &filament, recommendations);
        write_json(&machine_path, &machine)?;
        write_json(&process_path, &process)?;
        write_json(&filament_path, &filament)?;
        let settings = format!("{};{}", machine_path.display(), process_path.display());
        let output = Command::new(&executable)
            .arg(&core)
            .arg("--load-settings")
            .arg(settings)
            .arg("--load-filaments")
            .arg(&filament_path)
            .arg("--export-3mf")
            .arg(&generated_project)
            .output()
            .map_err(|e| format!("Could not run Bambu Studio: {e}"))?;
        if !output.status.success() || !generated_project.is_file() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "Bambu Studio could not create the project ({}). {}{}",
                output.status, stdout, stderr
            ));
        }
        let validation = Command::new(&executable)
            .arg(&generated_project)
            .arg("--info")
            .output()
            .map_err(|e| format!("Could not validate Bambu project: {e}"))?;
        if !validation.status.success() {
            return Err(format!(
                "Bambu Studio created the file but could not reopen it ({}).",
                validation.status
            ));
        }
        let applied = validate_bambu_project_settings(&generated_project, &expected)?;
        fs::copy(&generated_project, target).map_err(|e| {
            format!(
                "The validated Bambu project could not be saved to {}: {e}",
                target.display()
            )
        })?;
        let mut warnings = Vec::new();
        if recommendations
            .iter()
            .any(|item| item.setting == "speed_preset")
        {
            warnings.push("Speed preset is advisory because Bambu Studio does not expose it as one portable process key.".into())
        }
        Ok(ManufacturingPackageResult {
            path: target.to_string_lossy().into_owned(),
            target: "bambu".into(),
            validated: true,
            applied_settings: applied,
            warnings,
        })
    })();
    fs::remove_dir_all(&temp).ok();
    result
}

#[tauri::command]
fn create_3mf(
    path: String,
    orientation_id: String,
    metadata_json: String,
    default_name: String,
) -> Result<Option<String>, String> {
    let source = validate_model_path(&path)?;
    let target = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("3MF model", &["3mf"])
        .save_file();
    match target {
        Some(target) => {
            write_3mf(&source, &target, &orientation_id, &metadata_json)?;
            Ok(Some(target.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}
#[tauri::command]
fn create_manufacturing_package(
    path: String,
    target: String,
    orientation_id: String,
    metadata_json: String,
    default_name: String,
    printer_id: String,
    recommendations_json: String,
) -> Result<Option<ManufacturingPackageResult>, String> {
    let source = validate_model_path(&path)?;
    if target != "generic" && target != "bambu" {
        return Err(format!("The {target} project adapter is not implemented yet. Choose Generic Core 3MF or Bambu Studio."));
    }
    let destination = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("3MF project", &["3mf"])
        .save_file();
    let Some(destination) = destination else {
        return Ok(None);
    };
    let recommendations: Vec<RecommendationInput> = serde_json::from_str(&recommendations_json)
        .map_err(|e| format!("Invalid recommendation payload: {e}"))?;
    if target == "bambu" {
        return export_bambu_project(
            &source,
            &destination,
            &orientation_id,
            &metadata_json,
            &printer_id,
            &recommendations,
        )
        .map(Some);
    }
    write_3mf(&source, &destination, &orientation_id, &metadata_json)?;
    Ok(Some(ManufacturingPackageResult{path:destination.to_string_lossy().into_owned(),target:"generic".into(),validated:true,applied_settings:Vec::new(),warnings:vec!["Process recommendations are embedded as Check Make metadata; other slicers may not apply them automatically.".into()]}))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            pick_model_path,
            read_model_bytes,
            analyze_stl_native,
            analyze_model_with_openai,
            create_3mf,
            detect_slicer_adapters,
            create_manufacturing_package
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Check Make")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn analyzes_ascii_stl_and_builds_six_orientations() {
        let path = std::env::temp_dir().join(format!("check-make-{}.stl", std::process::id()));
        let stl="solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 20 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid triangle\n";
        fs::write(&path, stl).unwrap();
        let result = analyze_path(&path).unwrap();
        fs::remove_file(path).ok();
        assert_eq!(result.triangle_count, 1);
        assert_eq!(result.orientations.len(), 6);
        assert_eq!(result.bounding_box.size.x, 20.0);
    }
    #[test]
    fn writes_core_3mf_package() {
        let source =
            std::env::temp_dir().join(format!("check-make-3mf-{}.stl", std::process::id()));
        let target = source.with_extension("3mf");
        fs::write(&source,"solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 20 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid triangle\n").unwrap();
        write_3mf(&source, &target, "as-imported", "{\"material\":\"PETG\"}").unwrap();
        let mut archive = ZipArchive::new(File::open(&target).unwrap()).unwrap();
        let mut xml = String::new();
        archive
            .by_name("3D/3dmodel.model")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(xml.contains("unit=\"millimeter\""));
        assert!(xml.contains("checkmake:analysis"));
        assert!(xml.contains("<triangle v1=\"0\""));
        fs::remove_file(source).ok();
        fs::remove_file(target).ok();
    }
    #[test]
    fn maps_canonical_recommendations_to_bambu_profiles() {
        let mut process = json!({});
        let mut filament = json!({});
        let recommendations = vec![
            RecommendationInput {
                setting: "wall_loops".into(),
                value: json!(5),
            },
            RecommendationInput {
                setting: "infill_percent".into(),
                value: json!(25),
            },
            RecommendationInput {
                setting: "wall_order".into(),
                value: json!("Outer/Inner"),
            },
            RecommendationInput {
                setting: "nozzle_temperature".into(),
                value: json!("250 °C"),
            },
        ];
        let applied = apply_bambu_recommendations(&mut process, &mut filament, &recommendations);
        assert_eq!(process["wall_loops"], "5");
        assert_eq!(process["sparse_infill_density"], "25%");
        assert_eq!(process["wall_infill_order"], "outer wall/inner wall/infill");
        assert_eq!(filament["nozzle_temperature"], json!(["250"]));
        assert_eq!(applied.len(), 4);
    }
    #[test]
    #[ignore = "requires an installed Bambu Studio application"]
    fn exports_and_reopens_bambu_project() {
        if find_executable("bambu").is_none() {
            return;
        }
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/cube.stl");
        let target = std::env::temp_dir().join(format!(
            "check-make-bambu-project-{}.3mf",
            std::process::id()
        ));
        let recommendations = vec![
            RecommendationInput {
                setting: "material".into(),
                value: json!("PETG"),
            },
            RecommendationInput {
                setting: "layer_height".into(),
                value: json!("0.20 mm"),
            },
            RecommendationInput {
                setting: "wall_loops".into(),
                value: json!(5),
            },
            RecommendationInput {
                setting: "infill_percent".into(),
                value: json!(25),
            },
            RecommendationInput {
                setting: "infill_type".into(),
                value: json!("Gyroid"),
            },
            RecommendationInput {
                setting: "top_layers".into(),
                value: json!(6),
            },
            RecommendationInput {
                setting: "bottom_layers".into(),
                value: json!(5),
            },
        ];
        let result = export_bambu_project(
            &source,
            &target,
            "as-imported",
            "{}",
            "bambu-x1c",
            &recommendations,
        )
        .unwrap();
        assert!(result.validated);
        assert!(target.is_file());
        assert!(result.applied_settings.contains(&"wall_loops".into()));
        assert!(result.applied_settings.contains(&"infill_percent".into()));
        let settings = read_bambu_project_settings(&target).unwrap();
        assert_eq!(settings["wall_loops"], "5");
        assert_eq!(settings["sparse_infill_density"], "25%");
        assert_eq!(settings["sparse_infill_pattern"], "gyroid");
        assert_eq!(settings["top_shell_layers"], "6");
        assert_eq!(settings["bottom_shell_layers"], "5");
        fs::remove_file(target).ok();
    }
}
