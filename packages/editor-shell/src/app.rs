//! Main application entry point and event loop.

use tracing::info;
use uuid::Uuid;

use crate::ecs::World;
use crate::commands::EditorCommand;
use renderer::Viewport;

/// The main editor application state
pub struct EditorApp {
    /// ECS world
    pub world: World,
    /// Active viewport
    pub viewport: Viewport,
    /// Command queue
    command_queue: Vec<EditorCommand>,
    /// Whether the app is running
    pub running: bool,
    /// Current active tool
    pub active_tool: Tool,
    /// Selected entity IDs
    pub selection: Vec<Uuid>,
}

/// Available editing tools
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Select,
    Move,
    Rotate,
    Scale,
    Sketch,
    Extrude,
    Revolve,
    Fillet,
    Chamfer,
    Boolean,
    Measure,
    Section,
}

impl EditorApp {
    pub fn new() -> Self {
        info!("Initializing r3ditor editor...");
        Self {
            world: World::new(),
            viewport: Viewport::default(),
            command_queue: Vec::new(),
            running: true,
            active_tool: Tool::Select,
            selection: Vec::new(),
        }
    }

    /// Queue a command for execution
    pub fn execute_command(&mut self, command: EditorCommand) {
        self.command_queue.push(command);
    }

    /// Process all queued commands
    pub fn process_commands(&mut self) {
        let commands: Vec<_> = self.command_queue.drain(..).collect();
        for command in commands {
            if let Err(e) = command.execute(&mut self.world) {
                tracing::error!("Command execution failed: {}", e);
            }
        }
    }

    /// Main frame update
    pub fn update(&mut self) {
        // Stage 1: Process input commands
        self.process_commands();

        // Stage 2: Solve constraints
        self.world.solve_constraints();

        // Stage 3: Rebuild geometry (tessellate dirty models)
        self.world.rebuild_geometry();

        // Stage 4: Sync scene for rendering
        self.world.sync_render_scene(&mut self.viewport.scene);
    }

    /// Set the active tool
    pub fn set_tool(&mut self, tool: Tool) {
        self.active_tool = tool;
        info!("Active tool: {:?}", tool);
    }

    /// Select an entity
    pub fn select(&mut self, entity_id: Uuid) {
        if !self.selection.contains(&entity_id) {
            self.selection.push(entity_id);
        }
    }

    /// Clear selection
    pub fn clear_selection(&mut self) {
        self.selection.clear();
    }
}

impl Default for EditorApp {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_editor_app_new() {
        let app = EditorApp::new();
        assert!(app.running);
        assert_eq!(app.active_tool, Tool::Select);
        assert!(app.selection.is_empty());
        assert!(app.world.entities.is_empty());
    }

    #[test]
    fn test_set_tool() {
        let mut app = EditorApp::new();
        app.set_tool(Tool::Extrude);
        assert_eq!(app.active_tool, Tool::Extrude);
        app.set_tool(Tool::Sketch);
        assert_eq!(app.active_tool, Tool::Sketch);
    }

    #[test]
    fn test_select_entity() {
        let mut app = EditorApp::new();
        let id = Uuid::new_v4();
        app.select(id);
        assert_eq!(app.selection.len(), 1);
        assert_eq!(app.selection[0], id);
    }

    #[test]
    fn test_select_no_duplicates() {
        let mut app = EditorApp::new();
        let id = Uuid::new_v4();
        app.select(id);
        app.select(id);
        assert_eq!(app.selection.len(), 1);
    }

    #[test]
    fn test_clear_selection() {
        let mut app = EditorApp::new();
        app.select(Uuid::new_v4());
        app.select(Uuid::new_v4());
        app.clear_selection();
        assert!(app.selection.is_empty());
    }

    #[test]
    fn test_execute_command_creates_entity() {
        let mut app = EditorApp::new();
        app.execute_command(EditorCommand::CreateBox {
            name: "TestBox".into(),
            width: 10.0,
            height: 10.0,
            depth: 10.0,
        });
        app.update();
        assert_eq!(app.world.entities.len(), 1);
        assert_eq!(app.world.entities[0].name, "TestBox");
    }

    #[test]
    fn test_execute_command_create_cylinder() {
        let mut app = EditorApp::new();
        app.execute_command(EditorCommand::CreateCylinder {
            name: "TestCyl".into(),
            radius: 5.0,
            height: 20.0,
        });
        app.update();
        assert_eq!(app.world.entities.len(), 1);
        assert_eq!(app.world.entities[0].name, "TestCyl");
    }

    #[test]
    fn test_execute_command_delete_entity() {
        let mut app = EditorApp::new();
        app.execute_command(EditorCommand::CreateBox {
            name: "ToDelete".into(),
            width: 5.0,
            height: 5.0,
            depth: 5.0,
        });
        app.update();
        let id = app.world.entities[0].id;
        app.execute_command(EditorCommand::DeleteEntity { entity_id: id });
        app.update();
        assert!(app.world.entities.is_empty());
    }

    #[test]
    fn test_tool_variants() {
        let tools = vec![
            Tool::Select, Tool::Move, Tool::Rotate, Tool::Scale,
            Tool::Sketch, Tool::Extrude, Tool::Revolve,
            Tool::Fillet, Tool::Chamfer, Tool::Boolean,
            Tool::Measure, Tool::Section,
        ];
        assert_eq!(tools.len(), 12);
    }
}
