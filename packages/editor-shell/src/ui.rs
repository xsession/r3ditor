//! egui-based viewport UI overlays.

use egui::{self, Color32, RichText, Ui};

use crate::app::{EditorApp, Tool};
use crate::commands::EditorCommand;

/// Draw the main editor UI using egui
pub fn draw_editor_ui(ctx: &egui::Context, app: &mut EditorApp) {
    // Top toolbar
    egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
        ui.horizontal(|ui| {
            ui.heading(RichText::new("r3ditor").color(Color32::from_rgb(64, 180, 255)));
            ui.separator();

            // File menu
            ui.menu_button("File", |ui| {
                if ui.button("New Project").clicked() {
                    ui.close_menu();
                }
                if ui.button("Open...").clicked() {
                    ui.close_menu();
                }
                if ui.button("Save").clicked() {
                    ui.close_menu();
                }
                if ui.button("Export...").clicked() {
                    ui.close_menu();
                }
            });

            // Edit menu
            ui.menu_button("Edit", |ui| {
                if ui.button("Undo (Ctrl+Z)").clicked() {
                    app.execute_command(EditorCommand::Undo);
                    ui.close_menu();
                }
                if ui.button("Redo (Ctrl+Y)").clicked() {
                    app.execute_command(EditorCommand::Redo);
                    ui.close_menu();
                }
            });

            ui.separator();

            // Tool buttons
            tool_button(ui, app, Tool::Select, "⊙ Select");
            tool_button(ui, app, Tool::Move, "✥ Move");
            tool_button(ui, app, Tool::Rotate, "↻ Rotate");
            tool_button(ui, app, Tool::Scale, "⤡ Scale");
            ui.separator();
            tool_button(ui, app, Tool::Sketch, "✎ Sketch");
            tool_button(ui, app, Tool::Extrude, "⬆ Extrude");
            tool_button(ui, app, Tool::Revolve, "↻ Revolve");
            tool_button(ui, app, Tool::Fillet, "◠ Fillet");
            tool_button(ui, app, Tool::Chamfer, "▽ Chamfer");
            tool_button(ui, app, Tool::Boolean, "⊕ Boolean");
        });
    });

    // Right side panel — Properties
    egui::SidePanel::right("properties")
        .min_width(250.0)
        .default_width(300.0)
        .show(ctx, |ui| {
            ui.heading("Properties");
            ui.separator();

            if app.selection.is_empty() {
                ui.label("No selection");
            } else {
                for &id in &app.selection {
                    if let Some(entity) = app.world.get(id) {
                        ui.label(format!("Name: {}", entity.name));
                        ui.label(format!("Visible: {}", entity.visible));
                        if let Some(ref model) = entity.model {
                            ui.label(format!("Faces: {}", model.face_count()));
                            ui.label(format!("Edges: {}", model.edge_count()));
                            ui.label(format!("Vertices: {}", model.vertex_count()));
                        }
                        ui.separator();
                    }
                }
            }

            // Quick create section
            ui.heading("Create");
            ui.separator();
            if ui.button("Box (1)").clicked() {
                app.execute_command(EditorCommand::CreateBox {
                    name: "Box".into(),
                    width: 20.0,
                    height: 20.0,
                    depth: 20.0,
                });
            }
            if ui.button("Cylinder (2)").clicked() {
                app.execute_command(EditorCommand::CreateCylinder {
                    name: "Cylinder".into(),
                    radius: 10.0,
                    height: 30.0,
                });
            }
        });

    // Left side panel — Feature tree
    egui::SidePanel::left("feature_tree")
        .min_width(200.0)
        .default_width(250.0)
        .show(ctx, |ui| {
            ui.heading("Feature Tree");
            ui.separator();

            for entity in &app.world.entities {
                let selected = app.selection.contains(&entity.id);
                let text = if selected {
                    RichText::new(&entity.name).color(Color32::from_rgb(64, 180, 255))
                } else {
                    RichText::new(&entity.name)
                };

                if ui
                    .selectable_label(selected, text)
                    .clicked()
                {
                    app.selection.clear();
                    app.selection.push(entity.id);
                }

                // Show feature tree items
                for feature in entity.feature_tree.active_features() {
                    ui.indent(feature.id(), |ui| {
                        ui.label(format!("  ├─ {}", feature.type_name()));
                    });
                }
            }
        });

    // Bottom panel — Status bar
    egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
        ui.horizontal(|ui| {
            ui.label(format!("Tool: {:?}", app.active_tool));
            ui.separator();
            ui.label(format!("Entities: {}", app.world.entities.len()));
            ui.separator();
            ui.label(format!(
                "History: {} undo / {} redo",
                app.world.history.undo_count(),
                app.world.history.redo_count()
            ));
            if app.world.history.is_modified() {
                ui.label(RichText::new("● Modified").color(Color32::YELLOW));
            }
        });
    });
}

/// Helper to create tool toggle buttons
fn tool_button(ui: &mut Ui, app: &mut EditorApp, tool: Tool, label: &str) {
    let active = app.active_tool == tool;
    if ui.selectable_label(active, label).clicked() {
        app.set_tool(tool);
    }
}
