# Salome Platform: KERNEL & MEDCOUPLING — Comprehensive Technical Reference

> **Purpose**: Extract algorithms, architecture patterns, and design decisions from [SalomePlatform/KERNEL](https://github.com/SalomePlatform/KERNEL) and [SalomePlatform/MEDCOUPLING](https://github.com/SalomePlatform/MEDCOUPLING) for informing the design of the r3ditor CAD/CAM application.

---

## Table of Contents

1. [KERNEL Module](#1-kernel-module)
   1. [Study Management & Data Model](#11-study-management--data-model)
   2. [Undo/Redo Architecture](#12-undoredo-architecture)
   3. [Observer & Notification Pattern](#13-observer--notification-pattern)
   4. [Container & Component System](#14-container--component-system)
   5. [Resource Management](#15-resource-management)
   6. [Logging Architecture](#16-logging-architecture)
2. [MEDCOUPLING Module](#2-medcoupling-module)
   1. [Interpolation & Remapping Framework](#21-interpolation--remapping-framework)
   2. [Intersection Algorithms](#22-intersection-algorithms)
   3. [Field Operations & Arithmetic](#23-field-operations--arithmetic)
   4. [Spatial Discretization](#24-spatial-discretization)
   5. [Gauss Point Quadrature](#25-gauss-point-quadrature)
   6. [NatureOfField Semantics](#26-natureoffield-semantics)
   7. [Parallel Data Exchange (ParaMEDMEM)](#27-parallel-data-exchange-paramedmem)
3. [Key Takeaways for r3ditor](#3-key-takeaways-for-r3ditor)

---

## 1. KERNEL Module

The KERNEL module provides the foundational platform services for the Salome application: study (document) management, distributed component lifecycle, notifications, resource management, and logging. It is built on CORBA with a three-layer architecture: **Client Interface → CORBA Servant → C++ Implementation**.

---

### 1.1 Study Management & Data Model

**Purpose**: Manage the central document (study) that holds all CAD/CAM/analysis data as a hierarchical tree of labeled objects.

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `SALOMEDSImpl_Study` | `src/SALOMEDSImpl/SALOMEDSImpl_Study.cxx` | Core implementation |
| `SALOMEDS_Study_i` | `src/SALOMEDS/SALOMEDS_Study_i.cxx` | CORBA servant |
| `SALOMEDSClient_Study` | Client-side proxy | Client wrapper |
| `DF_Document` | `src/DF/DF_Document.cxx` | Tree document (HDF5-backed) |
| `DF_Label` | `src/DF/DF_Label.cxx` | Tree node in the document |
| `DF_Attribute` | `src/DF/DF_Attribute.cxx` | Data attached to labels |

**Architecture Pattern — Document/Label/Attribute Tree**:

The study is a tree of `DF_Label` nodes, each of which can hold multiple `DF_Attribute` instances. This is conceptually identical to OCAF (Open CASCADE Application Framework):

```
DF_Document
  └── Root DF_Label (0:)
       ├── DF_Label (0:1) — "GEOM" component
       │    ├── DF_Attribute: Name = "Box_1"
       │    ├── DF_Attribute: IOR = "corba:..."
       │    └── DF_Label (0:1:1) — child object
       └── DF_Label (0:2) — "SMESH" component
            └── ...
```

**Study Internal State**:
```cpp
class SALOMEDSImpl_Study {
    DF_Document*                       _doc;            // Main document tree
    DF_Document*                       _clipboard;      // Copy/paste clipboard
    SALOMEDSImpl_StudyBuilder*         _builder;        // Modification API
    SALOMEDSImpl_UseCaseBuilder*       _useCaseBuilder; // Use-case tree
    SALOMEDSImpl_AbstractCallback*     _notifier;       // Observer callback
    SALOMEDSImpl_AbstractCallback*     _genObjRegister; // GenericObj tracking
    bool                               _Saved;          // Dirty flag
    std::string                        _URL;            // File path
    bool                               _IsLocked;       // Lock state
    int                                _StudyId;        // Legacy ID
};
```

**Persistence — HDF5**:
- `Save()` / `SaveAs(url)`: Serialize entire study tree to HDF5
- `Open(url)`: Deserialize from HDF5
- Properties stored: modification dates, user names, units, comments, component version map

**RAII Locking Pattern**:
```cpp
// StudyUnlocker temporarily unlocks a locked study
class StudyUnlocker {
    SALOMEDSImpl_Study* _study;
    bool _wasLocked;
public:
    StudyUnlocker(SALOMEDSImpl_Study* study) : _study(study) {
        _wasLocked = _study->GetProperties()->IsLocked();
        if (_wasLocked) _study->GetProperties()->SetLocked(false);
    }
    ~StudyUnlocker() {
        if (_wasLocked) _study->GetProperties()->SetLocked(true);
    }
};
```

**r3ditor Relevance**: The Label/Attribute tree pattern maps directly to a feature tree in a parametric CAD application. The clipboard mechanism provides cut/copy/paste infrastructure. The HDF5 persistence pattern is a solid model for project file serialization.

---

### 1.2 Undo/Redo Architecture

**Purpose**: Track and reverse modifications to the study document.

**Key Classes & Files**:
| Class | File |
|---|---|
| `SALOMEDSImpl_StudyBuilder` | `src/SALOMEDSImpl/SALOMEDSImpl_StudyBuilder.cxx` |

**API Surface**:
```cpp
void    NewCommand();                    // Begin transaction
void    CommitCommand();                 // End transaction
void    AbortCommand();                  // Cancel transaction
void    Undo();                          // Undo last committed command
void    Redo();                          // Redo last undone command
bool    GetAvailableUndos();             // Check undo availability
bool    GetAvailableRedos();             // Check redo availability
int     UndoLimit();                     // Maximum undo depth
```

**⚠️ CRITICAL FINDING: Undo/Redo is NOT IMPLEMENTED**

The API exists but the implementation is skeletal:
```cpp
void SALOMEDSImpl_StudyBuilder::Undo() {
    // Not implemented
    _study->UndoModification();  // Only decrements modification counter
}

bool SALOMEDSImpl_StudyBuilder::GetAvailableUndos() {
    return false;  // Always returns false
}

int SALOMEDSImpl_StudyBuilder::UndoLimit() {
    return 1;      // Hardcoded
}
```

The transaction mechanism (`NewCommand`/`CommitCommand`/`AbortCommand`) only updates a `_modification` counter — no delta/snapshot recording occurs.

**r3ditor Relevance**: This is a cautionary example. For r3ditor's undo/redo, we need a proper Command Pattern implementation with:
- Delta recording (operation + inverse operation)
- Or snapshot-based approach (document state serialization)
- Bounded undo stack with configurable depth
- Transaction grouping for compound operations

---

### 1.3 Observer & Notification Pattern

**Purpose**: Decouple study modifications from UI/module updates via observer callbacks.

#### 1.3.1 Study-Level Observer (SALOMEDS)

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `SALOMEDSImpl_AbstractCallback` | `src/SALOMEDSImpl/SALOMEDSImpl_Callback.hxx` | Abstract observer base |
| `SALOMEDS::Notifier` | `src/SALOMEDS/SALOMEDS_Study_i.cxx` (inner class) | Concrete notifier |
| `SALOMEDSClient_Observer` | Client-side | Observer interface |

**Abstract Callback Interface**:
```cpp
class SALOMEDSImpl_AbstractCallback {
public:
    virtual bool addSO_Notification(const SALOMEDSImpl_SObject& theSObject);
    virtual bool removeSO_Notification(const SALOMEDSImpl_SObject& theSObject);
    virtual bool modifySO_Notification(const SALOMEDSImpl_SObject& theSObject, int reason);
    virtual bool modifyNB_Notification(const char* theVarName);
    virtual void RegisterGenObj(const std::string& theIOR);
    virtual void UnRegisterGenObj(const std::string& theIOR);
};
```

**Notification Event IDs**:
| ID | Meaning |
|----|---------|
| 1 | SObject added |
| 2 | SObject removed |
| (reason param) | SObject modified |
| 6 | NoteBook variable changed |

**Concrete Notifier Implementation** (in `SALOMEDS_Study_i.cxx`):
```cpp
class SALOMEDS::Notifier : public SALOMEDSImpl_AbstractCallback {
    typedef std::list<std::pair<SALOMEDS::Observer_ptr, bool>> ObsList;
    ObsList myObservers;

    void addSO_Notification(const SALOMEDSImpl_SObject& so) override {
        for (auto& [obs, modify] : myObservers)
            obs->notifyObserverID(so.GetID().c_str(), 1); // event=1 (add)
    }
    void removeSO_Notification(const SALOMEDSImpl_SObject& so) override {
        for (auto& [obs, modify] : myObservers)
            obs->notifyObserverID(so.GetID().c_str(), 2); // event=2 (remove)
    }
    void modifySO_Notification(const SALOMEDSImpl_SObject& so, int reason) override {
        for (auto& [obs, modify] : myObservers)
            if (modify) obs->notifyObserverID(so.GetID().c_str(), reason);
    }
};
```

**Registration**:
```cpp
study->attach(observer_ptr, bool receiveModifications);
study->detach(observer_ptr);
study->setNotifier(notifier);  // Set on the impl study
```

#### 1.3.2 CORBA Notification Service

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `NOTIFICATION_Supplier` | `src/Notification/NOTIFICATION_Supplier.cxx` | Event producer |
| `NOTIFICATION_Consumer` | `src/Notification/NOTIFICATION_Consumer.cxx` | Event consumer |

Built on **CosNotification** (CORBA Notification Service) with an EventChannel:

**Structured Event Format**:
```
Domain:    "SALOME"
Type:      "ComponentMessage"
Fields:
  - SenderName       (string)
  - DestinationGroup (string)
  - EventType        (short) — NOTIF_WARNING, NOTIF_STEP, NOTIF_TRACE, NOTIF_VERBOSE
  - EventNumber      (long)
  - SendingDate      (string)
  - DepartGroup      (string)
  - Stamp            (string)
  - Body             (remainder of message)
```

**Event Types**:
| Constant | Value | Usage |
|---|---|---|
| `NOTIF_WARNING` | - | Warning messages |
| `NOTIF_STEP` | - | Progress step notifications |
| `NOTIF_TRACE` | - | Trace messages |
| `NOTIF_VERBOSE` | - | Verbose debug messages |

**Supplier Usage**:
```cpp
auto* supplier = new NOTIFICATION_Supplier("MyComponent", notifSupported);
supplier->Send("MyComponent", "CAD", NOTIF_STEP, "Meshing complete");
```

**Consumer Usage**:
```cpp
auto* consumer = new NOTIFICATION_Consumer();
while (true) {
    CosN::StructuredEvent* event;
    bool hasEvent = consumer->Receive(&event);
    if (hasEvent) process(event);
}
```

#### 1.3.3 Launcher Observer

```cpp
// SALOME_Launcher.cxx
void notifyObservers(const std::string& event_name, const std::string& event_data) {
    for (auto& obs : _observers)
        obs->notify(event_name.c_str(), event_data.c_str());
}
```

**r3ditor Relevance**: The multi-level notification pattern (document-level callbacks + service-level event channels) is directly applicable. For r3ditor:
- **Document observer**: Feature tree changes (add/remove/modify) → UI tree view updates
- **Application events**: Progress notifications, status updates → status bar, progress dialogs
- Consider Rust's `tokio::broadcast` or `crossbeam::channel` as alternatives to CORBA events

---

### 1.4 Container & Component System

**Purpose**: Dynamic loading and lifecycle management of computational modules (plugins).

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `Abstract_Engines_Container_i` | `src/Container/Container_i.cxx` | Container (process host) |
| `Engines_Component_i` | `src/Container/Component_i.cxx` | Component (loaded module) |
| `SALOME_ModuleCatalog_impl` | `src/ModuleCatalog/SALOME_ModuleCatalog_impl.cxx` | Module registry |
| `SALOME_ContainerManager` | `src/Container/SALOME_ContainerManager.cxx` | Container orchestrator |

**Component Loading — Factory Pattern**:

Three implementation types, selected from XML module catalog:

| Type | Loading Mechanism | Factory Symbol |
|---|---|---|
| C++ (`SO`/`DLL`) | `dlopen` / `LoadLibrary` | `COMPONENTEngine_factory(orb, poa, contId, instanceName, componentName)` |
| Python | `importlib.import_module` | `componentName(orb, poa, contId, instanceName, componentName)` |
| Executable (`CEXE`) | Process spawn | stdin/stdout IPC |

**Instance Naming Convention**:
```
containerName/componentName_inst_N
```
where N is an auto-incrementing instance counter.

**Container Internal State**:
```cpp
class Abstract_Engines_Container_i {
    std::map<std::string, void*>  _library_map;       // Loaded shared libraries
    std::map<std::string, void*>  _toRemove_map;      // Libraries pending removal
    std::map<std::string, int>    _cntInstances_map;   // Instance count per component
    SALOME_NamingService_Abstract* _NS;                // CORBA naming service
};
```

**Container Lifecycle** (`GiveContainer` in ContainerManager):
1. **Find** mode: Search existing containers matching params
2. **FindOrStart** mode: Find existing, or start new if none found
3. **Start** mode: Always start new container
4. **Get** mode: Only return existing containers

**Steps in `GiveContainer`**:
1. Parse container parameters (name, mode, resource requirements)
2. If "find" or "findorstart" → `FindContainer()` via naming service
3. Filter `GetFittingResources()` with `can_run_containers=true`
4. If "get" mode → keep only resources with existing containers
5. Select resource using policy (`first`, `cycl`, `altcycl`, `best`)
6. Build launch command (local or remote via SSH/SRUN)
7. Start container process and register in naming service

**Module Catalog — XML-based Component Registration**:
```xml
<resources>
  <machine hostname="worker1" protocol="ssh" userName="salome">
    <modules moduleName="GEOM" />
    <component name="GEOM_Superv" moduleName="GEOM" />
  </machine>
</resources>
```

**r3ditor Relevance**: The factory pattern for loading C++/Python/WASM plugins is directly applicable. The module catalog concept maps to r3ditor's plugin manifest system. Container management translates to worker process management for CAD/CAM operations.

---

### 1.5 Resource Management

**Purpose**: Discover, catalog, and select computational resources (machines) for running containers and batch jobs.

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `ResourcesManager_cpp` | `src/ResourcesManager/ResourcesManager.cxx` | Core resource manager |
| `SALOME_ResourcesManager` | `src/ResourcesManager/SALOME_ResourcesManager.cxx` | CORBA servant |
| `SALOME_ResourcesCatalog_Handler` | `src/ResourcesManager/SALOME_ResourcesCatalog_Handler.cxx` | XML parser |
| `ParserResourcesType` | `src/ResourcesManager/SALOME_ResourcesCatalog_Parser.hxx` | Resource data structure |

**Resource Definition**:
```cpp
struct ParserResourcesType {
    std::string Name;
    std::string HostName;
    AccessProtocolType Protocol;        // ssh, rsh, srun, etc.
    AccessProtocolType ClusterInternalProtocol;
    ResourceType type;                  // single_machine, cluster
    BatchType Batch;                    // none, pbs, slurm, etc.
    MpiImplType mpi;                    // nompi, openmpi, mpich, etc.
    std::string UserName;
    std::string AppliPath;
    std::vector<std::string> ComponentsList;
    std::vector<std::string> ModulesList;
    std::string OS;
    unsigned int nbOfProc;
    bool can_launch_batch_jobs;
    bool can_run_containers;
    std::string working_directory;
    std::list<ParserResourcesType> ClusterMembersList;
    ResourceDataToSort DataForSort;     // nbNodes, nbProcPerNode, CPUFreq, memMB
};
```

**Resource Selection Algorithm** (`GetFittingResources`):
1. If `name` specified → direct lookup
2. Filter by `resourceList` if provided
3. If `hostname` specified → filter by hostname
4. Otherwise → sort by `ResourceDataToSort` (proc count, memory, CPU)
5. Filter by matching OS
6. Filter by required components (if inventory empty, skip this filter)
7. Filter by `can_launch_batch_jobs` / `can_run_containers` flags

**Load Balancing Policies**:
| Policy | Class | Behavior |
|---|---|---|
| `first` | `LoadRateManagerFirst` | Always returns first resource |
| `cycl` | `LoadRateManagerCycl` | Round-robin cycling |
| `altcycl` | `LoadRateManagerAltCycl` | Alternating round-robin |
| `best` | (alias for `altcycl`) | Same as altcycl |

```cpp
// Policy registration
_resourceManagerMap["first"]   = &first;
_resourceManagerMap["cycl"]    = &cycl;
_resourceManagerMap["altcycl"] = &altcycl;
_resourceManagerMap["best"]    = &altcycl;
_resourceManagerMap[""]        = &altcycl;  // default
```

**Default Resource**: Always adds `localhost` with `can_launch_batch_jobs=true`, `can_run_containers=true`.

**r3ditor Relevance**: The resource matching and selection pattern is applicable to distributing CAD/CAM computations across worker processes/machines. The policy-based selection (first, round-robin, etc.) is a clean abstraction for load balancing.

---

### 1.6 Logging Architecture

**Purpose**: Multi-level, multi-destination logging across C++ and Python components.

#### C++ Logging Layer

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `SALOME_Trace` | Singleton | C++ trace stream (`ostringstream`-based) |
| `Logger` | `src/Logger/SALOME_Logger_Server.cxx` | CORBA logging server |
| `SALOMETraceCollector` | `src/SALOMETraceCollector/` | Background thread → CORBA Logger |
| `LocalTraceBufferPool` | Internal | Lock-free buffer for trace messages |

**Trace Modes** (controlled by `SALOME_trace` env var):
| Value | Behavior |
|---|---|
| `"local"` | Print to console (stderr) |
| `"with_logger"` | Forward to CORBA Logger server |
| `"file:/path"` | Write to file |

**Architecture**:
```
Thread 1: MESSAGE("hello") → LocalTraceBufferPool
Thread 2: MESSAGE("world") → LocalTraceBufferPool
                                       ↓
SALOMETraceCollector (background thread) retrieves from pool
                                       ↓
                            Logger CORBA Server → putMessage() → file/console
```

**C++ Macros**:
```cpp
MESSAGE("text")       // Standard message (with file:line)
DEVTRACE("text")      // Development trace
SCRUTE(variable)      // Print variable name and value
BEGIN_OF("funcName")  // Function entry marker
END_OF("funcName")    // Function exit marker
```

#### Python Logging Layer

**Key Classes & Files**:
| Class/Module | File | Role |
|---|---|---|
| `salome.kernel.logger.Logger` | `src/KERNEL_PY/kernel/logger.py` | Enhanced Python logger |
| `SALOME_utilities` | `src/KERNEL_PY/SALOME_utilities.py` | Utility functions |

```python
from salome.kernel.logger import Logger
logger = Logger("MyModule", color=Logger.BLUE)
logger.info("Processing mesh...")
```

**Verbosity Control**:
- `SALOME_VERBOSE_LEVEL` environment variable
- `setVerboseLevel()` / `VerbosityLevel()` from `KernelBasis`
- `positionVerbosityOfLogger()` to sync Python logger with C++ level

**r3ditor Relevance**: The multi-destination pattern (console/file/network) with a background collector thread is a proven approach for high-performance logging. For Rust, consider `tracing` crate with similar subscriber architecture. The buffer pool pattern avoids blocking worker threads on I/O.

---

## 2. MEDCOUPLING Module

MEDCOUPLING provides mesh-to-mesh field interpolation, field arithmetic, spatial discretization, and parallel data exchange. The core computational algorithms live in `INTERP_KERNEL` (header-only templates), while `MEDCoupling` provides the higher-level field/mesh abstractions.

---

### 2.1 Interpolation & Remapping Framework

**Purpose**: Transfer field data between non-matching meshes (different topologies, resolutions, or element types).

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `MEDCouplingRemapper` | `src/MEDCoupling/MEDCouplingRemapper.cxx` | High-level remapper |
| `Interpolation3D` | `src/INTERP_KERNEL/Interpolation3D.txx` | 3D interpolation |
| `Interpolation3D1D` | `src/INTERP_KERNEL/Interpolation3D1D.txx` | 3D→1D projection |
| `InterpolationCurve` | `src/INTERP_KERNEL/InterpolationCurve.txx` | 1D curve interpolation |
| `InterpolationMatrix` | `src/ParaMEDMEM/InterpolationMatrix.hxx` | Sparse matrix for parallel |

**Three-Phase Workflow**:
```
Phase 1: Configure    →  remapper.setOption("Precision", 1e-12)
Phase 2: Prepare      →  remapper.prepare(srcMesh, tgtMesh, "P0P0")
Phase 3: Transfer     →  result = remapper.transferField(srcField, defaultValue)
```

**Interpolation Methods**:
| Method | Source | Target | Meaning |
|---|---|---|---|
| `"P0P0"` | Cell centers (P0) | Cell centers (P0) | Cell-to-cell |
| `"P0P1"` | Cell centers (P0) | Nodes (P1) | Cell-to-node |
| `"P1P0"` | Nodes (P1) | Cell centers (P0) | Node-to-cell |
| `"P1P1"` | Nodes (P1) | Nodes (P1) | Node-to-node |

**Internal Algorithm (3D P0P0)**:
1. Build **BBTree** (bounding box tree) for source mesh cells
2. For each target cell, find candidate source cells via BB intersection
3. For each candidate pair, compute **intersection volume** using appropriate intersector
4. Build sparse interpolation matrix W_ij where:

   W_ij = |S_i ∩ T_j| / |T_j|

5. Apply matrix: f_target = W · f_source

The denominator depends on `NatureOfField` — see [Section 2.6](#26-natureoffield-semantics).

**BBTree Filtering**:
The BBTree provides O(n log n) filtering of candidate intersection pairs, avoiding the O(n²) brute-force comparison. It stores axis-aligned bounding boxes and supports range queries.

**r3ditor Relevance**: The remapping framework is essential for:
- Transferring analysis results between different mesh resolutions
- Projecting FEA results onto display meshes
- Multi-physics coupling (thermal→structural)

---

### 2.2 Intersection Algorithms

**Purpose**: Compute exact geometric intersections between mesh elements for interpolation matrix construction.

#### 2.2.1 TransformedTriangle — Triangle/Tetrahedron Intersection

**Files**: `src/INTERP_KERNEL/TransformedTriangle.cxx`, `TransformedTriangle.hxx`

**Reference**: J. Grandy, *"Conservative Remapping and Region Overlays by Intersecting Arbitrary Polyhedra"*, Journal of Computational Physics, 1999.

**Algorithm**:
1. Transform the target tetrahedron to the **unit tetrahedron** (0,0,0), (1,0,0), (0,1,0), (0,0,1)
2. Apply the same transformation to the source triangle
3. Compute intersection polygon A (triangle ∩ tet faces) and polygon B (tet edges ∩ triangle)
4. Compute the signed volume of the intersection polyhedron

**Numerical Stability**:
- **Double products** (`calcStableC`): C_ij = p_i·q_j - p_j·q_i computed with controlled rounding
- **Triple products** (`calcStableT`): T_ijk = C_ij·r_k + C_jk·r_i + C_ki·r_j
- Uses Grandy equations [20]–[25], [53] for intersection point formulas

**Mathematical Formulation**:

The intersection volume is computed as:

V = (1/6) · Σ_faces Σ_triangles (v₀ · (v₁ × v₂))

where the sum is over triangulated faces of the intersection polyhedron.

#### 2.2.2 TriangulationIntersector — 2D Polygon Intersection

**Files**: `src/INTERP_KERNEL/TriangulationIntersector.txx`

**Algorithm**:
1. Decompose source and target 2D polygons into triangles
2. Compute triangle-triangle intersections via `intersec_de_triangle()`
3. Reconstruct the intersection polygon via `reconstruct_polygon()`
4. Sum intersection areas

#### 2.2.3 PlanarIntersector — 3D Face Projection to 2D

**Files**: `src/INTERP_KERNEL/PlanarIntersector.txx`

**Algorithm** (`Projection()`):
1. Compute the **median plane** between two 3D faces
2. Project both faces onto this median plane
3. Perform 2D intersection in the projected space

#### 2.2.4 SplitterTetra — Coplanar Triangle Intersection

**Files**: `src/INTERP_KERNEL/SplitterTetra.txx`

**Method**: `CalculateIntersectionSurfaceOfCoplanarTriangles()`:
1. Detect coplanar 3D triangles
2. Project to 2D by dropping the dominant normal component
3. Apply 2D polygon intersection

#### 2.2.5 Utility Algorithms

**File**: `src/INTERP_KERNEL/InterpolationUtils.hxx`

| Function | Purpose | Math |
|---|---|---|
| `inters_de_segment()` | 2D segment-segment intersection | Parametric line intersection |
| `intersec_de_polygone()` | Polygon-polygon intersection | Sutherland-Hodgman style clipping |
| `quad_mapped_coords()` | Bilinear mapping for quads | Inverse isoparametric mapping |

**r3ditor Relevance**: These intersection algorithms are fundamental for:
- Boolean operations on meshes
- Collision detection
- Mesh overlay for multi-body assembly analysis
- The Grandy algorithm is the gold standard for conservative remapping

---

### 2.3 Field Operations & Arithmetic

**Purpose**: Perform mathematical operations on fields defined over meshes.

**Key Classes & Files**:
| Class | File |
|---|---|
| `MEDCouplingFieldDouble` | `src/MEDCoupling/MEDCouplingFieldDouble.cxx` |

#### Binary Arithmetic Operations

| Operation | Static | In-place | Operator |
|---|---|---|---|
| Addition | `AddFields(f1, f2)` | `f1 += f2` | `f1 + f2` |
| Subtraction | `SubstractFields(f1, f2)` | `f1 -= f2` | `f1 - f2` |
| Multiplication | `MultiplyFields(f1, f2)` | `f1 *= f2` | `f1 * f2` |
| Division | `DivideFields(f1, f2)` | `f1 /= f2` | `f1 / f2` |
| Power | `PowFields(f1, f2)` | `f1 ^= f2` | `f1 ^ f2` |

#### Vector Operations

| Function | Purpose |
|---|---|
| `DotFields(f1, f2)` | Scalar dot product field |
| `CrossProductFields(f1, f2)` | Vector cross product field |
| `MaxFields(f1, f2)` | Component-wise maximum |
| `MinFields(f1, f2)` | Component-wise minimum |
| `MergeFields(f1, f2)` | Concatenate fields on disjoint meshes |
| `MeldFields(f1, f2)` | Concatenate components |

#### Unary Operations

| Function | Purpose | Formula |
|---|---|---|
| `magnitude()` | Vector magnitude | ‖v‖ = √(Σ vᵢ²) |
| `negate()` | Sign flip | −v |
| `inverse()` | Element-wise inverse | 1/vᵢ |

#### Analysis Operations

| Function | Purpose | Formula |
|---|---|---|
| `integral(isWAbs, res)` | Weighted integration | ∫_Ω f dΩ ≈ Σᵢ fᵢ · measureᵢ |
| `normL1()` | L1 norm | (∫\|f\| dΩ) / (∫ dΩ) |
| `normL2()` | L2 norm | √((∫ f² dΩ) / (∫ dΩ)) |
| `getWeightedAverageValue()` | Weighted average | (∫ f dΩ) / (∫ dΩ) |

#### Evaluation Operations

| Function | Purpose |
|---|---|
| `getValueOn(point)` | Evaluate field at arbitrary point |
| `getValueOnMulti(points)` | Batch point evaluation |
| `getValueOnPos(i, j, k)` | Evaluate on structured grid position |

#### Conversion Operations

| Function | Direction | Method |
|---|---|---|
| `cellToNodeDiscretization()` | P0 → P1 | Average values from surrounding cells to node |
| `nodeToCellDiscretization()` | P1 → P0 | Average values from cell's nodes to cell center |

**Note**: These conversions are **non-conservative** (simple averaging).

#### Functional Operations

| Function | Purpose |
|---|---|
| `fillFromAnalytic(nbComp, func)` | Fill field from analytical function of coordinates |
| `applyFunc(nbComp, func)` | Apply function to field values |
| `applyFuncFast32(func)` | Apply function using 32-bit float (performance) |
| `applyFuncFast64(func)` | Apply function using 64-bit float |

**r3ditor Relevance**: Field operations are essential for post-processing FEA/CFD results, DFM analysis scoring, and CAM toolpath optimization (e.g., combining multiple constraint fields).

---

### 2.4 Spatial Discretization

**Purpose**: Define how field values are distributed across a mesh — at cell centers, nodes, Gauss points, etc.

**Key Classes & Files**:
| Class | File | TypeOfField |
|---|---|---|
| `MEDCouplingFieldDiscretizationP0` | `MEDCouplingFieldDiscretization.cxx` | `ON_CELLS` |
| `MEDCouplingFieldDiscretizationP1` | `MEDCouplingFieldDiscretization.cxx` | `ON_NODES` |
| `MEDCouplingFieldDiscretizationGauss` | `MEDCouplingFieldDiscretization.cxx` | `ON_GAUSS_PT` |
| `MEDCouplingFieldDiscretizationGaussNE` | `MEDCouplingFieldDiscretization.cxx` | `ON_GAUSS_NE` |
| `MEDCouplingFieldDiscretizationOnNodesFE` | `MEDCouplingFieldDiscretization.cxx` | `ON_NODES_FE` |

**TypeOfField Enum**:
```cpp
enum TypeOfField {
    ON_CELLS,      // P0: One value per cell (piecewise constant)
    ON_NODES,      // P1: One value per node (piecewise linear)
    ON_GAUSS_PT,   // Gauss: Values at quadrature points
    ON_GAUSS_NE,   // GaussNE: Values at element nodes (quadrature)
    ON_NODES_FE    // NodeFE: FE-style nodal values
};
```

**Key Virtual Methods per Discretization**:
```cpp
class MEDCouplingFieldDiscretization {
    virtual TypeOfField getEnum() const = 0;
    virtual mcIdType getNumberOfTuples(const MEDCouplingMesh*) const = 0;
    virtual void checkCompatibilityWithNature(NatureOfField) const = 0;
    virtual void checkCoherencyBetween(const MEDCouplingMesh*, const DataArray*) const = 0;
    virtual MEDCouplingFieldDouble* getMeasureField(const MEDCouplingMesh*, bool isAbs) const = 0;
    virtual void getValueOn(const DataArrayDouble*, const MEDCouplingMesh*, const double*, double*) const = 0;
    virtual DataArrayDouble* getValueOnMulti(const DataArrayDouble*, const MEDCouplingMesh*, const double*, mcIdType) const = 0;
    virtual void integral(const MEDCouplingMesh*, const DataArrayDouble*, bool isWAbs, double*) const = 0;
};
```

**Discretization Details**:

| Type | # Values | Nature Constraints | `getValueOn` Method |
|---|---|---|---|
| P0 (ON_CELLS) | = # cells | All natures allowed | Find containing cell, return constant |
| P1 (ON_NODES) | = # nodes | Only `IntensiveMaximum` | Barycentric interpolation in containing cell |
| NodeFE | = # nodes | Only `IntensiveMaximum` | FE shape function interpolation |
| Gauss | = Σ(gauss pts per cell) | All natures | Not directly supported for arbitrary points |
| GaussNE | = Σ(nodes per cell) | All natures | Not directly supported |

**r3ditor Relevance**: Understanding discretization types is critical for:
- Displaying FEA results (P0 = cell colors, P1 = smooth interpolated colors)
- CAM toolpath planning (field evaluation at arbitrary points)
- DFM thickness analysis (field values at probe points)

---

### 2.5 Gauss Point Quadrature

**Purpose**: Define numerical integration points and weights for finite element computations.

**Key Classes & Files**:
| Class | File |
|---|---|
| `MEDCouplingGaussLocalization` | `src/MEDCoupling/MEDCouplingGaussLocalization.cxx` |
| `MEDCouplingFieldDiscretizationGauss` | `src/MEDCoupling/MEDCouplingFieldDiscretization.cxx` |
| `MEDCouplingFieldDiscretizationGaussNE` | `src/MEDCoupling/MEDCouplingFieldDiscretization.cxx` |

**Gauss Localization Data Structure**:
```cpp
class MEDCouplingGaussLocalization {
    INTERP_KERNEL::NormalizedCellType _type;  // Cell type (TRI3, QUAD4, TETRA4, ...)
    std::vector<double> _ref_coord;           // Reference cell node coordinates
    std::vector<double> _gauss_coord;         // Gauss point coordinates in ref space
    std::vector<double> _weight;              // Quadrature weights
};
```

**Setting Gauss Points on a Field**:
```cpp
field->setGaussLocalizationOnType(
    INTERP_KERNEL::NORM_TRI3,
    refCoords,     // {0,0, 1,0, 0,1} — reference triangle vertices
    gaussCoords,   // {0.33,0.33} — centroid Gauss point
    weights        // {0.5} — weight for single point
);
```

**Pre-defined Gauss-NE Quadrature Rules** (selected):

| Element | # Points | Locations (example) | Weights |
|---|---|---|---|
| SEG2 | 2 | ±0.5773 (1/√3) | {1.0, 1.0} |
| TRI3 | 3 | Midpoints of edges | {1/6, 1/6, 1/6} |
| QUAD4 | 4 | ±0.5773 in each direction | {1.0, 1.0, 1.0, 1.0} |
| TETRA4 | 4 | {0.138, 0.138, 0.138}, etc. | {1/24 each} |
| HEXA8 | 8 | ±0.5773 in each direction | {1.0 each} |

**Integration Formula** (GaussNE):

∫_Ω f dΩ ≈ Σ_e ( Σ_{g=1}^{Ng} wg · f(ξg) · |J(ξg)| ) · Ve / Vref

where wg are normalized weights, f(ξg) is the field value at Gauss point g, |J| is the Jacobian determinant, and Ve is the cell volume.

**Jacobian Computation** (from `getMeasureField`):
```cpp
for (int iGPt = 0; iGPt < nbOfGaussPt; ++iGPt) {
    for (int i = 0; i < spaceDim; ++i)
        for (int j = 0; j < meshDim; ++j) {
            double res = 0.0;
            for (int k = 0; k < nbPtsInCell; ++k)
                res += ptsInCell[spaceDim*k + i] * shapeFunc->getIJ(iGPt, meshDim*k + j);
            jacobian[i][j] = res;
        }
    measure = abs(jacobian.toJacobian()) * loc.getWeight(iGPt);
}
```

**r3ditor Relevance**: Gauss quadrature is fundamental for:
- FEA result visualization (accurate integration of stresses/strains)
- Volume/area computation of complex shapes
- DFM analysis (e.g., integrating material utilization metrics)

---

### 2.6 NatureOfField Semantics

**Purpose**: Define the physical meaning of field values, which controls how interpolation/remapping handles conservation and normalization.

**NatureOfField Enum**:
| Value | Meaning | Example |
|---|---|---|
| `IntensiveMaximum` | Intensive field, max preservation | Temperature, pressure |
| `IntensiveConservation` | Intensive field, integral conservation | Heat flux density |
| `ExtensiveMaximum` | Extensive field, max preservation | Power, force (point-like) |
| `ExtensiveConservation` | Extensive field, integral conservation | Total energy, total mass |
| `NoNature` | No physical meaning | Intermediate computation |

**Compatibility Constraints**:

| Operation | Nature Requirement | Result Nature |
|---|---|---|
| Add / Subtract | Same nature required | Same as operands |
| Max / Min | Same nature required | Same as operands |
| Multiply / Divide | Any nature (or NoNature) | `NoNature` |
| Dot / Cross product | Any nature | `NoNature` |
| Power | Any nature | `NoNature` |

**Discretization ↔ Nature Constraints**:
| Discretization | Allowed Natures |
|---|---|
| P0 (ON_CELLS) | All natures |
| P1 (ON_NODES) | Only `IntensiveMaximum` |
| ON_NODES_FE | Only `IntensiveMaximum` |
| ON_GAUSS_PT | All natures |
| ON_GAUSS_NE | All natures |

**Remapping Formulas** (how nature affects the interpolation matrix):

For source field f_s and intersection weights W_ij:

- **IntensiveMaximum**: f_t(j) = Σᵢ W_ij · f_s(i) / Σᵢ W_ij (normalized by target overlap)
- **IntensiveConservation**: f_t(j) = Σᵢ W_ij · f_s(i) / V_j (normalized by target volume)
- **ExtensiveMaximum**: f_t(j) = Σᵢ (W_ij / Σ_k W_ik) · f_s(i) (normalized by source overlap)
- **ExtensiveConservation**: f_t(j) = Σᵢ W_ij · f_s(i) (no normalization, direct transfer)

**Compatibility Check Functions**:
```cpp
areStrictlyCompatible(f1, f2)       // Checks nature must match
areCompatibleForMul(f1, f2)         // No nature check
areStrictlyCompatibleForMulDiv(f1, f2) // No nature check, stricter mesh check
```

**r3ditor Relevance**: NatureOfField semantics ensure physically meaningful results when combining or transferring field data. Critical for:
- Thermal-structural coupling (temperature = IntensiveMaximum)
- Load transfer (force = ExtensiveConservation)
- DFM scoring (material ratio = IntensiveMaximum)

---

### 2.7 Parallel Data Exchange (ParaMEDMEM)

**Purpose**: Transfer field data between parallel MPI processes with non-matching meshes.

#### 2.7.1 InterpKernelDEC — Disjoint Domain Exchange

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `InterpKernelDEC` | `src/ParaMEDMEM/InterpKernelDEC.cxx` | Disjoint DEC |
| `DisjointDEC` | `src/ParaMEDMEM/DisjointDEC.cxx` | Base class |
| `MPIProcessorGroup` | `src/ParaMEDMEM/MPIProcessorGroup.cxx` | MPI group wrapper |
| `InterpolationMatrix` | `src/ParaMEDMEM/InterpolationMatrix.hxx` | Sparse transfer matrix |
| `ElementLocator` | `src/ParaMEDMEM/ElementLocator.cxx` | Cross-process element finder |

**Architecture**: Two **disjoint** MPI processor groups — source procs never overlap with target procs.

```
Source Group (procs 0-3)          Target Group (procs 4-7)
┌──────────────────────┐          ┌──────────────────────┐
│  ParaFIELD + ParaMESH│          │  ParaFIELD + ParaMESH│
│  (source data)       │  ←DEC→  │  (target data)       │
└──────────────────────┘          └──────────────────────┘
```

**Synchronize Algorithm** (`synchronize()`):
1. **Bounding box exchange**: All procs share their mesh bounding boxes
2. **Mesh part exchange**: Each proc sends relevant mesh portions to procs with overlapping bounding boxes
3. **Local intersection**: Each proc computes interpolation weights for its local mesh portion using `INTERP_KERNEL` algorithms
4. **Build transfer structure**: Construct the sparse mapping for data exchange

**Usage Pattern**:
```cpp
InterpKernelDEC dec(sourceGroup, targetGroup);
dec.attachLocalField(myField);
dec.setMethod("P0");
dec.synchronize();           // One-time setup

// Time-stepping loop:
if (dec.isInSourceSide()) {
    dec.sendData();          // Source sends
} else {
    dec.recvData();          // Target receives
}
```

**Async Mode with Time Interpolation**:
```cpp
dec.setAsynchronous(true);
dec.setTimeInterpolationMethod(LinearTimeInterp);
dec.setAllToAllMethod(PointToPoint);  // vs. Native (collective)

// Source sends with timestamps:
dec.sendData(time, deltaTime);

// Target receives interpolated value at arbitrary time:
dec.recvData(requestedTime);
```

**Linear Time Interpolation**:

f(t) = (f₀ · (t₁ - t) + f₁ · (t - t₀)) / (t₁ - t₀)

where f₀, f₁ are field values at times t₀, t₁ bracketing the requested time t.

#### 2.7.2 OverlapDEC — Overlapping Domain Exchange

**Key Classes & Files**:
| Class | File | Role |
|---|---|---|
| `OverlapDEC` | `src/ParaMEDMEM/OverlapDEC.cxx` | Overlapping DEC |
| `OverlapElementLocator` | `src/ParaMEDMEM/OverlapElementLocator.cxx` | Element locator |
| `OverlapInterpolationMatrix` | `src/ParaMEDMEM/OverlapInterpolationMatrix.hxx` | Transfer matrix |

**Architecture**: **Single** processor group where source and target meshes **overlap** on the same procs.

```
Proc 0: [src_mesh_part_0, tgt_mesh_part_0]
Proc 1: [src_mesh_part_1, tgt_mesh_part_1]
Proc 2: [src_mesh_part_2, tgt_mesh_part_2]
```

**Synchronize Algorithm**:
1. Each proc computes bounding boxes for its source and target mesh portions
2. Exchange bounding boxes to determine which procs need each other's mesh parts
3. Exchange mesh parts based on overlap
4. Compute local intersections for assigned jobs (load-balanced)
5. Build mapping structure

**Work Sharing Algorithms**:
```cpp
dec.setWorkSharingAlgo(0);  // Initial algorithm
dec.setWorkSharingAlgo(1);  // Adrien's algorithm v1
dec.setWorkSharingAlgo(2);  // Adrien's algorithm v2
```

**⚠️ LIMITATION**: `OverlapDEC::recvData()` is **NOT IMPLEMENTED** — throws an exception. Only `sendRecvData(bool way)` and `sendData()` work.

**Usage Pattern**:
```cpp
OverlapDEC dec(group);
dec.attachSourceLocalField(sourceField);
dec.attachTargetLocalField(targetField);
dec.synchronize();

dec.sendRecvData(true);  // Forward transfer (source→target)
// dec.recvData();       // NOT IMPLEMENTED!
```

**r3ditor Relevance**: Parallel data exchange patterns are applicable to:
- Distributing CAD kernel operations across worker threads/processes
- Transferring mesh/field data between analysis and visualization
- Multi-resolution mesh handling (coarse analysis → fine display)
- The bounding-box-first approach to minimize communication is universally useful

---

## 3. Key Takeaways for r3ditor

### Architecture Patterns to Adopt

| Salome Pattern | r3ditor Application |
|---|---|
| Document/Label/Attribute tree | Feature tree with attributes (parameters, constraints, geometry) |
| Three-layer (Client→Servant→Impl) | UI → API boundary → Kernel implementation |
| Observer/Callback for study changes | Feature tree change notifications → UI updates |
| Factory pattern for component loading | Plugin loading (WASM, native dylib) |
| Resource manager with policies | Worker process selection for compute tasks |
| Background trace collector | Async logging with `tracing` crate subscriber |
| BBTree + intersector pipeline | Spatial indexing → precise intersection for boolean ops |
| NatureOfField semantics | Field transfer validation in multi-physics coupling |

### Algorithms to Implement

| Algorithm | Priority | Use Case |
|---|---|---|
| BBTree (bounding box tree) | **High** | Spatial queries, collision detection, selection |
| TransformedTriangle (Grandy) | **Medium** | Conservative remapping, mesh overlay |
| Gauss quadrature | **Medium** | Volume/area computation, FEA visualization |
| Linear time interpolation | **Low** | Animation, temporal field blending |
| P0↔P1 field conversion | **Medium** | Result visualization (smooth vs. cell-constant) |

### Anti-Patterns to Avoid

| Salome Issue | r3ditor Mitigation |
|---|---|
| Undo/Redo stubs (not implemented) | Implement Command Pattern from day one with delta recording |
| `OverlapDEC::recvData()` not implemented | Complete API before exposing; use `todo!()` macro to catch early |
| CORBA complexity | Use simpler RPC (gRPC, or Tauri IPC commands) |
| Single-thread POA for ResourcesManager | Design for concurrent access from the start |
| Tight coupling to HDF5 persistence format | Abstract persistence behind a trait (support multiple formats) |

### Mathematical Constants (from MEDCOUPLING source)

Useful Gauss quadrature points/weights for common elements:

```
SEG2:  points = [±1/√3],  weights = [1, 1]
TRI3:  points = [(1/6,1/6), (2/3,1/6), (1/6,2/3)],  weights = [1/6, 1/6, 1/6]
QUAD4: points = [(±1/√3, ±1/√3)],  weights = [1, 1, 1, 1]
TETRA4: points = [4 points at ~0.138],  weights = [1/24 each]
```

---

*Document generated from analysis of SalomePlatform/KERNEL and SalomePlatform/MEDCOUPLING GitHub repositories.*
