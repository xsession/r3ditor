//! Tauri command handlers — exposed to the React frontend via `invoke()`.

use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use cad_kernel::tessellation;
use editor_shell::commands::EditorCommand;

/// Entity info returned to the frontend
#[derive(Debug, Serialize)]
pub struct EntityInfo {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub face_count: usize,
    pub edge_count: usize,
    pub vertex_count: usize,
}

// -- Primitives --

#[tauri::command]
pub fn create_box(
    state: State<AppState>,
    name: String,
    width: f64,
    height: f64,
    depth: f64,
) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::CreateBox {
        name,
        width,
        height,
        depth,
    });
    editor.update();
    Ok("ok".to_string())
}

#[tauri::command]
pub fn create_cylinder(
    state: State<AppState>,
    name: String,
    radius: f64,
    height: f64,
) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::CreateCylinder {
        name,
        radius,
        height,
    });
    editor.update();
    Ok("ok".to_string())
}

// -- Entity management --

#[tauri::command]
pub fn delete_entity(state: State<AppState>, entity_id: String) -> Result<String, String> {
    let uuid = Uuid::parse_str(&entity_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::DeleteEntity { entity_id: uuid });
    editor.update();
    Ok("ok".to_string())
}

#[tauri::command]
pub fn get_entities(state: State<AppState>) -> Result<Vec<EntityInfo>, String> {
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    let entities: Vec<EntityInfo> = editor
        .world
        .entities
        .iter()
        .map(|e| EntityInfo {
            id: e.id.to_string(),
            name: e.name.clone(),
            visible: e.visible,
            locked: e.locked,
            face_count: e.brep.as_ref().map(|m| m.face_count()).unwrap_or(0),
            edge_count: e.brep.as_ref().map(|m| m.edge_count()).unwrap_or(0),
            vertex_count: e.brep.as_ref().map(|m| m.vertex_count()).unwrap_or(0),
        })
        .collect();
    Ok(entities)
}

// -- History --

#[tauri::command]
pub fn undo(state: State<AppState>) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::Undo);
    editor.update();
    Ok("ok".to_string())
}

#[tauri::command]
pub fn redo(state: State<AppState>) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::Redo);
    editor.update();
    Ok("ok".to_string())
}

// -- File I/O --

#[tauri::command]
pub fn import_file(state: State<AppState>, path: String) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::ImportFile { path });
    editor.update();
    Ok("ok".to_string())
}

#[tauri::command]
pub fn export_file(
    state: State<AppState>,
    entity_id: String,
    path: String,
    format: String,
) -> Result<String, String> {
    let uuid = Uuid::parse_str(&entity_id).map_err(|e| e.to_string())?;
    let file_format = match format.as_str() {
        "stl" => shared_types::geometry::FileFormat::Stl,
        "step" => shared_types::geometry::FileFormat::Step,
        "obj" => shared_types::geometry::FileFormat::Obj,
        "gltf" => shared_types::geometry::FileFormat::Gltf,
        _ => return Err(format!("Unknown format: {}", format)),
    };

    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.execute_command(EditorCommand::ExportFile {
        entity_id: uuid,
        path,
        format: file_format,
    });
    editor.update();
    Ok("ok".to_string())
}

// -- Analysis --

#[derive(Debug, Serialize)]
pub struct DfmResult {
    pub findings_count: usize,
    pub score: f64,
    pub findings: Vec<DfmFindingInfo>,
}

#[derive(Debug, Serialize)]
pub struct DfmFindingInfo {
    pub severity: String,
    pub category: String,
    pub message: String,
    pub suggestion: String,
}

#[tauri::command]
pub fn analyze_dfm(state: State<AppState>, entity_id: String) -> Result<DfmResult, String> {
    let uuid = Uuid::parse_str(&entity_id).map_err(|e| e.to_string())?;
    let editor = state.editor.lock().map_err(|e| e.to_string())?;

    let entity = editor
        .world
        .get(uuid)
        .ok_or_else(|| format!("Entity {} not found", entity_id))?;

    let mesh = entity
        .mesh
        .as_ref()
        .ok_or("Entity mesh not tessellated")?;

    let analyzer = dfm_analyzer::DfmAnalyzer::new(dfm_analyzer::analyzer::DfmConfig::default());
    let report = analyzer.analyze(mesh);

    Ok(DfmResult {
        findings_count: report.findings.len(),
        score: report.score,
        findings: report
            .findings
            .iter()
            .map(|f| DfmFindingInfo {
                severity: format!("{:?}", f.severity),
                category: format!("{:?}", f.category),
                message: f.title.clone(),
                suggestion: f.recommendation.clone(),
            })
            .collect(),
    })
}

// -- Materials & Cost --

#[tauri::command]
pub fn get_materials() -> Result<serde_json::Value, String> {
    let sheet = shared_types::materials::default_sheet_materials();
    let cnc = shared_types::materials::default_cnc_materials();
    serde_json::to_value(serde_json::json!({
        "sheet_materials": sheet,
        "cnc_materials": cnc,
    }))
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CostEstimateRequest {
    pub entity_id: String,
    pub material_id: String,
    pub process: String,
    pub quantity: u32,
}

#[derive(Debug, Serialize)]
pub struct CostEstimate {
    pub unit_cost: f64,
    pub total_cost: f64,
    pub machine_time_min: f64,
    pub material_cost: f64,
}

#[tauri::command]
pub fn estimate_cost(
    state: State<AppState>,
    request: CostEstimateRequest,
) -> Result<CostEstimate, String> {
    // TODO: run actual CAM estimation on the entity geometry
    Ok(CostEstimate {
        unit_cost: 25.0,
        total_cost: 25.0 * request.quantity as f64,
        machine_time_min: 12.5,
        material_cost: 8.0,
    })
}

/// Export all visible entities as a combined binary STL file.
#[tauri::command]
pub fn export_all_stl(state: State<AppState>, path: String) -> Result<String, String> {
    let editor = state.editor.lock().map_err(|e| e.to_string())?;

    let meshes: Vec<&shared_types::geometry::TriMesh> = editor
        .world
        .entities
        .iter()
        .filter(|e| e.visible)
        .filter_map(|e| e.mesh.as_ref())
        .collect();

    if meshes.is_empty() {
        return Err("No visible entities with mesh data to export".to_string());
    }

    let mesh_refs: Vec<&shared_types::geometry::TriMesh> = meshes.iter().copied().collect();
    let merged = tessellation::merge_meshes(&mesh_refs);

    tessellation::export_stl(&merged, &path).map_err(|e| format!("STL export failed: {}", e))?;

    let tri_count = merged.triangle_count();
    tracing::info!(
        "Exported {} entities ({} triangles) as binary STL → {}",
        meshes.len(),
        tri_count,
        path
    );

    Ok(format!(
        "Exported {} triangles from {} entities",
        tri_count,
        meshes.len()
    ))
}
