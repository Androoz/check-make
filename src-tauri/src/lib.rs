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
 <metadata name="Application">Check Make 0.2.2</metadata>
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

fn write_bambu_project_3mf(
    source: &Path,
    target: &Path,
    orientation_id: &str,
    metadata_json: &str,
    project_settings: &Value,
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
 <metadata name="Application">BambuStudio-02.07.01.62</metadata>
 <metadata name="checkmake:generator">Check Make 0.2.2</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">{title}</metadata>
 <metadata name="checkmake:analysis">{}</metadata>
 <metadata name="checkmake:orientation">{}</metadata>
 <metadata name="checkmake:degenerate-triangles-removed">{removed}</metadata>
 <resources><object id="2" p:UUID="00000001-61cb-4c03-9d28-80fed5dfa1dc" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" p:UUID="00010000-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object></resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369"><item objectid="2" p:UUID="00000002-b1ec-4553-aec9-835e5b724bb4" transform="1 0 0 0 1 0 0 0 1 {translate_x} {translate_y} 0" printable="1"/></build>
</model>"#,
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
    let slice_info = r#"<?xml version="1.0" encoding="UTF-8"?><config><header><header_item key="X-BBL-Client-Type" value="slicer"/><header_item key="X-BBL-Client-Version" value="Check Make 0.2.2"/></header></config>"#;
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
                "Installed profiles detected. Check Make writes a Bambu Studio project 3MF directly without launching the slicer.",
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

fn validate_bambu_override_markers(
    path: &Path,
    process_keys: &[String],
    filament_keys: &[String],
) -> Result<(), String> {
    let settings = read_bambu_project_settings(path)?;
    let groups = settings
        .get("different_settings_to_system")
        .and_then(Value::as_array)
        .ok_or_else(|| "Bambu project is missing its setting override markers.".to_string())?;
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
                    "Bambu project stores {label} setting '{key}' but does not mark it as an active project override."
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
        write_bambu_project_3mf(
            source,
            &generated_project,
            orientation_id,
            metadata_json,
            &project_settings,
        )?;
        let applied = validate_bambu_project_settings(&generated_project, &expected)?;
        validate_bambu_override_markers(
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
            create_manufacturing_package,
            create_and_open_bambu_project
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
        assert_eq!(process["wall_sequence"], "outer wall/inner wall");
        assert_eq!(filament["nozzle_temperature"], json!(["250"]));
        assert_eq!(applied.len(), 4);
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
        let settings = read_bambu_project_settings(&target).unwrap();
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
