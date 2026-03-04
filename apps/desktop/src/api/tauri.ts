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
