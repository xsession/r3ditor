//! # Stateful Tool Framework — CAD_Sketcher-inspired
//!
//! Implements the declarative state-machine tool system from CAD_Sketcher:
//! - Declarative tool state definitions
//! - Modal interaction loop (invoke → prefill → pick/create → next state)
//! - Continuous draw (chain drawing for polylines)
//! - Numeric input override
//! - Three interaction paradigms: Select→Invoke, Invoke→Select, Mixed

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::sketch::{Point2D, Sketch, SketchEntity, SketchEntityId};
use crate::snapshot::ToolSnapshotManager;

// ─── Tool State Definition (CAD_Sketcher OperatorState dataclass) ─────────────

/// Defines what types of entities can satisfy a tool state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EntityTypeFilter {
    Point,
    Line,
    Arc,
    Circle,
    AnySegment,
    AnyEntity,
}

/// A single state in a tool's state machine.
/// Equivalent to CAD_Sketcher's `OperatorState` dataclass.
#[derive(Debug, Clone)]
pub struct ToolStateDef {
    /// Human-readable name ("Start Point", "End Point", etc.)
    pub name: &'static str,
    /// Description for status bar
    pub description: &'static str,
    /// Acceptable entity types for picking
    pub entity_types: &'static [EntityTypeFilter],
    /// Whether to create a new entity if nothing is picked
    pub use_create: bool,
    /// Whether the state allows pre-filling from existing selection
    pub allow_prefill: bool,
    /// Whether the state is optional (can be skipped)
    pub optional: bool,
    /// Whether the state requires interactive input
    pub interactive: bool,
}

/// Value resolved for a tool state — either a picked entity or a coordinate
#[derive(Debug, Clone)]
pub enum ToolStateValue {
    /// An existing entity was picked
    Entity(SketchEntityId),
    /// A coordinate was input (via mouse click or numeric entry)
    Coordinate(Point2D),
    /// A numeric value was input
    Number(f64),
    /// Nothing was resolved
    None,
}

// ─── Tool Trait (the core abstraction) ────────────────────────────────────────

/// The result of a tool's modal event handling
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolModalResult {
    /// Continue in the current state (waiting for input)
    Running,
    /// Move to the next state
    NextState,
    /// Tool completed successfully
    Finished,
    /// Tool was cancelled
    Cancelled,
    /// Restart for continuous draw (chain drawing)
    ContinuousDraw,
}

/// Input event for the tool system
#[derive(Debug, Clone)]
pub enum ToolInput {
    /// Mouse moved to a new position
    MouseMove { position: Point2D },
    /// Mouse button clicked at position
    Click { position: Point2D },
    /// Mouse button released
    Release { position: Point2D },
    /// Entity picked/hovered under cursor
    EntityHover { entity_id: Option<SketchEntityId> },
    /// Numeric input confirmed
    NumericInput { value: f64 },
    /// Tab key (cycle numeric sub-state)
    Tab,
    /// Escape key (cancel)
    Escape,
    /// Enter key (confirm)
    Enter,
    /// Undo within tool
    Undo,
}

/// A stateful tool that interacts with sketches via a state machine.
pub trait StatefulTool: Send + Sync {
    /// Get the tool's display name
    fn name(&self) -> &'static str;

    /// Get the tool's state definitions
    fn states(&self) -> &[ToolStateDef];

    /// Whether this tool supports continuous draw (chain drawing)
    fn supports_continuous_draw(&self) -> bool { false }

    /// Resolve a coordinate to a state value.
    /// Called when the user clicks at a position — converts screen/sketch coords to a tool value.
    fn state_func(&self, state_idx: usize, coords: Point2D, sketch: &Sketch) -> ToolStateValue;

    /// Pick an entity under the cursor.
    /// Returns the entity ID if it matches the state's entity type filter.
    fn pick_element(&self, state_idx: usize, hover_entity: Option<SketchEntityId>, sketch: &Sketch) -> Option<SketchEntityId>;

    /// Create a new entity for this state if `use_create` is true.
    fn create_element(&self, state_idx: usize, value: &ToolStateValue, sketch: &mut Sketch) -> Option<SketchEntityId>;

    /// Execute the main operation after all states are resolved.
    fn execute(&mut self, sketch: &mut Sketch, values: &[ToolStateValue]) -> Result<(), String>;

    /// Called when the tool finishes (success or cancel) for cleanup.
    fn cleanup(&mut self, _sketch: &mut Sketch) {}
}

// ─── Tool State Machine (CAD_Sketcher _StateMachineMixin + StatefulOperatorLogic)

/// Manages the modal lifecycle of a stateful tool.
pub struct ToolStateMachine {
    /// Current state index
    pub current_state: usize,
    /// Resolved values for each state
    pub values: Vec<ToolStateValue>,
    /// Current hover entity
    pub hover_entity: Option<SketchEntityId>,
    /// Whether the tool is actively running
    pub active: bool,
    /// Snapshot manager for in-tool undo
    pub snapshots: ToolSnapshotManager,
    /// Numeric input buffer (X, Y, Value)
    pub numeric_input: NumericInputState,
    /// Last resolved pointer (for continuous draw)
    last_pointer: Option<(SketchEntityId, ToolStateValue)>,
}

/// Numeric input state for dimensional entry
#[derive(Debug, Clone, Default)]
pub struct NumericInputState {
    pub active: bool,
    pub buffer: String,
    pub sub_state: usize, // 0=X, 1=Y, 2=Z/Value
}

impl ToolStateMachine {
    pub fn new(state_count: usize) -> Self {
        Self {
            current_state: 0,
            values: vec![ToolStateValue::None; state_count],
            hover_entity: None,
            active: false,
            snapshots: ToolSnapshotManager::default(),
            numeric_input: NumericInputState::default(),
            last_pointer: None,
        }
    }

    /// Start the tool (invoke)
    pub fn invoke(&mut self, tool: &dyn StatefulTool, sketch: &mut Sketch, selection: &[SketchEntityId]) {
        self.active = true;
        self.current_state = 0;
        self.values = vec![ToolStateValue::None; tool.states().len()];
        self.snapshots.push_snapshot(sketch);

        // Prefill states from current selection
        self.prefill_states(tool, sketch, selection);
    }

    /// Prefill states from existing selection (Select→Invoke paradigm)
    fn prefill_states(&mut self, tool: &dyn StatefulTool, sketch: &Sketch, selection: &[SketchEntityId]) {
        let states = tool.states();
        let mut sel_iter = selection.iter();

        for (i, state_def) in states.iter().enumerate() {
            if !state_def.allow_prefill {
                continue;
            }
            if let Some(&entity_id) = sel_iter.next() {
                if let Some(picked) = tool.pick_element(i, Some(entity_id), sketch) {
                    self.values[i] = ToolStateValue::Entity(picked);
                    self.current_state = i + 1;
                }
            }
        }

        // Clamp to valid state range
        if self.current_state >= states.len() {
            self.current_state = states.len() - 1;
        }
    }

    /// Process a modal input event
    pub fn handle_input(
        &mut self,
        tool: &mut dyn StatefulTool,
        sketch: &mut Sketch,
        input: ToolInput,
    ) -> ToolModalResult {
        if !self.active {
            return ToolModalResult::Cancelled;
        }

        let states = tool.states();
        if self.current_state >= states.len() {
            return ToolModalResult::Finished;
        }

        match input {
            ToolInput::MouseMove { .. } => {
                ToolModalResult::Running
            }

            ToolInput::EntityHover { entity_id } => {
                self.hover_entity = entity_id;
                ToolModalResult::Running
            }

            ToolInput::Click { position } => {
                let state_def = &states[self.current_state];

                // Try to pick a hovered entity first
                if let Some(hover_id) = self.hover_entity {
                    if let Some(picked) = tool.pick_element(self.current_state, Some(hover_id), sketch) {
                        self.values[self.current_state] = ToolStateValue::Entity(picked);
                        return self.advance_state(tool, sketch);
                    }
                }

                // Resolve via state_func (coordinate → value)
                let value = tool.state_func(self.current_state, position, sketch);
                match &value {
                    ToolStateValue::None => {
                        if state_def.optional {
                            return self.advance_state(tool, sketch);
                        }
                        ToolModalResult::Running
                    }
                    _ => {
                        // Optionally create a new entity
                        if state_def.use_create {
                            if let Some(_created_id) = tool.create_element(self.current_state, &value, sketch) {
                                self.values[self.current_state] = value;
                                return self.advance_state(tool, sketch);
                            }
                        }
                        self.values[self.current_state] = value;
                        self.advance_state(tool, sketch)
                    }
                }
            }

            ToolInput::NumericInput { value } => {
                self.values[self.current_state] = ToolStateValue::Number(value);
                self.numeric_input.active = false;
                self.numeric_input.buffer.clear();
                self.advance_state(tool, sketch)
            }

            ToolInput::Tab => {
                self.numeric_input.sub_state = (self.numeric_input.sub_state + 1) % 3;
                ToolModalResult::Running
            }

            ToolInput::Enter => {
                // Try to parse numeric buffer
                if self.numeric_input.active {
                    if let Ok(val) = self.numeric_input.buffer.parse::<f64>() {
                        self.values[self.current_state] = ToolStateValue::Number(val);
                        self.numeric_input.active = false;
                        self.numeric_input.buffer.clear();
                        return self.advance_state(tool, sketch);
                    }
                }
                // Otherwise try to finish
                self.try_finish(tool, sketch)
            }

            ToolInput::Escape => {
                self.cancel(tool, sketch);
                ToolModalResult::Cancelled
            }

            ToolInput::Undo => {
                if self.current_state > 0 {
                    self.current_state -= 1;
                    self.values[self.current_state] = ToolStateValue::None;
                    // Restore snapshot
                    self.snapshots.pop_and_restore(sketch);
                    self.snapshots.push_snapshot(sketch);
                }
                ToolModalResult::Running
            }

            ToolInput::Release { .. } => ToolModalResult::Running,
        }
    }

    /// Advance to the next state or finish
    fn advance_state(&mut self, tool: &mut dyn StatefulTool, sketch: &mut Sketch) -> ToolModalResult {
        let states = tool.states();

        // Skip optional states that are already resolved
        self.current_state += 1;

        // Skip any optional states after the current one
        while self.current_state < states.len() && states[self.current_state].optional {
            if matches!(self.values[self.current_state], ToolStateValue::None) {
                break; // Optional but not pre-filled — let user decide
            }
            self.current_state += 1;
        }

        if self.current_state >= states.len() {
            return self.try_finish(tool, sketch);
        }

        ToolModalResult::NextState
    }

    /// Try to execute the tool's main operation
    fn try_finish(&mut self, tool: &mut dyn StatefulTool, sketch: &mut Sketch) -> ToolModalResult {
        match tool.execute(sketch, &self.values) {
            Ok(()) => {
                if tool.supports_continuous_draw() {
                    return self.begin_continuous_draw(tool, sketch);
                }
                self.active = false;
                tool.cleanup(sketch);
                ToolModalResult::Finished
            }
            Err(_e) => {
                // Execution failed — stay active for retry
                ToolModalResult::Running
            }
        }
    }

    /// Continuous draw: restart the tool with the last point as the first state
    fn begin_continuous_draw(&mut self, tool: &dyn StatefulTool, sketch: &mut Sketch) -> ToolModalResult {
        let states = tool.states();
        if states.is_empty() {
            self.active = false;
            return ToolModalResult::Finished;
        }

        // Save the last state's value as seed for the next iteration
        let last_value = self.values.last().cloned().unwrap_or(ToolStateValue::None);

        // Take a new snapshot
        self.snapshots.push_snapshot(sketch);

        // Reset
        self.values = vec![ToolStateValue::None; states.len()];
        self.values[0] = last_value; // Pre-fill first state with last endpoint
        self.current_state = 1; // Skip to second state

        ToolModalResult::ContinuousDraw
    }

    /// Cancel the tool and restore the snapshot
    fn cancel(&mut self, tool: &mut dyn StatefulTool, sketch: &mut Sketch) {
        self.snapshots.pop_and_restore(sketch);
        self.active = false;
        tool.cleanup(sketch);
    }

    /// Get the current state's definition
    pub fn current_state_def<'a>(&self, tool: &'a dyn StatefulTool) -> Option<&'a ToolStateDef> {
        tool.states().get(self.current_state)
    }

    /// Check if the tool is waiting for input
    pub fn is_running(&self) -> bool {
        self.active
    }
}

// ─── Built-in Tool Implementations ───────────────────────────────────────────

/// Line drawing tool (2-state: start point → end point)
pub struct LineTool;

impl StatefulTool for LineTool {
    fn name(&self) -> &'static str { "Line" }

    fn states(&self) -> &[ToolStateDef] {
        &[
            ToolStateDef {
                name: "Start Point",
                description: "Pick or click to set the start point",
                entity_types: &[EntityTypeFilter::Point],
                use_create: true,
                allow_prefill: true,
                optional: false,
                interactive: true,
            },
            ToolStateDef {
                name: "End Point",
                description: "Pick or click to set the end point",
                entity_types: &[EntityTypeFilter::Point],
                use_create: true,
                allow_prefill: true,
                optional: false,
                interactive: true,
            },
        ]
    }

    fn supports_continuous_draw(&self) -> bool { true }

    fn state_func(&self, _state_idx: usize, coords: Point2D, _sketch: &Sketch) -> ToolStateValue {
        ToolStateValue::Coordinate(coords)
    }

    fn pick_element(&self, _state_idx: usize, hover_entity: Option<SketchEntityId>, sketch: &Sketch) -> Option<SketchEntityId> {
        hover_entity.filter(|id| {
            sketch.entities.get(id).map(|e| matches!(e, SketchEntity::Point { .. })).unwrap_or(false)
        })
    }

    fn create_element(&self, _state_idx: usize, value: &ToolStateValue, sketch: &mut Sketch) -> Option<SketchEntityId> {
        if let ToolStateValue::Coordinate(pt) = value {
            let entity = SketchEntity::Point {
                id: Uuid::new_v4(),
                position: *pt,
                is_construction: false,
            };
            Some(sketch.add_entity(entity))
        } else {
            None
        }
    }

    fn execute(&mut self, sketch: &mut Sketch, values: &[ToolStateValue]) -> Result<(), String> {
        let start = match &values[0] {
            ToolStateValue::Coordinate(p) => *p,
            ToolStateValue::Entity(id) => {
                sketch.entities.get(id)
                    .and_then(|e| e.start_point())
                    .ok_or("Invalid start point")?
            }
            _ => return Err("Start point not set".into()),
        };
        let end = match &values[1] {
            ToolStateValue::Coordinate(p) => *p,
            ToolStateValue::Entity(id) => {
                sketch.entities.get(id)
                    .and_then(|e| e.start_point())
                    .ok_or("Invalid end point")?
            }
            _ => return Err("End point not set".into()),
        };

        let line = SketchEntity::Line {
            id: Uuid::new_v4(),
            start,
            end,
            is_construction: false,
        };
        sketch.add_entity(line);
        Ok(())
    }
}

/// Circle drawing tool (2-state: center → radius point)
pub struct CircleTool;

impl StatefulTool for CircleTool {
    fn name(&self) -> &'static str { "Circle" }

    fn states(&self) -> &[ToolStateDef] {
        &[
            ToolStateDef {
                name: "Center",
                description: "Pick or click to set the center",
                entity_types: &[EntityTypeFilter::Point],
                use_create: true,
                allow_prefill: true,
                optional: false,
                interactive: true,
            },
            ToolStateDef {
                name: "Radius",
                description: "Click to set the radius or enter a value",
                entity_types: &[EntityTypeFilter::Point],
                use_create: false,
                allow_prefill: false,
                optional: false,
                interactive: true,
            },
        ]
    }

    fn state_func(&self, state_idx: usize, coords: Point2D, _sketch: &Sketch) -> ToolStateValue {
        match state_idx {
            0 => ToolStateValue::Coordinate(coords),
            1 => ToolStateValue::Coordinate(coords), // Will compute radius from center
            _ => ToolStateValue::None,
        }
    }

    fn pick_element(&self, _state_idx: usize, hover_entity: Option<SketchEntityId>, sketch: &Sketch) -> Option<SketchEntityId> {
        hover_entity.filter(|id| {
            sketch.entities.get(id).map(|e| matches!(e, SketchEntity::Point { .. })).unwrap_or(false)
        })
    }

    fn create_element(&self, state_idx: usize, value: &ToolStateValue, sketch: &mut Sketch) -> Option<SketchEntityId> {
        if state_idx == 0 {
            if let ToolStateValue::Coordinate(pt) = value {
                let entity = SketchEntity::Point {
                    id: Uuid::new_v4(),
                    position: *pt,
                    is_construction: false,
                };
                return Some(sketch.add_entity(entity));
            }
        }
        None
    }

    fn execute(&mut self, sketch: &mut Sketch, values: &[ToolStateValue]) -> Result<(), String> {
        let center = match &values[0] {
            ToolStateValue::Coordinate(p) => *p,
            ToolStateValue::Entity(id) => {
                sketch.entities.get(id)
                    .and_then(|e| e.start_point())
                    .ok_or("Invalid center point")?
            }
            _ => return Err("Center not set".into()),
        };
        let radius = match &values[1] {
            ToolStateValue::Coordinate(p) => center.distance_to(p),
            ToolStateValue::Number(r) => *r,
            _ => return Err("Radius not set".into()),
        };

        if radius < 1e-12 {
            return Err("Radius too small".into());
        }

        let circle = SketchEntity::Circle {
            id: Uuid::new_v4(),
            center,
            radius,
            is_construction: false,
        };
        sketch.add_entity(circle);
        Ok(())
    }
}

/// Arc drawing tool (3-state: center → start → end)
pub struct ArcTool;

impl StatefulTool for ArcTool {
    fn name(&self) -> &'static str { "Arc (Center)" }

    fn states(&self) -> &[ToolStateDef] {
        &[
            ToolStateDef {
                name: "Center",
                description: "Pick or click the arc center",
                entity_types: &[EntityTypeFilter::Point],
                use_create: true,
                allow_prefill: true,
                optional: false,
                interactive: true,
            },
            ToolStateDef {
                name: "Start Point",
                description: "Click to set the arc start",
                entity_types: &[EntityTypeFilter::Point],
                use_create: false,
                allow_prefill: false,
                optional: false,
                interactive: true,
            },
            ToolStateDef {
                name: "End Point",
                description: "Click to set the arc end",
                entity_types: &[EntityTypeFilter::Point],
                use_create: false,
                allow_prefill: false,
                optional: false,
                interactive: true,
            },
        ]
    }

    fn state_func(&self, _state_idx: usize, coords: Point2D, _sketch: &Sketch) -> ToolStateValue {
        ToolStateValue::Coordinate(coords)
    }

    fn pick_element(&self, _state_idx: usize, hover_entity: Option<SketchEntityId>, sketch: &Sketch) -> Option<SketchEntityId> {
        hover_entity.filter(|id| {
            sketch.entities.get(id).map(|e| matches!(e, SketchEntity::Point { .. })).unwrap_or(false)
        })
    }

    fn create_element(&self, state_idx: usize, value: &ToolStateValue, sketch: &mut Sketch) -> Option<SketchEntityId> {
        if state_idx == 0 {
            if let ToolStateValue::Coordinate(pt) = value {
                let entity = SketchEntity::Point {
                    id: Uuid::new_v4(),
                    position: *pt,
                    is_construction: false,
                };
                return Some(sketch.add_entity(entity));
            }
        }
        None
    }

    fn execute(&mut self, sketch: &mut Sketch, values: &[ToolStateValue]) -> Result<(), String> {
        let center = match &values[0] {
            ToolStateValue::Coordinate(p) => *p,
            ToolStateValue::Entity(id) => {
                sketch.entities.get(id).and_then(|e| e.start_point()).ok_or("Invalid center")?
            }
            _ => return Err("Center not set".into()),
        };
        let start_pt = match &values[1] {
            ToolStateValue::Coordinate(p) => *p,
            _ => return Err("Start point not set".into()),
        };
        let end_pt = match &values[2] {
            ToolStateValue::Coordinate(p) => *p,
            _ => return Err("End point not set".into()),
        };

        let radius = center.distance_to(&start_pt);
        let start_angle = (start_pt.y - center.y).atan2(start_pt.x - center.x);
        let end_angle = (end_pt.y - center.y).atan2(end_pt.x - center.x);

        let arc = SketchEntity::Arc {
            id: Uuid::new_v4(),
            center,
            radius,
            start_angle,
            end_angle,
            is_construction: false,
        };
        sketch.add_entity(arc);
        Ok(())
    }
}

/// Rectangle tool (2-state: corner1 → corner2, creates 4 lines)
pub struct RectangleTool;

impl StatefulTool for RectangleTool {
    fn name(&self) -> &'static str { "Rectangle" }

    fn states(&self) -> &[ToolStateDef] {
        &[
            ToolStateDef {
                name: "First Corner",
                description: "Click to set the first corner",
                entity_types: &[EntityTypeFilter::Point],
                use_create: false,
                allow_prefill: false,
                optional: false,
                interactive: true,
            },
            ToolStateDef {
                name: "Opposite Corner",
                description: "Click to set the opposite corner",
                entity_types: &[EntityTypeFilter::Point],
                use_create: false,
                allow_prefill: false,
                optional: false,
                interactive: true,
            },
        ]
    }

    fn state_func(&self, _state_idx: usize, coords: Point2D, _sketch: &Sketch) -> ToolStateValue {
        ToolStateValue::Coordinate(coords)
    }

    fn pick_element(&self, _: usize, _: Option<SketchEntityId>, _: &Sketch) -> Option<SketchEntityId> { None }
    fn create_element(&self, _: usize, _: &ToolStateValue, _: &mut Sketch) -> Option<SketchEntityId> { None }

    fn execute(&mut self, sketch: &mut Sketch, values: &[ToolStateValue]) -> Result<(), String> {
        let p1 = match &values[0] {
            ToolStateValue::Coordinate(p) => *p,
            _ => return Err("First corner not set".into()),
        };
        let p2 = match &values[1] {
            ToolStateValue::Coordinate(p) => *p,
            _ => return Err("Opposite corner not set".into()),
        };

        let corners = [
            p1,
            Point2D::new(p2.x, p1.y),
            p2,
            Point2D::new(p1.x, p2.y),
        ];

        for i in 0..4 {
            sketch.add_entity(SketchEntity::Line {
                id: Uuid::new_v4(),
                start: corners[i],
                end: corners[(i + 1) % 4],
                is_construction: false,
            });
        }
        Ok(())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_tool_invoke_and_click() {
        let mut sketch = Sketch::new("Test");
        let mut tool = LineTool;
        let mut machine = ToolStateMachine::new(tool.states().len());

        machine.invoke(&tool, &mut sketch, &[]);
        assert!(machine.is_running());
        assert_eq!(machine.current_state, 0);

        // Click start point
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(0.0, 0.0),
        });
        assert_eq!(result, ToolModalResult::NextState);

        // Click end point
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(10.0, 5.0),
        });
        // LineTool supports continuous draw → ContinuousDraw
        assert_eq!(result, ToolModalResult::ContinuousDraw);

        // Check that a line was created (plus 2 points from create_element)
        let lines: Vec<_> = sketch.entities.values()
            .filter(|e| matches!(e, SketchEntity::Line { .. }))
            .collect();
        assert_eq!(lines.len(), 1);
    }

    #[test]
    fn test_circle_tool() {
        let mut sketch = Sketch::new("Test");
        let mut tool = CircleTool;
        let mut machine = ToolStateMachine::new(tool.states().len());

        machine.invoke(&tool, &mut sketch, &[]);

        // Click center
        machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(5.0, 5.0),
        });

        // Click radius point
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(10.0, 5.0),
        });
        assert_eq!(result, ToolModalResult::Finished);

        let circles: Vec<_> = sketch.entities.values()
            .filter(|e| matches!(e, SketchEntity::Circle { .. }))
            .collect();
        assert_eq!(circles.len(), 1);
    }

    #[test]
    fn test_rectangle_tool() {
        let mut sketch = Sketch::new("Test");
        let mut tool = RectangleTool;
        let mut machine = ToolStateMachine::new(tool.states().len());

        machine.invoke(&tool, &mut sketch, &[]);

        machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(0.0, 0.0),
        });

        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(10.0, 5.0),
        });
        assert_eq!(result, ToolModalResult::Finished);

        let lines: Vec<_> = sketch.entities.values()
            .filter(|e| matches!(e, SketchEntity::Line { .. }))
            .collect();
        assert_eq!(lines.len(), 4);
    }

    #[test]
    fn test_tool_cancel() {
        let mut sketch = Sketch::new("Test");
        let mut tool = LineTool;
        let mut machine = ToolStateMachine::new(tool.states().len());

        machine.invoke(&tool, &mut sketch, &[]);

        // Add a point via click
        machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(0.0, 0.0),
        });

        // Cancel
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Escape);
        assert_eq!(result, ToolModalResult::Cancelled);
        assert!(!machine.is_running());

        // Sketch should be restored to original state (empty, since we started empty)
        // Note: the point was created but the snapshot should restore
    }

    #[test]
    fn test_numeric_input() {
        let mut sketch = Sketch::new("Test");
        let mut tool = CircleTool;
        let mut machine = ToolStateMachine::new(tool.states().len());

        machine.invoke(&tool, &mut sketch, &[]);

        // Click center
        machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(0.0, 0.0),
        });

        // Enter radius numerically
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::NumericInput {
            value: 7.5,
        });
        assert_eq!(result, ToolModalResult::Finished);

        let circles: Vec<_> = sketch.entities.values()
            .filter(|e| matches!(e, SketchEntity::Circle { radius, .. } if (*radius - 7.5).abs() < 1e-10))
            .collect();
        assert_eq!(circles.len(), 1);
    }

    #[test]
    fn test_continuous_draw() {
        let mut sketch = Sketch::new("Test");
        let mut tool = LineTool;
        let mut machine = ToolStateMachine::new(tool.states().len());

        machine.invoke(&tool, &mut sketch, &[]);

        // Draw first line
        machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(0.0, 0.0),
        });
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(10.0, 0.0),
        });
        assert_eq!(result, ToolModalResult::ContinuousDraw);

        // Machine should be ready for second line, state 1
        assert!(machine.is_running());
        assert_eq!(machine.current_state, 1);

        // Draw second line
        let result = machine.handle_input(&mut tool, &mut sketch, ToolInput::Click {
            position: Point2D::new(10.0, 5.0),
        });
        assert_eq!(result, ToolModalResult::ContinuousDraw);

        // Should have 2 lines now
        let lines: Vec<_> = sketch.entities.values()
            .filter(|e| matches!(e, SketchEntity::Line { .. }))
            .collect();
        assert_eq!(lines.len(), 2);
    }
}
