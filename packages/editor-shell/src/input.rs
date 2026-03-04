//! Input handling — keyboard, mouse, touch events.

use winit::event::{ElementState, KeyEvent, MouseButton, MouseScrollDelta};
use winit::keyboard::{Key, NamedKey};

use crate::app::{EditorApp, Tool};
use crate::commands::EditorCommand;

/// Handle keyboard input
pub fn handle_key_event(app: &mut EditorApp, event: &KeyEvent) {
    if event.state != ElementState::Pressed {
        return;
    }

    // Check for modifier keys
    let ctrl = false; // TODO: track modifier state
    let shift = false;

    match &event.logical_key {
        // Tool shortcuts
        Key::Character(c) => match c.as_str() {
            "s" if !ctrl => app.set_tool(Tool::Sketch),
            "e" => app.set_tool(Tool::Extrude),
            "r" if !ctrl => app.set_tool(Tool::Rotate),
            "f" => app.set_tool(Tool::Fillet),
            "c" => app.set_tool(Tool::Chamfer),
            "b" => app.set_tool(Tool::Boolean),
            "m" => app.set_tool(Tool::Measure),

            // Quick create (for testing)
            "1" => {
                app.execute_command(EditorCommand::CreateBox {
                    name: "Box".into(),
                    width: 20.0,
                    height: 20.0,
                    depth: 20.0,
                });
            }
            "2" => {
                app.execute_command(EditorCommand::CreateCylinder {
                    name: "Cylinder".into(),
                    radius: 10.0,
                    height: 30.0,
                });
            }

            _ => {}
        },

        // Named keys
        Key::Named(NamedKey::Escape) => {
            app.set_tool(Tool::Select);
            app.clear_selection();
        }
        Key::Named(NamedKey::Delete) => {
            let ids: Vec<_> = app.selection.clone();
            for id in ids {
                app.execute_command(EditorCommand::DeleteEntity { entity_id: id });
            }
            app.clear_selection();
        }

        _ => {}
    }
}

/// Handle mouse movement for camera orbit/pan
pub fn handle_mouse_motion(
    app: &mut EditorApp,
    delta_x: f64,
    delta_y: f64,
    left_button: bool,
    middle_button: bool,
    right_button: bool,
    shift: bool,
) {
    if middle_button && shift {
        // Pan
        app.viewport.camera.pan(delta_x as f32, delta_y as f32);
    } else if middle_button || right_button {
        // Orbit
        app.viewport
            .camera
            .orbit(delta_x as f32, delta_y as f32);
    }
}

/// Handle mouse scroll for zoom
pub fn handle_scroll(app: &mut EditorApp, delta: MouseScrollDelta) {
    match delta {
        MouseScrollDelta::LineDelta(_, y) => {
            app.viewport.camera.zoom(y * 50.0);
        }
        MouseScrollDelta::PixelDelta(pos) => {
            app.viewport.camera.zoom(pos.y as f32);
        }
    }
}
