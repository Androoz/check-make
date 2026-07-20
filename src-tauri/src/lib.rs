use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Cursor, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::Response,
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter,
};
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
struct ModelClue {
    source: String,
    value: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelMetadata {
    format: String,
    encoding: String,
    clues: Vec<ModelClue>,
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
    metadata: ModelMetadata,
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
    supported_printer_ids: Vec<String>,
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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageValidationCheck {
    id: String,
    label: String,
    passed: bool,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageValidationReport {
    valid: bool,
    target: String,
    checks: Vec<PackageValidationCheck>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanMetrics {
    source: String,
    material_grams: f64,
    filament_length_mm: f64,
    estimated_time_seconds: f64,
    material_volume_cm3: f64,
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

fn validate_import_path(path: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("Cannot access model: {e}"))?;
    let ext = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["stl", "3mf", "obj"].contains(&ext.as_str()) {
        return Err("Supported formats are STL, 3MF, and OBJ.".into());
    }
    let size = fs::metadata(&canonical).map_err(|e| e.to_string())?.len();
    if size > MAX_MODEL_BYTES {
        return Err("The model exceeds the 100 MB import limit.".into());
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

fn clean_semantic_clue(input: &str) -> Option<String> {
    let mut value = input.trim().trim_end_matches(".stl").to_lowercase();
    for marker in [" generated by", " exported by", " created by"] {
        if let Some(index) = value.find(marker) {
            value.truncate(index);
        }
    }
    if value.contains('@') {
        return None;
    }
    value = value
        .rsplit(|character| character == '/' || character == '\\')
        .next()
        .unwrap_or("")
        .trim_end_matches(".stl")
        .to_string();
    let generic = [
        "ascii",
        "binary",
        "stl",
        "mesh",
        "model",
        "part",
        "object",
        "solid",
        "untitled",
        "export",
        "exported",
        "final",
        "copy",
        "repaired",
        "fixed",
        "scaled",
        "revision",
        "rev",
        "mm",
        "openscad",
        "meshlab",
        "blender",
        "freecad",
        "solidworks",
        "bambustudio",
        "orcaslicer",
        "prusaslicer",
        "color",
        "material",
        "magics",
        "viscam",
    ];
    let separated: String = value
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect();
    let tokens: Vec<&str> = separated
        .split_whitespace()
        .filter(|token| {
            if generic.contains(token) || token.chars().all(|character| character.is_ascii_digit())
            {
                return false;
            }
            let version = ["v", "ver", "rev"]
                .iter()
                .find_map(|prefix| token.strip_prefix(prefix))
                .is_some_and(|suffix| {
                    !suffix.is_empty() && suffix.chars().all(|character| character.is_ascii_digit())
                });
            let copy = token
                .strip_prefix("copy")
                .is_some_and(|suffix| suffix.chars().all(|character| character.is_ascii_digit()));
            let long_hex =
                token.len() >= 8 && token.chars().all(|character| character.is_ascii_hexdigit());
            !version && !copy && !long_hex
        })
        .take(8)
        .collect();
    if !tokens.iter().any(|token| {
        token
            .chars()
            .filter(|character| character.is_alphabetic())
            .count()
            >= 3
    }) {
        return None;
    }
    let result = tokens.join(" ");
    Some(result.chars().take(96).collect())
}

fn is_binary_stl(bytes: &[u8]) -> bool {
    if bytes.len() < 84 {
        return false;
    }
    let triangle_count = u32::from_le_bytes(bytes[80..84].try_into().unwrap()) as usize;
    84usize
        .checked_add(triangle_count.saturating_mul(50))
        .is_some_and(|expected| expected == bytes.len())
}

fn extract_model_metadata(path: &Path, bytes: &[u8]) -> ModelMetadata {
    let binary = is_binary_stl(bytes);
    let mut clues = Vec::new();
    if binary {
        let printable: String = bytes[..bytes.len().min(80)]
            .iter()
            .map(|byte| {
                if (32..=126).contains(byte) {
                    *byte as char
                } else {
                    ' '
                }
            })
            .collect();
        if let Some(value) = clean_semantic_clue(&printable) {
            clues.push(ModelClue {
                source: "stl-binary-header".into(),
                value,
            });
        }
    } else {
        let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
        let first_line = prefix
            .trim_start_matches(|character: char| {
                character == '\u{feff}' || character.is_ascii_whitespace()
            })
            .lines()
            .next()
            .unwrap_or("");
        if first_line
            .get(..5)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("solid"))
        {
            if let Some(value) = first_line
                .get(5..)
                .and_then(|name| clean_semantic_clue(name.trim()))
            {
                clues.push(ModelClue {
                    source: "stl-solid-name".into(),
                    value,
                });
            }
        }
    }
    if let Some(value) = path
        .file_stem()
        .and_then(|name| name.to_str())
        .and_then(clean_semantic_clue)
    {
        clues.push(ModelClue {
            source: "file-name".into(),
            value,
        });
    }
    ModelMetadata {
        format: "stl".into(),
        encoding: if binary { "binary" } else { "ascii" }.into(),
        clues,
    }
}

fn analyze_path(path: &Path) -> Result<NativeModelAnalysis, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let metadata = extract_model_metadata(path, &bytes);
    let mesh =
        stl_io::read_stl(&mut Cursor::new(&bytes)).map_err(|e| format!("Invalid STL: {e}"))?;
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
        metadata,
    })
}

#[tauri::command]
fn pick_model_path() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("3D model", &["stl", "3mf", "obj"])
        .pick_file()
        .map(|p| p.to_string_lossy().into_owned())
}
#[tauri::command]
fn read_model_bytes(path: String) -> Result<Response, String> {
    let path = validate_import_path(&path)?;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn cache_normalized_stl(original_path: String, bytes: Vec<u8>) -> Result<String, String> {
    validate_import_path(&original_path)?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_MODEL_BYTES {
        return Err("The normalized mesh is empty or exceeds the 100 MB limit.".into());
    }
    stl_io::read_stl(&mut Cursor::new(bytes.as_slice()))
        .map_err(|e| format!("The normalized mesh is not a valid STL: {e}"))?;
    let directory = std::env::temp_dir().join("check-make-imports");
    fs::create_dir_all(&directory).map_err(|e| format!("Cannot create import cache: {e}"))?;
    let stem = Path::new(&original_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("model")
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '_' })
        .collect::<String>();
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let target = directory.join(format!("{stem}-{stamp}.stl"));
    fs::write(&target, bytes).map_err(|e| format!("Cannot cache normalized STL: {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_check_make_project(default_name: String, contents: String) -> Result<Option<String>, String> {
    let _: Value = serde_json::from_str(&contents).map_err(|e| format!("Invalid project data: {e}"))?;
    if contents.len() > 10 * 1024 * 1024 {
        return Err("The Check Make project exceeds the 10 MB limit.".into());
    }
    let target = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("Check Make project", &["checkmake"])
        .save_file();
    let Some(target) = target else { return Ok(None) };
    fs::write(&target, contents).map_err(|e| format!("Could not save project: {e}"))?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

#[tauri::command]
fn open_check_make_project() -> Result<Option<String>, String> {
    let source = rfd::FileDialog::new()
        .add_filter("Check Make project", &["checkmake"])
        .pick_file();
    let Some(source) = source else { return Ok(None) };
    if fs::metadata(&source).map_err(|e| e.to_string())?.len() > 10 * 1024 * 1024 {
        return Err("The Check Make project exceeds the 10 MB limit.".into());
    }
    let contents = fs::read_to_string(&source).map_err(|e| format!("Could not read project: {e}"))?;
    let value: Value = serde_json::from_str(&contents).map_err(|e| format!("Invalid project file: {e}"))?;
    if value.get("product").and_then(Value::as_str) != Some("Check Make") {
        return Err("This is not a Check Make project file.".into());
    }
    Ok(Some(contents))
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
        r#"You are Check Make's 3D-print engineering analyst. Identify what the model is likely to be and how it is likely used from the rendered view and deterministic mesh measurements. Treat file names and embedded model names or headers in geometry.metadata.clues as unverified naming clues: use them when relevant, identify their source in evidence, and do not infer material, load, impact, or environment from a name alone. Use unknown whenever the supplied evidence does not establish a decision variable; never fill an unknown with a typical or conservative default. Never claim certainty that the evidence does not support. Ask zero to three concise follow-up questions only when their answers could materially change material, orientation, strength, fit, support, or surface recommendations.

Return ONLY one JSON object with exactly these fields:
objectName (string), likelyPurpose (string), evidence (string array), assumptions (string array), questions (array of objects with id, question, why), environment (unknown|indoor|outdoor), load (unknown|none|static|cyclic), impact (unknown|none|medium|high), heat (unknown|normal|warm|hot), priority (unknown|strength|accuracy|finish|speed|flexibility), supportsAllowed (boolean or the string unknown), materialHint (unknown|PLA|PETG|ASA|TPU|PA-CF), requirements (object with environment, load, impact, heat, priority, supportsAllowed; each contains status, source, confidence, evidence). Status is confirmed|inferred|assumed|not_applicable|unknown. Source is user|geometry|filename|ai|default. Every inferred or confirmed value must cite concrete evidence. Ask only questions whose answers could change a manufacturing recommendation; group related unknowns into one question.

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
 <metadata name="Application">Check Make 0.2.3</metadata>
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

fn build_bambu_project_settings(
    machine: &Value,
    process: &Value,
    filament: &Value,
    machine_name: &str,
    process_name: &str,
    filament_name: &str,
    process_override_keys: &[String],
    filament_override_keys: &[String],
) -> Value {
    let mut project = json!({});
    merge_json(&mut project, machine);
    merge_json(&mut project, process);
    merge_json(&mut project, filament);
    if let Some(object) = project.as_object_mut() {
        for key in ["type", "name", "from", "setting_id", "instantiation"] {
            object.remove(key);
        }
        object.insert(
            "printer_settings_id".into(),
            Value::String(machine_name.into()),
        );
        object.insert(
            "print_settings_id".into(),
            Value::String(process_name.into()),
        );
        object.insert(
            "default_print_profile".into(),
            Value::String(process_name.into()),
        );
        object.insert(
            "filament_settings_id".into(),
            Value::Array(vec![Value::String(filament_name.into())]),
        );
        object.insert(
            "different_settings_to_system".into(),
            json!([
                process_override_keys.join(";"),
                filament_override_keys.join(";"),
                ""
            ]),
        );
    }
    project
}

fn write_bambu_family_project_3mf(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    project_settings: &Value,
    application: &str,
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
    let mut max = [f32::NEG_INFINITY; 3];
    for vertex in &vertices {
        for axis in 0..3 {
            min[axis] = min[axis].min(vertex[axis]);
            max[axis] = max[axis].max(vertex[axis]);
        }
    }
    for vertex in &mut vertices {
        for axis in 0..3 {
            vertex[axis] -= min[axis];
        }
    }
    let valid_faces: Vec<_> = mesh
        .faces
        .iter()
        .filter(|face| {
            let a = vertices[face.vertices[0]];
            let b = vertices[face.vertices[1]];
            let c = vertices[face.vertices[2]];
            let normal = cross(sub(b, a), sub(c, a));
            normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2] > 1e-12
        })
        .collect();
    let removed = mesh.faces.len() - valid_faces.len();
    let title = xml_escape(
        source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Check Make model"),
    );
    let source_name = xml_escape(
        source
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("model.stl"),
    );
    let size_x = max[0] - min[0];
    let size_y = max[1] - min[1];
    let translate_x = 128.0 - size_x / 2.0;
    let translate_y = 128.0 - size_y / 2.0;

    let mut object_model = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <resources>
  <object id="1" p:UUID="00010000-81cb-4c03-9d28-80fed5dfa1dc" type="model"><mesh><vertices>
"#,
    );
    for vertex in &vertices {
        object_model.push_str(&format!(
            "<vertex x=\"{}\" y=\"{}\" z=\"{}\"/>\n",
            vertex[0], vertex[1], vertex[2]
        ));
    }
    object_model.push_str("</vertices><triangles>\n");
    for face in &valid_faces {
        object_model.push_str(&format!(
            "<triangle v1=\"{}\" v2=\"{}\" v3=\"{}\"/>\n",
            face.vertices[0], face.vertices[1], face.vertices[2]
        ));
    }
    object_model.push_str("</triangles></mesh></object></resources><build/></model>");

    let root_model = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="Application">{}</metadata>
 <metadata name="checkmake:generator">Check Make 0.2.3</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">{title}</metadata>
 <metadata name="checkmake:analysis">{}</metadata>
 <metadata name="checkmake:orientation">{}</metadata>
 <metadata name="checkmake:degenerate-triangles-removed">{removed}</metadata>
 <resources><object id="2" p:UUID="00000001-61cb-4c03-9d28-80fed5dfa1dc" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" p:UUID="00010000-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object></resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369"><item objectid="2" p:UUID="00000002-b1ec-4553-aec9-835e5b724bb4" transform="1 0 0 0 1 0 0 0 1 {translate_x} {translate_y} 0" printable="1"/></build>
</model>"#,
        xml_escape(application),
        xml_escape(metadata_json),
        xml_escape(orientation_id),
    );
    let model_settings = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<config>
 <object id="2"><metadata key="name" value="{title}"/><metadata key="extruder" value="1"/><metadata face_count="{}"/>
  <part id="1" subtype="normal_part"><metadata key="name" value="{title}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata key="source_file" value="{source_name}"/><metadata key="source_object_id" value="0"/><metadata key="source_volume_id" value="0"/><mesh_stat face_count="{}" edges_fixed="0" degenerate_facets="{removed}" facets_removed="{removed}" facets_reversed="0" backwards_edges="0"/></part>
 </object>
 <plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value=""/><metadata key="locked" value="false"/><metadata key="filament_map_mode" value="Auto For Flush"/><metadata key="gcode_file" value=""/><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="1"/></model_instance></plate>
 <assemble></assemble>
</config>"#,
        valid_faces.len(),
        valid_faces.len(),
    );
    let content_types = r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>"#;
    let package_rels = r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>"#;
    let model_rels = r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>"#;
    let slice_info = r#"<?xml version="1.0" encoding="UTF-8"?><config><header><header_item key="X-BBL-Client-Type" value="slicer"/><header_item key="X-BBL-Client-Version" value="Check Make 0.2.3"/></header></config>"#;
    let cut_info = r#"<?xml version="1.0" encoding="utf-8"?><objects><object id="1"><cut_id id="0" check_sum="1" connectors_cnt="0"/></object></objects>"#;
    let project_json = serde_json::to_vec_pretty(project_settings).map_err(|e| e.to_string())?;
    let file = File::create(target).map_err(|e| e.to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in [
        ("[Content_Types].xml", content_types.as_bytes()),
        ("_rels/.rels", package_rels.as_bytes()),
        ("3D/3dmodel.model", root_model.as_bytes()),
        ("3D/_rels/3dmodel.model.rels", model_rels.as_bytes()),
        ("3D/Objects/object_1.model", object_model.as_bytes()),
        ("Metadata/project_settings.config", project_json.as_slice()),
        ("Metadata/model_settings.config", model_settings.as_bytes()),
        ("Metadata/slice_info.config", slice_info.as_bytes()),
        ("Metadata/cut_information.xml", cut_info.as_bytes()),
        (
            "Metadata/filament_sequence.json",
            br#"{"plate_1":{"nozzle_sequence":[],"optimal_assignment":[],"sequence":[]}}"#,
        ),
    ] {
        archive
            .start_file(name, options)
            .map_err(|e| e.to_string())?;
        archive.write_all(bytes).map_err(|e| e.to_string())?;
    }
    archive.finish().map_err(|e| e.to_string())?;
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
            PathBuf::from(
                "/Applications/Original Prusa Drivers/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
            ),
            PathBuf::from(r"C:\Program Files\Prusa3D\PrusaSlicer\prusa-slicer-console.exe"),
        ],
        "cura" => vec![
            PathBuf::from("/Applications/UltiMaker Cura.app/Contents/MacOS/UltiMaker-Cura"),
            PathBuf::from(r"C:\Program Files\UltiMaker Cura\UltiMaker-Cura.exe"),
        ],
        "creality" => vec![
            PathBuf::from("/Applications/Creality Print.app/Contents/MacOS/CrealityPrint"),
            PathBuf::from(r"C:\Program Files\Creality Print 6.0\CrealityPrint.exe"),
            PathBuf::from(r"C:\Program Files\Creality Print 5.1\CrealityPrint.exe"),
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
        supported_printer_ids: Vec::new(),
    }];
    for (target, label) in [
        ("bambu", "Bambu Studio"),
        ("orca", "OrcaSlicer"),
        ("prusa", "PrusaSlicer"),
        ("cura", "UltiMaker Cura"),
        ("creality", "Creality Print"),
    ] {
        let executable = find_executable(target);
        let available = executable.is_some();
        let native_adapter = target == "bambu"
            || target == "orca"
            || target == "prusa"
            || target == "cura"
            || target == "creality";
        let (capability, detail) = if native_adapter && available {
            match target {
                "bambu" => (
                    "project-3mf",
                    "Installed profiles detected. Check Make writes and validates a native Bambu Studio project 3MF.",
                ),
                "orca" => (
                    "project-3mf",
                    "Installed profiles detected. Check Make writes a native project and validates its effective settings with OrcaSlicer.",
                ),
                "prusa" => (
                    "project-3mf",
                    "Installed profiles detected. Check Make lets PrusaSlicer create a native project and validates its effective settings.",
                ),
                "cura" => (
                    "project-3mf",
                    "Installed profiles detected. Check Make writes a native Cura workspace and validates its embedded machine and process settings.",
                ),
                "creality" => (
                    "project-3mf",
                    "Installed profiles detected. Check Make writes a native project and validates its effective settings with Creality Print.",
                ),
                _ => unreachable!(),
            }
        } else if native_adapter {
            (
                "planned",
                "The native project adapter requires this slicer to be installed.",
            )
        } else {
            (
                "core-3mf",
                "Exports a compatible Core 3MF with corrected geometry and Check Make settings metadata.",
            )
        };
        adapters.push(SlicerAdapterStatus {
            target: target.into(),
            label: label.into(),
            available: if native_adapter { available } else { true },
            executable_path: executable.map(|path| path.to_string_lossy().into_owned()),
            capability: capability.into(),
            detail: detail.into(),
            supported_printer_ids: match target {
                "bambu" => &["bambu-x1c", "bambu-p1s", "bambu-a1", "bambu-a1-mini"][..],
                "orca" => &[
                    "bambu-x1c",
                    "bambu-p1s",
                    "bambu-a1",
                    "bambu-a1-mini",
                    "prusa-mk4s",
                    "prusa-core-one",
                    "creality-k1c",
                    "creality-ender3-v3",
                    "creality-ender3-v3-se",
                    "creality-ender3-v3-ke",
                    "elegoo-neptune4pro",
                    "anycubic-kobra3",
                ][..],
                "prusa" => &["prusa-mk4s", "prusa-core-one"][..],
                "cura" => &[
                    "creality-ender3-v3-se",
                    "creality-ender3-v3-ke",
                    "elegoo-neptune4pro",
                ][..],
                "creality" => &[
                    "bambu-x1c",
                    "bambu-p1s",
                    "bambu-a1",
                    "bambu-a1-mini",
                    "creality-k1c",
                    "creality-ender3-v3",
                    "creality-ender3-v3-se",
                    "creality-ender3-v3-ke",
                ][..],
                _ => &[],
            }
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
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
fn find_profile_in_tree(root: &Path, file_name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().and_then(|value| value.to_str()) == Some(file_name) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_profile_in_tree(&path, file_name) {
                return Some(found);
            }
        }
    }
    None
}
fn resolve_profile(
    dir: &Path,
    name: &str,
    visiting: &mut HashSet<String>,
) -> Result<Value, String> {
    if !visiting.insert(name.to_string()) {
        return Err(format!("Circular slicer profile dependency: {name}"));
    }
    let file_name = format!("{name}.json");
    let direct_path = dir
        .ancestors()
        .map(|candidate| candidate.join(&file_name))
        .find(|candidate| candidate.is_file());
    let category_root = dir.ancestors().find(|candidate| {
        matches!(
            candidate.file_name().and_then(|value| value.to_str()),
            Some("machine" | "process" | "filament")
        )
    });
    let path = direct_path
        .or_else(|| category_root.and_then(|root| find_profile_in_tree(root, &file_name)))
        .ok_or_else(|| {
            format!(
                "Cannot locate slicer profile {} from {}",
                file_name,
                dir.display()
            )
        })?;
    let profile_dir = path.parent().unwrap_or(dir);
    let child: Value = serde_json::from_reader(BufReader::new(
        File::open(&path)
            .map_err(|e| format!("Cannot open slicer profile {}: {e}", path.display()))?,
    ))
    .map_err(|e| format!("Invalid slicer profile {}: {e}", path.display()))?;
    let mut result = json!({});
    if let Some(parent) = child.get("inherits").and_then(Value::as_str) {
        merge_json(
            &mut result,
            &resolve_profile(profile_dir, parent, visiting)?,
        )
    }
    if let Some(includes) = child.get("include").and_then(Value::as_array) {
        for include in includes.iter().filter_map(Value::as_str) {
            merge_json(
                &mut result,
                &resolve_profile(profile_dir, include, visiting)?,
            );
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
                set_profile_value(
                    process,
                    "brim_type",
                    Value::String(if off { "no_brim" } else { "outer_only" }.into()),
                );
                if !off {
                    set_profile_value(process, "brim_width", Value::String(numeric));
                }
                applied.push(item.setting.clone());
                continue;
            }
            "wall_generator" => Some(("process", "wall_generator", raw.to_ascii_lowercase())),
            "wall_order" => Some((
                "process",
                "wall_sequence",
                if raw.to_ascii_lowercase().starts_with("outer") {
                    "outer wall/inner wall".into()
                } else {
                    "inner wall/outer wall".into()
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
            if item.setting == "infill_percent" {
                let density = target
                    .get("sparse_infill_density")
                    .cloned()
                    .unwrap_or_else(|| Value::String("15%".into()));
                set_profile_value(target, "skeleton_infill_density", density.clone());
                set_profile_value(target, "skin_infill_density", density);
            }
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
                "wall_order" => (process, "wall_sequence"),
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

fn bambu_override_keys(recommendations: &[RecommendationInput]) -> (Vec<String>, Vec<String>) {
    let mut process = Vec::new();
    let mut filament = Vec::new();
    for item in recommendations {
        let process_keys: &[&str] = match item.setting.as_str() {
            "layer_height" => &["layer_height"],
            "wall_loops" => &["wall_loops"],
            "top_layers" => &["top_shell_layers"],
            "bottom_layers" => &["bottom_shell_layers"],
            "infill_type" => &["sparse_infill_pattern"],
            "infill_percent" => &[
                "skeleton_infill_density",
                "skin_infill_density",
                "sparse_infill_density",
            ],
            "support" => &["enable_support"],
            "brim" => {
                if value_text(&item.value).eq_ignore_ascii_case("off") {
                    &["brim_type"]
                } else {
                    &["brim_type", "brim_width"]
                }
            }
            "wall_generator" => &["wall_generator"],
            "wall_order" => &["wall_sequence"],
            "seam" => &["seam_position"],
            _ => &[],
        };
        for key in process_keys {
            if !process.iter().any(|existing| existing == key) {
                process.push((*key).to_string());
            }
        }
        let filament_keys: &[&str] = match item.setting.as_str() {
            "nozzle_temperature" => &["nozzle_temperature", "nozzle_temperature_initial_layer"],
            "bed_temperature" => &[
                "hot_plate_temp",
                "hot_plate_temp_initial_layer",
                "textured_plate_temp",
                "textured_plate_temp_initial_layer",
            ],
            _ => &[],
        };
        for key in filament_keys {
            if !filament.iter().any(|existing| existing == key) {
                filament.push((*key).to_string());
            }
        }
    }
    process.sort();
    filament.sort();
    (process, filament)
}

fn read_bambu_family_project_settings(path: &Path) -> Result<Value, String> {
    let file = File::open(path).map_err(|e| {
        format!(
            "Cannot open generated slicer project {}: {e}",
            path.display()
        )
    })?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Generated slicer project is not a valid 3MF archive: {e}"))?;
    let mut content = String::new();
    archive
        .by_name("Metadata/project_settings.config")
        .map_err(|_| "The slicer project contains no embedded process settings.".to_string())?
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot read embedded slicer process settings: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Embedded slicer process settings are invalid: {e}"))
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

fn validate_bambu_family_project_settings(
    path: &Path,
    expected: &[(String, String, Value)],
) -> Result<Vec<String>, String> {
    let settings = read_bambu_family_project_settings(path)?;
    let mut applied = Vec::new();
    for (canonical, key, expected_value) in expected {
        let actual = settings.get(key).ok_or_else(|| {
            format!("Slicer project is missing the embedded setting '{key}' ({canonical}).")
        })?;
        if !equivalent_project_value(actual, expected_value) {
            return Err(format!(
                "Slicer project did not preserve {canonical}: expected {}, found {}.",
                expected_value, actual
            ));
        }
        if !applied.contains(canonical) {
            applied.push(canonical.clone());
        }
    }
    Ok(applied)
}

fn validate_bambu_family_override_markers(
    path: &Path,
    process_keys: &[String],
    filament_keys: &[String],
) -> Result<(), String> {
    let settings = read_bambu_family_project_settings(path)?;
    let groups = settings
        .get("different_settings_to_system")
        .and_then(Value::as_array)
        .ok_or_else(|| "Slicer project is missing its setting override markers.".to_string())?;
    for (index, expected_keys, label) in
        [(0, process_keys, "process"), (1, filament_keys, "filament")]
    {
        let marked: HashSet<&str> = groups
            .get(index)
            .and_then(Value::as_str)
            .unwrap_or("")
            .split(';')
            .filter(|key| !key.is_empty())
            .collect();
        for key in expected_keys {
            if !marked.contains(key.as_str()) {
                return Err(format!(
                    "Slicer project stores {label} setting '{key}' but does not mark it as an active project override."
                ));
            }
        }
    }
    Ok(())
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

fn orca_resources(executable: &Path) -> Result<PathBuf, String> {
    let parent = executable
        .parent()
        .ok_or_else(|| "OrcaSlicer installation path is invalid.".to_string())?;
    [
        parent.join("resources/profiles"),
        parent.join("Resources/profiles"),
        parent.parent().unwrap_or(parent).join("Resources/profiles"),
    ]
    .into_iter()
    .find(|path| path.is_dir())
    .ok_or_else(|| "OrcaSlicer profile resources could not be located.".into())
}

fn creality_resources(executable: &Path) -> Result<PathBuf, String> {
    let parent = executable
        .parent()
        .ok_or_else(|| "Creality Print installation path is invalid.".to_string())?;
    [
        parent.join("resources/profiles"),
        parent.join("Resources/profiles"),
        parent.parent().unwrap_or(parent).join("Resources/profiles"),
    ]
    .into_iter()
    .find(|path| path.is_dir())
    .ok_or_else(|| "Creality Print profile resources could not be located.".into())
}

fn cura_resources(executable: &Path) -> Result<PathBuf, String> {
    let parent = executable
        .parent()
        .ok_or_else(|| "UltiMaker Cura installation path is invalid.".to_string())?;
    [
        parent.join("../Resources/share/cura/resources"),
        parent.join("resources"),
        parent
            .parent()
            .unwrap_or(parent)
            .join("Resources/cura/resources"),
    ]
    .into_iter()
    .find(|path| path.join("definitions/fdmprinter.def.json").is_file())
    .ok_or_else(|| "UltiMaker Cura profile resources could not be located.".into())
}

struct OrcaProfileSpec {
    machine_dir: &'static str,
    machine_name: &'static str,
    process_dir: &'static str,
    process_name: &'static str,
    filament_dir: &'static str,
    filament_name: String,
}

fn orca_profile_spec(printer_id: &str, material: &str) -> Result<OrcaProfileSpec, String> {
    let spec = match printer_id {
        "bambu-x1c" => OrcaProfileSpec {
            machine_dir: "BBL/machine",
            machine_name: "Bambu Lab X1 Carbon 0.4 nozzle",
            process_dir: "BBL/process",
            process_name: "0.20mm Standard @BBL X1C",
            filament_dir: "BBL/filament",
            filament_name: format!("Generic {material}"),
        },
        "bambu-p1s" => OrcaProfileSpec {
            machine_dir: "BBL/machine",
            machine_name: "Bambu Lab P1S 0.4 nozzle",
            process_dir: "BBL/process",
            process_name: "0.20mm Standard @BBL P1P",
            filament_dir: "BBL/filament",
            filament_name: format!("Generic {material}"),
        },
        "bambu-a1" => OrcaProfileSpec {
            machine_dir: "BBL/machine",
            machine_name: "Bambu Lab A1 0.4 nozzle",
            process_dir: "BBL/process",
            process_name: "0.20mm Standard @BBL A1",
            filament_dir: "BBL/filament",
            filament_name: format!("Generic {material}"),
        },
        "bambu-a1-mini" => OrcaProfileSpec {
            machine_dir: "BBL/machine",
            machine_name: "Bambu Lab A1 mini 0.4 nozzle",
            process_dir: "BBL/process",
            process_name: "0.20mm Standard @BBL A1M",
            filament_dir: "BBL/filament",
            filament_name: format!("Generic {material}"),
        },
        "prusa-mk4s" => OrcaProfileSpec {
            machine_dir: "Prusa/machine",
            machine_name: "Prusa MK4S 0.4 nozzle",
            process_dir: "Prusa/process",
            process_name: "0.20mm STRUCTURAL @MK4S 0.4",
            filament_dir: "Prusa/filament",
            filament_name: if material == "PA-CF" {
                "Prusa Generic PA-CF".into()
            } else {
                format!("Prusa Generic {material} @MK4S")
            },
        },
        "prusa-core-one" => OrcaProfileSpec {
            machine_dir: "Prusa/machine",
            machine_name: "Prusa CORE One 0.4 nozzle",
            process_dir: "Prusa/process",
            process_name: "0.20mm STRUCTURAL @CORE One 0.4",
            filament_dir: "Prusa/filament",
            filament_name: if material == "PA-CF" {
                "Prusament PA-CF @CORE One".into()
            } else {
                format!("Prusa Generic {material} @CORE One")
            },
        },
        "creality-k1c" => OrcaProfileSpec {
            machine_dir: "Creality/machine",
            machine_name: "Creality K1C 0.4 nozzle",
            process_dir: "Creality/process",
            process_name: "0.20mm Standard @Creality K1C 0.4 nozzle",
            filament_dir: "Creality/filament",
            filament_name: format!("Creality Generic {material} @K1-all"),
        },
        "creality-ender3-v3" => OrcaProfileSpec {
            machine_dir: "Creality/machine",
            machine_name: "Creality Ender-3 V3 0.4 nozzle",
            process_dir: "Creality/process",
            process_name: "0.20mm Standard @Creality Ender3V3 0.4 nozzle",
            filament_dir: "Creality/filament",
            filament_name: format!("Creality Generic {material} @Ender-3V3-all"),
        },
        "creality-ender3-v3-se" => OrcaProfileSpec {
            machine_dir: "Creality/machine",
            machine_name: "Creality Ender-3 V3 SE 0.4 nozzle",
            process_dir: "Creality/process",
            process_name: "0.20mm Standard @Creality Ender3V3SE 0.4",
            filament_dir: "Creality/filament",
            filament_name: format!("Creality Generic {material} @Ender-3V3-all"),
        },
        "creality-ender3-v3-ke" => OrcaProfileSpec {
            machine_dir: "Creality/machine",
            machine_name: "Creality Ender-3 V3 KE 0.4 nozzle",
            process_dir: "Creality/process",
            process_name: "0.20mm Standard @Creality Ender3V3KE",
            filament_dir: "Creality/filament",
            filament_name: format!("Creality Generic {material} @Ender-3V3-all"),
        },
        "elegoo-neptune4pro" => {
            let (filament_dir, filament_name) = if material == "PA-CF" {
                (
                    "OrcaFilamentLibrary/filament/Elegoo",
                    "Elegoo PAHT-CF @System".into(),
                )
            } else {
                let name = if material == "TPU" {
                    "Elegoo TPU 95A @EN4 Series".into()
                } else {
                    format!("Elegoo {material} @EN4 Series")
                };
                ("Elegoo/filament/EN4SERIES", name)
            };
            OrcaProfileSpec {
                machine_dir: "Elegoo/machine/EN4SERIES",
                machine_name: "Elegoo Neptune 4 Pro 0.4 nozzle",
                process_dir: "Elegoo/process/EN4SERIES",
                process_name: "0.20mm Standard @Elegoo N4Pro 0.4 nozzle",
                filament_dir,
                filament_name,
            }
        }
        "anycubic-kobra3" => OrcaProfileSpec {
            machine_dir: "Anycubic/machine",
            machine_name: "Anycubic Kobra 3 0.4 nozzle",
            process_dir: "Anycubic/process",
            process_name: "0.20mm Standard @Anycubic Kobra 3 0.4 nozzle",
            filament_dir: "Anycubic/filament",
            filament_name: format!("Anycubic Generic {material}"),
        },
        _ => return Err("OrcaSlicer export requires a supported printer profile.".into()),
    };
    Ok(spec)
}

fn creality_profile_spec(printer_id: &str, material: &str) -> Result<OrcaProfileSpec, String> {
    let mut spec = orca_profile_spec(printer_id, material)?;
    match printer_id {
        "creality-k1c" => {
            spec.filament_name = format!("Generic {material} @Creality K1C 0.4 nozzle");
        }
        "creality-ender3-v3" => {
            if !["PLA", "PETG", "TPU"].contains(&material) {
                return Err(format!(
                    "Creality Print has no compatible {material} profile for Ender-3 V3 0.4 nozzle."
                ));
            }
            spec.filament_name = format!("Generic {material} @Creality Ender-3 V3 0.4 nozzle");
        }
        "creality-ender3-v3-se" => {
            if !["PLA", "PETG", "TPU"].contains(&material) {
                return Err(format!(
                    "Creality Print has no compatible {material} profile for Ender-3 V3 SE 0.4 nozzle."
                ));
            }
            spec.process_name = "0.20mm Standard @Creality Ender-3 V3 SE 0.4 nozzle";
            spec.filament_name = match material {
                "PLA" => "CR-PLA @Creality Ender-3 V3 SE 0.4 nozzle".into(),
                "PETG" => "Generic PETG @Creality Ender-3 V3 SE 0.4 nozzle".into(),
                "TPU" => "Generic TPU @Creality Ender-3 V3 SE 0.4 nozzle".into(),
                _ => unreachable!(),
            };
        }
        "creality-ender3-v3-ke" => {
            if !["PLA", "PETG", "ASA", "TPU"].contains(&material) {
                return Err(format!(
                    "Creality Print has no compatible {material} profile for Ender-3 V3 KE 0.4 nozzle."
                ));
            }
            spec.process_name = "0.20mm Standard @Creality Ender-3 V3 KE 0.4 nozzle";
            spec.filament_name = match material {
                "PLA" => "CR-PLA @Creality Ender-3 V3 KE 0.4 nozzle".into(),
                "PETG" => "CR-PETG @Creality Ender-3 V3 KE 0.4 nozzle".into(),
                "ASA" => "HP-ASA @Creality Ender-3 V3 KE 0.4 nozzle".into(),
                "TPU" => "HP-TPU @Creality Ender-3 V3 KE 0.4 nozzle".into(),
                _ => unreachable!(),
            };
        }
        _ => {}
    }
    Ok(spec)
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

fn gcode_number(line: &str, label: &str) -> Option<f64> {
    if !line.contains(label) { return None; }
    let value = line.split_once('=')?.1.trim().split_whitespace().next()?;
    value.parse().ok()
}

fn duration_seconds(line: &str) -> Option<f64> {
    if !line.contains("total estimated time:") { return None; }
    let value = line.split_once("total estimated time:")?.1.trim();
    let mut seconds = 0.0;
    for token in value.split_whitespace() {
        let (number, multiplier) = if let Some(number) = token.strip_suffix('h') { (number, 3600.0) }
            else if let Some(number) = token.strip_suffix('m') { (number, 60.0) }
            else if let Some(number) = token.strip_suffix('s') { (number, 1.0) }
            else { continue };
        seconds += number.trim_end_matches(';').parse::<f64>().ok()? * multiplier;
    }
    (seconds > 0.0).then_some(seconds)
}

fn read_gcode_plan_metrics(path: &Path) -> Result<PlanMetrics, String> {
    let reader = BufReader::new(File::open(path).map_err(|e| format!("Cannot read OrcaSlicer G-code statistics: {e}"))?);
    let mut material_grams = None; let mut filament_length_mm = None; let mut material_volume_cm3 = None; let mut estimated_time_seconds = None;
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Cannot read OrcaSlicer G-code statistics: {e}"))?;
        material_grams = material_grams.or_else(|| gcode_number(&line, "filament used [g]"));
        filament_length_mm = filament_length_mm.or_else(|| gcode_number(&line, "filament used [mm]"));
        material_volume_cm3 = material_volume_cm3.or_else(|| gcode_number(&line, "filament used [cm3]"));
        estimated_time_seconds = estimated_time_seconds.or_else(|| duration_seconds(&line));
        if material_grams.is_some() && filament_length_mm.is_some() && material_volume_cm3.is_some() && estimated_time_seconds.is_some() { break; }
    }
    let material_grams = material_grams.ok_or_else(|| "OrcaSlicer G-code omits filament weight.".to_string())?;
    let filament_length_mm = filament_length_mm.ok_or_else(|| "OrcaSlicer G-code omits filament length.".to_string())?;
    let material_volume_cm3 = material_volume_cm3.ok_or_else(|| "OrcaSlicer G-code omits extruded volume.".to_string())?;
    let estimated_time_seconds = estimated_time_seconds.ok_or_else(|| "OrcaSlicer G-code omits estimated print time.".to_string())?;
    Ok(PlanMetrics { source: "orca-slicer".into(), material_grams, filament_length_mm, estimated_time_seconds, material_volume_cm3, warnings: Vec::new() })
}

fn launch_bambu_project(executable: &Path, project: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app_bundle = executable
            .ancestors()
            .find(|path| path.extension().and_then(|value| value.to_str()) == Some("app"))
            .ok_or_else(|| "Bambu Studio application bundle could not be located.".to_string())?;
        Command::new("open")
            .arg("-a")
            .arg(app_bundle)
            .arg(project)
            .spawn()
            .map_err(|e| format!("Could not open the project in Bambu Studio: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new(executable)
            .arg(project)
            .spawn()
            .map_err(|e| format!("Could not open the project in Bambu Studio: {e}"))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Opening Bambu Studio is currently supported on macOS and Windows.".into())
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
    let generated_project = temp.join("bambu-project.3mf");
    let result = (|| {
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
        let (process_override_keys, filament_override_keys) = bambu_override_keys(recommendations);
        let project_settings = build_bambu_project_settings(
            &machine,
            &process,
            &filament,
            machine_name,
            process_name,
            filament_name,
            &process_override_keys,
            &filament_override_keys,
        );
        write_bambu_family_project_3mf(
            source,
            &generated_project,
            orientation_id,
            metadata_json,
            &project_settings,
            "BambuStudio-02.07.01.62",
        )?;
        let applied = validate_bambu_family_project_settings(&generated_project, &expected)?;
        validate_bambu_family_override_markers(
            &generated_project,
            &process_override_keys,
            &filament_override_keys,
        )?;
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

fn validate_bambu_family_effective_settings(
    executable: &Path,
    slicer: &str,
    project: &Path,
    expected: &[(String, String, Value)],
    directory: &Path,
) -> Result<(), String> {
    let info = Command::new(executable)
        .arg(project)
        .arg("--info")
        .output()
        .map_err(|e| format!("Could not validate the project with {slicer}: {e}"))?;
    if !info.status.success() {
        return Err(format!(
            "{slicer} could not reopen the generated project ({}). {}{}",
            info.status,
            String::from_utf8_lossy(&info.stdout),
            String::from_utf8_lossy(&info.stderr)
        ));
    }
    let effective_path = directory.join("effective-settings.json");
    let exported = Command::new(executable)
        .arg(project)
        .arg("--export-settings")
        .arg(&effective_path)
        .output()
        .map_err(|e| format!("Could not export {slicer}'s effective settings: {e}"))?;
    if !exported.status.success() || !effective_path.is_file() {
        return Err(format!(
            "{slicer} could not expose the project's effective settings ({}). {}{}",
            exported.status,
            String::from_utf8_lossy(&exported.stdout),
            String::from_utf8_lossy(&exported.stderr)
        ));
    }
    let effective: Value = serde_json::from_reader(BufReader::new(
        File::open(&effective_path).map_err(|e| e.to_string())?,
    ))
    .map_err(|e| format!("{slicer} exported invalid effective settings: {e}"))?;
    for (canonical, key, expected_value) in expected {
        let actual = effective
            .get(key)
            .ok_or_else(|| format!("{slicer}'s effective settings omit '{key}' ({canonical})."))?;
        if !equivalent_project_value(actual, expected_value) {
            return Err(format!(
                "{slicer} did not activate {canonical}: expected {}, found {}.",
                expected_value, actual
            ));
        }
    }
    Ok(())
}

fn export_orca_project(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    printer_id: &str,
    recommendations: &[RecommendationInput],
) -> Result<ManufacturingPackageResult, String> {
    let executable = find_executable("orca").ok_or_else(|| {
        "OrcaSlicer was not detected. Install it to create a native Orca project 3MF.".to_string()
    })?;
    let resources = orca_resources(&executable)?;
    let material = recommendations
        .iter()
        .find(|item| item.setting == "material")
        .map(|item| value_text(&item.value))
        .unwrap_or_else(|| "PLA".into());
    let spec = orca_profile_spec(printer_id, &material)?;
    let temp = unique_temp_dir()?;
    let generated_project = temp.join("orca-project.3mf");
    let result = (|| {
        let machine = resolve_profile(
            &resources.join(spec.machine_dir),
            spec.machine_name,
            &mut HashSet::new(),
        )?;
        let mut process = resolve_profile(
            &resources.join(spec.process_dir),
            spec.process_name,
            &mut HashSet::new(),
        )?;
        let mut filament = resolve_profile(
            &resources.join(spec.filament_dir),
            &spec.filament_name,
            &mut HashSet::new(),
        )?;
        apply_bambu_recommendations(&mut process, &mut filament, recommendations);
        let expected = expected_bambu_project_values(&process, &filament, recommendations);
        let (process_override_keys, filament_override_keys) = bambu_override_keys(recommendations);
        let project_settings = build_bambu_project_settings(
            &machine,
            &process,
            &filament,
            spec.machine_name,
            spec.process_name,
            &spec.filament_name,
            &process_override_keys,
            &filament_override_keys,
        );
        write_bambu_family_project_3mf(
            source,
            &generated_project,
            orientation_id,
            metadata_json,
            &project_settings,
            "OrcaSlicer-2.4.0",
        )?;
        let applied = validate_bambu_family_project_settings(&generated_project, &expected)?;
        validate_bambu_family_override_markers(
            &generated_project,
            &process_override_keys,
            &filament_override_keys,
        )?;
        validate_bambu_family_effective_settings(
            &executable,
            "OrcaSlicer",
            &generated_project,
            &expected,
            &temp,
        )?;
        fs::copy(&generated_project, target).map_err(|e| {
            format!(
                "The validated OrcaSlicer project could not be saved to {}: {e}",
                target.display()
            )
        })?;
        let mut warnings = Vec::new();
        if recommendations
            .iter()
            .any(|item| item.setting == "speed_preset")
        {
            warnings.push(
                "Speed preset is advisory because it is not one stable OrcaSlicer process key."
                    .into(),
            )
        }
        Ok(ManufacturingPackageResult {
            path: target.to_string_lossy().into_owned(),
            target: "orca".into(),
            validated: true,
            applied_settings: applied,
            warnings,
        })
    })();
    fs::remove_dir_all(&temp).ok();
    result
}

type PrusaSections = HashMap<String, BTreeMap<String, String>>;

struct PrusaProfileSpec {
    printer_name: &'static str,
    print_name: &'static str,
    filament_name: &'static str,
}

fn prusa_resources(executable: &Path) -> Result<PathBuf, String> {
    let parent = executable
        .parent()
        .ok_or_else(|| "PrusaSlicer installation path is invalid.".to_string())?;
    [
        parent.join("../Resources/profiles/PrusaResearch.ini"),
        parent.join("../../Resources/profiles/PrusaResearch.ini"),
        parent.join("resources/profiles/PrusaResearch.ini"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .ok_or_else(|| "PrusaSlicer's bundled PrusaResearch profiles could not be located.".into())
}

fn prusa_profile_spec(printer_id: &str, material: &str) -> Result<PrusaProfileSpec, String> {
    let (printer_name, print_name, suffix) = match printer_id {
        "prusa-mk4s" => (
            "Original Prusa MK4S 0.4 nozzle",
            "0.20mm STRUCTURAL @MK4S 0.4",
            "MK4S",
        ),
        "prusa-core-one" => (
            "Prusa CORE One 0.4 nozzle",
            "0.20mm STRUCTURAL @COREONE 0.4",
            "COREONE",
        ),
        _ => {
            return Err(
                "PrusaSlicer project export requires a supported Prusa printer profile.".into(),
            )
        }
    };
    let filament_name = match (material, suffix) {
        ("PLA", "MK4S") => "Generic PLA @MK4S",
        ("PETG", "MK4S") => "Generic PETG @MK4S",
        ("ASA", "MK4S") => "Prusament ASA @MK4S",
        ("TPU", "MK4S") => "Generic FLEX @MK4S",
        ("PA-CF", "MK4S") => "Filament PM PA-CFJet @MK4S",
        ("PLA", "COREONE") => "Generic PLA @COREONE",
        ("PETG", "COREONE") => "Generic PETG @COREONE",
        ("ASA", "COREONE") => "Prusament ASA @COREONE",
        ("TPU", "COREONE") => "Generic FLEX @COREONE",
        ("PA-CF", "COREONE") => "Filament PM PA-CFJet @COREONE",
        _ => {
            return Err(format!(
                "PrusaSlicer's bundled profiles do not contain a {material} profile for the selected printer."
            ))
        }
    };
    Ok(PrusaProfileSpec {
        printer_name,
        print_name,
        filament_name,
    })
}

fn parse_prusa_sections(path: &Path) -> Result<PrusaSections, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Cannot read PrusaSlicer profiles {}: {e}", path.display()))?;
    let mut sections = PrusaSections::new();
    let mut current: Option<String> = None;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let name = &trimmed[1..trimmed.len() - 1];
            current = if name.starts_with("print:")
                || name.starts_with("filament:")
                || name.starts_with("printer:")
            {
                Some(name.to_string())
            } else {
                None
            };
            continue;
        }
        let Some(section) = current.as_ref() else {
            continue;
        };
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        sections
            .entry(section.clone())
            .or_default()
            .insert(key.trim().to_string(), value.trim().to_string());
    }
    Ok(sections)
}

fn resolve_prusa_section(
    sections: &PrusaSections,
    kind: &str,
    name: &str,
    visiting: &mut HashSet<String>,
) -> Result<BTreeMap<String, String>, String> {
    let section_name = format!("{kind}:{name}");
    if !visiting.insert(section_name.clone()) {
        return Err(format!(
            "Circular PrusaSlicer profile dependency: {section_name}"
        ));
    }
    let section = sections
        .get(&section_name)
        .ok_or_else(|| format!("Cannot locate PrusaSlicer profile [{section_name}]."))?;
    let mut resolved = BTreeMap::new();
    if let Some(parents) = section.get("inherits") {
        for parent in parents
            .split(';')
            .map(str::trim)
            .filter(|name| !name.is_empty())
        {
            resolved.extend(resolve_prusa_section(sections, kind, parent, visiting)?);
        }
    }
    for (key, value) in section {
        if key != "inherits" {
            resolved.insert(key.clone(), value.clone());
        }
    }
    visiting.remove(&section_name);
    Ok(resolved)
}

fn build_prusa_config(
    sections: &PrusaSections,
    spec: &PrusaProfileSpec,
) -> Result<BTreeMap<String, String>, String> {
    let mut config =
        resolve_prusa_section(sections, "print", spec.print_name, &mut HashSet::new())?;
    config.extend(resolve_prusa_section(
        sections,
        "filament",
        spec.filament_name,
        &mut HashSet::new(),
    )?);
    config.extend(resolve_prusa_section(
        sections,
        "printer",
        spec.printer_name,
        &mut HashSet::new(),
    )?);
    config.insert("print_settings_id".into(), spec.print_name.into());
    config.insert("filament_settings_id".into(), spec.filament_name.into());
    config.insert("printer_settings_id".into(), spec.printer_name.into());
    Ok(config)
}

fn apply_prusa_recommendations(
    config: &mut BTreeMap<String, String>,
    recommendations: &[RecommendationInput],
) -> Vec<(String, String, String)> {
    let mut expected = Vec::new();
    for item in recommendations {
        let raw = value_text(&item.value);
        let lower = raw.to_ascii_lowercase();
        let numeric = numeric_text(&item.value);
        let (key, value) = match item.setting.as_str() {
            "layer_height" => ("layer_height", numeric),
            "wall_loops" => ("perimeters", numeric),
            "top_layers" => ("top_solid_layers", numeric),
            "bottom_layers" => ("bottom_solid_layers", numeric),
            "infill_type" => ("fill_pattern", lower.replace(' ', "")),
            "infill_percent" => (
                "fill_density",
                format!("{}%", numeric.trim_end_matches('%')),
            ),
            "support" => (
                "support_material",
                if lower.starts_with("off") { "0" } else { "1" }.into(),
            ),
            "brim" => (
                "brim_width",
                if lower == "off" { "0".into() } else { numeric },
            ),
            "wall_generator" => (
                "perimeter_generator",
                if lower.contains("arachne") {
                    "arachne"
                } else {
                    "classic"
                }
                .into(),
            ),
            "wall_order" => (
                "external_perimeters_first",
                if lower.starts_with("outer") { "1" } else { "0" }.into(),
            ),
            "seam" => (
                "seam_position",
                if lower.contains("back") {
                    "rear"
                } else if lower.contains("nearest") {
                    "nearest"
                } else if lower.contains("random") {
                    "random"
                } else {
                    "aligned"
                }
                .into(),
            ),
            "nozzle_temperature" => ("temperature", numeric),
            "bed_temperature" => ("bed_temperature", numeric),
            _ => continue,
        };
        config.insert(key.into(), value.clone());
        expected.push((item.setting.clone(), key.into(), value.clone()));
        match item.setting.as_str() {
            "nozzle_temperature" => {
                config.insert("first_layer_temperature".into(), value);
            }
            "bed_temperature" => {
                config.insert("first_layer_bed_temperature".into(), value);
            }
            _ => {}
        }
    }
    expected
}

fn write_prusa_config(path: &Path, config: &BTreeMap<String, String>) -> Result<(), String> {
    let mut file = File::create(path).map_err(|e| {
        format!(
            "Cannot create PrusaSlicer configuration {}: {e}",
            path.display()
        )
    })?;
    for (key, value) in config {
        writeln!(file, "{key} = {value}").map_err(|e| {
            format!(
                "Cannot write PrusaSlicer configuration {}: {e}",
                path.display()
            )
        })?;
    }
    Ok(())
}

fn append_prusa_project_config(
    path: &Path,
    config: &BTreeMap<String, String>,
    metadata_json: &str,
    orientation_id: &str,
) -> Result<(), String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| format!("Cannot update PrusaSlicer project {}: {e}", path.display()))?;
    let mut archive = ZipWriter::new_append(file)
        .map_err(|e| format!("Cannot append PrusaSlicer configuration to the project: {e}"))?;
    archive
        .start_file(
            "Metadata/Slic3r_PE.config",
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|e| format!("Cannot create PrusaSlicer's project configuration: {e}"))?;
    writeln!(archive, "; generated by Check Make 0.2.3")
        .map_err(|e| format!("Cannot write PrusaSlicer project header: {e}"))?;
    for (key, value) in config {
        writeln!(archive, "; {key} = {value}")
            .map_err(|e| format!("Cannot embed PrusaSlicer setting '{key}': {e}"))?;
    }
    archive
        .start_file(
            "Metadata/check_make.json",
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|e| format!("Cannot create Check Make project metadata: {e}"))?;
    archive
        .write_all(metadata_json.as_bytes())
        .map_err(|e| format!("Cannot preserve Check Make project metadata: {e}"))?;
    archive
        .start_file(
            "Metadata/check_make_orientation.txt",
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|e| format!("Cannot create Check Make orientation metadata: {e}"))?;
    archive
        .write_all(orientation_id.as_bytes())
        .map_err(|e| format!("Cannot preserve Check Make orientation metadata: {e}"))?;
    archive
        .finish()
        .map_err(|e| format!("Cannot finish PrusaSlicer project configuration: {e}"))?;
    Ok(())
}

fn parse_prusa_flat_config(content: &str) -> BTreeMap<String, String> {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
                return None;
            }
            trimmed
                .split_once('=')
                .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

fn parse_prusa_embedded_config(content: &str) -> BTreeMap<String, String> {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let setting = trimmed.strip_prefix(';').unwrap_or(trimmed).trim();
            setting
                .split_once('=')
                .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

fn read_prusa_project_config(path: &Path) -> Result<BTreeMap<String, String>, String> {
    let file =
        File::open(path).map_err(|e| format!("Cannot open generated PrusaSlicer project: {e}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Generated PrusaSlicer project is not a valid 3MF archive: {e}"))?;
    let config_name = archive
        .file_names()
        .find(|name| name.to_ascii_lowercase().ends_with("slic3r_pe.config"))
        .map(str::to_string)
        .ok_or_else(|| {
            format!(
                "PrusaSlicer project contains no embedded process configuration (entries: {}).",
                archive.file_names().collect::<Vec<_>>().join(", ")
            )
        })?;
    let mut content = String::new();
    archive
        .by_name(&config_name)
        .map_err(|e| format!("Cannot open embedded PrusaSlicer configuration: {e}"))?
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot read embedded PrusaSlicer configuration: {e}"))?;
    Ok(parse_prusa_embedded_config(&content))
}

fn validate_prusa_values(
    config: &BTreeMap<String, String>,
    expected: &[(String, String, String)],
    source: &str,
) -> Result<Vec<String>, String> {
    let mut applied = Vec::new();
    for (canonical, key, expected_value) in expected {
        let actual = config
            .get(key)
            .ok_or_else(|| format!("{source} omits '{key}' ({canonical})."))?;
        let equivalent = actual == expected_value
            || match (
                actual.trim_end_matches('%').parse::<f64>(),
                expected_value.trim_end_matches('%').parse::<f64>(),
            ) {
                (Ok(actual), Ok(expected)) => (actual - expected).abs() < f64::EPSILON,
                _ => false,
            };
        if !equivalent {
            return Err(format!(
                "{source} did not preserve {canonical}: expected {expected_value}, found {actual}."
            ));
        }
        if !applied.contains(canonical) {
            applied.push(canonical.clone());
        }
    }
    Ok(applied)
}

fn export_prusa_project(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    printer_id: &str,
    recommendations: &[RecommendationInput],
) -> Result<ManufacturingPackageResult, String> {
    let executable = find_executable("prusa").ok_or_else(|| {
        "PrusaSlicer was not detected. Install it to create a native PrusaSlicer project 3MF."
            .to_string()
    })?;
    let profiles = prusa_resources(&executable)?;
    let material = recommendations
        .iter()
        .find(|item| item.setting == "material")
        .map(|item| value_text(&item.value))
        .unwrap_or_else(|| "PLA".into());
    let spec = prusa_profile_spec(printer_id, &material)?;
    let sections = parse_prusa_sections(&profiles)?;
    let mut config = build_prusa_config(&sections, &spec)?;
    let expected = apply_prusa_recommendations(&mut config, recommendations);
    let temp = unique_temp_dir()?;
    let core_project = temp.join("check-make-core.3mf");
    let config_path = temp.join("check-make-prusa.ini");
    let generated_project = temp.join("check-make-prusa.3mf");
    let effective_path = temp.join("effective-prusa.ini");
    let result = (|| {
        write_3mf(source, &core_project, orientation_id, metadata_json)?;
        write_prusa_config(&config_path, &config)?;
        let output = Command::new(&executable)
            .arg("--load")
            .arg(&config_path)
            .arg("--export-3mf")
            .arg("--output")
            .arg(&generated_project)
            .arg(&core_project)
            .output()
            .map_err(|e| format!("Could not create the project with PrusaSlicer: {e}"))?;
        if !output.status.success() || !generated_project.is_file() {
            return Err(format!(
                "PrusaSlicer could not create the project ({}). {}{}",
                output.status,
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        append_prusa_project_config(&generated_project, &config, metadata_json, orientation_id)?;
        let embedded = read_prusa_project_config(&generated_project)?;
        let applied = validate_prusa_values(&embedded, &expected, "PrusaSlicer project")?;
        let info = Command::new(&executable)
            .arg(&generated_project)
            .arg("--info")
            .output()
            .map_err(|e| format!("Could not reopen the project with PrusaSlicer: {e}"))?;
        if !info.status.success() {
            return Err(format!(
                "PrusaSlicer could not reopen the generated project ({}). {}{}",
                info.status,
                String::from_utf8_lossy(&info.stdout),
                String::from_utf8_lossy(&info.stderr)
            ));
        }
        let saved = Command::new(&executable)
            .arg(&generated_project)
            .arg("--save")
            .arg(&effective_path)
            .output()
            .map_err(|e| format!("Could not export PrusaSlicer's effective settings: {e}"))?;
        if !saved.status.success() || !effective_path.is_file() {
            return Err(format!(
                "PrusaSlicer could not expose the project's effective settings ({}). {}{}",
                saved.status,
                String::from_utf8_lossy(&saved.stdout),
                String::from_utf8_lossy(&saved.stderr)
            ));
        }
        let effective = parse_prusa_flat_config(
            &fs::read_to_string(&effective_path)
                .map_err(|e| format!("Cannot read PrusaSlicer's effective settings: {e}"))?,
        );
        validate_prusa_values(&effective, &expected, "PrusaSlicer's effective settings")?;
        fs::copy(&generated_project, target).map_err(|e| {
            format!(
                "The validated PrusaSlicer project could not be saved to {}: {e}",
                target.display()
            )
        })?;
        let mut warnings = Vec::new();
        if recommendations
            .iter()
            .any(|item| item.setting == "speed_preset")
        {
            warnings.push(
                "Speed preset is advisory because it is not one stable PrusaSlicer process key."
                    .into(),
            );
        }
        Ok(ManufacturingPackageResult {
            path: target.to_string_lossy().into_owned(),
            target: "prusa".into(),
            validated: true,
            applied_settings: applied,
            warnings,
        })
    })();
    fs::remove_dir_all(&temp).ok();
    result
}

fn export_creality_project(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    printer_id: &str,
    recommendations: &[RecommendationInput],
) -> Result<ManufacturingPackageResult, String> {
    if ![
        "bambu-x1c",
        "bambu-p1s",
        "bambu-a1",
        "bambu-a1-mini",
        "creality-k1c",
        "creality-ender3-v3",
        "creality-ender3-v3-se",
        "creality-ender3-v3-ke",
    ]
    .contains(&printer_id)
    {
        return Err(
            "The installed Creality Print profile library does not contain the selected printer."
                .into(),
        );
    }
    let executable = find_executable("creality").ok_or_else(|| {
        "Creality Print was not detected. Install it to create a native Creality project 3MF."
            .to_string()
    })?;
    let resources = creality_resources(&executable)?;
    let material = recommendations
        .iter()
        .find(|item| item.setting == "material")
        .map(|item| value_text(&item.value))
        .unwrap_or_else(|| "PLA".into());
    let spec = creality_profile_spec(printer_id, &material)?;
    let temp = unique_temp_dir()?;
    let generated_project = temp.join("creality-project.3mf");
    let result = (|| {
        let machine = resolve_profile(
            &resources.join(spec.machine_dir),
            spec.machine_name,
            &mut HashSet::new(),
        )?;
        let mut process = resolve_profile(
            &resources.join(spec.process_dir),
            spec.process_name,
            &mut HashSet::new(),
        )?;
        let mut filament = resolve_profile(
            &resources.join(spec.filament_dir),
            &spec.filament_name,
            &mut HashSet::new(),
        )?;
        apply_bambu_recommendations(&mut process, &mut filament, recommendations);
        let expected = expected_bambu_project_values(&process, &filament, recommendations);
        let (process_override_keys, filament_override_keys) = bambu_override_keys(recommendations);
        let project_settings = build_bambu_project_settings(
            &machine,
            &process,
            &filament,
            spec.machine_name,
            spec.process_name,
            &spec.filament_name,
            &process_override_keys,
            &filament_override_keys,
        );
        write_bambu_family_project_3mf(
            source,
            &generated_project,
            orientation_id,
            metadata_json,
            &project_settings,
            "CrealityPrint-7.2.0",
        )?;
        let applied = validate_bambu_family_project_settings(&generated_project, &expected)?;
        validate_bambu_family_override_markers(
            &generated_project,
            &process_override_keys,
            &filament_override_keys,
        )?;
        let effective_validation = validate_bambu_family_effective_settings(
            &executable,
            "Creality Print",
            &generated_project,
            &expected,
            &temp,
        );
        fs::copy(&generated_project, target).map_err(|e| {
            format!(
                "The validated Creality Print project could not be saved to {}: {e}",
                target.display()
            )
        })?;
        let mut warnings = Vec::new();
        if let Err(error) = effective_validation {
            warnings.push(format!(
                "Embedded Creality settings and overrides were validated, but this Creality Print build could not perform a headless round-trip: {error}"
            ));
        }
        if recommendations
            .iter()
            .any(|item| item.setting == "speed_preset")
        {
            warnings.push(
                "Speed preset is advisory because it is not one stable Creality Print process key."
                    .into(),
            )
        }
        Ok(ManufacturingPackageResult {
            path: target.to_string_lossy().into_owned(),
            target: "creality".into(),
            validated: true,
            applied_settings: applied,
            warnings,
        })
    })();
    fs::remove_dir_all(&temp).ok();
    result
}

struct CuraProfileSpec {
    machine_definition: &'static str,
    extruder_definition: &'static str,
    quality_definition: &'static str,
    quality_type: &'static str,
    machine_id: &'static str,
    machine_name: &'static str,
    material_id: &'static str,
    variant: Option<(&'static str, &'static str)>,
}

fn cura_profile_spec(printer_id: &str, material: &str) -> Result<CuraProfileSpec, String> {
    let supported_materials: &[&str] = match printer_id {
        "creality-ender3-v3-se" => &["PLA", "PETG", "TPU"],
        "creality-ender3-v3-ke" | "elegoo-neptune4pro" => &["PLA", "PETG", "ASA", "TPU"],
        _ => return Err(
            "The installed UltiMaker Cura profile library does not contain the selected printer."
                .into(),
        ),
    };
    if !supported_materials.contains(&material) {
        return Err(format!(
            "UltiMaker Cura has no compatible {material} material profile for the selected printer."
        ));
    }
    let material_id = match material {
        "PLA" => "generic_pla_175",
        "PETG" => "generic_petg_175",
        "ASA" => "generic_asa_175",
        "TPU" => "generic_tpu_175",
        _ => {
            return Err(format!(
                "Unsupported UltiMaker Cura material profile: {material}."
            ))
        }
    };
    Ok(match printer_id {
        "creality-ender3-v3-se" => CuraProfileSpec {
            machine_definition: "creality_ender3v3se",
            extruder_definition: "creality_base_extruder_0",
            quality_definition: "creality_base",
            quality_type: "standard",
            machine_id: "check_make_creality_ender3_v3_se",
            machine_name: "Check Make Creality Ender-3 V3 SE",
            material_id,
            variant: Some((
                "creality/creality_ender3v3se_0.4.inst.cfg",
                "creality_ender3v3se_0.4",
            )),
        },
        "creality-ender3-v3-ke" => CuraProfileSpec {
            machine_definition: "creality_ender3v3ke",
            extruder_definition: "creality_base_extruder_0",
            quality_definition: "creality_base",
            quality_type: "standard",
            machine_id: "check_make_creality_ender3_v3_ke",
            machine_name: "Check Make Creality Ender-3 V3 KE",
            material_id,
            variant: Some((
                "creality/creality_ender3v3ke_0.4.inst.cfg",
                "creality_ender3v3ke_0.4",
            )),
        },
        "elegoo-neptune4pro" => CuraProfileSpec {
            machine_definition: "elegoo_neptune_4pro",
            extruder_definition: "elegoo_extruder_0",
            quality_definition: "elegoo_neptune_4",
            quality_type: "Elegoo_layer_020",
            machine_id: "check_make_elegoo_neptune_4_pro",
            machine_name: "Check Make ELEGOO Neptune 4 Pro",
            material_id,
            variant: None,
        },
        _ => unreachable!(),
    })
}

fn apply_cura_recommendations(
    values: &mut BTreeMap<String, String>,
    recommendations: &[RecommendationInput],
) -> Vec<(String, String, String)> {
    let mut expected = Vec::new();
    for item in recommendations {
        let raw = value_text(&item.value);
        let lower = raw.to_ascii_lowercase();
        let numeric = numeric_text(&item.value);
        let mapped = match item.setting.as_str() {
            "layer_height" => Some(("layer_height", numeric.clone())),
            "wall_loops" => Some(("wall_line_count", numeric.clone())),
            "top_layers" => Some(("top_layers", numeric.clone())),
            "bottom_layers" => Some(("bottom_layers", numeric.clone())),
            "infill_type" => Some(("infill_pattern", lower.replace(' ', ""))),
            "infill_percent" => Some(("infill_sparse_density", numeric.clone())),
            "support" => Some((
                "support_enable",
                if lower.starts_with("off") {
                    "False"
                } else {
                    "True"
                }
                .into(),
            )),
            "wall_order" => Some((
                "inset_direction",
                if lower.starts_with("outer") {
                    "outside_in"
                } else {
                    "inside_out"
                }
                .into(),
            )),
            "seam" => Some((
                "z_seam_type",
                if lower.contains("back") {
                    "back"
                } else if lower.contains("random") {
                    "random"
                } else if lower.contains("nearest") {
                    "shortest"
                } else {
                    "sharpest_corner"
                }
                .into(),
            )),
            _ => None,
        };
        if let Some((key, value)) = mapped {
            values.insert(key.into(), value.clone());
            expected.push((item.setting.clone(), key.into(), value));
            continue;
        }
        match item.setting.as_str() {
            "brim" => {
                let adhesion = if lower == "off" { "none" } else { "brim" };
                values.insert("adhesion_type".into(), adhesion.into());
                expected.push((
                    item.setting.clone(),
                    "adhesion_type".into(),
                    adhesion.into(),
                ));
                if lower != "off" {
                    values.insert("brim_width".into(), numeric.clone());
                    expected.push((item.setting.clone(), "brim_width".into(), numeric));
                }
            }
            "nozzle_temperature" => {
                for key in [
                    "material_print_temperature",
                    "material_print_temperature_layer_0",
                ] {
                    values.insert(key.into(), numeric.clone());
                    expected.push((item.setting.clone(), key.into(), numeric.clone()));
                }
            }
            "bed_temperature" => {
                for key in [
                    "material_bed_temperature",
                    "material_bed_temperature_layer_0",
                ] {
                    values.insert(key.into(), numeric.clone());
                    expected.push((item.setting.clone(), key.into(), numeric.clone()));
                }
            }
            _ => {}
        }
    }
    expected
}

fn cura_quality_config(
    id: &str,
    name: &str,
    definition: &str,
    quality_type: &str,
    position: Option<&str>,
    values: &BTreeMap<String, String>,
) -> String {
    let position_metadata = position
        .map(|value| format!("position = {value}\nintent_category = default\n"))
        .unwrap_or_default();
    let mut result = format!(
        "[general]\nversion = 4\nname = {name}\nid = {id}\ndefinition = {definition}\n\n[metadata]\ntype = quality_changes\nsetting_version = 27\nquality_type = {quality_type}\n{position_metadata}\n[values]\n"
    );
    for (key, value) in values {
        result.push_str(&format!("{key} = {value}\n"));
    }
    result
}

fn append_cura_workspace(
    project: &Path,
    resources: &Path,
    spec: &CuraProfileSpec,
    values: &BTreeMap<String, String>,
    metadata_json: &str,
    orientation_id: &str,
) -> Result<(), String> {
    let machine_definition = fs::read(
        resources
            .join("definitions")
            .join(format!("{}.def.json", spec.machine_definition)),
    )
    .map_err(|e| format!("Cannot read Cura machine definition: {e}"))?;
    let extruder_definition = fs::read(
        resources
            .join("extruders")
            .join(format!("{}.def.json", spec.extruder_definition)),
    )
    .map_err(|e| format!("Cannot read Cura extruder definition: {e}"))?;
    let material = fs::read(
        resources
            .join("materials")
            .join(format!("{}.xml.fdm_material", spec.material_id)),
    )
    .map_err(|e| format!("Cannot read Cura material profile: {e}"))?;
    let variant = spec
        .variant
        .map(|(path, _)| fs::read(resources.join("variants").join(path)))
        .transpose()
        .map_err(|e| format!("Cannot read Cura nozzle variant: {e}"))?;
    let machine_id = spec.machine_id;
    let extruder_id = format!("{machine_id}_extruder_0");
    let variant_id = spec.variant.map(|(_, id)| id).unwrap_or("empty_variant");
    let global_quality_id = "check_make_quality_changes";
    let extruder_quality_id = "check_make_quality_changes_extruder_0";
    let global_stack = format!(
        "[general]\nversion = 6\nname = {}\nid = {machine_id}\n\n[metadata]\nsetting_version = 27\ntype = machine\ngroup_id = check-make\n\n[containers]\n0 = empty_user\n1 = {global_quality_id}\n2 = empty_intent\n3 = empty_quality\n4 = empty_material\n5 = empty_variant\n6 = empty_definition_changes\n7 = {}\n",
        spec.machine_name, spec.machine_definition
    );
    let extruder_stack = format!(
        "[general]\nversion = 6\nname = Extruder 1\nid = {extruder_id}\n\n[metadata]\nsetting_version = 27\ntype = extruder_train\nposition = 0\nmachine = {machine_id}\nenabled = True\n\n[containers]\n0 = empty_user\n1 = {extruder_quality_id}\n2 = empty_intent\n3 = empty_quality\n4 = {}\n5 = {variant_id}\n6 = empty_definition_changes\n7 = {}\n",
        spec.material_id, spec.extruder_definition
    );
    let global_quality = cura_quality_config(
        global_quality_id,
        "Check Make recommendations",
        spec.quality_definition,
        spec.quality_type,
        None,
        values,
    );
    let extruder_quality = cura_quality_config(
        extruder_quality_id,
        "Check Make recommendations",
        spec.quality_definition,
        spec.quality_type,
        Some("0"),
        &BTreeMap::new(),
    );
    let preferences = "[general]\nversion = 7\nvisible_settings = layer_height;wall_line_count;top_layers;bottom_layers;infill_pattern;infill_sparse_density;support_enable;adhesion_type;brim_width;inset_direction;z_seam_type;material_print_temperature;material_bed_temperature\n\n[cura]\nactive_mode = custom\ncategories_expanded = shell;infill;material;support;platform_adhesion\n";
    let version =
        "[versions]\ncura_version = 5.13.0\nbuild_type = release\nis_debug_mode = False\n";
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(project)
        .map_err(|e| format!("Cannot update Cura project {}: {e}", project.display()))?;
    let mut archive = ZipWriter::new_append(file)
        .map_err(|e| format!("Cannot append the Cura workspace: {e}"))?;
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in [
        (
            format!("Cura/{}.def.json", spec.machine_definition),
            machine_definition.as_slice(),
        ),
        (
            format!("Cura/{}.def.json", spec.extruder_definition),
            extruder_definition.as_slice(),
        ),
        (
            format!("Cura/{}.xml.fdm_material", spec.material_id),
            material.as_slice(),
        ),
        (
            format!("Cura/{machine_id}.global.cfg"),
            global_stack.as_bytes(),
        ),
        (
            format!("Cura/{extruder_id}.extruder.cfg"),
            extruder_stack.as_bytes(),
        ),
        (
            format!("Cura/{global_quality_id}.inst.cfg"),
            global_quality.as_bytes(),
        ),
        (
            format!("Cura/{extruder_quality_id}.inst.cfg"),
            extruder_quality.as_bytes(),
        ),
        ("Cura/preferences.cfg".into(), preferences.as_bytes()),
        ("Cura/version.ini".into(), version.as_bytes()),
        ("Metadata/check_make.json".into(), metadata_json.as_bytes()),
        (
            "Metadata/check_make_orientation.txt".into(),
            orientation_id.as_bytes(),
        ),
    ] {
        archive
            .start_file(name, options)
            .map_err(|e| format!("Cannot create Cura workspace entry: {e}"))?;
        archive
            .write_all(bytes)
            .map_err(|e| format!("Cannot write Cura workspace entry: {e}"))?;
    }
    if let (Some((_, variant_id)), Some(variant)) = (spec.variant, variant.as_deref()) {
        archive
            .start_file(format!("Cura/{variant_id}.inst.cfg"), options)
            .map_err(|e| format!("Cannot create Cura nozzle variant entry: {e}"))?;
        archive
            .write_all(variant)
            .map_err(|e| format!("Cannot write Cura nozzle variant entry: {e}"))?;
    }
    archive
        .finish()
        .map_err(|e| format!("Cannot finish Cura workspace: {e}"))?;
    Ok(())
}

fn read_ini_values(content: &str) -> BTreeMap<String, String> {
    let mut in_values = false;
    let mut values = BTreeMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_values = trimmed.eq_ignore_ascii_case("[values]");
            continue;
        }
        if in_values {
            if let Some((key, value)) = trimmed.split_once('=') {
                values.insert(key.trim().into(), value.trim().into());
            }
        }
    }
    values
}

fn validate_cura_workspace(
    project: &Path,
    spec: &CuraProfileSpec,
    expected: &[(String, String, String)],
) -> Result<Vec<String>, String> {
    let file =
        File::open(project).map_err(|e| format!("Cannot open generated Cura project: {e}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Generated Cura project is not a valid 3MF archive: {e}"))?;
    let names: HashSet<String> = archive.file_names().map(str::to_string).collect();
    for required in [
        format!("Cura/{}.def.json", spec.machine_definition),
        format!("Cura/{}.def.json", spec.extruder_definition),
        format!("Cura/{}.xml.fdm_material", spec.material_id),
        format!("Cura/{}.global.cfg", spec.machine_id),
        format!("Cura/{}_extruder_0.extruder.cfg", spec.machine_id),
        "Cura/check_make_quality_changes.inst.cfg".into(),
        "Cura/preferences.cfg".into(),
        "Cura/version.ini".into(),
        "Metadata/check_make.json".into(),
    ] {
        if !names.contains(&required) {
            return Err(format!(
                "Cura project is missing required workspace entry '{required}'."
            ));
        }
    }
    if let Some((_, variant_id)) = spec.variant {
        let required = format!("Cura/{variant_id}.inst.cfg");
        if !names.contains(&required) {
            return Err(format!(
                "Cura project is missing required nozzle variant '{required}'."
            ));
        }
    }
    let mut quality = String::new();
    archive
        .by_name("Cura/check_make_quality_changes.inst.cfg")
        .map_err(|e| format!("Cannot open Cura process settings: {e}"))?
        .read_to_string(&mut quality)
        .map_err(|e| format!("Cannot read Cura process settings: {e}"))?;
    let values = read_ini_values(&quality);
    validate_prusa_values(&values, expected, "Cura workspace")
}

fn export_cura_project(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    printer_id: &str,
    recommendations: &[RecommendationInput],
) -> Result<ManufacturingPackageResult, String> {
    let executable = find_executable("cura").ok_or_else(|| {
        "UltiMaker Cura was not detected. Install it to create a native Cura project 3MF."
            .to_string()
    })?;
    let resources = cura_resources(&executable)?;
    let material = recommendations
        .iter()
        .find(|item| item.setting == "material")
        .map(|item| value_text(&item.value))
        .unwrap_or_else(|| "PLA".into());
    let spec = cura_profile_spec(printer_id, &material)?;
    let mut values = BTreeMap::from([("machine_nozzle_size".into(), "0.4".into())]);
    let expected = apply_cura_recommendations(&mut values, recommendations);
    let temp = unique_temp_dir()?;
    let generated_project = temp.join("check-make-cura.3mf");
    let result = (|| {
        write_3mf(source, &generated_project, orientation_id, metadata_json)?;
        append_cura_workspace(
            &generated_project,
            &resources,
            &spec,
            &values,
            metadata_json,
            orientation_id,
        )?;
        let applied = validate_cura_workspace(&generated_project, &spec, &expected)?;
        fs::copy(&generated_project, target).map_err(|e| {
            format!(
                "The validated Cura workspace could not be saved to {}: {e}",
                target.display()
            )
        })?;
        let mut warnings = vec![
            "Cura workspace structure and embedded settings were validated; this Cura installation does not expose a stable headless project-settings round-trip."
                .into(),
        ];
        if recommendations
            .iter()
            .any(|item| item.setting == "wall_generator")
        {
            warnings.push(
                "Cura 5 uses its Arachne wall engine without a separate portable wall-generator setting."
                    .into(),
            );
        }
        if recommendations
            .iter()
            .any(|item| item.setting == "speed_preset")
        {
            warnings.push(
                "Speed preset is advisory because it is not one stable UltiMaker Cura process key."
                    .into(),
            );
        }
        Ok(ManufacturingPackageResult {
            path: target.to_string_lossy().into_owned(),
            target: "cura".into(),
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
    if !["generic", "bambu", "orca", "prusa", "cura", "creality"].contains(&target.as_str()) {
        return Err(format!("Unsupported export target: {target}."));
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
    if target == "orca" {
        return export_orca_project(
            &source,
            &destination,
            &orientation_id,
            &metadata_json,
            &printer_id,
            &recommendations,
        )
        .map(Some);
    }
    if target == "prusa" {
        return export_prusa_project(
            &source,
            &destination,
            &orientation_id,
            &metadata_json,
            &printer_id,
            &recommendations,
        )
        .map(Some);
    }
    if target == "cura" {
        return export_cura_project(
            &source,
            &destination,
            &orientation_id,
            &metadata_json,
            &printer_id,
            &recommendations,
        )
        .map(Some);
    }
    if target == "creality" {
        return export_creality_project(
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
    Ok(Some(ManufacturingPackageResult{path:destination.to_string_lossy().into_owned(),target:target.clone(),validated:true,applied_settings:Vec::new(),warnings:vec![format!("Process recommendations are embedded as Check Make metadata; {target} may not apply them automatically.")]}))
}

#[tauri::command]
fn create_and_open_bambu_project(
    path: String,
    orientation_id: String,
    metadata_json: String,
    default_name: String,
    printer_id: String,
    recommendations_json: String,
) -> Result<ManufacturingPackageResult, String> {
    let source = validate_model_path(&path)?;
    let recommendations: Vec<RecommendationInput> = serde_json::from_str(&recommendations_json)
        .map_err(|e| format!("Invalid recommendation payload: {e}"))?;
    let executable =
        find_executable("bambu").ok_or_else(|| "Bambu Studio was not detected.".to_string())?;
    let directory = unique_temp_dir()?;
    let file_name = Path::new(&default_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("check-make-project.3mf");
    let destination = directory.join(file_name);
    let mut result = export_bambu_project(
        &source,
        &destination,
        &orientation_id,
        &metadata_json,
        &printer_id,
        &recommendations,
    )?;
    launch_bambu_project(&executable, &destination)?;
    result.warnings.push(
        "Opened from a temporary Check Make project. Use Save Project As in Bambu Studio to keep a permanent copy."
            .into(),
    );
    Ok(result)
}

#[tauri::command]
fn estimate_plan_metrics(
    path: String,
    orientation_id: String,
    printer_id: String,
    recommendations_json: String,
) -> Result<PlanMetrics, String> {
    let source = validate_model_path(&path)?;
    let executable = find_executable("orca").ok_or_else(|| "OrcaSlicer is required for exact cost and weight estimates.".to_string())?;
    let recommendations: Vec<RecommendationInput> = serde_json::from_str(&recommendations_json)
        .map_err(|e| format!("Invalid recommendation payload: {e}"))?;
    let temp = unique_temp_dir()?;
    let unsliced = temp.join("check-make-estimate.3mf");
    let output_dir = temp.join("sliced-output");
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    let result = (|| {
        export_orca_project(&source, &unsliced, &orientation_id, "{\"purpose\":\"plan-estimate\"}", &printer_id, &recommendations)?;
        let output = Command::new(&executable)
            .arg("--slice").arg("0")
            .arg("--outputdir").arg(&output_dir)
            .arg(&unsliced)
            .output()
            .map_err(|e| format!("Could not start OrcaSlicer estimation: {e}"))?;
        if !output.status.success() {
            return Err(format!("OrcaSlicer could not slice the candidate plan ({}). {}{}", output.status, String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)));
        }
        let gcode = fs::read_dir(&output_dir).map_err(|e| e.to_string())?
            .filter_map(Result::ok).map(|entry| entry.path())
            .find(|path| path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref() == Some("gcode"))
            .ok_or_else(|| "OrcaSlicer completed without creating a G-code file.".to_string())?;
        read_gcode_plan_metrics(&gcode)
    })();
    fs::remove_dir_all(&temp).ok();
    result
}

fn package_check(id: &str, label: &str, passed: bool, detail: impl Into<String>) -> PackageValidationCheck {
    PackageValidationCheck { id: id.into(), label: label.into(), passed, detail: detail.into() }
}

#[tauri::command]
fn validate_manufacturing_package(path: String, target: String) -> Result<PackageValidationReport, String> {
    let source = Path::new(&path).canonicalize().map_err(|e| format!("Cannot reopen exported 3MF: {e}"))?;
    if source.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref() != Some("3mf") {
        return Err("Package validation requires a 3MF file.".into());
    }
    let file = File::open(&source).map_err(|e| format!("Cannot reopen exported 3MF: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("The exported file is not a valid 3MF archive: {e}"))?;
    let mut names = Vec::new();
    let mut searchable = String::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.ends_with(".model") || name.ends_with(".config") || name.ends_with(".json") || name.ends_with(".txt") {
            if entry.size() <= 8 * 1024 * 1024 {
                let mut text = String::new();
                entry.read_to_string(&mut text).ok();
                searchable.push_str(&text);
            }
        }
        names.push(name);
    }
    let has_content_types = names.iter().any(|name| name == "[Content_Types].xml");
    let has_root_model = names.iter().any(|name| name == "3D/3dmodel.model");
    let has_mesh = searchable.contains("<triangle") && searchable.contains("<vertex");
    let has_build = searchable.contains("<build") && searchable.contains("<item");
    let uses_mm = searchable.contains("unit=\"millimeter\"");
    let has_check_make = searchable.to_ascii_lowercase().contains("check make")
        || searchable.to_ascii_lowercase().contains("checkmake")
        || names.iter().any(|name| name.to_ascii_lowercase().contains("check_make"));
    let settings_entry = match target.as_str() {
        "bambu" | "orca" | "creality" => Some("Metadata/project_settings.config"),
        "prusa" => Some("Metadata/Slic3r_PE.config"),
        "cura" => Some("Cura/check_make_quality_changes.inst.cfg"),
        _ => None,
    };
    let has_settings = settings_entry.map(|expected| names.iter().any(|name| name == expected)).unwrap_or(true);
    let mut checks = vec![
        package_check("archive", "Reopen 3MF archive", true, format!("{} entries read successfully", names.len())),
        package_check("content-types", "3MF package declarations", has_content_types, "[Content_Types].xml is present"),
        package_check("root-model", "Root model relationship", has_root_model, "3D/3dmodel.model is present"),
        package_check("geometry", "Printable triangle geometry", has_mesh, "Vertices and triangles are present"),
        package_check("build", "Build placement", has_build, "The project contains a build item"),
        package_check("units", "Millimetre units", uses_mm, "Model units are explicitly millimetres"),
        package_check("analysis", "Check Make analysis metadata", has_check_make, "Analysis provenance is embedded"),
    ];
    if let Some(expected) = settings_entry {
        checks.push(package_check("settings", "Slicer process settings", has_settings, format!("Expected native entry: {expected}")));
    }
    let valid = checks.iter().all(|check| check.passed);
    Ok(PackageValidationReport { valid, target, checks })
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_menu = SubmenuBuilder::new(app, "Check Make")
                .about(None)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let open_project = MenuItemBuilder::with_id("project-open", "Open Project…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save_project = MenuItemBuilder::with_id("project-save", "Save Project…")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&open_project)
                .item(&save_project)
                .separator()
                .close_window()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .fullscreen()
                .build()?;
            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "project-open" => {
                let _ = app.emit("project-open-requested", ());
            }
            "project-save" => {
                let _ = app.emit("project-save-requested", ());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            pick_model_path,
            read_model_bytes,
            cache_normalized_stl,
            save_check_make_project,
            open_check_make_project,
            analyze_stl_native,
            analyze_model_with_openai,
            create_3mf,
            detect_slicer_adapters,
            create_manufacturing_package,
            create_and_open_bambu_project,
            estimate_plan_metrics,
            validate_manufacturing_package
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Check Make")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn always_offers_generic_core_3mf() {
        let adapters = detect_slicer_adapters();
        let adapter = adapters
            .iter()
            .find(|adapter| adapter.target == "generic")
            .unwrap();
        assert!(adapter.available);
        assert_eq!(adapter.capability, "core-3mf");
    }
    #[test]
    fn always_reports_every_slicer_adapter() {
        let adapters = detect_slicer_adapters();
        let targets: Vec<&str> = adapters.iter().map(|adapter| adapter.target.as_str()).collect();
        assert_eq!(targets, vec!["generic", "bambu", "orca", "prusa", "cura", "creality"]);
        for target in ["prusa", "cura"] {
            let adapter = adapters.iter().find(|adapter| adapter.target == target).unwrap();
            assert!(!adapter.supported_printer_ids.is_empty());
            if find_executable(target).is_some() {
                assert!(adapter.available, "{target} is installed but was not exposed as available");
                assert_eq!(adapter.capability, "project-3mf");
            }
        }
    }
    #[test]
    fn maps_every_printer_to_an_orca_profile() {
        for printer_id in [
            "bambu-x1c",
            "bambu-p1s",
            "bambu-a1",
            "bambu-a1-mini",
            "prusa-mk4s",
            "prusa-core-one",
            "creality-k1c",
            "creality-ender3-v3",
            "creality-ender3-v3-se",
            "creality-ender3-v3-ke",
            "elegoo-neptune4pro",
            "anycubic-kobra3",
        ] {
            let spec = orca_profile_spec(printer_id, "PETG").unwrap();
            assert!(!spec.machine_name.is_empty());
            assert!(!spec.process_name.is_empty());
            assert!(spec.filament_name.contains("PETG"));
        }
    }
    #[test]
    fn maps_ender_v3_variants_to_exact_cura_profiles() {
        let se = cura_profile_spec("creality-ender3-v3-se", "PETG").unwrap();
        assert_eq!(se.machine_definition, "creality_ender3v3se");
        assert_eq!(se.variant.unwrap().1, "creality_ender3v3se_0.4");
        assert!(cura_profile_spec("creality-ender3-v3-se", "ASA").is_err());

        let ke = cura_profile_spec("creality-ender3-v3-ke", "ASA").unwrap();
        assert_eq!(ke.machine_definition, "creality_ender3v3ke");
        assert_eq!(ke.variant.unwrap().1, "creality_ender3v3ke_0.4");
        assert!(cura_profile_spec("creality-ender3-v3-ke", "PA-CF").is_err());
    }
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
        assert_eq!(result.metadata.encoding, "ascii");
        assert!(result
            .metadata
            .clues
            .iter()
            .any(|clue| clue.source == "stl-solid-name" && clue.value == "triangle"));
    }
    #[test]
    fn extracts_binary_header_and_filename_clues_without_exporter_noise() {
        let mut bytes = vec![0u8; 84 + 50];
        let header = b"Wall Bracket generated by Fusion 360";
        bytes[..header.len()].copy_from_slice(header);
        bytes[80..84].copy_from_slice(&1u32.to_le_bytes());
        let metadata = extract_model_metadata(Path::new("wall_bracket_final_v4.stl"), &bytes);
        assert_eq!(metadata.encoding, "binary");
        assert_eq!(metadata.clues.len(), 2);
        assert_eq!(metadata.clues[0].source, "stl-binary-header");
        assert_eq!(metadata.clues[0].value, "wall bracket");
        assert_eq!(metadata.clues[1].source, "file-name");
        assert_eq!(metadata.clues[1].value, "wall bracket");

        let mut path_header_bytes = vec![0u8; 84 + 50];
        let path_header = b"C:\\Users\\Alice\\phone_holder.stl";
        path_header_bytes[..path_header.len()].copy_from_slice(path_header);
        path_header_bytes[80..84].copy_from_slice(&1u32.to_le_bytes());
        let path_metadata = extract_model_metadata(Path::new("export.stl"), &path_header_bytes);
        assert_eq!(path_metadata.clues.len(), 1);
        assert_eq!(path_metadata.clues[0].value, "phone holder");
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
    fn reopens_and_validates_reference_core_3mf() {
        let source = std::env::temp_dir().join(format!("check-make-validation-{}.stl", std::process::id()));
        let target = source.with_extension("3mf");
        fs::write(&source, "solid reference\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 20 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid reference\n").unwrap();
        write_3mf(&source, &target, "as-imported", "{\"product\":\"Check Make\"}").unwrap();

        let report = validate_manufacturing_package(target.to_string_lossy().into_owned(), "generic".into()).unwrap();
        assert!(report.valid);
        assert!(report.checks.iter().all(|check| check.passed));
        assert!(report.checks.iter().any(|check| check.id == "geometry"));
        assert!(report.checks.iter().any(|check| check.id == "analysis"));

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
        assert_eq!(process["wall_sequence"], "outer wall/inner wall");
        assert_eq!(filament["nozzle_temperature"], json!(["250"]));
        assert_eq!(applied.len(), 4);
    }
    #[test]
    fn maps_canonical_recommendations_to_prusa_config() {
        let mut config = BTreeMap::new();
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
        let expected = apply_prusa_recommendations(&mut config, &recommendations);
        assert_eq!(config["perimeters"], "5");
        assert_eq!(config["fill_density"], "25%");
        assert_eq!(config["external_perimeters_first"], "1");
        assert_eq!(config["temperature"], "250");
        assert_eq!(config["first_layer_temperature"], "250");
        assert_eq!(expected.len(), 4);
    }
    #[test]
    fn maps_canonical_recommendations_to_cura_quality_changes() {
        let mut values = BTreeMap::new();
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
        let expected = apply_cura_recommendations(&mut values, &recommendations);
        assert_eq!(values["wall_line_count"], "5");
        assert_eq!(values["infill_sparse_density"], "25");
        assert_eq!(values["inset_direction"], "outside_in");
        assert_eq!(values["material_print_temperature"], "250");
        assert_eq!(values["material_print_temperature_layer_0"], "250");
        assert_eq!(expected.len(), 5);
    }
    #[test]
    #[ignore = "requires an installed OrcaSlicer application"]
    fn exports_orca_project_with_effective_settings() {
        if find_executable("orca").is_none() {
            return;
        }
        let source = PathBuf::from("../tests/fixtures/cube.stl");
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
                setting: "nozzle_temperature".into(),
                value: json!("245 °C"),
            },
            RecommendationInput {
                setting: "bed_temperature".into(),
                value: json!("75 °C"),
            },
        ];
        for printer_id in [
            "elegoo-neptune4pro",
            "creality-ender3-v3-se",
            "creality-ender3-v3-ke",
        ] {
            let target = std::env::temp_dir().join(format!(
                "check-make-orca-{printer_id}-{}.3mf",
                std::process::id()
            ));
            let result = export_orca_project(
                &source,
                &target,
                "as-imported",
                "{}",
                printer_id,
                &recommendations,
            )
            .unwrap_or_else(|error| panic!("{printer_id}: {error}"));
            assert!(result.validated);
            assert!(result.applied_settings.contains(&"wall_loops".into()));
            assert!(result.applied_settings.contains(&"infill_percent".into()));
            let settings = read_bambu_family_project_settings(&target).unwrap();
            assert_eq!(settings["wall_loops"], "5");
            assert_eq!(settings["sparse_infill_density"], "25%");
            assert_eq!(settings["sparse_infill_pattern"], "gyroid");
            fs::remove_file(target).ok();
        }
    }
    #[test]
    #[ignore = "requires an installed OrcaSlicer application"]
    fn slices_plan_and_reads_material_and_time_metrics() {
        if find_executable("orca").is_none() { return; }
        let recommendations = serde_json::to_string(&vec![
            json!({"setting":"material","value":"PLA"}),
            json!({"setting":"layer_height","value":"0.20 mm"}),
            json!({"setting":"wall_loops","value":3}),
            json!({"setting":"top_layers","value":5}),
            json!({"setting":"bottom_layers","value":4}),
            json!({"setting":"infill_type","value":"Gyroid"}),
            json!({"setting":"infill_percent","value":15}),
            json!({"setting":"support","value":"Off"}),
            json!({"setting":"brim","value":"Off"})
        ]).unwrap();
        let metrics = estimate_plan_metrics(
            "../tests/fixtures/cube.stl".into(), "as-imported".into(), "bambu-x1c".into(), recommendations,
        ).unwrap();
        assert!(metrics.material_grams > 0.0);
        assert!(metrics.estimated_time_seconds > 0.0);
        assert!(metrics.material_volume_cm3 > 0.0);
    }
    #[test]
    #[ignore = "requires OrcaSlicer's installed system profile library"]
    fn resolves_all_orca_machine_process_and_material_profiles() {
        let Some(executable) = find_executable("orca") else {
            return;
        };
        let resources = orca_resources(&executable).unwrap();
        for printer_id in [
            "bambu-x1c",
            "bambu-p1s",
            "bambu-a1",
            "bambu-a1-mini",
            "prusa-mk4s",
            "prusa-core-one",
            "creality-k1c",
            "creality-ender3-v3",
            "creality-ender3-v3-se",
            "creality-ender3-v3-ke",
            "elegoo-neptune4pro",
            "anycubic-kobra3",
        ] {
            for material in ["PLA", "PETG", "ASA", "TPU", "PA-CF"] {
                let spec = orca_profile_spec(printer_id, material).unwrap();
                resolve_profile(
                    &resources.join(spec.machine_dir),
                    spec.machine_name,
                    &mut HashSet::new(),
                )
                .unwrap_or_else(|error| panic!("{printer_id} machine: {error}"));
                resolve_profile(
                    &resources.join(spec.process_dir),
                    spec.process_name,
                    &mut HashSet::new(),
                )
                .unwrap_or_else(|error| panic!("{printer_id} process: {error}"));
                resolve_profile(
                    &resources.join(spec.filament_dir),
                    &spec.filament_name,
                    &mut HashSet::new(),
                )
                .unwrap_or_else(|error| panic!("{printer_id} {material}: {error}"));
            }
        }
    }
    #[test]
    #[ignore = "requires PrusaSlicer's installed PrusaResearch profile bundle"]
    fn resolves_all_prusa_machine_process_and_material_profiles() {
        let Some(executable) = find_executable("prusa") else {
            return;
        };
        let sections = parse_prusa_sections(&prusa_resources(&executable).unwrap()).unwrap();
        for printer_id in ["prusa-mk4s", "prusa-core-one"] {
            for material in ["PLA", "PETG", "ASA", "TPU", "PA-CF"] {
                let spec = prusa_profile_spec(printer_id, material).unwrap();
                let config = build_prusa_config(&sections, &spec)
                    .unwrap_or_else(|error| panic!("{printer_id} {material}: {error}"));
                assert!(config.contains_key("printer_model"));
                assert!(config.contains_key("filament_type"));
                assert!(config.contains_key("layer_height"));
            }
        }
    }
    #[test]
    #[ignore = "requires an installed PrusaSlicer application"]
    fn exports_prusa_project_with_effective_settings() {
        if find_executable("prusa").is_none() {
            return;
        }
        let source = PathBuf::from("../tests/fixtures/cube.stl");
        let target = std::env::temp_dir().join(format!(
            "check-make-prusa-project-{}.3mf",
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
                setting: "nozzle_temperature".into(),
                value: json!("245 °C"),
            },
            RecommendationInput {
                setting: "bed_temperature".into(),
                value: json!("75 °C"),
            },
        ];
        let result = export_prusa_project(
            &source,
            &target,
            "as-imported",
            "{}",
            "prusa-mk4s",
            &recommendations,
        )
        .unwrap();
        assert!(result.validated);
        assert!(result.applied_settings.contains(&"wall_loops".into()));
        assert!(result.applied_settings.contains(&"infill_percent".into()));
        let config = read_prusa_project_config(&target).unwrap();
        assert_eq!(config["perimeters"], "5");
        assert_eq!(config["fill_density"], "25%");
        assert_eq!(config["fill_pattern"], "gyroid");
        let mut archive = ZipArchive::new(File::open(&target).unwrap()).unwrap();
        let mut metadata = String::new();
        archive
            .by_name("Metadata/check_make.json")
            .unwrap()
            .read_to_string(&mut metadata)
            .unwrap();
        assert_eq!(metadata, "{}");
        fs::remove_file(target).ok();
    }
    #[test]
    #[ignore = "requires an installed UltiMaker Cura application"]
    fn exports_cura_workspace_with_embedded_settings() {
        if find_executable("cura").is_none() {
            return;
        }
        let source = PathBuf::from("../tests/fixtures/cube.stl");
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
                setting: "support".into(),
                value: json!("Off"),
            },
            RecommendationInput {
                setting: "nozzle_temperature".into(),
                value: json!("245 °C"),
            },
            RecommendationInput {
                setting: "bed_temperature".into(),
                value: json!("75 °C"),
            },
        ];
        for printer_id in [
            "elegoo-neptune4pro",
            "creality-ender3-v3-se",
            "creality-ender3-v3-ke",
        ] {
            let target = std::env::temp_dir().join(format!(
                "check-make-cura-{printer_id}-{}.3mf",
                std::process::id()
            ));
            let result = export_cura_project(
                &source,
                &target,
                "as-imported",
                "{}",
                printer_id,
                &recommendations,
            )
            .unwrap_or_else(|error| panic!("{printer_id}: {error}"));
            assert!(result.validated);
            assert!(result.applied_settings.contains(&"wall_loops".into()));
            assert!(result.applied_settings.contains(&"infill_percent".into()));
            let mut archive = ZipArchive::new(File::open(&target).unwrap()).unwrap();
            let mut quality = String::new();
            archive
                .by_name("Cura/check_make_quality_changes.inst.cfg")
                .unwrap()
                .read_to_string(&mut quality)
                .unwrap();
            let values = read_ini_values(&quality);
            assert_eq!(values["wall_line_count"], "5");
            assert_eq!(values["infill_sparse_density"], "25");
            assert_eq!(values["infill_pattern"], "gyroid");
            assert_eq!(values["material_print_temperature"], "245");
            fs::remove_file(target).ok();
        }
    }
    #[test]
    #[ignore = "requires Creality Print's installed system profile library"]
    fn resolves_ender_v3_creality_print_profiles() {
        let Some(executable) = find_executable("creality") else {
            return;
        };
        let resources = creality_resources(&executable).unwrap();
        for (printer_id, materials) in [
            ("creality-ender3-v3-se", &["PLA", "PETG", "TPU"][..]),
            ("creality-ender3-v3-ke", &["PLA", "PETG", "ASA", "TPU"][..]),
        ] {
            for material in materials {
                let spec = creality_profile_spec(printer_id, material).unwrap();
                resolve_profile(
                    &resources.join(spec.machine_dir),
                    spec.machine_name,
                    &mut HashSet::new(),
                )
                .unwrap_or_else(|error| panic!("{printer_id} machine: {error}"));
                resolve_profile(
                    &resources.join(spec.process_dir),
                    spec.process_name,
                    &mut HashSet::new(),
                )
                .unwrap_or_else(|error| panic!("{printer_id} process: {error}"));
                resolve_profile(
                    &resources.join(spec.filament_dir),
                    &spec.filament_name,
                    &mut HashSet::new(),
                )
                .unwrap_or_else(|error| panic!("{printer_id} {material}: {error}"));
            }
        }
    }
    #[test]
    #[ignore = "requires an installed Creality Print application"]
    fn exports_creality_project_with_active_overrides() {
        if find_executable("creality").is_none() {
            return;
        }
        let source = PathBuf::from("../tests/fixtures/cube.stl");
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
                setting: "nozzle_temperature".into(),
                value: json!("245 °C"),
            },
            RecommendationInput {
                setting: "bed_temperature".into(),
                value: json!("75 °C"),
            },
        ];
        for printer_id in [
            "creality-k1c",
            "creality-ender3-v3-se",
            "creality-ender3-v3-ke",
        ] {
            let target = std::env::temp_dir().join(format!(
                "check-make-creality-{printer_id}-{}.3mf",
                std::process::id()
            ));
            let result = export_creality_project(
                &source,
                &target,
                "as-imported",
                "{}",
                printer_id,
                &recommendations,
            )
            .unwrap_or_else(|error| panic!("{printer_id}: {error}"));
            assert!(result.validated);
            assert!(result.applied_settings.contains(&"wall_loops".into()));
            assert!(result.applied_settings.contains(&"infill_percent".into()));
            let settings = read_bambu_family_project_settings(&target).unwrap();
            assert_eq!(settings["wall_loops"], "5");
            assert_eq!(settings["sparse_infill_density"], "25%");
            assert_eq!(settings["sparse_infill_pattern"], "gyroid");
            fs::remove_file(target).ok();
        }
    }
    #[test]
    #[ignore = "requires an installed Bambu Studio application"]
    fn exports_direct_bambu_project_that_bambu_can_reopen() {
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
        let settings = read_bambu_family_project_settings(&target).unwrap();
        assert_eq!(settings["wall_loops"], "5");
        assert_eq!(settings["sparse_infill_density"], "25%");
        assert_eq!(settings["sparse_infill_pattern"], "gyroid");
        assert_eq!(settings["skeleton_infill_density"], "25%");
        assert_eq!(settings["skin_infill_density"], "25%");
        assert_eq!(settings["top_shell_layers"], "6");
        assert_eq!(settings["bottom_shell_layers"], "5");
        let overrides = settings["different_settings_to_system"][0]
            .as_str()
            .unwrap();
        assert!(overrides.contains("wall_loops"));
        assert!(overrides.contains("sparse_infill_pattern"));
        assert!(overrides.contains("skeleton_infill_density"));
        let validation = Command::new(find_executable("bambu").unwrap())
            .arg(&target)
            .arg("--info")
            .output()
            .unwrap();
        assert!(
            validation.status.success(),
            "Bambu Studio could not read direct project export: {}{}",
            String::from_utf8_lossy(&validation.stdout),
            String::from_utf8_lossy(&validation.stderr)
        );
        let effective_path = target.with_extension("effective-settings.json");
        let effective_export = Command::new(find_executable("bambu").unwrap())
            .arg(&target)
            .arg("--export-settings")
            .arg(&effective_path)
            .output()
            .unwrap();
        assert!(
            effective_export.status.success(),
            "Bambu Studio could not export effective settings: {}{}",
            String::from_utf8_lossy(&effective_export.stdout),
            String::from_utf8_lossy(&effective_export.stderr)
        );
        let effective: Value =
            serde_json::from_reader(File::open(&effective_path).unwrap()).unwrap();
        assert_eq!(effective["wall_loops"], "5");
        assert_eq!(effective["sparse_infill_density"], "25%");
        assert_eq!(effective["sparse_infill_pattern"], "gyroid");
        assert_eq!(effective["top_shell_layers"], "6");
        assert_eq!(effective["bottom_shell_layers"], "5");
        fs::remove_file(effective_path).ok();
        fs::remove_file(target).ok();
    }
}
