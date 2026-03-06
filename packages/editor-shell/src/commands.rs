//! Editor commands (undo-able operations).

use anyhow::Result;
use cad_kernel::brep::BRepBody;
use cad_kernel::features::{Feature, FeatureAttributes, FeatureKind, FeatureResult};
use cad_kernel::history::ChangeRecord;
use cad_kernel::operations;
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
        }
    }
}
