//! Editor commands (undo-able operations).

use anyhow::Result;
use cad_kernel::brep::BRepBody;
use cad_kernel::features::{Feature, FeatureAttributes, FeatureKind, FeatureResult};
use cad_kernel::history::ChangeRecord;
use cad_kernel::operations;
use cad_kernel::sketch::{Point2D, Sketch, SketchConstraint, SketchEntity, SketchEntityId};
use cad_kernel::snapshot::{SketchSnapshot, ClipboardBuffer};
use cad_kernel::tessellation;
use std::collections::HashMap;
use uuid::Uuid;

use crate::ecs::{Entity, World};

/// High-level editor commands
pub enum EditorCommand {
    /// Create a new primitive body
    CreateBox {
        name: String,
        width: f64,
        height: f64,
        depth: f64,
    },
    /// Create a cylinder
    CreateCylinder {
        name: String,
        radius: f64,
        height: f64,
    },
    /// Apply a feature to an entity
    ApplyFeature {
        entity_id: Uuid,
        feature: Feature,
    },
    /// Delete an entity
    DeleteEntity {
        entity_id: Uuid,
    },
    /// Undo last operation
    Undo,
    /// Redo last undone operation
    Redo,
    /// Import a file
    ImportFile {
        path: String,
    },
    /// Export a file
    ExportFile {
        entity_id: Uuid,
        path: String,
        format: shared_types::geometry::FileFormat,
    },

    // ── Sketch Commands ──

    /// Create a new sketch
    CreateSketch {
        name: String,
    },
    /// Delete a sketch
    DeleteSketch {
        sketch_id: Uuid,
    },
    /// Set the active sketch for editing
    SetActiveSketch {
        sketch_id: Option<Uuid>,
    },
    /// Add an entity to the active sketch
    AddSketchEntity {
        sketch_id: Uuid,
        entity: SketchEntity,
    },
    /// Remove an entity from a sketch
    RemoveSketchEntity {
        sketch_id: Uuid,
        entity_id: SketchEntityId,
    },
    /// Add a constraint to a sketch
    AddSketchConstraint {
        sketch_id: Uuid,
        constraint: SketchConstraint,
    },
    /// Remove a constraint from a sketch
    RemoveSketchConstraint {
        sketch_id: Uuid,
        constraint_id: SketchEntityId,
    },
    /// Trim a segment at intersections
    TrimSegment {
        sketch_id: Uuid,
        segment_id: SketchEntityId,
        click_pos: Point2D,
    },
    /// Create a bevel (fillet) at a junction
    BevelAtPoint {
        sketch_id: Uuid,
        point: Point2D,
        radius: f64,
    },
    /// Offset a path
    OffsetPath {
        sketch_id: Uuid,
        entity_id: SketchEntityId,
        distance: f64,
    },
    /// Take a snapshot of a sketch (for undo)
    TakeSnapshot {
        sketch_id: Uuid,
    },
    /// Restore the last snapshot
    RestoreSnapshot {
        sketch_id: Uuid,
    },
    /// Copy selected entities to clipboard
    CopyEntities {
        sketch_id: Uuid,
        entity_ids: Vec<SketchEntityId>,
    },
    /// Paste clipboard contents
    PasteEntities {
        sketch_id: Uuid,
        offset_x: f64,
        offset_y: f64,
    },
}

impl EditorCommand {
    /// Execute the command on the world
    pub fn execute(self, world: &mut World) -> Result<()> {
        match self {
            EditorCommand::CreateBox {
                name,
                width,
                height,
                depth,
            } => {
                // Tessellate directly for display
                let hw = (width / 2.0) as f32;
                let hh = (height / 2.0) as f32;
                let hd = (depth / 2.0) as f32;
                let mesh = tessellation::tessellate_box(-hw, -hh, -hd, hw, hh, hd);

                // Create BRepBody placeholder
                let body = BRepBody::new();
                let entity = Entity::new(&name).with_brep(body).with_mesh(mesh);
                let _id = world.spawn(entity);
                let entity_count = world.entities.len();
                tracing::info!("Created box '{}' ({:.1}×{:.1}×{:.1})", name, width, height, depth);

                // Record in history using a placeholder Import feature
                let feature = Feature::new(
                    FeatureKind::Import,
                    format!("Box '{}'", name),
                    FeatureAttributes::Import {
                        format: "native".into(),
                        file_path: name,
                    },
                );
                world.history.begin_transaction(format!("Create box"));
                world.history.record_change(ChangeRecord::Added {
                    feature_id: feature.id,
                    feature,
                    order_index: entity_count.saturating_sub(1),
                });
                world.history.commit_transaction();
                Ok(())
            }

            EditorCommand::CreateCylinder {
                name,
                radius,
                height,
            } => {
                let mesh = tessellation::tessellate_cylinder(radius as f32, height as f32, 32);
                let body = BRepBody::new();
                let entity = Entity::new(&name).with_brep(body).with_mesh(mesh);
                let _id = world.spawn(entity);
                let entity_count = world.entities.len();
                tracing::info!(
                    "Created cylinder '{}' (r={:.1}, h={:.1})",
                    name, radius, height
                );

                let feature = Feature::new(
                    FeatureKind::Import,
                    format!("Cylinder '{}'", name),
                    FeatureAttributes::Import {
                        format: "native".into(),
                        file_path: name,
                    },
                );
                world.history.begin_transaction(format!("Create cylinder"));
                world.history.record_change(ChangeRecord::Added {
                    feature_id: feature.id,
                    feature,
                    order_index: entity_count.saturating_sub(1),
                });
                world.history.commit_transaction();
                Ok(())
            }

            EditorCommand::ApplyFeature { entity_id, feature } => {
                let results: HashMap<Uuid, FeatureResult> = HashMap::new();
                let kind_name = format!("{:?}", feature.kind);

                match operations::execute_feature(&feature, &results) {
                    Ok(_result) => {
                        let order_index;
                        if let Some(entity) = world.get_mut(entity_id) {
                            order_index = entity.feature_tree.len();
                            entity.feature_tree.push(feature.clone());
                            entity.dirty = true;
                            let entity_name = entity.name.clone();
                            tracing::info!("Applied {} to {}", kind_name, entity_name);
                        } else {
                            order_index = 0;
                        }

                        world.history.begin_transaction(format!("Apply {}", kind_name));
                        world.history.record_change(ChangeRecord::Added {
                            feature_id: feature.id,
                            feature,
                            order_index,
                        });
                        world.history.commit_transaction();
                    }
                    Err(e) => {
                        tracing::warn!("Feature execution failed: {}", e);
                    }
                }
                Ok(())
            }

            EditorCommand::DeleteEntity { entity_id } => {
                world.despawn(entity_id);
                Ok(())
            }

            EditorCommand::Undo => {
                if world.history.can_undo() {
                    world.history.undo();
                    tracing::info!("Undo");
                }
                Ok(())
            }

            EditorCommand::Redo => {
                if world.history.can_redo() {
                    world.history.redo();
                    tracing::info!("Redo");
                }
                Ok(())
            }

            EditorCommand::ImportFile { path } => {
                tracing::info!("Import file: {}", path);
                // TODO: Detect format and import
                Ok(())
            }

            EditorCommand::ExportFile {
                entity_id,
                path,
                format,
            } => {
                let entity = world
                    .get(entity_id)
                    .ok_or_else(|| anyhow::anyhow!("Entity {} not found", entity_id))?;

                let mesh = entity
                    .mesh
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("Entity '{}' has no tessellated mesh", entity.name))?;

                match format {
                    shared_types::geometry::FileFormat::Stl => {
                        tessellation::export_stl(mesh, &path)
                            .map_err(|e| anyhow::anyhow!("STL export failed: {}", e))?;
                        tracing::info!(
                            "Exported '{}' ({} triangles) as binary STL → {}",
                            entity.name,
                            mesh.triangle_count(),
                            path
                        );
                    }
                    _ => {
                        tracing::warn!("Export format {:?} not yet implemented", format);
                        return Err(anyhow::anyhow!("Export format {:?} not yet supported", format));
                    }
                }
                Ok(())
            }

            // ── Sketch Commands ──

            EditorCommand::CreateSketch { name } => {
                let id = world.create_sketch(&name);
                tracing::info!("Created sketch '{}' ({})", name, id);
                Ok(())
            }

            EditorCommand::DeleteSketch { sketch_id } => {
                world.remove_sketch(sketch_id);
                tracing::info!("Deleted sketch {}", sketch_id);
                Ok(())
            }

            EditorCommand::SetActiveSketch { sketch_id } => {
                world.set_active_sketch(sketch_id);
                tracing::info!("Active sketch: {:?}", sketch_id);
                Ok(())
            }

            EditorCommand::AddSketchEntity { sketch_id, entity } => {
                if let Some(sketch) = world.get_sketch_mut(sketch_id) {
                    let eid = sketch.add_entity(entity);
                    tracing::info!("Added entity {} to sketch {}", eid, sketch_id);
                } else {
                    tracing::warn!("Sketch {} not found", sketch_id);
                }
                Ok(())
            }

            EditorCommand::RemoveSketchEntity { sketch_id, entity_id } => {
                if let Some(sketch) = world.get_sketch_mut(sketch_id) {
                    sketch.remove_entity(entity_id);
                    tracing::info!("Removed entity {} from sketch {}", entity_id, sketch_id);
                }
                Ok(())
            }

            EditorCommand::AddSketchConstraint { sketch_id, constraint } => {
                if let Some(sketch) = world.get_sketch_mut(sketch_id) {
                    sketch.add_constraint(constraint);
                    tracing::info!("Added constraint to sketch {}", sketch_id);
                }
                Ok(())
            }

            EditorCommand::RemoveSketchConstraint { sketch_id, constraint_id } => {
                if let Some(sketch) = world.get_sketch_mut(sketch_id) {
                    sketch.remove_constraint(constraint_id);
                    tracing::info!("Removed constraint {} from sketch {}", constraint_id, sketch_id);
                }
                Ok(())
            }

            EditorCommand::TrimSegment { sketch_id, segment_id, click_pos } => {
                if let Some(sketch) = world.sketches.get(&sketch_id).cloned() {
                    match cad_kernel::trim_segment(&sketch, segment_id, click_pos) {
                        Ok(result) => {
                            let sketch_mut = world.get_sketch_mut(sketch_id).unwrap();
                            for id in &result.entities_to_remove {
                                sketch_mut.remove_entity(*id);
                            }
                            for entity in result.new_entities {
                                sketch_mut.add_entity(entity);
                            }
                            tracing::info!("Trimmed segment {} in sketch {}", segment_id, sketch_id);
                        }
                        Err(e) => {
                            tracing::warn!("Trim failed: {}", e);
                        }
                    }
                }
                Ok(())
            }

            EditorCommand::BevelAtPoint { sketch_id, point, radius } => {
                if let Some(sketch) = world.sketches.get(&sketch_id).cloned() {
                    match cad_kernel::bevel_at_point(&sketch, point, radius) {
                        Ok(result) => {
                            let sketch_mut = world.get_sketch_mut(sketch_id).unwrap();
                            for id in &result.entities_to_remove {
                                sketch_mut.remove_entity(*id);
                            }
                            sketch_mut.add_entity(result.arc);
                            sketch_mut.add_entity(result.segment_a);
                            sketch_mut.add_entity(result.segment_b);
                            tracing::info!("Beveled at ({}, {}) in sketch {}", point.x, point.y, sketch_id);
                        }
                        Err(e) => {
                            tracing::warn!("Bevel failed: {}", e);
                        }
                    }
                }
                Ok(())
            }

            EditorCommand::OffsetPath { sketch_id, entity_id, distance } => {
                if let Some(sketch) = world.sketches.get(&sketch_id).cloned() {
                    match cad_kernel::offset_path(&sketch, entity_id, distance) {
                        Ok(result) => {
                            let sketch_mut = world.get_sketch_mut(sketch_id).unwrap();
                            for entity in result.new_entities {
                                sketch_mut.add_entity(entity);
                            }
                            tracing::info!("Offset entity {} by {} in sketch {}", entity_id, distance, sketch_id);
                        }
                        Err(e) => {
                            tracing::warn!("Offset failed: {}", e);
                        }
                    }
                }
                Ok(())
            }

            EditorCommand::TakeSnapshot { sketch_id } => {
                if let Some(sketch) = world.get_sketch(sketch_id) {
                    let cloned = sketch.clone();
                    world.sketch_snapshots.push_snapshot(&cloned);
                    tracing::info!("Took snapshot of sketch {}", sketch_id);
                }
                Ok(())
            }

            EditorCommand::RestoreSnapshot { sketch_id } => {
                if let Some(snapshot) = world.sketch_snapshots.pop_snapshot() {
                    if let Some(sketch) = world.get_sketch_mut(sketch_id) {
                        snapshot.restore_to_sketch(sketch);
                        tracing::info!("Restored snapshot for sketch {}", sketch_id);
                    }
                }
                Ok(())
            }

            EditorCommand::CopyEntities { sketch_id, entity_ids } => {
                if let Some(sketch) = world.get_sketch(sketch_id) {
                    let buffer = ClipboardBuffer::from_selection(sketch, &entity_ids);
                    tracing::info!("Copied {} entities from sketch {}", buffer.entities.len(), sketch_id);
                    world.clipboard = Some(buffer);
                }
                Ok(())
            }

            EditorCommand::PasteEntities { sketch_id, offset_x, offset_y } => {
                if let Some(buffer) = world.clipboard.clone() {
                    if let Some(sketch) = world.get_sketch_mut(sketch_id) {
                        let new_ids = buffer.paste_into(sketch, (offset_x, offset_y));
                        tracing::info!("Pasted {} entities into sketch {}", new_ids.len(), sketch_id);
                    }
                }
                Ok(())
            }
        }
    }
}
