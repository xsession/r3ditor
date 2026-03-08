//! Main application entry point and event loop.

use tracing::info;
use uuid::Uuid;

use cad_kernel::sketch::Point2D;
use cad_kernel::snap::{SnapConfig, SnapEngine, SnapResult, SnapType};
use cad_kernel::tools::{
    ToolStateMachine, ToolInput, ToolModalResult, StatefulTool,
    LineTool, CircleTool, ArcTool, RectangleTool,
};

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

    // ── Sketch Tool System ──
    /// Current stateful sketch tool (if any)
    sketch_tool: Option<Box<dyn StatefulTool>>,
    /// Tool state machine for the active sketch tool
    tool_machine: Option<ToolStateMachine>,
    /// Last snap result (for visual feedback)
    pub last_snap: Option<SnapResult>,
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
    // ── Sketch Tools ──
    SketchLine,
    SketchCircle,
    SketchArc,
    SketchRectangle,
    SketchTrim,
    SketchOffset,
    SketchBevel,
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
            sketch_tool: None,
            tool_machine: None,
            last_snap: None,
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
        // Cancel any active sketch tool
        self.cancel_sketch_tool();

        self.active_tool = tool;
        info!("Active tool: {:?}", tool);

        // If a sketch tool, initialize the tool + state machine
        match tool {
            Tool::SketchLine => self.activate_sketch_tool(Box::new(LineTool)),
            Tool::SketchCircle => self.activate_sketch_tool(Box::new(CircleTool)),
            Tool::SketchArc => self.activate_sketch_tool(Box::new(ArcTool)),
            Tool::SketchRectangle => self.activate_sketch_tool(Box::new(RectangleTool)),
            _ => {}
        }
    }

    /// Activate a sketch tool with its state machine
    fn activate_sketch_tool(&mut self, tool: Box<dyn StatefulTool>) {
        let state_count = tool.states().len();
        let mut machine = ToolStateMachine::new(state_count);

        // Invoke the tool on the active sketch
        if let Some(sketch) = self.world.active_sketch_mut() {
            let sel: Vec<Uuid> = self.selection.clone();
            machine.invoke(tool.as_ref(), sketch, &sel);
        }

        self.tool_machine = Some(machine);
        self.sketch_tool = Some(tool);
    }

    /// Cancel the active sketch tool
    fn cancel_sketch_tool(&mut self) {
        if let (Some(tool), Some(machine)) = (self.sketch_tool.as_mut(), self.tool_machine.as_mut()) {
            if machine.is_running() {
                if let Some(sketch) = self.world.active_sketch_mut() {
                    machine.handle_input(tool.as_mut(), sketch, ToolInput::Escape);
                }
            }
        }
        self.sketch_tool = None;
        self.tool_machine = None;
    }

    /// Send a tool input to the active sketch tool
    pub fn send_tool_input(&mut self, input: ToolInput) -> Option<ToolModalResult> {
        let tool = self.sketch_tool.as_mut()?;
        let machine = self.tool_machine.as_mut()?;
        let sketch = self.world.active_sketch_mut()?;

        let result = machine.handle_input(tool.as_mut(), sketch, input);

        match result {
            ToolModalResult::Finished | ToolModalResult::Cancelled => {
                // Reset to select tool after completion
                self.sketch_tool = None;
                self.tool_machine = None;
                self.active_tool = Tool::Select;
            }
            ToolModalResult::ContinuousDraw => {
                // Keep tool active for continuous drawing
            }
            _ => {}
        }

        Some(result)
    }

    /// Compute snap for the current cursor position (in sketch coordinates)
    pub fn compute_snap(&mut self, cursor: Point2D, reference_point: Option<Point2D>) -> SnapResult {
        let exclude: Vec<Uuid> = Vec::new();
        if let Some(sketch) = self.world.active_sketch() {
            let result = SnapEngine::find_snap(
                sketch,
                cursor,
                &self.world.snap_config,
                &exclude,
                reference_point,
            );
            self.last_snap = Some(result.clone());
            result
        } else {
            SnapResult {
                position: cursor,
                snap_type: SnapType::None,
                source_entity: None,
                secondary_entity: None,
                distance: 0.0,
            }
        }
    }

    /// Check if a sketch tool is currently active
    pub fn is_sketch_tool_active(&self) -> bool {
        self.tool_machine.as_ref().map(|m| m.is_running()).unwrap_or(false)
    }

    /// Get the current sketch tool's status text
    pub fn sketch_tool_status(&self) -> Option<String> {
        let tool = self.sketch_tool.as_ref()?;
        let machine = self.tool_machine.as_ref()?;
        let state_def = machine.current_state_def(tool.as_ref())?;
        Some(format!("{}: {}", tool.name(), state_def.description))
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
    fn test_set_sketch_tool() {
        let mut app = EditorApp::new();
        // Create and activate a sketch first
        let sketch_id = app.world.create_sketch("Test");
        app.world.set_active_sketch(Some(sketch_id));

        app.set_tool(Tool::SketchLine);
        assert_eq!(app.active_tool, Tool::SketchLine);
        assert!(app.is_sketch_tool_active());
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
            Tool::SketchLine, Tool::SketchCircle, Tool::SketchArc,
            Tool::SketchRectangle, Tool::SketchTrim, Tool::SketchOffset,
            Tool::SketchBevel,
        ];
        assert_eq!(tools.len(), 19);
    }

    #[test]
    fn test_sketch_line_tool_workflow() {
        let mut app = EditorApp::new();
        let sketch_id = app.world.create_sketch("Test");
        app.world.set_active_sketch(Some(sketch_id));

        app.set_tool(Tool::SketchLine);
        assert!(app.is_sketch_tool_active());

        // Click start point
        let result = app.send_tool_input(ToolInput::Click {
            position: Point2D::new(0.0, 0.0),
        });
        assert!(result.is_some());

        // Click end point
        let result = app.send_tool_input(ToolInput::Click {
            position: Point2D::new(10.0, 5.0),
        });
        // LineTool supports continuous draw
        assert_eq!(result, Some(ToolModalResult::ContinuousDraw));

        // Verify line was created
        let sketch = app.world.get_sketch(sketch_id).unwrap();
        let lines: Vec<_> = sketch.entities.values()
            .filter(|e| matches!(e, cad_kernel::sketch::SketchEntity::Line { .. }))
            .collect();
        assert_eq!(lines.len(), 1);
    }

    #[test]
    fn test_create_sketch_command() {
        let mut app = EditorApp::new();
        app.execute_command(EditorCommand::CreateSketch {
            name: "MySketch".into(),
        });
        app.update();
        assert_eq!(app.world.sketches.len(), 1);
    }

    #[test]
    fn test_snap_computation() {
        let mut app = EditorApp::new();
        let sketch_id = app.world.create_sketch("Snap Test");
        app.world.set_active_sketch(Some(sketch_id));

        // Add a line entity
        {
            let sketch = app.world.get_sketch_mut(sketch_id).unwrap();
            sketch.add_entity(cad_kernel::sketch::SketchEntity::Line {
                id: Uuid::new_v4(),
                start: Point2D::new(0.0, 0.0),
                end: Point2D::new(10.0, 0.0),
                is_construction: false,
            });
        }

        // Snap near the start endpoint
        let result = app.compute_snap(Point2D::new(0.1, 0.1), None);
        assert_eq!(result.snap_type, SnapType::Endpoint);
    }
}
