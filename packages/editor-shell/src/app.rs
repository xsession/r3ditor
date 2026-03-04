//! Main application entry point and event loop.

use anyhow::Result;
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
