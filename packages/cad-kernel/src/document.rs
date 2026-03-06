//! # Document Model — Salome SHAPER-inspired Parametric Document
//!
//! Central document that owns all features, manages the dependency graph,
//! event system, and automatic recomputation engine.
//!
//! ## Architecture (from Salome SHAPER `Model_Update`)
//! - Dependencies are **derived** from attribute references at update time
//! - Features declare attributes via `init_attributes()` and compute via `execute()`
//! - Event bus (pub-sub) decouples feature changes from recomputation
//! - Cycle detection with per-feature counter (limit: 100 iterations)

use std::collections::{HashMap, HashSet, VecDeque};


use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::features::{Feature, FeatureId, FeatureResult, FeatureStatus};
use crate::naming::TopologicalNamingService;

// ─── Events ───────────────────────────────────────────────────────────────────

/// Event types in the document lifecycle (from Salome Events_Loop)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DocumentEvent {
    /// Feature was created
    ObjectCreated(FeatureId),
    /// Feature was modified (attribute changed)
    ObjectUpdated(FeatureId),
    /// Feature was deleted
    ObjectDeleted(FeatureId),
    /// Feature needs visual redisplay
    ObjectToRedisplay(FeatureId),
    /// Feature order changed in the tree
    OrderUpdated,
    /// Preview computation requested
    PreviewRequested(FeatureId),
    /// Preview computation blocked
    PreviewBlocked,
    /// Automatic recomputation enabled/disabled
    AutoRecomputeToggle(bool),
    /// Transaction started (for undo grouping)
    TransactionStarted(String),
    /// Transaction finished
    TransactionFinished,
    /// Full recomputation triggered
    RecomputeAll,
}

/// Event listener callback type
pub type EventListener = Box<dyn Fn(&DocumentEvent) + Send + Sync>;

/// Event bus — central pub-sub message system (Salome `Events_Loop` singleton pattern)
pub struct EventBus {
    listeners: HashMap<String, Vec<(usize, EventListener)>>,
    next_id: usize,
    /// Queue of events to be processed
    pending: VecDeque<DocumentEvent>,
    /// Whether event processing is suspended (during batch operations)
    suspended: bool,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            listeners: HashMap::new(),
            next_id: 0,
            pending: VecDeque::new(),
            suspended: false,
        }
    }

    /// Subscribe to a specific event category, returns listener id for unsubscribe
    pub fn subscribe(&mut self, category: &str, listener: EventListener) -> usize {
        let id = self.next_id;
        self.next_id += 1;
        self.listeners
            .entry(category.to_string())
            .or_default()
            .push((id, listener));
        id
    }

    /// Unsubscribe a listener by id
    pub fn unsubscribe(&mut self, id: usize) {
        for listeners in self.listeners.values_mut() {
            listeners.retain(|(lid, _)| *lid != id);
        }
    }

    /// Emit an event — if suspended, queues it; otherwise dispatches immediately
    pub fn emit(&mut self, event: DocumentEvent) {
        if self.suspended {
            self.pending.push_back(event);
        } else {
            self.dispatch(&event);
        }
    }

    /// Suspend event dispatching (for batch operations)
    pub fn suspend(&mut self) {
        self.suspended = true;
    }

    /// Resume event dispatching and flush queued events
    pub fn resume(&mut self) {
        self.suspended = false;
        while let Some(event) = self.pending.pop_front() {
            self.dispatch(&event);
        }
    }

    fn dispatch(&self, event: &DocumentEvent) {
        let category = event_category(event);
        if let Some(listeners) = self.listeners.get(&category) {
            for (_, listener) in listeners {
                listener(event);
            }
        }
        // Also dispatch to wildcard listeners
        if let Some(listeners) = self.listeners.get("*") {
            for (_, listener) in listeners {
                listener(event);
            }
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

fn event_category(event: &DocumentEvent) -> String {
    match event {
        DocumentEvent::ObjectCreated(_) => "object_created".to_string(),
        DocumentEvent::ObjectUpdated(_) => "object_updated".to_string(),
        DocumentEvent::ObjectDeleted(_) => "object_deleted".to_string(),
        DocumentEvent::ObjectToRedisplay(_) => "object_to_redisplay".to_string(),
        DocumentEvent::OrderUpdated => "order_updated".to_string(),
        DocumentEvent::PreviewRequested(_) => "preview_requested".to_string(),
        DocumentEvent::PreviewBlocked => "preview_blocked".to_string(),
        DocumentEvent::AutoRecomputeToggle(_) => "auto_recompute".to_string(),
        DocumentEvent::TransactionStarted(_) => "transaction_started".to_string(),
        DocumentEvent::TransactionFinished => "transaction_finished".to_string(),
        DocumentEvent::RecomputeAll => "recompute_all".to_string(),
    }
}

// ─── Dependency Graph ─────────────────────────────────────────────────────────

/// Tracks which features depend on which other features.
/// Dependencies are **derived** from feature attribute references (Salome pattern).
#[derive(Debug, Clone, Default)]
pub struct DependencyGraph {
    /// Forward dependencies: feature → set of features it depends on
    depends_on: HashMap<FeatureId, HashSet<FeatureId>>,
    /// Reverse dependencies: feature → set of features that depend on it (refsToMe)
    depended_by: HashMap<FeatureId, HashSet<FeatureId>>,
}

impl DependencyGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the dependencies for a feature (replaces any existing)
    pub fn set_dependencies(&mut self, feature: FeatureId, deps: HashSet<FeatureId>) {
        // Remove old reverse links
        if let Some(old_deps) = self.depends_on.get(&feature) {
            for old_dep in old_deps.clone() {
                if let Some(rev) = self.depended_by.get_mut(&old_dep) {
                    rev.remove(&feature);
                }
            }
        }
        // Set new forward links
        for dep in &deps {
            self.depended_by
                .entry(*dep)
                .or_default()
                .insert(feature);
        }
        self.depends_on.insert(feature, deps);
    }

    /// Remove a feature from the graph entirely
    pub fn remove_feature(&mut self, feature: FeatureId) {
        // Remove forward links
        if let Some(deps) = self.depends_on.remove(&feature) {
            for dep in deps {
                if let Some(rev) = self.depended_by.get_mut(&dep) {
                    rev.remove(&feature);
                }
            }
        }
        // Remove reverse links
        if let Some(dependents) = self.depended_by.remove(&feature) {
            for dependent in dependents {
                if let Some(fwd) = self.depends_on.get_mut(&dependent) {
                    fwd.remove(&feature);
                }
            }
        }
    }

    /// Get all features that directly depend on the given feature (refsToMe)
    pub fn direct_dependents(&self, feature: FeatureId) -> HashSet<FeatureId> {
        self.depended_by
            .get(&feature)
            .cloned()
            .unwrap_or_default()
    }

    /// Get all features the given feature directly depends on
    pub fn direct_dependencies(&self, feature: FeatureId) -> HashSet<FeatureId> {
        self.depends_on
            .get(&feature)
            .cloned()
            .unwrap_or_default()
    }

    /// Get all transitive dependents (recursive refsToMe) — for propagating updates
    pub fn all_dependents(&self, feature: FeatureId) -> HashSet<FeatureId> {
        let mut result = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back(feature);

        while let Some(current) = queue.pop_front() {
            if let Some(deps) = self.depended_by.get(&current) {
                for dep in deps {
                    if result.insert(*dep) {
                        queue.push_back(*dep);
                    }
                }
            }
        }
        result
    }

    /// Topological sort of features (for ordered recomputation)
    pub fn topological_order(&self, features: &[FeatureId]) -> Vec<FeatureId> {
        let feature_set: HashSet<_> = features.iter().cloned().collect();
        let mut in_degree: HashMap<FeatureId, usize> = HashMap::new();
        let mut result = Vec::new();
        let mut queue = VecDeque::new();

        // Initialize in-degrees (only for features in our set)
        for &f in features {
            let deps = self.direct_dependencies(f);
            let count = deps.iter().filter(|d| feature_set.contains(d)).count();
            in_degree.insert(f, count);
            if count == 0 {
                queue.push_back(f);
            }
        }

        while let Some(f) = queue.pop_front() {
            result.push(f);
            for dependent in self.direct_dependents(f) {
                if let Some(deg) = in_degree.get_mut(&dependent) {
                    *deg = deg.saturating_sub(1);
                    if *deg == 0 {
                        queue.push_back(dependent);
                    }
                }
            }
        }

        // If we couldn't sort all features, there's a cycle — append remaining
        for &f in features {
            if !result.contains(&f) {
                result.push(f);
            }
        }

        result
    }

    /// Detect if adding a dependency (from depends on to) would create a cycle
    pub fn would_create_cycle(&self, from: FeatureId, to: FeatureId) -> bool {
        if from == to {
            return true;
        }
        // Check if `from` is reachable from `to` via depends_on links
        // If `to` transitively depends on `from`, adding `from→to` creates a cycle
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back(to);

        while let Some(current) = queue.pop_front() {
            if current == from {
                return true;
            }
            if visited.insert(current) {
                if let Some(deps) = self.depends_on.get(&current) {
                    for dep in deps {
                        queue.push_back(*dep);
                    }
                }
            }
        }
        false
    }
}

// ─── Recomputation Engine ─────────────────────────────────────────────────────

/// Configuration for the recomputation engine
#[derive(Debug, Clone)]
pub struct RecomputeConfig {
    /// Maximum recomputation cycles per feature (cycle detection, default: 100)
    pub max_cycles_per_feature: u32,
    /// Whether auto-recomputation is enabled
    pub auto_recompute: bool,
}

impl Default for RecomputeConfig {
    fn default() -> Self {
        Self {
            max_cycles_per_feature: 100,
            auto_recompute: true,
        }
    }
}

/// The recomputation engine — Salome `Model_Update` pattern
///
/// Listens for OBJECT_UPDATED / OBJECT_CREATED events and propagates
/// changes through the dependency graph, calling `execute()` on each
/// affected feature in topological order.
pub struct RecomputeEngine {
    /// Features marked as needing update + their reasons
    modified: HashMap<FeatureId, HashSet<FeatureId>>,
    /// Per-feature cycle counter (Salome: limit 100)
    processed_count: HashMap<FeatureId, u32>,
    /// Configuration
    config: RecomputeConfig,
}

impl RecomputeEngine {
    pub fn new(config: RecomputeConfig) -> Self {
        Self {
            modified: HashMap::new(),
            processed_count: HashMap::new(),
            config,
        }
    }

    /// Mark a feature as modified, recursively propagating to all dependents
    /// (Salome: `addModified(feature, reason)`)
    pub fn add_modified(
        &mut self,
        feature: FeatureId,
        reason: FeatureId,
        graph: &DependencyGraph,
    ) {
        self.modified
            .entry(feature)
            .or_default()
            .insert(reason);

        // Recursively propagate to all dependents
        for dependent in graph.direct_dependents(feature) {
            if !self.modified.contains_key(&dependent) {
                self.add_modified(dependent, feature, graph);
            } else {
                // Already marked, just add reason
                self.modified
                    .entry(dependent)
                    .or_default()
                    .insert(feature);
            }
        }
    }

    /// Process all modified features in dependency order
    /// (Salome: `processFeatures()`)
    ///
    /// Returns list of (feature_id, success) pairs
    pub fn process_features(
        &mut self,
        document: &mut DocumentData,
    ) -> Vec<(FeatureId, bool)> {
        let mut results = Vec::new();

        while !self.modified.is_empty() {
            // Get all modified feature IDs and sort topologically
            let modified_ids: Vec<_> = self.modified.keys().cloned().collect();
            let ordered = document.dep_graph.topological_order(&modified_ids);

            for fid in ordered {
                if self.modified.remove(&fid).is_none() {
                    continue; // Already processed
                }

                // Cycle detection
                let count = self.processed_count.entry(fid).or_insert(0);
                *count += 1;
                if *count > self.config.max_cycles_per_feature {
                    tracing::warn!(
                        "Feature {:?} exceeded max recomputation cycles ({})",
                        fid,
                        self.config.max_cycles_per_feature
                    );
                    results.push((fid, false));
                    continue;
                }

                // Process the feature
                let success = self.process_single_feature(fid, document);
                results.push((fid, success));
            }
        }

        // Reset cycle counters
        self.processed_count.clear();
        results
    }

    /// Process a single feature: validate → update args → execute
    /// (Salome: `processFeature()`)
    fn process_single_feature(
        &mut self,
        feature_id: FeatureId,
        document: &mut DocumentData,
    ) -> bool {
        // Get the feature
        let feature = match document.features.get(&feature_id) {
            Some(f) => f.clone(),
            None => return false,
        };

        // Skip disabled features
        if feature.status == FeatureStatus::Disabled {
            return true;
        }

        // Collect all dependency references (allReasons pattern)
        let deps = feature.collect_references();
        document.dep_graph.set_dependencies(feature_id, deps);

        // Execute the feature
        tracing::debug!("Executing feature {:?} ({:?})", feature_id, feature.kind);
        match feature.execute(&document.features, &document.results) {
            Ok(result) => {
                // Store results
                document.results.insert(feature_id, result);
                // Update feature status
                if let Some(f) = document.features.get_mut(&feature_id) {
                    f.status = FeatureStatus::Valid;
                }
                // Update topological naming
                document.naming.track_feature_result(feature_id, &document.results);
                true
            }
            Err(err) => {
                tracing::error!("Feature {:?} execution failed: {}", feature_id, err);
                if let Some(f) = document.features.get_mut(&feature_id) {
                    f.status = FeatureStatus::Error(err.to_string());
                }
                false
            }
        }
    }
}

impl Default for RecomputeEngine {
    fn default() -> Self {
        Self::new(RecomputeConfig::default())
    }
}

// ─── Document Data ────────────────────────────────────────────────────────────

/// Internal document data (separated from Document for borrow-checker friendliness)
pub struct DocumentData {
    /// All features indexed by ID
    pub features: HashMap<FeatureId, Feature>,
    /// Feature results (output geometry/shapes)
    pub results: HashMap<FeatureId, FeatureResult>,
    /// Ordered feature list (feature tree order)
    pub feature_order: Vec<FeatureId>,
    /// Current rollback index (how many features are "active")
    pub current_index: usize,
    /// Dependency graph
    pub dep_graph: DependencyGraph,
    /// Topological naming service
    pub naming: TopologicalNamingService,
}

// ─── Document ─────────────────────────────────────────────────────────────────

/// The parametric document — owns features, dependency graph, events, and recomputation.
///
/// This is the Salome `Model_Document` equivalent for r3ditor.
pub struct Document {
    /// Unique document ID
    pub id: Uuid,
    /// Document name
    pub name: String,
    /// All document data
    pub data: DocumentData,
    /// Event bus for pub-sub notifications
    pub events: EventBus,
    /// Recomputation engine
    pub recompute: RecomputeEngine,
    /// Whether the document has been modified since last save
    pub modified: bool,
}

impl Document {
    /// Create a new empty document
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            data: DocumentData {
                features: HashMap::new(),
                results: HashMap::new(),
                feature_order: Vec::new(),
                current_index: 0,
                dep_graph: DependencyGraph::new(),
                naming: TopologicalNamingService::new(),
            },
            events: EventBus::new(),
            recompute: RecomputeEngine::default(),
            modified: false,
        }
    }

    /// Add a feature to the document
    pub fn add_feature(&mut self, feature: Feature) -> FeatureId {
        let id = feature.id;

        // Register dependencies
        let deps = feature.collect_references();
        self.data.dep_graph.set_dependencies(id, deps);

        // Insert feature
        self.data.features.insert(id, feature);

        // Add to ordered list at current position
        self.data.feature_order.truncate(self.data.current_index);
        self.data.feature_order.push(id);
        self.data.current_index = self.data.feature_order.len();

        // Emit event
        self.events.emit(DocumentEvent::ObjectCreated(id));

        // Mark for recomputation
        if self.recompute.config.auto_recompute {
            self.recompute
                .add_modified(id, id, &self.data.dep_graph);
            self.recompute.process_features(&mut self.data);
        }

        self.modified = true;
        id
    }

    /// Remove a feature from the document
    pub fn remove_feature(&mut self, id: FeatureId) -> Option<Feature> {
        // Check if any features depend on this one
        let dependents = self.data.dep_graph.direct_dependents(id);
        if !dependents.is_empty() {
            tracing::warn!(
                "Removing feature {:?} which has {} dependents",
                id,
                dependents.len()
            );
        }

        // Remove from graph
        self.data.dep_graph.remove_feature(id);

        // Remove from ordered list
        self.data.feature_order.retain(|&fid| fid != id);
        self.data.current_index = self.data.current_index.min(self.data.feature_order.len());

        // Remove results
        self.data.results.remove(&id);

        // Remove feature
        let feature = self.data.features.remove(&id);

        if feature.is_some() {
            self.events.emit(DocumentEvent::ObjectDeleted(id));
            self.modified = true;

            // Recompute dependents
            if self.recompute.config.auto_recompute {
                for dep in dependents {
                    self.recompute.add_modified(dep, id, &self.data.dep_graph);
                }
                self.recompute.process_features(&mut self.data);
            }
        }

        feature
    }

    /// Update a feature (replace it and trigger recomputation)
    pub fn update_feature(&mut self, feature: Feature) {
        let id = feature.id;

        // Update dependencies
        let deps = feature.collect_references();
        self.data.dep_graph.set_dependencies(id, deps);

        // Replace feature
        self.data.features.insert(id, feature);

        // Emit event
        self.events.emit(DocumentEvent::ObjectUpdated(id));

        // Mark for recomputation
        if self.recompute.config.auto_recompute {
            self.recompute
                .add_modified(id, id, &self.data.dep_graph);
            self.recompute.process_features(&mut self.data);
        }

        self.modified = true;
    }

    /// Trigger full recomputation of all features
    pub fn recompute_all(&mut self) {
        let all_ids: Vec<_> = self.data.feature_order.clone();
        let ordered = self.data.dep_graph.topological_order(&all_ids);

        for &id in &ordered {
            self.recompute
                .add_modified(id, id, &self.data.dep_graph);
        }
        self.recompute.process_features(&mut self.data);
        self.events.emit(DocumentEvent::RecomputeAll);
    }

    /// Get active features (up to current rollback index)
    pub fn active_features(&self) -> &[FeatureId] {
        &self.data.feature_order[..self.data.current_index]
    }

    /// Get a feature by ID
    pub fn get_feature(&self, id: FeatureId) -> Option<&Feature> {
        self.data.features.get(&id)
    }

    /// Get a feature result by ID
    pub fn get_result(&self, id: FeatureId) -> Option<&FeatureResult> {
        self.data.results.get(&id)
    }

    /// Rollback to a specific feature index
    pub fn rollback_to(&mut self, index: usize) {
        let new_index = index.min(self.data.feature_order.len());
        if new_index != self.data.current_index {
            self.data.current_index = new_index;
            self.events.emit(DocumentEvent::OrderUpdated);
            if self.recompute.config.auto_recompute {
                self.recompute_all();
            }
        }
    }

    /// Get the total number of features
    pub fn feature_count(&self) -> usize {
        self.data.feature_order.len()
    }

    /// Toggle auto-recomputation
    pub fn set_auto_recompute(&mut self, enabled: bool) {
        self.recompute.config.auto_recompute = enabled;
        self.events
            .emit(DocumentEvent::AutoRecomputeToggle(enabled));
    }

    /// Check if a feature is concealed (Salome concealment pattern)
    /// A feature is concealed if a boolean operation consumes it
    pub fn is_concealed(&self, id: FeatureId) -> bool {
        for (&_fid, feature) in &self.data.features {
            if feature.conceals(&id) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dependency_graph_basic() {
        let mut graph = DependencyGraph::new();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let c = Uuid::new_v4();

        // b depends on a, c depends on b
        graph.set_dependencies(b, [a].into_iter().collect());
        graph.set_dependencies(c, [b].into_iter().collect());

        assert!(graph.direct_dependents(a).contains(&b));
        assert!(graph.direct_dependents(b).contains(&c));
        assert!(graph.all_dependents(a).contains(&b));
        assert!(graph.all_dependents(a).contains(&c));
    }

    #[test]
    fn test_topological_order() {
        let mut graph = DependencyGraph::new();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let c = Uuid::new_v4();

        graph.set_dependencies(b, [a].into_iter().collect());
        graph.set_dependencies(c, [b].into_iter().collect());

        let order = graph.topological_order(&[c, a, b]);
        let a_pos = order.iter().position(|&x| x == a).unwrap();
        let b_pos = order.iter().position(|&x| x == b).unwrap();
        let c_pos = order.iter().position(|&x| x == c).unwrap();

        assert!(a_pos < b_pos);
        assert!(b_pos < c_pos);
    }

    #[test]
    fn test_cycle_detection() {
        use uuid::Uuid;
        let mut graph = DependencyGraph::new();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();

        graph.set_dependencies(b, [a].into_iter().collect());

        // Adding a→b when b→a exists would create cycle
        assert!(graph.would_create_cycle(a, b));
        assert!(!graph.would_create_cycle(b, a)); // This is already the direction
    }

    #[test]
    fn test_event_bus() {
        use std::sync::{Arc, Mutex};
        use uuid::Uuid;
        let mut bus = EventBus::new();
        let received = Arc::new(Mutex::new(Vec::new()));
        let received_clone = received.clone();

        bus.subscribe("object_created", Box::new(move |event| {
            received_clone.lock().unwrap().push(format!("{:?}", event));
        }));

        let id = Uuid::new_v4();
        bus.emit(DocumentEvent::ObjectCreated(id));

        assert_eq!(received.lock().unwrap().len(), 1);
    }

    #[test]
    fn test_event_bus_suspend_resume() {
        use std::sync::{Arc, Mutex};
        use uuid::Uuid;
        let mut bus = EventBus::new();
        let count = Arc::new(Mutex::new(0));
        let count_clone = count.clone();

        bus.subscribe("*", Box::new(move |_| {
            *count_clone.lock().unwrap() += 1;
        }));

        bus.suspend();
        bus.emit(DocumentEvent::ObjectCreated(Uuid::new_v4()));
        bus.emit(DocumentEvent::ObjectCreated(Uuid::new_v4()));
        assert_eq!(*count.lock().unwrap(), 0);

        bus.resume();
        assert_eq!(*count.lock().unwrap(), 2);
    }
}
