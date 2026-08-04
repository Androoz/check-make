use quick_xml::{events::Event, Reader};
use serde::Serialize;
use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs::File,
    io::{BufReader, Read},
    path::Path,
};
use zip::ZipArchive;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ModelPart {
    pub name: String,
    pub extruder: usize,
    pub vertices: Vec<[f32; 3]>,
    pub triangles: Vec<[usize; 3]>,
    pub source_object_id: String,
    pub source_instance_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuildPlateSummary {
    pub id: String,
    pub name: String,
    pub instance_count: usize,
    pub instances: Vec<PlateInstance>,
    pub triangle_count: usize,
    pub size_mm: [f32; 3],
    pub min_mm: [f32; 3],
    pub max_mm: [f32; 3],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlateInstance {
    pub object_id: String,
    pub instance_id: String,
    pub identify_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BuildPlate {
    pub id: String,
    pub name: String,
    pub instances: Vec<PlateInstance>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ModelDocument {
    pub title: String,
    pub source_format: String,
    pub parts: Vec<ModelPart>,
    pub object_count: usize,
    pub instance_count: usize,
    pub plates: Vec<BuildPlate>,
    pub source_project_flavor: String,
    pub override_keys: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelDocumentSummary {
    pub source_format: String,
    pub export_source: String,
    pub preserves_source_topology: bool,
    pub part_count: usize,
    pub part_names: Vec<String>,
    pub object_count: usize,
    pub instance_count: usize,
    pub plate_count: usize,
    pub plates: Vec<BuildPlateSummary>,
    pub source_project_flavor: String,
    pub override_keys: Vec<String>,
}

impl ModelDocument {
    /// True only when the imported document explicitly described build plates.
    /// An empty plate graph is meaningful: exporters must leave placement to
    /// the target slicer instead of inventing a synthetic plate.
    pub(crate) fn has_explicit_plate_metadata(&self) -> bool {
        !self.plates.is_empty()
    }

    pub(crate) fn summary(&self) -> ModelDocumentSummary {
        ModelDocumentSummary {
            source_format: self.source_format.clone(),
            export_source: if self.source_format == "3mf" {
                "original"
            } else {
                "normalized-stl"
            }
            .into(),
            preserves_source_topology: self.source_format == "3mf",
            part_count: self.parts.len(),
            part_names: self.parts.iter().map(|part| part.name.clone()).collect(),
            object_count: self.object_count,
            instance_count: self.instance_count,
            plate_count: self.plates.len(),
            plates: self
                .plates
                .iter()
                .map(|plate| {
                    let plate_parts = self
                        .parts
                        .iter()
                        .filter(|part| {
                            plate.instances.iter().any(|instance| {
                                instance.object_id == part.source_object_id
                                    && instance.instance_id == part.source_instance_id
                            })
                        })
                        .collect::<Vec<_>>();
                    let mut min = [f32::INFINITY; 3];
                    let mut max = [f32::NEG_INFINITY; 3];
                    for vertex in plate_parts.iter().flat_map(|part| part.vertices.iter()) {
                        for axis in 0..3 {
                            min[axis] = min[axis].min(vertex[axis]);
                            max[axis] = max[axis].max(vertex[axis]);
                        }
                    }
                    let size_mm = if min[0].is_finite() {
                        [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
                    } else {
                        min = [0.0; 3];
                        max = [0.0; 3];
                        [0.0; 3]
                    };
                    BuildPlateSummary {
                        id: plate.id.clone(),
                        name: plate.name.clone(),
                        instance_count: plate.instances.len(),
                        instances: plate.instances.clone(),
                        triangle_count: plate_parts.iter().map(|part| part.triangles.len()).sum(),
                        size_mm,
                        min_mm: min,
                        max_mm: max,
                    }
                })
                .collect(),
            source_project_flavor: self.source_project_flavor.clone(),
            override_keys: self.override_keys.clone(),
        }
    }

    pub(crate) fn is_multi_plate(&self) -> bool {
        self.plates.len() > 1
    }

    pub(crate) fn parts_for_plate(&self, plate: &BuildPlate) -> Vec<ModelPart> {
        self.parts
            .iter()
            .filter(|part| {
                plate.instances.iter().any(|instance| {
                    instance.object_id == part.source_object_id
                        && instance.instance_id == part.source_instance_id
                })
            })
            .cloned()
            .collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum GeometryStrategy {
    Preserve,
    Multipart,
    SingleSolid,
}

impl GeometryStrategy {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "preserve" | "" => Ok(Self::Preserve),
            "multipart" => Ok(Self::Multipart),
            "single-solid" => Ok(Self::SingleSolid),
            _ => Err(format!("Unsupported geometry strategy: {value}.")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Preserve => "preserve",
            Self::Multipart => "multipart",
            Self::SingleSolid => "single-solid",
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct PreparedDocument {
    pub title: String,
    pub source_format: String,
    pub parts: Vec<ModelPart>,
    pub removed_triangles: usize,
    pub min: [f32; 3],
    pub max: [f32; 3],
}

type Matrix = [[f32; 4]; 4];

fn identity() -> Matrix {
    [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
}

fn matrix(value: Option<&str>) -> Result<Matrix, String> {
    let Some(value) = value else {
        return Ok(identity());
    };
    let values = value
        .split_whitespace()
        .map(|item| item.parse::<f32>().map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    if values.len() != 12 {
        return Err(format!(
            "A 3MF transform must contain 12 numbers, found {}.",
            values.len()
        ));
    }
    Ok([
        [values[0], values[3], values[6], values[9]],
        [values[1], values[4], values[7], values[10]],
        [values[2], values[5], values[8], values[11]],
        [0.0, 0.0, 0.0, 1.0],
    ])
}

fn multiply(left: Matrix, right: Matrix) -> Matrix {
    let mut result = [[0.0; 4]; 4];
    for row in 0..4 {
        for column in 0..4 {
            result[row][column] = (0..4)
                .map(|index| left[row][index] * right[index][column])
                .sum();
        }
    }
    result
}

fn apply(value: [f32; 3], transform: Matrix) -> [f32; 3] {
    [
        transform[0][0] * value[0]
            + transform[0][1] * value[1]
            + transform[0][2] * value[2]
            + transform[0][3],
        transform[1][0] * value[0]
            + transform[1][1] * value[1]
            + transform[1][2] * value[2]
            + transform[1][3],
        transform[2][0] * value[0]
            + transform[2][1] * value[1]
            + transform[2][2] * value[2]
            + transform[2][3],
    ]
}

#[derive(Clone, Debug)]
struct Component {
    object_id: String,
    path: Option<String>,
    transform: Matrix,
}

#[derive(Clone, Debug)]
struct ParsedObject {
    name: Option<String>,
    extruder: usize,
    vertices: Vec<[f32; 3]>,
    triangles: Vec<[usize; 3]>,
    components: Vec<Component>,
}

#[derive(Clone, Debug)]
struct BuildItem {
    object_id: String,
    transform: Matrix,
}

#[derive(Clone, Debug, Default)]
struct ParsedModel {
    title: Option<String>,
    objects: HashMap<String, ParsedObject>,
    build: Vec<BuildItem>,
}

fn attributes(event: &quick_xml::events::BytesStart<'_>) -> HashMap<String, String> {
    event
        .attributes()
        .flatten()
        .map(|attribute| {
            (
                String::from_utf8_lossy(attribute.key.as_ref()).into_owned(),
                String::from_utf8_lossy(attribute.value.as_ref()).into_owned(),
            )
        })
        .collect()
}

fn attribute<'a>(values: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    values
        .iter()
        .find(|(key, _)| key.rsplit(':').next() == Some(name))
        .map(|(_, value)| value.as_str())
}

fn parse_model(xml: &str) -> Result<ParsedModel, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut parsed = ParsedModel::default();
    let mut object_id: Option<String> = None;
    let mut object_name: Option<String> = None;
    let mut object_extruder = 1usize;
    let mut vertices = Vec::new();
    let mut triangles = Vec::new();
    let mut components = Vec::new();
    let mut metadata_name: Option<String> = None;
    loop {
        match reader
            .read_event()
            .map_err(|error| format!("Invalid 3MF XML: {error}"))?
        {
            Event::Start(event) => {
                let local = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                let values = attributes(&event);
                match local.as_str() {
                    "object" => {
                        object_id = attribute(&values, "id").map(str::to_string);
                        object_name = attribute(&values, "name").map(str::to_string);
                        object_extruder = attribute(&values, "pindex")
                            .and_then(|value| value.parse::<usize>().ok())
                            .map(|value| value + 1)
                            .unwrap_or(1);
                        vertices.clear();
                        triangles.clear();
                        components.clear();
                    }
                    "metadata" => metadata_name = attribute(&values, "name").map(str::to_string),
                    _ => {}
                }
            }
            Event::Empty(event) => {
                let local = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                let values = attributes(&event);
                match local.as_str() {
                    "vertex" => vertices.push([
                        attribute(&values, "x")
                            .ok_or("3MF vertex is missing x.")?
                            .parse::<f32>()
                            .map_err(|e| e.to_string())?,
                        attribute(&values, "y")
                            .ok_or("3MF vertex is missing y.")?
                            .parse::<f32>()
                            .map_err(|e| e.to_string())?,
                        attribute(&values, "z")
                            .ok_or("3MF vertex is missing z.")?
                            .parse::<f32>()
                            .map_err(|e| e.to_string())?,
                    ]),
                    "triangle" => triangles.push([
                        attribute(&values, "v1")
                            .ok_or("3MF triangle is missing v1.")?
                            .parse::<usize>()
                            .map_err(|e| e.to_string())?,
                        attribute(&values, "v2")
                            .ok_or("3MF triangle is missing v2.")?
                            .parse::<usize>()
                            .map_err(|e| e.to_string())?,
                        attribute(&values, "v3")
                            .ok_or("3MF triangle is missing v3.")?
                            .parse::<usize>()
                            .map_err(|e| e.to_string())?,
                    ]),
                    "component" => components.push(Component {
                        object_id: attribute(&values, "objectid")
                            .ok_or("3MF component is missing objectid.")?
                            .to_string(),
                        path: attribute(&values, "path").map(str::to_string),
                        transform: matrix(attribute(&values, "transform"))?,
                    }),
                    "item" => parsed.build.push(BuildItem {
                        object_id: attribute(&values, "objectid")
                            .ok_or("3MF build item is missing objectid.")?
                            .to_string(),
                        transform: matrix(attribute(&values, "transform"))?,
                    }),
                    _ => {}
                }
            }
            Event::Text(text) => {
                if metadata_name.as_deref() == Some("Title") {
                    parsed.title = Some(text.decode().map_err(|e| e.to_string())?.into_owned());
                }
            }
            Event::End(event) => {
                let local = String::from_utf8_lossy(event.local_name().as_ref()).into_owned();
                match local.as_str() {
                    "object" => {
                        let id = object_id.take().ok_or("3MF object is missing id.")?;
                        parsed.objects.insert(
                            id,
                            ParsedObject {
                                name: object_name.take(),
                                extruder: object_extruder,
                                vertices: std::mem::take(&mut vertices),
                                triangles: std::mem::take(&mut triangles),
                                components: std::mem::take(&mut components),
                            },
                        );
                    }
                    "metadata" => metadata_name = None,
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(parsed)
}

fn normalize_archive_path(current: &str, requested: Option<&str>) -> String {
    let Some(requested) = requested else {
        return current.to_string();
    };
    if requested.starts_with('/') {
        return requested.trim_start_matches('/').to_string();
    }
    let parent = current
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let combined = if parent.is_empty() {
        requested.to_string()
    } else {
        format!("{parent}/{requested}")
    };
    let mut parts = Vec::new();
    for part in combined.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    parts.join("/")
}

fn resolve_object(
    models: &HashMap<String, ParsedModel>,
    file_path: &str,
    object_id: &str,
    instance_object_id: &str,
    instance_id: &str,
    parent_transform: Matrix,
    stack: &mut HashSet<(String, String)>,
    result: &mut Vec<ModelPart>,
) -> Result<(), String> {
    let key = (file_path.to_string(), object_id.to_string());
    if !stack.insert(key.clone()) {
        return Err(format!(
            "Cyclic 3MF component reference at {file_path} object {object_id}."
        ));
    }
    let model = models
        .get(file_path)
        .ok_or_else(|| format!("3MF component file is missing: {file_path}."))?;
    let object = model
        .objects
        .get(object_id)
        .ok_or_else(|| format!("3MF object {object_id} is missing in {file_path}."))?;
    if !object.triangles.is_empty() {
        if object
            .triangles
            .iter()
            .flatten()
            .any(|index| *index >= object.vertices.len())
        {
            return Err(format!(
                "3MF object {object_id} contains an invalid vertex index."
            ));
        }
        result.push(ModelPart {
            name: object
                .name
                .clone()
                .unwrap_or_else(|| format!("Part {}", result.len() + 1)),
            extruder: object.extruder,
            vertices: object
                .vertices
                .iter()
                .map(|vertex| apply(*vertex, parent_transform))
                .collect(),
            triangles: object.triangles.clone(),
            source_object_id: instance_object_id.to_string(),
            source_instance_id: instance_id.to_string(),
        });
    }
    for component in &object.components {
        let component_path = normalize_archive_path(file_path, component.path.as_deref());
        resolve_object(
            models,
            &component_path,
            &component.object_id,
            instance_object_id,
            instance_id,
            multiply(parent_transform, component.transform),
            stack,
            result,
        )?;
    }
    stack.remove(&key);
    Ok(())
}

#[derive(Clone, Debug, Default)]
struct BambuObjectMetadata {
    name: Option<String>,
    extruder: Option<usize>,
}

#[derive(Clone, Debug, Default)]
struct BambuProjectMetadata {
    objects: HashMap<String, BambuObjectMetadata>,
    plates: Vec<BuildPlate>,
    override_keys: Vec<String>,
}

fn is_structural_bambu_metadata(key: &str) -> bool {
    matches!(
        key,
        "name"
            | "extruder"
            | "matrix"
            | "source_file"
            | "source_object_id"
            | "source_volume_id"
            | "source_offset_x"
            | "source_offset_y"
            | "source_offset_z"
            | "plater_id"
            | "plater_name"
            | "locked"
            | "filament_map_mode"
            | "gcode_file"
            | "filament_maps"
            | "filament_volume_maps"
            | "thumbnail_file"
            | "thumbnail_no_light_file"
            | "top_file"
            | "pick_file"
            | "object_id"
            | "instance_id"
            | "identify_id"
    )
}

fn parse_bambu_project_metadata(xml: &str) -> BambuProjectMetadata {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut result = BambuProjectMetadata::default();
    let mut current_object_id: Option<String> = None;
    let mut current_plate: Option<BuildPlate> = None;
    let mut current_instance: Option<PlateInstance> = None;
    let mut inside_part = false;
    let mut override_keys = BTreeSet::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let local = event.local_name();
                let values = attributes(&event);
                match local.as_ref() {
                    b"object" => current_object_id = attribute(&values, "id").map(str::to_string),
                    b"part" => inside_part = true,
                    b"plate" => {
                        current_plate = Some(BuildPlate {
                            id: String::new(),
                            name: String::new(),
                            instances: Vec::new(),
                        })
                    }
                    b"model_instance" => {
                        current_instance = Some(PlateInstance {
                            object_id: String::new(),
                            instance_id: String::new(),
                            identify_id: None,
                        })
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(event)) if event.local_name().as_ref() == b"metadata" => {
                let values = attributes(&event);
                let Some(key) = attribute(&values, "key") else {
                    continue;
                };
                let value = attribute(&values, "value").unwrap_or_default();
                if let Some(instance) = current_instance.as_mut() {
                    match key {
                        "object_id" => instance.object_id = value.to_string(),
                        "instance_id" => instance.instance_id = value.to_string(),
                        "identify_id" => instance.identify_id = Some(value.to_string()),
                        _ => {
                            if !is_structural_bambu_metadata(key) {
                                override_keys.insert(key.to_string());
                            }
                        }
                    }
                } else if let Some(plate) = current_plate.as_mut() {
                    match key {
                        "plater_id" => plate.id = value.to_string(),
                        "plater_name" => plate.name = value.to_string(),
                        _ => {
                            if !is_structural_bambu_metadata(key) {
                                override_keys.insert(key.to_string());
                            }
                        }
                    }
                } else if let Some(object_id) = current_object_id.as_ref() {
                    let object = result.objects.entry(object_id.clone()).or_default();
                    match key {
                        "name" if !inside_part => object.name = Some(value.to_string()),
                        "extruder" if !inside_part => object.extruder = value.parse::<usize>().ok(),
                        _ => {
                            if !is_structural_bambu_metadata(key) {
                                override_keys.insert(key.to_string());
                            }
                        }
                    }
                }
            }
            Ok(Event::End(event)) => match event.local_name().as_ref() {
                b"model_instance" => {
                    if let (Some(plate), Some(instance)) =
                        (current_plate.as_mut(), current_instance.take())
                    {
                        if !instance.object_id.is_empty() {
                            plate.instances.push(instance);
                        }
                    }
                }
                b"plate" => {
                    if let Some(mut plate) = current_plate.take() {
                        if plate.id.is_empty() {
                            plate.id = (result.plates.len() + 1).to_string();
                        }
                        result.plates.push(plate);
                    }
                }
                b"part" => inside_part = false,
                b"object" => current_object_id = None,
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    result.override_keys = override_keys.into_iter().collect();
    result
}

fn load_3mf(path: &Path) -> Result<ModelDocument, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid 3MF archive: {error}"))?;
    let mut models = HashMap::new();
    let mut model_settings = None;
    let mut has_project_settings = false;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name().trim_start_matches('/').to_string();
        if name.eq_ignore_ascii_case("Metadata/model_settings.config") {
            let mut xml = String::new();
            entry
                .read_to_string(&mut xml)
                .map_err(|error| format!("Cannot read {name}: {error}"))?;
            model_settings = Some(xml);
            continue;
        }
        if name.eq_ignore_ascii_case("Metadata/project_settings.config") {
            has_project_settings = true;
        }
        if !name.to_ascii_lowercase().ends_with(".model") {
            continue;
        }
        let mut xml = String::new();
        entry
            .read_to_string(&mut xml)
            .map_err(|error| format!("Cannot read {name}: {error}"))?;
        models.insert(name, parse_model(&xml)?);
    }
    let root_path = if models.contains_key("3D/3dmodel.model") {
        "3D/3dmodel.model".to_string()
    } else {
        models
            .keys()
            .next()
            .cloned()
            .ok_or("The 3MF archive contains no model document.")?
    };
    let root = models
        .get(&root_path)
        .ok_or("The root 3MF model is missing.")?;
    let title = root
        .title
        .clone()
        .or_else(|| {
            path.file_stem()
                .and_then(|v| v.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "Check Make model".into());
    let mut parts = Vec::new();
    if root.build.is_empty() {
        for object_id in root.objects.keys() {
            resolve_object(
                &models,
                &root_path,
                object_id,
                object_id,
                "0",
                identity(),
                &mut HashSet::new(),
                &mut parts,
            )?;
        }
    } else {
        let mut instance_counts: HashMap<String, usize> = HashMap::new();
        for item in &root.build {
            let instance_id = instance_counts.entry(item.object_id.clone()).or_default();
            resolve_object(
                &models,
                &root_path,
                &item.object_id,
                &item.object_id,
                &instance_id.to_string(),
                item.transform,
                &mut HashSet::new(),
                &mut parts,
            )?;
            *instance_id += 1;
        }
    }
    if parts.is_empty() || parts.iter().all(|part| part.triangles.is_empty()) {
        return Err("The 3MF contains no printable triangle mesh.".into());
    }
    let project_metadata = model_settings
        .as_deref()
        .map(parse_bambu_project_metadata)
        .unwrap_or_default();
    for part in &mut parts {
        if let Some(metadata) = project_metadata.objects.get(&part.source_object_id) {
            if let Some(name) = metadata.name.as_ref() {
                part.name = name.clone();
            }
            if let Some(extruder) = metadata.extruder {
                part.extruder = extruder.max(1);
            }
        }
    }
    let object_count = if project_metadata.objects.is_empty() {
        parts
            .iter()
            .map(|part| part.source_object_id.as_str())
            .collect::<HashSet<_>>()
            .len()
    } else {
        project_metadata.objects.len()
    };
    let instance_count = if project_metadata.plates.is_empty() {
        root.build.len().max(object_count)
    } else {
        project_metadata
            .plates
            .iter()
            .map(|plate| plate.instances.len())
            .sum()
    };
    Ok(ModelDocument {
        title,
        source_format: "3mf".into(),
        parts,
        object_count,
        instance_count,
        plates: project_metadata.plates,
        source_project_flavor: if has_project_settings {
            "bambu-family"
        } else {
            "core-3mf"
        }
        .into(),
        override_keys: project_metadata.override_keys,
    })
}

fn load_stl(path: &Path) -> Result<ModelDocument, String> {
    let mesh = stl_io::read_stl(&mut BufReader::new(
        File::open(path).map_err(|error| error.to_string())?,
    ))
    .map_err(|error| format!("Invalid STL: {error}"))?;
    let title = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Check Make model")
        .to_string();
    Ok(ModelDocument {
        title: title.clone(),
        source_format: "stl".into(),
        parts: vec![ModelPart {
            name: title,
            extruder: 1,
            vertices: mesh
                .vertices
                .iter()
                .map(|vertex| [vertex[0], vertex[1], vertex[2]])
                .collect(),
            triangles: mesh.faces.iter().map(|face| face.vertices).collect(),
            source_object_id: "1".into(),
            source_instance_id: "0".into(),
        }],
        object_count: 1,
        instance_count: 1,
        plates: Vec::new(),
        source_project_flavor: "mesh".into(),
        override_keys: Vec::new(),
    })
}

pub(crate) fn load_model_document(path: &Path) -> Result<ModelDocument, String> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "3mf" => load_3mf(path),
        "stl" => load_stl(path),
        extension => Err(format!(
            "No canonical model loader is available for .{extension}."
        )),
    }
}

fn split_part(part: &ModelPart) -> Vec<ModelPart> {
    if part.triangles.len() < 2 {
        return vec![part.clone()];
    }
    let mut parents: Vec<usize> = (0..part.triangles.len()).collect();
    fn find(parents: &mut [usize], index: usize) -> usize {
        if parents[index] != index {
            parents[index] = find(parents, parents[index]);
        }
        parents[index]
    }
    let mut vertex_owner: HashMap<usize, usize> = HashMap::new();
    for (face_index, triangle) in part.triangles.iter().enumerate() {
        for vertex in triangle {
            if let Some(owner) = vertex_owner.insert(*vertex, face_index) {
                let left = find(&mut parents, face_index);
                let right = find(&mut parents, owner);
                if left != right {
                    parents[right] = left;
                }
            }
        }
    }
    let mut groups: HashMap<usize, Vec<[usize; 3]>> = HashMap::new();
    for (index, triangle) in part.triangles.iter().enumerate() {
        let root = find(&mut parents, index);
        groups.entry(root).or_default().push(*triangle);
    }
    if groups.len() == 1 {
        return vec![part.clone()];
    }
    let mut groups = groups.into_values().collect::<Vec<_>>();
    groups.sort_by_key(|group| std::cmp::Reverse(group.len()));
    groups
        .into_iter()
        .enumerate()
        .map(|(index, triangles)| {
            let mut remap = HashMap::new();
            let mut vertices = Vec::new();
            let triangles = triangles
                .into_iter()
                .map(|triangle| {
                    triangle.map(|old| {
                        *remap.entry(old).or_insert_with(|| {
                            vertices.push(part.vertices[old]);
                            vertices.len() - 1
                        })
                    })
                })
                .collect();
            ModelPart {
                name: format!("{} · shell {}", part.name, index + 1),
                extruder: part.extruder,
                vertices,
                triangles,
                source_object_id: part.source_object_id.clone(),
                source_instance_id: part.source_instance_id.clone(),
            }
        })
        .collect()
}

fn orientation(value: [f32; 3], orientation_id: &str) -> [f32; 3] {
    match orientation_id {
        "flip-z" => [value[0], -value[1], -value[2]],
        "right-side" => [value[2], value[1], -value[0]],
        "left-side" => [-value[2], value[1], value[0]],
        "front-side" => [value[0], value[2], -value[1]],
        "back-side" => [value[0], -value[2], value[1]],
        _ => value,
    }
}

pub(crate) fn prepare_document(
    source: &Path,
    orientation_id: &str,
    strategy: GeometryStrategy,
) -> Result<PreparedDocument, String> {
    let document = load_model_document(source)?;
    if strategy == GeometryStrategy::SingleSolid {
        return Err("Single-solid repair requires the explicit boolean repair pipeline; the original geometry was not changed.".into());
    }
    let source_parts = if strategy == GeometryStrategy::Multipart {
        document
            .parts
            .iter()
            .flat_map(split_part)
            .collect::<Vec<_>>()
    } else {
        document.parts.clone()
    };
    let mut removed_triangles = 0;
    let mut parts = Vec::new();
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for part in source_parts {
        let vertices = part
            .vertices
            .iter()
            .map(|vertex| orientation(*vertex, orientation_id))
            .collect::<Vec<_>>();
        let triangles = part
            .triangles
            .into_iter()
            .filter(|triangle| {
                let a = vertices[triangle[0]];
                let b = vertices[triangle[1]];
                let c = vertices[triangle[2]];
                let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                let cross = [
                    ab[1] * ac[2] - ab[2] * ac[1],
                    ab[2] * ac[0] - ab[0] * ac[2],
                    ab[0] * ac[1] - ab[1] * ac[0],
                ];
                let valid = cross.iter().map(|value| value * value).sum::<f32>() > 1e-12;
                if !valid {
                    removed_triangles += 1;
                }
                valid
            })
            .collect::<Vec<_>>();
        if triangles.is_empty() {
            continue;
        }
        for vertex in &vertices {
            for axis in 0..3 {
                min[axis] = min[axis].min(vertex[axis]);
                max[axis] = max[axis].max(vertex[axis]);
            }
        }
        parts.push(ModelPart {
            name: part.name,
            extruder: part.extruder,
            vertices,
            triangles,
            source_object_id: part.source_object_id,
            source_instance_id: part.source_instance_id,
        });
    }
    if parts.is_empty() {
        return Err("The prepared model contains no printable triangles.".into());
    }
    for part in &mut parts {
        for vertex in &mut part.vertices {
            for axis in 0..3 {
                vertex[axis] -= min[axis];
            }
        }
    }
    Ok(PreparedDocument {
        title: document.title,
        source_format: document.source_format,
        parts,
        removed_triangles,
        min,
        max,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[test]
    fn matrix_translation_is_applied() {
        let transform = matrix(Some("1 0 0 0 1 0 0 0 1 10 20 30")).unwrap();
        assert_eq!(apply([1.0, 2.0, 3.0], transform), [11.0, 22.0, 33.0]);
    }

    #[test]
    fn multipart_splits_index_disconnected_shells() {
        let part = ModelPart {
            name: "two".into(),
            extruder: 1,
            vertices: vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [2.0, 0.0, 0.0],
                [3.0, 0.0, 0.0],
                [2.0, 1.0, 0.0],
            ],
            triangles: vec![[0, 1, 2], [3, 4, 5]],
            source_object_id: "1".into(),
            source_instance_id: "0".into(),
        };
        assert_eq!(split_part(&part).len(), 2);
    }

    #[test]
    fn loads_external_3mf_components_without_welding_shell_indices() {
        let path = std::env::temp_dir().join(format!(
            "check-make-model-document-{}.3mf",
            std::process::id()
        ));
        let file = File::create(&path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("3D/3dmodel.model", options).unwrap();
        archive.write_all(br#"<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><metadata name="Title">Fixture</metadata><resources><object id="2"><components><component p:path="/3D/Objects/object.model" objectid="1"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 10 20 30"/></build></model>"#).unwrap();
        archive
            .start_file("3D/Objects/object.model", options)
            .unwrap();
        archive.write_all(br#"<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" name="Two shells"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="2" y="0" z="0"/><vertex x="3" y="0" z="0"/><vertex x="2" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/><triangle v1="3" v2="4" v3="5"/></triangles></mesh></object></resources><build/></model>"#).unwrap();
        archive.finish().unwrap();

        let document = load_model_document(&path).unwrap();
        assert_eq!(document.title, "Fixture");
        assert_eq!(document.parts.len(), 1);
        assert_eq!(document.parts[0].vertices[0], [10.0, 20.0, 30.0]);
        assert_eq!(document.parts[0].triangles.len(), 2);
        assert_eq!(split_part(&document.parts[0]).len(), 2);
        std::fs::remove_file(path).unwrap();
    }
}
