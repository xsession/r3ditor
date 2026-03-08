import { invoke } from '@tauri-apps/api/core';

export interface EntityInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  face_count: number;
  edge_count: number;
  vertex_count: number;
}

export interface DfmResult {
  findings_count: number;
  score: number;
  findings: DfmFinding[];
}

export interface DfmFinding {
  severity: string;
  category: string;
  message: string;
  suggestion: string;
}

export interface CostEstimate {
  unit_cost: number;
  total_cost: number;
  machine_time_min: number;
  material_cost: number;
}

// -- Primitives --

export async function createBox(
  name: string,
  width: number,
  height: number,
  depth: number
): Promise<string> {
  return invoke('create_box', { name, width, height, depth });
}

export async function createCylinder(
  name: string,
  radius: number,
  height: number
): Promise<string> {
  return invoke('create_cylinder', { name, radius, height });
}

// -- Entities --

export async function getEntities(): Promise<EntityInfo[]> {
  return invoke('get_entities');
}

export async function deleteEntity(entityId: string): Promise<string> {
  return invoke('delete_entity', { entityId });
}

// -- History --

export async function undo(): Promise<string> {
  return invoke('undo');
}

export async function redo(): Promise<string> {
  return invoke('redo');
}

// -- File I/O --

export async function importFile(path: string): Promise<string> {
  return invoke('import_file', { path });
}

export async function exportFile(
  entityId: string,
  path: string,
  format: string
): Promise<string> {
  return invoke('export_file', { entityId, path, format });
}

export async function exportAllStl(path: string): Promise<string> {
  return invoke('export_all_stl', { path });
}

// -- Analysis --

export async function analyzeDfm(entityId: string): Promise<DfmResult> {
  return invoke('analyze_dfm', { entityId });
}

// -- Materials & Cost --

export async function getMaterials(): Promise<unknown> {
  return invoke('get_materials');
}

export async function estimateCost(request: {
  entity_id: string;
  material_id: string;
  process: string;
  quantity: number;
}): Promise<CostEstimate> {
  return invoke('estimate_cost', { request });
}

// ─── Sketch Types ─────────────────────────────────────────────────────────────

export interface SketchInfo {
  id: string;
  name: string;
  entity_count: number;
  constraint_count: number;
  dof: number;
}

export interface SketchEntityInfo {
  id: string;
  entity_type: string;
  data: unknown;
}

export interface ConstraintInfo {
  id: string;
  constraint_type: string;
  data: unknown;
}

export interface SketchPathInfo {
  segments: string[];
  cyclic: boolean;
}

export interface SnapResultInfo {
  x: number;
  y: number;
  snap_type: string;
  source_entity: string | null;
  distance: number;
}

export interface ToolStatusInfo {
  active_tool: string;
  is_sketch_tool: boolean;
  status_text: string | null;
}

// ─── Sketch CRUD ──────────────────────────────────────────────────────────────

export async function createSketch(name: string): Promise<string> {
  return invoke('create_sketch', { name });
}

export async function deleteSketch(sketchId: string): Promise<string> {
  return invoke('delete_sketch', { sketchId });
}

export async function getSketches(): Promise<SketchInfo[]> {
  return invoke('get_sketches');
}

export async function setActiveSketch(sketchId: string | null): Promise<string> {
  return invoke('set_active_sketch', { sketchId });
}

export async function getActiveSketch(): Promise<string | null> {
  return invoke('get_active_sketch');
}

// ─── Sketch Entities ──────────────────────────────────────────────────────────

export async function getSketchEntities(sketchId: string): Promise<SketchEntityInfo[]> {
  return invoke('get_sketch_entities', { sketchId });
}

export async function addSketchLine(request: {
  sketch_id: string;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  is_construction: boolean;
}): Promise<string> {
  return invoke('add_sketch_line', { request });
}

export async function addSketchCircle(request: {
  sketch_id: string;
  center_x: number;
  center_y: number;
  radius: number;
  is_construction: boolean;
}): Promise<string> {
  return invoke('add_sketch_circle', { request });
}

export async function addSketchArc(request: {
  sketch_id: string;
  center_x: number;
  center_y: number;
  radius: number;
  start_angle: number;
  end_angle: number;
  is_construction: boolean;
}): Promise<string> {
  return invoke('add_sketch_arc', { request });
}

export async function addSketchPoint(request: {
  sketch_id: string;
  x: number;
  y: number;
  is_construction: boolean;
}): Promise<string> {
  return invoke('add_sketch_point', { request });
}

export async function removeSketchEntity(sketchId: string, entityId: string): Promise<string> {
  return invoke('remove_sketch_entity', { sketchId, entityId });
}

// ─── Sketch Operations ───────────────────────────────────────────────────────

export async function trimSegment(
  sketchId: string,
  segmentId: string,
  clickX: number,
  clickY: number
): Promise<string> {
  return invoke('trim_segment', { sketchId, segmentId, clickX, clickY });
}

export async function bevelAtPoint(
  sketchId: string,
  pointX: number,
  pointY: number,
  radius: number
): Promise<string> {
  return invoke('bevel_at_point', { sketchId, pointX, pointY, radius });
}

export async function offsetPath(
  sketchId: string,
  entityId: string,
  distance: number
): Promise<string> {
  return invoke('offset_path', { sketchId, entityId, distance });
}

// ─── Snap System ──────────────────────────────────────────────────────────────

export async function computeSnap(
  cursorX: number,
  cursorY: number,
  refX?: number,
  refY?: number
): Promise<SnapResultInfo> {
  return invoke('compute_snap', { cursorX, cursorY, refX, refY });
}

export async function updateSnapConfig(config: {
  snap_radius?: number;
  grid_spacing?: number;
  endpoint?: boolean;
  midpoint?: boolean;
  center?: boolean;
  intersection?: boolean;
  nearest?: boolean;
  grid?: boolean;
  angle_increment?: number;
}): Promise<string> {
  return invoke('update_snap_config', { config });
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

export async function copySketchEntities(sketchId: string, entityIds: string[]): Promise<string> {
  return invoke('copy_sketch_entities', { sketchId, entityIds });
}

export async function pasteSketchEntities(
  sketchId: string,
  offsetX: number,
  offsetY: number
): Promise<string[]> {
  return invoke('paste_sketch_entities', { sketchId, offsetX, offsetY });
}

// ─── Snapshot / Undo ──────────────────────────────────────────────────────────

export async function takeSketchSnapshot(sketchId: string): Promise<string> {
  return invoke('take_sketch_snapshot', { sketchId });
}

export async function restoreSketchSnapshot(sketchId: string): Promise<string> {
  return invoke('restore_sketch_snapshot', { sketchId });
}

// ─── Tool System ──────────────────────────────────────────────────────────────

export async function setActiveTool(toolName: string): Promise<string> {
  return invoke('set_active_tool', { toolName });
}

export async function getToolStatus(): Promise<ToolStatusInfo> {
  return invoke('get_tool_status');
}

// ─── Constraints ──────────────────────────────────────────────────────────────

export async function getSketchConstraints(sketchId: string): Promise<ConstraintInfo[]> {
  return invoke('get_sketch_constraints', { sketchId });
}

export async function removeSketchConstraint(sketchId: string, constraintId: string): Promise<string> {
  return invoke('remove_sketch_constraint', { sketchId, constraintId });
}

// ─── Path Analysis ────────────────────────────────────────────────────────────

export async function getSketchPaths(sketchId: string): Promise<SketchPathInfo[]> {
  return invoke('get_sketch_paths', { sketchId });
}
