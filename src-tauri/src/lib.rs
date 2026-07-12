use serde::Serialize;
use std::{fs::File, io::BufReader};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MeshSummary { triangle_count: usize, min: [f32; 3], max: [f32; 3], size: [f32; 3] }

/// Native production boundary. The M1 UI currently uses an equivalent web fallback.
#[tauri::command]
fn analyze_stl_native(path: String) -> Result<MeshSummary, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mesh = stl_io::read_stl(&mut BufReader::new(file)).map_err(|e| e.to_string())?;
    let mut min = [f32::INFINITY; 3]; let mut max = [f32::NEG_INFINITY; 3];
    for v in &mesh.vertices { for axis in 0..3 { min[axis] = min[axis].min(v[axis]); max[axis] = max[axis].max(v[axis]); } }
    Ok(MeshSummary { triangle_count: mesh.faces.len(), min, max, size: [max[0]-min[0], max[1]-min[1], max[2]-min[2]] })
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { tauri::Builder::default().invoke_handler(tauri::generate_handler![analyze_stl_native]).run(tauri::generate_context!()).expect("failed to run OptimusPrint"); }
