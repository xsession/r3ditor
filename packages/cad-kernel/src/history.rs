//! Undo/redo history manager using the Command pattern.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::features::Feature;

/// A command that was executed and can be undone
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub id: Uuid,
    pub description: String,
    pub feature: Feature,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl Command {
    pub fn new(description: impl Into<String>, feature: Feature) -> Self {
        Self {
            id: Uuid::new_v4(),
            description: description.into(),
            feature,
            timestamp: chrono::Utc::now(),
        }
    }
}

/// History manager with undo/redo stacks
#[derive(Debug, Clone)]
pub struct HistoryManager {
    /// Commands that have been executed
    undo_stack: Vec<Command>,
    /// Commands that have been undone (available for redo)
    redo_stack: Vec<Command>,
    /// Maximum number of undo steps
    max_history: usize,
    /// Whether the model is modified since last save
    modified: bool,
}

impl HistoryManager {
    pub fn new(max_history: usize) -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_history,
            modified: false,
        }
    }

    /// Execute a command and push it onto the undo stack
    pub fn execute(&mut self, command: Command) {
        // Clear redo stack when a new command is executed
        self.redo_stack.clear();

        self.undo_stack.push(command);

        // Trim history if it exceeds max
        if self.undo_stack.len() > self.max_history {
            self.undo_stack.remove(0);
        }

        self.modified = true;
    }

    /// Undo the last command, returns it if available
    pub fn undo(&mut self) -> Option<&Command> {
        if let Some(command) = self.undo_stack.pop() {
            self.redo_stack.push(command);
            self.modified = true;
            self.redo_stack.last()
        } else {
            None
        }
    }

    /// Redo the last undone command, returns it if available
    pub fn redo(&mut self) -> Option<&Command> {
        if let Some(command) = self.redo_stack.pop() {
            self.undo_stack.push(command);
            self.modified = true;
            self.undo_stack.last()
        } else {
            None
        }
    }

    /// Check if undo is available
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    /// Check if redo is available
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Get the undo stack length
    pub fn undo_count(&self) -> usize {
        self.undo_stack.len()
    }

    /// Get the redo stack length
    pub fn redo_count(&self) -> usize {
        self.redo_stack.len()
    }

    /// Check if the model has been modified since last save
    pub fn is_modified(&self) -> bool {
        self.modified
    }

    /// Mark the model as saved
    pub fn mark_saved(&mut self) {
        self.modified = false;
    }

    /// Get a read-only view of the undo history
    pub fn history(&self) -> &[Command] {
        &self.undo_stack
    }
}

impl Default for HistoryManager {
    fn default() -> Self {
        Self::new(200) // 200 undo steps by default
    }
}
