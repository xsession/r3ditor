//! # Transaction-Based Undo/Redo — Salome OCAF Pattern
//!
//! Each feature operation is wrapped in a **Transaction**. Undo/redo
//! operates on entire transactions, not individual attribute changes.
//!
//! ## Architecture
//! - `Transaction` groups one or more feature changes
//! - `HistoryManager` maintains undo/redo stacks of transactions
//! - `FeatureSnapshot` captures the state of features for rollback
//! - Undo limit: 1000 (Salome default)

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::features::{Feature, FeatureId, FeatureResult};

/// A snapshot of a single feature's state (for undo/redo)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureSnapshot {
    pub feature: Feature,
    pub result: Option<FeatureResult>,
}

/// A single change within a transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChangeRecord {
    /// Feature was added
    Added {
        feature_id: FeatureId,
        feature: Feature,
        /// Index in the feature order where it was inserted
        order_index: usize,
    },
    /// Feature was removed
    Removed {
        feature_id: FeatureId,
        snapshot: FeatureSnapshot,
        /// Index in the feature order where it was removed from
        order_index: usize,
    },
    /// Feature was modified
    Modified {
        feature_id: FeatureId,
        old_snapshot: FeatureSnapshot,
        new_snapshot: FeatureSnapshot,
    },
    /// Feature order was changed
    Reordered {
        old_order: Vec<FeatureId>,
        new_order: Vec<FeatureId>,
    },
}

/// A transaction — groups one or more changes into an undoable unit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    /// Unique transaction ID
    pub id: Uuid,
    /// Human-readable description
    pub description: String,
    /// Ordered list of changes in this transaction
    pub changes: Vec<ChangeRecord>,
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl Transaction {
    pub fn new(description: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            description: description.into(),
            changes: Vec::new(),
            timestamp: chrono::Utc::now(),
        }
    }

    pub fn add_change(&mut self, change: ChangeRecord) {
        self.changes.push(change);
    }

    pub fn is_empty(&self) -> bool {
        self.changes.is_empty()
    }
}

/// History manager with undo/redo stacks of transactions.
///
/// Follows the Salome OCAF transaction model where each user action
/// is wrapped in a transaction that can be undone/redone atomically.
pub struct HistoryManager {
    /// Undo stack (most recent at the end)
    undo_stack: Vec<Transaction>,
    /// Redo stack (most recent at the end)
    redo_stack: Vec<Transaction>,
    /// Maximum number of undo levels (Salome: 1000)
    max_undo: usize,
    /// Currently open transaction (being built)
    current_transaction: Option<Transaction>,
    /// Whether the document has been modified since last save
    modified: bool,
    /// Transaction nesting depth (for nested operations)
    nesting_depth: u32,
}

impl HistoryManager {
    pub fn new() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_undo: 1000,
            current_transaction: None,
            modified: false,
            nesting_depth: 0,
        }
    }

    pub fn with_max_undo(mut self, max: usize) -> Self {
        self.max_undo = max;
        self
    }

    /// Start a new transaction. Can be nested — only the outermost
    /// transaction is committed to the undo stack.
    pub fn begin_transaction(&mut self, description: impl Into<String>) {
        if self.nesting_depth == 0 {
            self.current_transaction = Some(Transaction::new(description));
        }
        self.nesting_depth += 1;
    }

    /// Record a change in the current transaction
    pub fn record_change(&mut self, change: ChangeRecord) {
        if let Some(ref mut txn) = self.current_transaction {
            txn.add_change(change);
        } else {
            tracing::warn!("record_change called outside of a transaction");
        }
    }

    /// Finish the current transaction, pushing it to the undo stack
    pub fn commit_transaction(&mut self) {
        if self.nesting_depth == 0 {
            tracing::warn!("commit_transaction called with no open transaction");
            return;
        }

        self.nesting_depth -= 1;
        if self.nesting_depth > 0 {
            return; // Still inside a nested transaction
        }

        if let Some(txn) = self.current_transaction.take() {
            if !txn.is_empty() {
                self.undo_stack.push(txn);
                self.redo_stack.clear(); // New action invalidates redo
                self.modified = true;

                // Enforce undo limit
                while self.undo_stack.len() > self.max_undo {
                    self.undo_stack.remove(0);
                }
            }
        }
    }

    /// Abort the current transaction (discard changes)
    pub fn abort_transaction(&mut self) {
        self.nesting_depth = 0;
        self.current_transaction = None;
    }

    /// Check if there's an active transaction
    pub fn in_transaction(&self) -> bool {
        self.current_transaction.is_some()
    }

    /// Undo the last transaction.
    /// Returns the transaction so the caller can reverse the changes.
    pub fn undo(&mut self) -> Option<&Transaction> {
        if let Some(txn) = self.undo_stack.pop() {
            self.redo_stack.push(txn);
            self.modified = true;
            self.redo_stack.last()
        } else {
            None
        }
    }

    /// Redo the last undone transaction.
    /// Returns the transaction so the caller can re-apply the changes.
    pub fn redo(&mut self) -> Option<&Transaction> {
        if let Some(txn) = self.redo_stack.pop() {
            self.undo_stack.push(txn);
            self.modified = true;
            self.undo_stack.last()
        } else {
            None
        }
    }

    pub fn can_undo(&self) -> bool { !self.undo_stack.is_empty() }
    pub fn can_redo(&self) -> bool { !self.redo_stack.is_empty() }

    /// Get the undo history (descriptions, newest first)
    pub fn undo_history(&self) -> Vec<&str> {
        self.undo_stack.iter().rev().map(|t| t.description.as_str()).collect()
    }

    /// Get the redo history (descriptions, newest first)
    pub fn redo_history(&self) -> Vec<&str> {
        self.redo_stack.iter().rev().map(|t| t.description.as_str()).collect()
    }

    pub fn undo_count(&self) -> usize { self.undo_stack.len() }
    pub fn redo_count(&self) -> usize { self.redo_stack.len() }

    pub fn is_modified(&self) -> bool { self.modified }
    pub fn mark_saved(&mut self) { self.modified = false; }
}

impl Default for HistoryManager {
    fn default() -> Self { Self::new() }
}

/// Convenience macro for wrapping an operation in a transaction
#[macro_export]
macro_rules! with_transaction {
    ($history:expr, $desc:expr, $body:block) => {{
        $history.begin_transaction($desc);
        let result = { $body };
        $history.commit_transaction();
        result
    }};
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::*;

    fn make_test_feature() -> Feature {
        Feature::new(
            FeatureKind::Sketch2D,
            "Test Sketch",
            FeatureAttributes::Sketch2D {
                plane: SketchPlane::XY { offset: 0.0 },
                sketch_id: Uuid::new_v4(),
            },
        )
    }

    #[test]
    fn test_transaction_basic() {
        let mut history = HistoryManager::new();
        let feature = make_test_feature();
        let fid = feature.id;

        history.begin_transaction("Add sketch");
        history.record_change(ChangeRecord::Added {
            feature_id: fid,
            feature: feature.clone(),
            order_index: 0,
        });
        history.commit_transaction();

        assert!(history.can_undo());
        assert!(!history.can_redo());
        assert_eq!(history.undo_count(), 1);
    }

    #[test]
    fn test_undo_redo() {
        let mut history = HistoryManager::new();

        history.begin_transaction("Action 1");
        history.record_change(ChangeRecord::Added {
            feature_id: Uuid::new_v4(),
            feature: make_test_feature(),
            order_index: 0,
        });
        history.commit_transaction();

        history.begin_transaction("Action 2");
        history.record_change(ChangeRecord::Added {
            feature_id: Uuid::new_v4(),
            feature: make_test_feature(),
            order_index: 1,
        });
        history.commit_transaction();

        assert_eq!(history.undo_count(), 2);

        history.undo();
        assert_eq!(history.undo_count(), 1);
        assert_eq!(history.redo_count(), 1);

        history.redo();
        assert_eq!(history.undo_count(), 2);
        assert_eq!(history.redo_count(), 0);
    }

    #[test]
    fn test_nested_transactions() {
        let mut history = HistoryManager::new();

        history.begin_transaction("Outer");
        history.record_change(ChangeRecord::Added {
            feature_id: Uuid::new_v4(),
            feature: make_test_feature(),
            order_index: 0,
        });

        // Nested transaction — should NOT create a new undo entry
        history.begin_transaction("Inner");
        history.record_change(ChangeRecord::Added {
            feature_id: Uuid::new_v4(),
            feature: make_test_feature(),
            order_index: 1,
        });
        history.commit_transaction(); // Closes inner

        history.commit_transaction(); // Closes outer

        // Should have only 1 transaction with 2 changes
        assert_eq!(history.undo_count(), 1);
    }

    #[test]
    fn test_max_undo_limit() {
        let mut history = HistoryManager::new().with_max_undo(3);

        for i in 0..5 {
            history.begin_transaction(format!("Action {}", i));
            history.record_change(ChangeRecord::Added {
                feature_id: Uuid::new_v4(),
                feature: make_test_feature(),
                order_index: i,
            });
            history.commit_transaction();
        }

        assert_eq!(history.undo_count(), 3);
    }
}
