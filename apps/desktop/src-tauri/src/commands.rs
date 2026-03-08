//! Tauri command handlers — exposed to the React frontend via `invoke()`.

use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use cad_kernel::sketch::{Point2D, SketchEntity, SketchConstraint, PointOnEntity};
use cad_kernel::snap::{SnapConfig, SnapType};
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

// ─── Sketch CRUD ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SketchInfo {
    pub id: String,
    pub name: String,
    pub entity_count: usize,
    pub constraint_count: usize,
    pub dof: i32,
}

#[tauri::command]
pub fn create_sketch(state: State<AppState>, name: String) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let id = editor.world.create_sketch(&name);
    tracing::info!("Created sketch '{}' ({})", name, id);
    Ok(id.to_string())
}

#[tauri::command]
pub fn delete_sketch(state: State<AppState>, sketch_id: String) -> Result<String, String> {
    let uuid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.world.remove_sketch(uuid);
    Ok("ok".to_string())
}

#[tauri::command]
pub fn get_sketches(state: State<AppState>) -> Result<Vec<SketchInfo>, String> {
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketches: Vec<SketchInfo> = editor.world.sketches.iter()
        .map(|(&id, s)| SketchInfo {
            id: id.to_string(),
            name: s.name.clone(),
            entity_count: s.entities.len(),
            constraint_count: s.constraints.len(),
            dof: s.compute_dof(),
        })
        .collect();
    Ok(sketches)
}

#[tauri::command]
pub fn set_active_sketch(state: State<AppState>, sketch_id: Option<String>) -> Result<String, String> {
    let uuid = match &sketch_id {
        Some(id) => Some(Uuid::parse_str(id).map_err(|e| e.to_string())?),
        None => None,
    };
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    editor.world.set_active_sketch(uuid);
    Ok("ok".to_string())
}

#[tauri::command]
pub fn get_active_sketch(state: State<AppState>) -> Result<Option<String>, String> {
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    Ok(editor.world.active_sketch.map(|id| id.to_string()))
}

// ─── Sketch Entities ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SketchEntityInfo {
    pub id: String,
    pub entity_type: String,
    pub data: serde_json::Value,
}

#[tauri::command]
pub fn get_sketch_entities(state: State<AppState>, sketch_id: String) -> Result<Vec<SketchEntityInfo>, String> {
    let uuid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch(uuid).ok_or("Sketch not found")?;

    let entities: Vec<SketchEntityInfo> = sketch.entity_order.iter()
        .filter_map(|id| sketch.entities.get(id))
        .map(|e| SketchEntityInfo {
            id: e.id().to_string(),
            entity_type: format!("{:?}", std::mem::discriminant(e)),
            data: serde_json::to_value(e).unwrap_or_default(),
        })
        .collect();

    Ok(entities)
}

#[derive(Debug, Deserialize)]
pub struct AddLineRequest {
    pub sketch_id: String,
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    pub is_construction: bool,
}

#[tauri::command]
pub fn add_sketch_line(state: State<AppState>, request: AddLineRequest) -> Result<String, String> {
    let sketch_id = Uuid::parse_str(&request.sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch_mut(sketch_id).ok_or("Sketch not found")?;

    let entity = SketchEntity::Line {
        id: Uuid::new_v4(),
        start: Point2D::new(request.start_x, request.start_y),
        end: Point2D::new(request.end_x, request.end_y),
        is_construction: request.is_construction,
    };
    let id = sketch.add_entity(entity);
    Ok(id.to_string())
}

#[derive(Debug, Deserialize)]
pub struct AddCircleRequest {
    pub sketch_id: String,
    pub center_x: f64,
    pub center_y: f64,
    pub radius: f64,
    pub is_construction: bool,
}

#[tauri::command]
pub fn add_sketch_circle(state: State<AppState>, request: AddCircleRequest) -> Result<String, String> {
    let sketch_id = Uuid::parse_str(&request.sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch_mut(sketch_id).ok_or("Sketch not found")?;

    let entity = SketchEntity::Circle {
        id: Uuid::new_v4(),
        center: Point2D::new(request.center_x, request.center_y),
        radius: request.radius,
        is_construction: request.is_construction,
    };
    let id = sketch.add_entity(entity);
    Ok(id.to_string())
}

#[derive(Debug, Deserialize)]
pub struct AddArcRequest {
    pub sketch_id: String,
    pub center_x: f64,
    pub center_y: f64,
    pub radius: f64,
    pub start_angle: f64,
    pub end_angle: f64,
    pub is_construction: bool,
}

#[tauri::command]
pub fn add_sketch_arc(state: State<AppState>, request: AddArcRequest) -> Result<String, String> {
    let sketch_id = Uuid::parse_str(&request.sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch_mut(sketch_id).ok_or("Sketch not found")?;

    let entity = SketchEntity::Arc {
        id: Uuid::new_v4(),
        center: Point2D::new(request.center_x, request.center_y),
        radius: request.radius,
        start_angle: request.start_angle,
        end_angle: request.end_angle,
        is_construction: request.is_construction,
    };
    let id = sketch.add_entity(entity);
    Ok(id.to_string())
}

#[derive(Debug, Deserialize)]
pub struct AddPointRequest {
    pub sketch_id: String,
    pub x: f64,
    pub y: f64,
    pub is_construction: bool,
}

#[tauri::command]
pub fn add_sketch_point(state: State<AppState>, request: AddPointRequest) -> Result<String, String> {
    let sketch_id = Uuid::parse_str(&request.sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch_mut(sketch_id).ok_or("Sketch not found")?;

    let entity = SketchEntity::Point {
        id: Uuid::new_v4(),
        position: Point2D::new(request.x, request.y),
        is_construction: request.is_construction,
    };
    let id = sketch.add_entity(entity);
    Ok(id.to_string())
}

#[tauri::command]
pub fn remove_sketch_entity(state: State<AppState>, sketch_id: String, entity_id: String) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let eid = Uuid::parse_str(&entity_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch_mut(sid).ok_or("Sketch not found")?;
    sketch.remove_entity(eid);
    Ok("ok".to_string())
}

// ─── Sketch Operations (Trim, Bevel, Offset) ─────────────────────────────────

#[tauri::command]
pub fn trim_segment(
    state: State<AppState>,
    sketch_id: String,
    segment_id: String,
    click_x: f64,
    click_y: f64,
) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let seg_id = Uuid::parse_str(&segment_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;

    // Clone the sketch for read-only analysis
    let sketch_clone = editor.world.get_sketch(sid).ok_or("Sketch not found")?.clone();
    let result = cad_kernel::trim_segment(&sketch_clone, seg_id, Point2D::new(click_x, click_y))
        .map_err(|e| e.to_string())?;

    // Apply the result
    let sketch = editor.world.get_sketch_mut(sid).ok_or("Sketch not found")?;
    for id in &result.entities_to_remove {
        sketch.remove_entity(*id);
    }
    for entity in result.new_entities {
        sketch.add_entity(entity);
    }
    Ok("ok".to_string())
}

#[tauri::command]
pub fn bevel_at_point(
    state: State<AppState>,
    sketch_id: String,
    point_x: f64,
    point_y: f64,
    radius: f64,
) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;

    let sketch_clone = editor.world.get_sketch(sid).ok_or("Sketch not found")?.clone();
    let result = cad_kernel::bevel_at_point(&sketch_clone, Point2D::new(point_x, point_y), radius)
        .map_err(|e| e.to_string())?;

    let sketch = editor.world.get_sketch_mut(sid).ok_or("Sketch not found")?;
    for id in &result.entities_to_remove {
        sketch.remove_entity(*id);
    }
    sketch.add_entity(result.arc);
    sketch.add_entity(result.segment_a);
    sketch.add_entity(result.segment_b);
    Ok("ok".to_string())
}

#[tauri::command]
pub fn offset_path(
    state: State<AppState>,
    sketch_id: String,
    entity_id: String,
    distance: f64,
) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let eid = Uuid::parse_str(&entity_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;

    let sketch_clone = editor.world.get_sketch(sid).ok_or("Sketch not found")?.clone();
    let result = cad_kernel::offset_path(&sketch_clone, eid, distance)
        .map_err(|e| e.to_string())?;

    let sketch = editor.world.get_sketch_mut(sid).ok_or("Sketch not found")?;
    for entity in result.new_entities {
        sketch.add_entity(entity);
    }
    Ok("ok".to_string())
}

// ─── Snap System ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SnapResultInfo {
    pub x: f64,
    pub y: f64,
    pub snap_type: String,
    pub source_entity: Option<String>,
    pub distance: f64,
}

#[tauri::command]
pub fn compute_snap(
    state: State<AppState>,
    cursor_x: f64,
    cursor_y: f64,
    ref_x: Option<f64>,
    ref_y: Option<f64>,
) -> Result<SnapResultInfo, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let reference = match (ref_x, ref_y) {
        (Some(x), Some(y)) => Some(Point2D::new(x, y)),
        _ => None,
    };
    let result = editor.compute_snap(Point2D::new(cursor_x, cursor_y), reference);
    Ok(SnapResultInfo {
        x: result.position.x,
        y: result.position.y,
        snap_type: format!("{:?}", result.snap_type),
        source_entity: result.source_entity.map(|id| id.to_string()),
        distance: result.distance,
    })
}

#[derive(Debug, Deserialize)]
pub struct SnapConfigUpdate {
    pub snap_radius: Option<f64>,
    pub grid_spacing: Option<f64>,
    pub endpoint: Option<bool>,
    pub midpoint: Option<bool>,
    pub center: Option<bool>,
    pub intersection: Option<bool>,
    pub nearest: Option<bool>,
    pub grid: Option<bool>,
    pub angle_increment: Option<f64>,
}

#[tauri::command]
pub fn update_snap_config(state: State<AppState>, config: SnapConfigUpdate) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sc = &mut editor.world.snap_config;

    if let Some(v) = config.snap_radius { sc.snap_radius = v; }
    if let Some(v) = config.grid_spacing { sc.grid_spacing = v; }
    if let Some(v) = config.endpoint { sc.enabled.endpoint = v; }
    if let Some(v) = config.midpoint { sc.enabled.midpoint = v; }
    if let Some(v) = config.center { sc.enabled.center = v; }
    if let Some(v) = config.intersection { sc.enabled.intersection = v; }
    if let Some(v) = config.nearest { sc.enabled.nearest = v; }
    if let Some(v) = config.grid { sc.enabled.grid = v; }
    if let Some(v) = config.angle_increment { sc.angle_increment = v; }

    Ok("ok".to_string())
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn copy_sketch_entities(
    state: State<AppState>,
    sketch_id: String,
    entity_ids: Vec<String>,
) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let eids: Vec<Uuid> = entity_ids.iter()
        .map(|id| Uuid::parse_str(id).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;

    let buffer = {
        let sketch = editor.world.get_sketch(sid).ok_or("Sketch not found")?;
        cad_kernel::ClipboardBuffer::from_selection(sketch, &eids)
    };
    let count = buffer.entities.len();
    editor.world.clipboard = Some(buffer);
    Ok(format!("Copied {} entities", count))
}

#[tauri::command]
pub fn paste_sketch_entities(
    state: State<AppState>,
    sketch_id: String,
    offset_x: f64,
    offset_y: f64,
) -> Result<Vec<String>, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;

    let buffer = editor.world.clipboard.clone().ok_or("Clipboard is empty")?;
    let sketch = editor.world.get_sketch_mut(sid).ok_or("Sketch not found")?;
    let new_ids = buffer.paste_into(sketch, (offset_x, offset_y));
    Ok(new_ids.iter().map(|id| id.to_string()).collect())
}

// ─── Snapshot / Undo ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn take_sketch_snapshot(state: State<AppState>, sketch_id: String) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch(sid).ok_or("Sketch not found")?.clone();
    editor.world.sketch_snapshots.push_snapshot(&sketch);
    Ok("ok".to_string())
}

#[tauri::command]
pub fn restore_sketch_snapshot(state: State<AppState>, sketch_id: String) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    if let Some(snapshot) = editor.world.sketch_snapshots.pop_snapshot() {
        if let Some(sketch) = editor.world.get_sketch_mut(sid) {
            snapshot.restore_to_sketch(sketch);
            Ok("restored".to_string())
        } else {
            Ok("sketch not found".to_string())
        }
    } else {
        Ok("no snapshot available".to_string())
    }
}

// ─── Tool System ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn set_active_tool(state: State<AppState>, tool_name: String) -> Result<String, String> {
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let tool = match tool_name.as_str() {
        "select" => editor_shell::Tool::Select,
        "move" => editor_shell::Tool::Move,
        "rotate" => editor_shell::Tool::Rotate,
        "scale" => editor_shell::Tool::Scale,
        "sketch" => editor_shell::Tool::Sketch,
        "extrude" => editor_shell::Tool::Extrude,
        "revolve" => editor_shell::Tool::Revolve,
        "fillet" => editor_shell::Tool::Fillet,
        "chamfer" => editor_shell::Tool::Chamfer,
        "boolean" => editor_shell::Tool::Boolean,
        "measure" => editor_shell::Tool::Measure,
        "section" => editor_shell::Tool::Section,
        "sketch_line" => editor_shell::Tool::SketchLine,
        "sketch_circle" => editor_shell::Tool::SketchCircle,
        "sketch_arc" => editor_shell::Tool::SketchArc,
        "sketch_rectangle" => editor_shell::Tool::SketchRectangle,
        "sketch_trim" => editor_shell::Tool::SketchTrim,
        "sketch_offset" => editor_shell::Tool::SketchOffset,
        "sketch_bevel" => editor_shell::Tool::SketchBevel,
        _ => return Err(format!("Unknown tool: {}", tool_name)),
    };
    editor.set_tool(tool);
    Ok("ok".to_string())
}

#[derive(Debug, Serialize)]
pub struct ToolStatusInfo {
    pub active_tool: String,
    pub is_sketch_tool: bool,
    pub status_text: Option<String>,
}

#[tauri::command]
pub fn get_tool_status(state: State<AppState>) -> Result<ToolStatusInfo, String> {
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    Ok(ToolStatusInfo {
        active_tool: format!("{:?}", editor.active_tool),
        is_sketch_tool: editor.is_sketch_tool_active(),
        status_text: editor.sketch_tool_status(),
    })
}

// ─── Sketch Constraints ──────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConstraintInfo {
    pub id: String,
    pub constraint_type: String,
    pub data: serde_json::Value,
}

#[tauri::command]
pub fn get_sketch_constraints(state: State<AppState>, sketch_id: String) -> Result<Vec<ConstraintInfo>, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch(sid).ok_or("Sketch not found")?;

    let constraints: Vec<ConstraintInfo> = sketch.constraints.iter()
        .map(|c| ConstraintInfo {
            id: c.id().to_string(),
            constraint_type: format!("{:?}", std::mem::discriminant(c)),
            data: serde_json::to_value(c).unwrap_or_default(),
        })
        .collect();

    Ok(constraints)
}

#[tauri::command]
pub fn remove_sketch_constraint(state: State<AppState>, sketch_id: String, constraint_id: String) -> Result<String, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let cid = Uuid::parse_str(&constraint_id).map_err(|e| e.to_string())?;
    let mut editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch_mut(sid).ok_or("Sketch not found")?;
    sketch.remove_constraint(cid);
    Ok("ok".to_string())
}

// ─── Sketch Path Analysis ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SketchPathInfo {
    pub segments: Vec<String>,
    pub cyclic: bool,
}

#[tauri::command]
pub fn get_sketch_paths(state: State<AppState>, sketch_id: String) -> Result<Vec<SketchPathInfo>, String> {
    let sid = Uuid::parse_str(&sketch_id).map_err(|e| e.to_string())?;
    let editor = state.editor.lock().map_err(|e| e.to_string())?;
    let sketch = editor.world.get_sketch(sid).ok_or("Sketch not found")?;

    let paths = cad_kernel::find_paths(sketch);
    let infos: Vec<SketchPathInfo> = paths.iter()
        .map(|p| SketchPathInfo {
            segments: p.segments.iter().map(|id| id.to_string()).collect(),
            cyclic: p.cyclic,
        })
        .collect();

    Ok(infos)
}
