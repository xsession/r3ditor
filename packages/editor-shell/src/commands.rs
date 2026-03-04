//! Editor commands (undo-able operations).

use anyhow::Result;
use cad_kernel::brep::BRepModel;
use cad_kernel::features::Feature;
use cad_kernel::history::Command;
use cad_kernel::operations;
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
                let model = BRepModel::create_box(&name, width, height, depth);
                let entity = Entity::new(&name).with_model(model);
                let id = world.spawn(entity);
                tracing::info!("Created box '{}' ({:.1}×{:.1}×{:.1})", name, width, height, depth);

                world.history.execute(Command::new(
                    format!("Create box '{}'", name),
                    Feature::Import {
                        id: id,
                        format: shared_types::geometry::FileFormat::ManuNative,
                        filename: name,
                    },
                ));
                Ok(())
            }

            EditorCommand::CreateCylinder {
                name,
                radius,
                height,
            } => {
                let model = BRepModel::create_cylinder(&name, radius, height, 32);
                let entity = Entity::new(&name).with_model(model);
                let id = world.spawn(entity);
                tracing::info!(
                    "Created cylinder '{}' (r={:.1}, h={:.1})",
                    name, radius, height
                );

                world.history.execute(Command::new(
                    format!("Create cylinder '{}'", name),
                    Feature::Import {
                        id: id,
                        format: shared_types::geometry::FileFormat::ManuNative,
                        filename: name,
                    },
                ));
                Ok(())
            }

            EditorCommand::ApplyFeature { entity_id, feature } => {
                if let Some(entity) = world.get_mut(entity_id) {
                    if let Some(ref mut model) = entity.model {
                        operations::execute_feature(model, &feature)?;
                        entity.feature_tree.push(feature.clone());

                        world.history.execute(Command::new(
                            format!("Apply {} to {}", feature.type_name(), entity.name),
                            feature,
                        ));
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
                tracing::info!("Export {:?} to: {}", format, path);
                // TODO: Implement export
                Ok(())
            }
        }
    }
}
