"use strict";
// ═══════════════════════════════════════════════════════════════════
//  r3ditor — main.js
//  Vanilla ES2020+ module · Three.js for 3D rendering
//  No build step · No framework
// ═══════════════════════════════════════════════════════════════════

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

// ── DOM Helpers ────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  $("#toastContainer").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function closeModal(id) {
  $(`#${id}`).classList.remove("show");
}
window.closeModal = closeModal;

function openModal(id) {
  $(`#${id}`).classList.add("show");
}

// ── State ──────────────────────────────────────────────────────
let sceneId = null;
let sceneData = null;
let selectedObjId = null;
let currentTool = "select";
let showEdges = true;
let showWireframe = false;
let sketchMode = false;
let currentSketchId = null;
let sketchDrawTool = "line";
let sketchClickState = null;
let sketchVisuals = [];

// Three.js objects
let renderer, camera, scene, orbitControls, transformControls;
let gridHelper, axesHelper;
let sceneObjects = {};   // objId → { mesh, edges, wireframe }
let raycaster, pointer;
let clock, fpsFrames = 0, fpsTime = 0;

// Colors for primitives
const PRIM_COLORS = [
  "#6c8ebf", "#82b366", "#d6b656", "#b85450",
  "#9673a6", "#d79b00", "#23b7e5", "#e377c2",
];
let colorIdx = 0;
function nextColor() {
  return PRIM_COLORS[colorIdx++ % PRIM_COLORS.length];
}

// ═══════════════════════════════════════════════════════════════
//  VP — Viewport (Three.js)
// ═══════════════════════════════════════════════════════════════

function vpInit() {
  const canvas = $("#viewport-canvas");
  const container = $("#viewportContainer");

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x1e1e2e, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    10000
  );
  camera.position.set(30, 25, 30);
  camera.lookAt(0, 0, 0);

  // Orbit controls
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.screenSpacePanning = true;
  orbitControls.minDistance = 1;
  orbitControls.maxDistance = 2000;
  orbitControls.target.set(0, 0, 0);

  // Transform controls
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setSize(0.8);
  scene.add(transformControls);

  transformControls.addEventListener("dragging-changed", (e) => {
    orbitControls.enabled = !e.value;
  });
  transformControls.addEventListener("objectChange", () => {
    if (selectedObjId && sceneObjects[selectedObjId]) {
      const mesh = sceneObjects[selectedObjId].mesh;
      ppUpdateFromMesh(mesh);
      vpSyncEdges(selectedObjId);
    }
  });
  transformControls.addEventListener("mouseUp", () => {
    if (selectedObjId) {
      ppSaveTransform();
    }
  });

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xcdd6f4, 0.4);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight1.position.set(20, 40, 30);
  dirLight1.castShadow = true;
  dirLight1.shadow.mapSize.set(1024, 1024);
  dirLight1.shadow.camera.near = 0.5;
  dirLight1.shadow.camera.far = 200;
  dirLight1.shadow.camera.left = -50;
  dirLight1.shadow.camera.right = 50;
  dirLight1.shadow.camera.top = 50;
  dirLight1.shadow.camera.bottom = -50;
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x89b4fa, 0.3);
  dirLight2.position.set(-20, 10, -20);
  scene.add(dirLight2);

  const hemiLight = new THREE.HemisphereLight(0x89b4fa, 0x1e1e2e, 0.3);
  scene.add(hemiLight);

  // Grid
  gridHelper = new THREE.GridHelper(200, 40, 0x45475a, 0x313244);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.6;
  scene.add(gridHelper);

  // Axes
  axesHelper = new THREE.AxesHelper(100);
  axesHelper.material.transparent = true;
  axesHelper.material.opacity = 0.4;
  scene.add(axesHelper);

  // Ground plane for shadows
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.userData.isGround = true;
  scene.add(ground);

  // Raycaster
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Clock
  clock = new THREE.Clock();

  // Events
  window.addEventListener("resize", vpResize);
  canvas.addEventListener("pointerdown", vpOnPointerDown);
  canvas.addEventListener("pointermove", vpOnPointerMove);

  // Start render loop
  vpAnimate();
}

function vpResize() {
  const container = $("#viewportContainer");
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function vpAnimate() {
  requestAnimationFrame(vpAnimate);
  const dt = clock.getDelta();
  orbitControls.update();
  renderer.render(scene, camera);

  // FPS counter
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 1) {
    const fps = Math.round(fpsFrames / fpsTime);
    $("#infoFps").textContent = `FPS: ${fps}`;
    fpsFrames = 0;
    fpsTime = 0;
  }
}

function vpOnPointerDown(e) {
  if (e.button !== 0) return; // Left click only
  if (transformControls.dragging) return;

  const container = $("#viewportContainer");
  const rect = container.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  // Sketch mode: handle drawing on sketch plane
  if (sketchMode && currentSketchId) {
    skHandleClick(pointer.x, pointer.y);
    return;
  }

  raycaster.setFromCamera(pointer, camera);

  // Get all meshes
  const meshes = [];
  for (const [id, obj] of Object.entries(sceneObjects)) {
    if (obj.mesh && obj.mesh.visible) {
      meshes.push(obj.mesh);
    }
  }

  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length > 0) {
    const hit = hits[0].object;
    const objId = hit.userData.objId;
    if (objId) {
      selectObject(objId);
    }
  } else {
    // Clicked on empty space
    deselectAll();
  }
}

function vpOnPointerMove(e) {
  const container = $("#viewportContainer");
  const rect = container.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  // Update status bar with approx world position
  // (This is a rough estimate based on ground plane intersection)
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersection = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersection);
  if (intersection) {
    // Optionally show cursor position in statusbar
  }
}

function vpAddObject(objId, objData) {
  if (!objData.vertices || objData.vertices.length === 0) return;

  const verts = new Float32Array(objData.vertices);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));

  if (objData.normals && objData.normals.length > 0) {
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(objData.normals), 3));
  } else {
    geo.computeVertexNormals();
  }

  if (objData.indices && objData.indices.length > 0) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(objData.indices), 1));
  }

  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // Material
  const mat = objData.material || {};
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(mat.color || "#6c8ebf"),
    metalness: mat.metalness ?? 0.3,
    roughness: mat.roughness ?? 0.6,
    transparent: (mat.opacity ?? 1) < 1,
    opacity: mat.opacity ?? 1,
    side: THREE.DoubleSide,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.objId = objId;

  // Apply transform
  const t = objData.transform || {};
  const pos = t.position || {};
  const rot = t.rotation || {};
  const scl = t.scale || { x: 1, y: 1, z: 1 };
  mesh.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
  mesh.rotation.set(
    (rot.x || 0) * Math.PI / 180,
    (rot.y || 0) * Math.PI / 180,
    (rot.z || 0) * Math.PI / 180
  );
  mesh.scale.set(scl.x || 1, scl.y || 1, scl.z || 1);

  mesh.visible = objData.visible !== false;

  scene.add(mesh);

  // Edge lines
  let edgeLines = null;
  if (objData.edges && objData.edges.length > 0) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position",
      new THREE.BufferAttribute(new Float32Array(objData.edges), 3));
    edgeLines = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0x89b4fa, transparent: true, opacity: 0.35 })
    );
    edgeLines.position.copy(mesh.position);
    edgeLines.rotation.copy(mesh.rotation);
    edgeLines.scale.copy(mesh.scale);
    edgeLines.visible = showEdges && mesh.visible;
    scene.add(edgeLines);
  }

  // Wireframe overlay
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x6c7086,
    transparent: true,
    opacity: 0.15,
  });
  const wireframe = new THREE.LineSegments(wireGeo, wireMat);
  wireframe.position.copy(mesh.position);
  wireframe.rotation.copy(mesh.rotation);
  wireframe.scale.copy(mesh.scale);
  wireframe.visible = showWireframe && mesh.visible;
  scene.add(wireframe);

  sceneObjects[objId] = { mesh, edges: edgeLines, wireframe };

  vpUpdateStats();
  vpUpdateHint();
}

function vpRemoveObject(objId) {
  const obj = sceneObjects[objId];
  if (!obj) return;
  if (obj.mesh) scene.remove(obj.mesh);
  if (obj.edges) scene.remove(obj.edges);
  if (obj.wireframe) scene.remove(obj.wireframe);
  if (transformControls.object === obj.mesh) {
    transformControls.detach();
  }
  delete sceneObjects[objId];
  vpUpdateStats();
  vpUpdateHint();
}

function vpSyncEdges(objId) {
  const obj = sceneObjects[objId];
  if (!obj || !obj.mesh) return;
  if (obj.edges) {
    obj.edges.position.copy(obj.mesh.position);
    obj.edges.rotation.copy(obj.mesh.rotation);
    obj.edges.scale.copy(obj.mesh.scale);
  }
  if (obj.wireframe) {
    obj.wireframe.position.copy(obj.mesh.position);
    obj.wireframe.rotation.copy(obj.mesh.rotation);
    obj.wireframe.scale.copy(obj.mesh.scale);
  }
}

function vpHighlightObject(objId, highlight) {
  const obj = sceneObjects[objId];
  if (!obj || !obj.mesh) return;
  if (highlight) {
    obj.mesh.material.emissive = new THREE.Color(0x89b4fa);
    obj.mesh.material.emissiveIntensity = 0.15;
    if (obj.edges) {
      obj.edges.material.opacity = 0.6;
      obj.edges.material.color.set(0x89b4fa);
    }
  } else {
    obj.mesh.material.emissive = new THREE.Color(0x000000);
    obj.mesh.material.emissiveIntensity = 0;
    if (obj.edges) {
      obj.edges.material.opacity = 0.35;
    }
  }
}

function vpFitAll() {
  const box = new THREE.Box3();
  let hasObjects = false;

  for (const obj of Object.values(sceneObjects)) {
    if (obj.mesh && obj.mesh.visible) {
      box.expandByObject(obj.mesh);
      hasObjects = true;
    }
  }

  if (!hasObjects) {
    camera.position.set(30, 25, 30);
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 2;

  camera.position.copy(center).add(new THREE.Vector3(dist * 0.6, dist * 0.5, dist * 0.6));
  orbitControls.target.copy(center);
  orbitControls.update();
}

function vpSetView(direction) {
  const box = new THREE.Box3();
  let center = new THREE.Vector3();
  let dist = 40;

  for (const obj of Object.values(sceneObjects)) {
    if (obj.mesh && obj.mesh.visible) {
      box.expandByObject(obj.mesh);
    }
  }
  if (!box.isEmpty()) {
    center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    dist = Math.max(size.x, size.y, size.z) * 2;
  }

  const views = {
    front:  new THREE.Vector3(0, 0, dist),
    back:   new THREE.Vector3(0, 0, -dist),
    top:    new THREE.Vector3(0, dist, 0.01),
    bottom: new THREE.Vector3(0, -dist, 0.01),
    right:  new THREE.Vector3(dist, 0, 0),
    left:   new THREE.Vector3(-dist, 0, 0),
    iso:    new THREE.Vector3(dist * 0.6, dist * 0.5, dist * 0.6),
  };

  const pos = views[direction] || views.iso;
  camera.position.copy(center).add(pos);
  orbitControls.target.copy(center);
  orbitControls.update();
}

function vpUpdateStats() {
  let totalVerts = 0;
  let totalFaces = 0;
  for (const obj of Object.values(sceneObjects)) {
    if (obj.mesh && obj.mesh.geometry) {
      const geo = obj.mesh.geometry;
      const posAttr = geo.getAttribute("position");
      if (posAttr) totalVerts += posAttr.count;
      if (geo.index) totalFaces += geo.index.count / 3;
      else if (posAttr) totalFaces += posAttr.count / 3;
    }
  }
  $("#infoVerts").textContent = `Verts: ${totalVerts.toLocaleString()}`;
  $("#infoFaces").textContent = `Faces: ${totalFaces.toLocaleString()}`;
  $("#statusTotalVerts").textContent = `Vertices: ${totalVerts.toLocaleString()}`;
  $("#statusTotalFaces").textContent = `Faces: ${totalFaces.toLocaleString()}`;
  $("#statusObjects").textContent = `Objects: ${Object.keys(sceneObjects).length}`;
}

function vpUpdateHint() {
  const hint = $("#viewportHint");
  if (Object.keys(sceneObjects).length > 0) {
    hint.classList.add("hidden");
  } else {
    hint.classList.remove("hidden");
  }
}

function vpToggleWireframe() {
  showWireframe = !showWireframe;
  for (const obj of Object.values(sceneObjects)) {
    if (obj.wireframe) obj.wireframe.visible = showWireframe && obj.mesh.visible;
  }
}

function vpToggleEdges() {
  showEdges = !showEdges;
  for (const obj of Object.values(sceneObjects)) {
    if (obj.edges) obj.edges.visible = showEdges && obj.mesh.visible;
  }
}

function vpUpdateObjectMesh(objId, objData) {
  vpRemoveObject(objId);
  vpAddObject(objId, objData);
  if (selectedObjId === objId) {
    const obj = sceneObjects[objId];
    if (obj && obj.mesh) {
      transformControls.attach(obj.mesh);
      vpHighlightObject(objId, true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  FT — Feature Tree
// ═══════════════════════════════════════════════════════════════

function ftRender() {
  const container = $("#featureTree");
  const empty = $("#treeEmpty");

  if (!sceneData || !sceneData.feature_order || sceneData.feature_order.length === 0) {
    empty.style.display = "block";
    container.querySelectorAll(".tree-item").forEach((el) => el.remove());
    return;
  }

  empty.style.display = "none";

  // Remove old items
  container.querySelectorAll(".tree-item").forEach((el) => el.remove());

  for (const objId of sceneData.feature_order) {
    const obj = sceneData.objects[objId];
    if (!obj) continue;

    const item = document.createElement("div");
    item.className = `tree-item ${objId === selectedObjId ? "selected" : ""}`;
    item.dataset.objId = objId;

    const icon = ftGetIcon(obj.feature_type);
    const visIcon = obj.visible ? "👁" : "👁‍🗨";
    const visClass = obj.visible ? "" : "vis-off";

    item.innerHTML = `
      <div class="tree-item-icon">${icon}</div>
      <span class="tree-item-name">${obj.name}</span>
      <div class="tree-item-actions">
        <button class="tree-item-btn ${visClass}" data-action="toggle-vis" title="Toggle visibility">${visIcon}</button>
        <button class="tree-item-btn" data-action="delete" title="Delete">✕</button>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      selectObject(objId);
    });

    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      selectObject(objId);
      ctxShow(e.clientX, e.clientY, objId);
    });

    const visBtn = item.querySelector("[data-action='toggle-vis']");
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVisibility(objId);
    });

    const delBtn = item.querySelector("[data-action='delete']");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteObject(objId);
    });

    container.appendChild(item);
  }
}

function ftGetIcon(featureType) {
  const icons = {
    primitive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    extrude: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    sketch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    boolean: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  };
  return icons[featureType] || icons.primitive;
}

window.collapseAll = function () {
  if (!sceneData) return;
  for (const objId of sceneData.feature_order) {
    const obj = sceneData.objects[objId];
    if (obj && obj.visible) toggleVisibility(objId);
  }
  toast("All objects hidden", "info");
};
window.expandAll = function () {
  if (!sceneData) return;
  for (const objId of sceneData.feature_order) {
    const obj = sceneData.objects[objId];
    if (obj && !obj.visible) toggleVisibility(objId);
  }
  toast("All objects visible", "info");
};

// ═══════════════════════════════════════════════════════════════
//  PP — Properties Panel
// ═══════════════════════════════════════════════════════════════

function ppRender(objId) {
  const obj = sceneData?.objects?.[objId];
  if (!obj) {
    $("#panelEmpty").style.display = "block";
    $("#panelContent").style.display = "none";
    return;
  }

  $("#panelEmpty").style.display = "none";
  $("#panelContent").style.display = "block";

  // Name & Type
  $("#propName").value = obj.name;
  $("#propType").textContent = obj.feature_type;

  // Transform
  const t = obj.transform || {};
  const pos = t.position || {};
  const rot = t.rotation || {};
  const scl = t.scale || { x: 1, y: 1, z: 1 };
  $("#propPosX").value = (pos.x || 0).toFixed(2);
  $("#propPosY").value = (pos.y || 0).toFixed(2);
  $("#propPosZ").value = (pos.z || 0).toFixed(2);
  $("#propRotX").value = (rot.x || 0).toFixed(1);
  $("#propRotY").value = (rot.y || 0).toFixed(1);
  $("#propRotZ").value = (rot.z || 0).toFixed(1);
  $("#propScaleX").value = (scl.x || 1).toFixed(2);
  $("#propScaleY").value = (scl.y || 1).toFixed(2);
  $("#propScaleZ").value = (scl.z || 1).toFixed(2);

  // Material
  const mat = obj.material || {};
  $("#propColor").value = mat.color || "#6c8ebf";
  $("#propColorHex").value = mat.color || "#6c8ebf";
  $("#propMetalness").value = mat.metalness ?? 0.3;
  $("#propMetalnessVal").textContent = (mat.metalness ?? 0.3).toFixed(2);
  $("#propRoughness").value = mat.roughness ?? 0.6;
  $("#propRoughnessVal").textContent = (mat.roughness ?? 0.6).toFixed(2);
  $("#propOpacity").value = mat.opacity ?? 1;
  $("#propOpacityVal").textContent = (mat.opacity ?? 1).toFixed(2);

  // Parameters (primitives only)
  const paramsSection = $("#paramsSection");
  const paramsBody = $("#paramsBody");
  if (obj.params && obj.feature_type === "primitive") {
    paramsSection.style.display = "block";
    paramsBody.innerHTML = "";
    ppRenderParams(obj.params);
  } else {
    paramsSection.style.display = "none";
  }

  // Load measurements
  ppLoadMeasurements(objId);
}

function ppRenderParams(params) {
  const body = $("#paramsBody");
  const pt = params.primitive_type;

  const fields = [];
  if (pt === "box") {
    fields.push(["Width", "width", params.width]);
    fields.push(["Height", "height", params.height]);
    fields.push(["Depth", "depth", params.depth]);
  } else if (pt === "sphere") {
    fields.push(["Radius", "radius", params.radius]);
    fields.push(["Segments", "radial_segments", params.radial_segments]);
  } else if (pt === "cylinder") {
    fields.push(["Radius", "radius", params.radius]);
    fields.push(["Height", "cyl_height", params.cyl_height]);
    fields.push(["Segments", "radial_segments", params.radial_segments]);
  } else if (pt === "cone") {
    fields.push(["Top R", "radius_top", params.radius_top]);
    fields.push(["Bottom R", "radius_bottom", params.radius_bottom]);
    fields.push(["Height", "cyl_height", params.cyl_height]);
  } else if (pt === "torus") {
    fields.push(["Radius", "radius", params.radius]);
    fields.push(["Tube R", "tube_radius", params.tube_radius]);
    fields.push(["Segments", "radial_segments", params.radial_segments]);
  }

  for (const [label, key, val] of fields) {
    const row = document.createElement("div");
    row.className = "prop-row";
    row.innerHTML = `
      <span class="prop-label">${label}</span>
      <input type="number" class="prop-input" step="${key.includes("segment") ? 1 : 0.1}"
             min="${key.includes("segment") ? 3 : 0.01}"
             value="${val}" data-param="${key}">
    `;
    const input = row.querySelector("input");
    input.addEventListener("change", () => ppSaveParams());
    body.appendChild(row);
  }
}

async function ppLoadMeasurements(objId) {
  const section = $("#measureSection");
  const body = $("#measureBody");
  try {
    const resp = await fetch(`/api/scene/${sceneId}/measure/${objId}`);
    if (!resp.ok) { section.style.display = "none"; return; }
    const data = await resp.json();
    section.style.display = "block";
    body.innerHTML = "";

    const items = [];
    if (data.volume != null) items.push(["Volume", data.volume.toFixed(2)]);
    if (data.area != null) items.push(["Area", data.area.toFixed(2)]);
    if (data.bbox_min && data.bbox_max) {
      const bmin = data.bbox_min, bmax = data.bbox_max;
      items.push(["Size X", (bmax.x - bmin.x).toFixed(2)]);
      items.push(["Size Y", (bmax.y - bmin.y).toFixed(2)]);
      items.push(["Size Z", (bmax.z - bmin.z).toFixed(2)]);
    }

    for (const [label, val] of items) {
      const row = document.createElement("div");
      row.className = "prop-row";
      row.innerHTML = `<span class="prop-label">${label}</span>
        <span style="font-size:12px;font-family:Consolas,monospace;color:var(--teal)">${val}</span>`;
      body.appendChild(row);
    }
  } catch {
    section.style.display = "none";
  }
}

function ppUpdateFromMesh(mesh) {
  if (!mesh) return;
  $("#propPosX").value = mesh.position.x.toFixed(2);
  $("#propPosY").value = mesh.position.y.toFixed(2);
  $("#propPosZ").value = mesh.position.z.toFixed(2);
  $("#propRotX").value = (mesh.rotation.x * 180 / Math.PI).toFixed(1);
  $("#propRotY").value = (mesh.rotation.y * 180 / Math.PI).toFixed(1);
  $("#propRotZ").value = (mesh.rotation.z * 180 / Math.PI).toFixed(1);
  $("#propScaleX").value = mesh.scale.x.toFixed(2);
  $("#propScaleY").value = mesh.scale.y.toFixed(2);
  $("#propScaleZ").value = mesh.scale.z.toFixed(2);
}

async function ppSaveTransform() {
  if (!selectedObjId || !sceneId) return;
  const updates = {
    transform: {
      position: {
        x: parseFloat($("#propPosX").value) || 0,
        y: parseFloat($("#propPosY").value) || 0,
        z: parseFloat($("#propPosZ").value) || 0,
      },
      rotation: {
        x: parseFloat($("#propRotX").value) || 0,
        y: parseFloat($("#propRotY").value) || 0,
        z: parseFloat($("#propRotZ").value) || 0,
      },
      scale: {
        x: parseFloat($("#propScaleX").value) || 1,
        y: parseFloat($("#propScaleY").value) || 1,
        z: parseFloat($("#propScaleZ").value) || 1,
      },
    },
  };

  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${selectedObjId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[selectedObjId] = data;
    }
  } catch (e) {
    console.error("Failed to save transform:", e);
  }
}

async function ppSaveMaterial() {
  if (!selectedObjId || !sceneId) return;
  const updates = {
    material: {
      color: $("#propColor").value,
      metalness: parseFloat($("#propMetalness").value),
      roughness: parseFloat($("#propRoughness").value),
      opacity: parseFloat($("#propOpacity").value),
    },
  };

  // Update Three.js material immediately
  const obj = sceneObjects[selectedObjId];
  if (obj && obj.mesh) {
    obj.mesh.material.color.set(updates.material.color);
    obj.mesh.material.metalness = updates.material.metalness;
    obj.mesh.material.roughness = updates.material.roughness;
    obj.mesh.material.opacity = updates.material.opacity;
    obj.mesh.material.transparent = updates.material.opacity < 1;
  }

  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${selectedObjId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[selectedObjId] = data;
    }
  } catch (e) {
    console.error("Failed to save material:", e);
  }
}

async function ppSaveParams() {
  if (!selectedObjId || !sceneId) return;
  const paramInputs = $$("#paramsBody input[data-param]");
  const params = {};
  for (const inp of paramInputs) {
    const key = inp.dataset.param;
    params[key] = parseFloat(inp.value);
  }

  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${selectedObjId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[selectedObjId] = data;
      vpUpdateObjectMesh(selectedObjId, data);
      toast("Parameters updated", "success");
    }
  } catch (e) {
    console.error("Failed to save params:", e);
  }
}

async function ppSaveName() {
  if (!selectedObjId || !sceneId) return;
  const name = $("#propName").value.trim();
  if (!name) return;

  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${selectedObjId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[selectedObjId] = data;
      ftRender();
    }
  } catch (e) {
    console.error("Failed to save name:", e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Selection & Object Operations
// ═══════════════════════════════════════════════════════════════

function selectObject(objId) {
  // Deselect previous
  if (selectedObjId && selectedObjId !== objId) {
    vpHighlightObject(selectedObjId, false);
  }

  selectedObjId = objId;
  vpHighlightObject(objId, true);

  // Attach transform controls
  const obj = sceneObjects[objId];
  if (obj && obj.mesh) {
    if (currentTool !== "select") {
      transformControls.attach(obj.mesh);
    } else {
      transformControls.detach();
    }
  }

  ftRender();
  ppRender(objId);
  setStatus(`Selected: ${sceneData?.objects?.[objId]?.name || objId}`);
}

function deselectAll() {
  if (selectedObjId) {
    vpHighlightObject(selectedObjId, false);
  }
  selectedObjId = null;
  transformControls.detach();
  ftRender();
  ppRender(null);
  setStatus("Ready");
}

async function deleteObject(objId) {
  if (!sceneId || !objId) return;
  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${objId}`, { method: "DELETE" });
    if (resp.ok) {
      vpRemoveObject(objId);
      if (sceneData) {
        delete sceneData.objects[objId];
        sceneData.feature_order = sceneData.feature_order.filter((id) => id !== objId);
      }
      if (selectedObjId === objId) {
        selectedObjId = null;
        transformControls.detach();
        ppRender(null);
      }
      ftRender();
      toast("Object deleted", "info");
    }
  } catch (e) {
    toast("Failed to delete object", "error");
  }
}

async function toggleVisibility(objId) {
  if (!sceneId || !objId) return;
  const obj = sceneData?.objects?.[objId];
  if (!obj) return;

  const newVis = !obj.visible;
  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${objId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: newVis }),
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[objId] = data;
      const scObj = sceneObjects[objId];
      if (scObj) {
        if (scObj.mesh) scObj.mesh.visible = newVis;
        if (scObj.edges) scObj.edges.visible = newVis && showEdges;
        if (scObj.wireframe) scObj.wireframe.visible = newVis && showWireframe;
      }
      ftRender();
    }
  } catch (e) {
    toast("Failed to toggle visibility", "error");
  }
}

async function toggleLock(objId) {
  if (!sceneId || !objId) return;
  const obj = sceneData?.objects?.[objId];
  if (!obj) return;
  const newLocked = !obj.locked;
  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${objId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: newLocked }),
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[objId] = data;
      toast(newLocked ? "Object locked" : "Object unlocked", "info");
    }
  } catch (e) {
    toast("Failed to toggle lock", "error");
  }
}

async function duplicateObject(objId) {
  if (!sceneId || !objId) return;
  try {
    const resp = await fetch(`/api/scene/${sceneId}/object/${objId}/duplicate`, {
      method: "POST",
    });
    if (resp.ok) {
      const data = await resp.json();
      sceneData.objects[data.id] = data;
      sceneData.feature_order.push(data.id);
      vpAddObject(data.id, data);
      selectObject(data.id);
      ftRender();
      toast("Object duplicated", "success");
    }
  } catch (e) {
    toast("Failed to duplicate", "error");
  }
}

// ═══════════════════════════════════════════════════════════════
//  TB — Toolbar Actions
// ═══════════════════════════════════════════════════════════════

function tbInit() {
  // Tool buttons (select, move, rotate, scale, measure)
  $$("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      setTool(tool);
    });
  });

  // Action buttons
  $$("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      handleAction(action);
    });
  });

  // Sketch buttons
  $$("[data-sketch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const st = btn.dataset.sketch;
      // Constraint buttons trigger immediately
      if (st === "constraint-h") { skAddConstraint("horizontal"); return; }
      if (st === "constraint-v") { skAddConstraint("vertical"); return; }
      if (st === "constraint-d") { skAddConstraint("distance"); return; }
      // Drawing tools
      sketchDrawTool = st;
      sketchClickState = null;
      $$("[data-sketch]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function setTool(tool) {
  currentTool = tool;
  $$("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });

  if (selectedObjId && sceneObjects[selectedObjId]) {
    const mesh = sceneObjects[selectedObjId].mesh;
    if (tool === "move") {
      transformControls.setMode("translate");
      transformControls.attach(mesh);
    } else if (tool === "rotate") {
      transformControls.setMode("rotate");
      transformControls.attach(mesh);
    } else if (tool === "scale") {
      transformControls.setMode("scale");
      transformControls.attach(mesh);
    } else {
      transformControls.detach();
    }
  }
}

async function handleAction(action) {
  switch (action) {
    case "add-box":
      await addPrimitive("box");
      break;
    case "add-sphere":
      await addPrimitive("sphere");
      break;
    case "add-cylinder":
      await addPrimitive("cylinder");
      break;
    case "add-cone":
      await addPrimitive("cone");
      break;
    case "add-torus":
      await addPrimitive("torus");
      break;
    case "import":
      openModal("importModal");
      break;
    case "export":
      openModal("exportModal");
      break;
    case "fit-all":
      vpFitAll();
      break;
    case "toggle-wireframe":
      vpToggleWireframe();
      break;
    case "toggle-edges":
      vpToggleEdges();
      break;
    case "new-sketch":
      skStartSketch();
      break;
    case "finish-sketch":
      skFinishSketch();
      break;
    case "solve-sketch":
      await skSolve();
      break;
    case "extrude":
      if (currentSketchId) {
        await skExtrude();
      } else {
        toast("Select or create a sketch first", "info");
      }
      break;
    case "measure":
      if (selectedObjId) {
        ppLoadMeasurements(selectedObjId);
      }
      break;
  }
}

async function addPrimitive(type) {
  if (!sceneId) await initScene();
  setStatus(`Creating ${type}...`);

  try {
    const resp = await fetch(`/api/scene/${sceneId}/primitive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primitive_type: type,
        material: { color: nextColor() },
      }),
    });

    if (!resp.ok) throw new Error("Failed to create primitive");
    const data = await resp.json();

    sceneData.objects[data.id] = data;
    sceneData.feature_order.push(data.id);

    vpAddObject(data.id, data);
    selectObject(data.id);
    ftRender();
    vpFitAll();
    toast(`${type.charAt(0).toUpperCase() + type.slice(1)} created`, "success");
    setStatus("Ready");
  } catch (e) {
    toast(`Failed to create ${type}: ${e.message}`, "error");
    setStatus("Error");
  }
}

// ═══════════════════════════════════════════════════════════════
//  IE — Import / Export
// ═══════════════════════════════════════════════════════════════

let pendingImportFile = null;

function ieInit() {
  // File input change
  $("#importFileInput").addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      pendingImportFile = e.target.files[0];
      $("#importBtn").disabled = false;
      toast(`File selected: ${pendingImportFile.name}`, "info");
    }
  });

  // Import modal drop area
  const importDrop = $("#importDropArea");
  if (importDrop) {
    importDrop.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      importDrop.style.borderColor = "var(--accent)";
      importDrop.style.background = "rgba(137,180,250,0.08)";
    });
    importDrop.addEventListener("dragleave", (e) => {
      e.preventDefault();
      importDrop.style.borderColor = "";
      importDrop.style.background = "";
    });
    importDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      importDrop.style.borderColor = "";
      importDrop.style.background = "";
      if (e.dataTransfer.files.length > 0) {
        pendingImportFile = e.dataTransfer.files[0];
        $("#importBtn").disabled = false;
        toast(`File selected: ${pendingImportFile.name}`, "info");
      }
    });
  }

  // Hidden file input (for keyboard shortcut)
  $("#hiddenFileInput").addEventListener("change", async (e) => {
    if (e.target.files.length > 0) {
      await importFile(e.target.files[0]);
      e.target.value = "";
    }
  });

  // Drag and drop on viewport
  const vp = $("#viewportContainer");
  vp.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    $("#dropzone").classList.add("active");
  });
  vp.addEventListener("dragleave", (e) => {
    e.preventDefault();
    $("#dropzone").classList.remove("active");
  });
  vp.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    $("#dropzone").classList.remove("active");
    if (e.dataTransfer.files.length > 0) {
      await importFile(e.dataTransfer.files[0]);
    }
  });

  // Also drag on entire body
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
  });
}

window.doImport = async function () {
  if (pendingImportFile) {
    closeModal("importModal");
    await importFile(pendingImportFile);
    pendingImportFile = null;
    $("#importBtn").disabled = true;
    $("#importFileInput").value = "";
  }
};

async function importFile(file) {
  if (!sceneId) await initScene();
  setStatus(`Importing ${file.name}...`);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const resp = await fetch(`/api/scene/${sceneId}/import`, {
      method: "POST",
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Import failed");
    }

    const data = await resp.json();
    sceneData.objects[data.id] = data;
    sceneData.feature_order.push(data.id);

    vpAddObject(data.id, data);
    selectObject(data.id);
    ftRender();
    vpFitAll();

    toast(`Imported: ${file.name}`, "success");
    setStatus("Ready");
  } catch (e) {
    toast(`Import failed: ${e.message}`, "error");
    setStatus("Error");
  }
}

window.doExport = async function () {
  if (!sceneId) return;
  const fmt = $("#exportFormat").value;
  const scope = $("#exportScope").value;

  closeModal("exportModal");
  setStatus("Exporting...");

  try {
    let url;
    if (scope === "selected" && selectedObjId) {
      url = `/api/scene/${sceneId}/object/${selectedObjId}/export?format=${fmt}`;
    } else {
      url = `/api/scene/${sceneId}/export?format=${fmt}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Export failed");

    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `r3ditor_export.${fmt}`;
    a.click();
    URL.revokeObjectURL(a.href);

    toast(`Exported as ${fmt.toUpperCase()}`, "success");
    setStatus("Ready");
  } catch (e) {
    toast(`Export failed: ${e.message}`, "error");
    setStatus("Error");
  }
};

// ═══════════════════════════════════════════════════════════════
//  SK — Sketch Mode
// ═══════════════════════════════════════════════════════════════

async function skStartSketch() {
  if (!sceneId) await initScene();

  try {
    const resp = await fetch(`/api/scene/${sceneId}/sketch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plane: "XY" }),
    });
    if (!resp.ok) throw new Error("Failed to create sketch");
    const sketch = await resp.json();
    currentSketchId = sketch.id;
    sketchMode = true;

    // Show sketch toolbar
    $("#sketchToolbar").classList.add("active");
    sketchDrawTool = "line";
    sketchClickState = null;

    // Disable orbit rotation so left-click goes to sketch
    orbitControls.enableRotate = false;

    // Switch to front view for XY plane sketching
    vpSetView("front");

    toast(`Sketch mode: ${sketch.name}`, "info");
    setStatus(`Sketch: ${sketch.name} — Draw on XY plane`);
  } catch (e) {
    toast("Failed to start sketch", "error");
  }
}

function skFinishSketch() {
  sketchMode = false;
  currentSketchId = null;
  sketchClickState = null;
  sketchDrawTool = "line";
  // Remove sketch visuals
  for (const v of sketchVisuals) {
    scene.remove(v);
    if (v.geometry) v.geometry.dispose();
    if (v.material) v.material.dispose();
  }
  sketchVisuals = [];
  // Re-enable orbit rotation
  orbitControls.enableRotate = true;
  $("#sketchToolbar").classList.remove("active");
  setStatus("Ready");
  toast("Sketch finished", "info");
}

async function skSolve() {
  if (!sceneId || !currentSketchId) return;
  try {
    const resp = await fetch(`/api/scene/${sceneId}/sketch/${currentSketchId}/solve`, {
      method: "POST",
    });
    if (!resp.ok) throw new Error("Solve failed");
    const result = await resp.json();
    if (result.success) {
      toast(`Solved! DOF: ${result.dof}`, "success");
    } else {
      toast(`Solve failed: ${result.message}`, "error");
    }
  } catch (e) {
    toast("Solve failed", "error");
  }
}

async function skExtrude() {
  if (!sceneId || !currentSketchId) return;
  const height = parseFloat(prompt("Extrude height:", "10") || "10");
  if (isNaN(height) || height <= 0) return;

  try {
    const resp = await fetch(`/api/scene/${sceneId}/sketch/${currentSketchId}/extrude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ height }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Extrude failed");
    }
    const data = await resp.json();
    sceneData.objects[data.id] = data;
    sceneData.feature_order.push(data.id);
    vpAddObject(data.id, data);
    selectObject(data.id);
    ftRender();
    vpFitAll();
    skFinishSketch();
    toast("Extruded!", "success");
  } catch (e) {
    toast(`Extrude failed: ${e.message}`, "error");
  }
}

// ── Sketch drawing helpers ─────────────────────────────────────────

function skHandleClick(ndcX, ndcY) {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const skPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(skPlane, hit);
  if (!hit) return;

  const sx = Math.round(hit.x * 10) / 10;
  const sy = Math.round(hit.y * 10) / 10;

  if (sketchDrawTool === "line") {
    if (!sketchClickState) {
      sketchClickState = { x1: sx, y1: sy };
      toast(`Line start: (${sx}, ${sy}) — click endpoint`, "info");
    } else {
      skAddEntity("line", { x1: sketchClickState.x1, y1: sketchClickState.y1, x2: sx, y2: sy });
      sketchClickState = null;
    }
  } else if (sketchDrawTool === "rect") {
    if (!sketchClickState) {
      sketchClickState = { x1: sx, y1: sy };
      toast(`Rect corner 1: (${sx}, ${sy}) — click opposite corner`, "info");
    } else {
      skAddEntity("rect", { x1: sketchClickState.x1, y1: sketchClickState.y1, x2: sx, y2: sy });
      sketchClickState = null;
    }
  } else if (sketchDrawTool === "circle") {
    if (!sketchClickState) {
      sketchClickState = { cx: sx, cy: sy };
      toast(`Circle center: (${sx}, ${sy}) — click for radius`, "info");
    } else {
      const dx = sx - sketchClickState.cx;
      const dy = sy - sketchClickState.cy;
      const r = Math.max(0.1, Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10);
      skAddEntity("circle", { cx: sketchClickState.cx, cy: sketchClickState.cy, radius: r });
      sketchClickState = null;
    }
  } else if (sketchDrawTool === "arc") {
    if (!sketchClickState) {
      sketchClickState = { cx: sx, cy: sy };
      toast(`Arc center: (${sx}, ${sy}) — click for radius`, "info");
    } else {
      const dx = sx - sketchClickState.cx;
      const dy = sy - sketchClickState.cy;
      const r = Math.max(0.1, Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10);
      skAddEntity("arc", { cx: sketchClickState.cx, cy: sketchClickState.cy, radius: r, start_angle: 0, end_angle: 180 });
      sketchClickState = null;
    }
  }
}

async function skAddEntity(entityType, data) {
  if (!sceneId || !currentSketchId) return;
  try {
    const resp = await fetch(`/api/scene/${sceneId}/sketch/${currentSketchId}/entity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, ...data }),
    });
    if (resp.ok) {
      toast(`Added ${entityType}`, "success");
      await skRenderEntities();
    } else {
      const err = await resp.json();
      toast(`Failed: ${err.error || "Unknown error"}`, "error");
    }
  } catch (e) {
    toast(`Failed to add ${entityType}`, "error");
  }
}

async function skAddConstraint(type) {
  if (!sceneId || !currentSketchId) {
    toast("Enter sketch mode first", "info");
    return;
  }
  try {
    const skResp = await fetch(`/api/scene/${sceneId}/sketch/${currentSketchId}`);
    if (!skResp.ok) return;
    const sketch = await skResp.json();
    if (sketch.entities.length === 0) {
      toast("Add entities before constraining", "info");
      return;
    }
    const entityIds = sketch.entities.map((e) => e.id);
    const body = { constraint_type: type, entity_ids: entityIds };
    if (type === "distance") {
      const val = prompt("Distance value:", "10");
      if (val === null) return;
      body.value = parseFloat(val);
    }
    const resp = await fetch(`/api/scene/${sceneId}/sketch/${currentSketchId}/constraint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      toast(`${type} constraint added`, "success");
    }
  } catch (e) {
    toast("Failed to add constraint", "error");
  }
}

async function skRenderEntities() {
  for (const v of sketchVisuals) {
    scene.remove(v);
    if (v.geometry) v.geometry.dispose();
    if (v.material) v.material.dispose();
  }
  sketchVisuals = [];
  if (!sceneId || !currentSketchId) return;

  try {
    const resp = await fetch(`/api/scene/${sceneId}/sketch/${currentSketchId}`);
    if (!resp.ok) return;
    const sketch = await resp.json();

    const lineMat = new THREE.LineBasicMaterial({ color: 0xa6e3a1 });
    const ptMat = new THREE.PointsMaterial({ color: 0xf9e2af, size: 6, sizeAttenuation: false });

    for (const ent of sketch.entities) {
      if (ent.entity_type === "line") {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ent.x1, ent.y1, 0.01),
          new THREE.Vector3(ent.x2, ent.y2, 0.01),
        ]);
        const line = new THREE.Line(geo, lineMat.clone());
        scene.add(line);
        sketchVisuals.push(line);
        const ptGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ent.x1, ent.y1, 0.01),
          new THREE.Vector3(ent.x2, ent.y2, 0.01),
        ]);
        const pts = new THREE.Points(ptGeo, ptMat.clone());
        scene.add(pts);
        sketchVisuals.push(pts);
      } else if (ent.entity_type === "rect") {
        const c = [
          new THREE.Vector3(ent.x1, ent.y1, 0.01),
          new THREE.Vector3(ent.x2, ent.y1, 0.01),
          new THREE.Vector3(ent.x2, ent.y2, 0.01),
          new THREE.Vector3(ent.x1, ent.y2, 0.01),
          new THREE.Vector3(ent.x1, ent.y1, 0.01),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(c);
        const line = new THREE.Line(geo, lineMat.clone());
        scene.add(line);
        sketchVisuals.push(line);
      } else if (ent.entity_type === "circle") {
        const curve = new THREE.EllipseCurve(ent.cx, ent.cy, ent.radius, ent.radius, 0, Math.PI * 2, false, 0);
        const pts3d = curve.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0.01));
        const geo = new THREE.BufferGeometry().setFromPoints(pts3d);
        const line = new THREE.Line(geo, lineMat.clone());
        scene.add(line);
        sketchVisuals.push(line);
      } else if (ent.entity_type === "arc") {
        const s = (ent.start_angle * Math.PI) / 180;
        const e2 = (ent.end_angle * Math.PI) / 180;
        const curve = new THREE.EllipseCurve(ent.cx, ent.cy, ent.radius, ent.radius, s, e2, false, 0);
        const pts3d = curve.getPoints(32).map((p) => new THREE.Vector3(p.x, p.y, 0.01));
        const geo = new THREE.BufferGeometry().setFromPoints(pts3d);
        const line = new THREE.Line(geo, lineMat.clone());
        scene.add(line);
        sketchVisuals.push(line);
      } else if (ent.entity_type === "point") {
        const ptGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ent.px, ent.py, 0.01),
        ]);
        const pts = new THREE.Points(ptGeo, ptMat.clone());
        scene.add(pts);
        sketchVisuals.push(pts);
      }
    }
  } catch (e) {
    console.error("Failed to render sketch:", e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CTX — Context Menu
// ═══════════════════════════════════════════════════════════════

let ctxTargetId = null;

function ctxInit() {
  const menu = $("#contextMenu");
  const menuDd = $("#menuDropdown");

  document.addEventListener("click", () => {
    menu.classList.remove("show");
    if (menuDd) menuDd.classList.remove("show");
  });

  $$(".ctx-item").forEach((item) => {
    item.addEventListener("click", () => {
      const action = item.dataset.ctx;
      ctxAction(action);
      menu.classList.remove("show");
    });
  });
}

function ctxShow(x, y, objId) {
  ctxTargetId = objId;
  const menu = $("#contextMenu");
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.classList.add("show");
}

function ctxAction(action) {
  if (!ctxTargetId) return;
  switch (action) {
    case "duplicate":
      duplicateObject(ctxTargetId);
      break;
    case "rename":
      const nameInput = $("#propName");
      nameInput.focus();
      nameInput.select();
      break;
    case "hide":
      toggleVisibility(ctxTargetId);
      break;
    case "lock":
      toggleLock(ctxTargetId);
      break;
    case "delete":
      deleteObject(ctxTargetId);
      break;
    case "export-obj":
      window.location.href = `/api/scene/${sceneId}/object/${ctxTargetId}/export?format=obj`;
      break;
    case "export-stl":
      window.location.href = `/api/scene/${sceneId}/object/${ctxTargetId}/export?format=stl`;
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Menu Dropdowns
// ═══════════════════════════════════════════════════════════════

const MENU_DEFS = {
  new: [
    { label: "📄 New Scene", fn: () => { if (confirm("Create a new scene? Unsaved changes will be lost.")) newScene(); } },
    { sep: true },
    { label: "📂 Import...", shortcut: "Ctrl+I", fn: () => handleAction("import") },
    { label: "💾 Export...", shortcut: "Ctrl+E", fn: () => handleAction("export") },
  ],
  edit: [
    { label: "📋 Duplicate", shortcut: "Ctrl+D", fn: () => { if (selectedObjId) duplicateObject(selectedObjId); else toast("Select an object first", "info"); } },
    { label: "✏️ Rename", shortcut: "F2", fn: () => { if (selectedObjId) { $("#propName").focus(); $("#propName").select(); } else toast("Select an object first", "info"); } },
    { sep: true },
    { label: "👁 Toggle Visibility", shortcut: "H", fn: () => { if (selectedObjId) toggleVisibility(selectedObjId); else toast("Select an object first", "info"); } },
    { label: "🔒 Toggle Lock", fn: () => { if (selectedObjId) toggleLock(selectedObjId); else toast("Select an object first", "info"); } },
    { sep: true },
    { label: "🗑 Delete", shortcut: "Del", fn: () => { if (selectedObjId) deleteObject(selectedObjId); else toast("Select an object first", "info"); } },
    { label: "⬜ Deselect All", shortcut: "Esc", fn: () => deselectAll() },
  ],
  view: [
    { label: "📐 Fit All", shortcut: "F", fn: () => vpFitAll() },
    { sep: true },
    { label: "🔲 Front", shortcut: "1", fn: () => vpSetView("front") },
    { label: "➡️ Right", shortcut: "2", fn: () => vpSetView("right") },
    { label: "⬆️ Top", shortcut: "3", fn: () => vpSetView("top") },
    { label: "🔳 Perspective", shortcut: "4", fn: () => vpSetView("iso") },
    { sep: true },
    { label: "🔲 Wireframe", shortcut: "W", fn: () => vpToggleWireframe() },
    { label: "📏 Edges", shortcut: "E", fn: () => vpToggleEdges() },
  ],
  insert: [
    { label: "📦 Box", fn: () => addPrimitive("box") },
    { label: "🔵 Sphere", fn: () => addPrimitive("sphere") },
    { label: "🔷 Cylinder", fn: () => addPrimitive("cylinder") },
    { label: "🔺 Cone", fn: () => addPrimitive("cone") },
    { label: "🍩 Torus", fn: () => addPrimitive("torus") },
    { sep: true },
    { label: "✏️ New Sketch", fn: () => handleAction("new-sketch") },
  ],
  tools: [
    { label: "📏 Measure Object", fn: () => { if (selectedObjId) { ppLoadMeasurements(selectedObjId); toast("Measurements loaded in Properties panel", "info"); } else toast("Select an object first", "info"); } },
    { sep: true },
    { label: "✏️ New Sketch", fn: () => handleAction("new-sketch") },
    { label: "⬆️ Extrude", fn: () => handleAction("extrude") },
  ],
  help: [
    { label: "ℹ️ About r3ditor v0.1", fn: () => toast("r3ditor v0.1 — 3D Model Editor with SolveSpace constraint solver", "info") },
    { label: "⌨️ Keyboard Shortcuts", fn: () => showShortcutsHelp() },
  ],
};

function showMenu(menuId, anchorEl) {
  const items = MENU_DEFS[menuId];
  if (!items) return;
  const dd = $("#menuDropdown");
  dd.innerHTML = "";
  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      dd.appendChild(sep);
      continue;
    }
    const el = document.createElement("div");
    el.className = "ctx-item";
    el.innerHTML = `${item.label}${item.shortcut ? `<span class="ctx-shortcut">${item.shortcut}</span>` : ""}`;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      dd.classList.remove("show");
      item.fn();
    });
    dd.appendChild(el);
  }
  const rect = anchorEl.getBoundingClientRect();
  dd.style.left = rect.left + "px";
  dd.style.top = (rect.bottom + 2) + "px";
  dd.classList.add("show");
}

function showShortcutsHelp() {
  const lines = [
    "V — Select        G — Move        R — Rotate      S — Scale",
    "F — Fit all       W — Wireframe   E — Edges        H — Hide",
    "Del — Delete      Ctrl+D — Duplicate               Ctrl+I — Import",
    "1 — Front         2 — Right       3 — Top          4 — Perspective",
    "Esc — Deselect / Exit sketch",
  ];
  alert("Keyboard Shortcuts\n\n" + lines.join("\n"));
}

window.menuAction = function (menu, event) {
  const dd = $("#menuDropdown");
  const wasOpen = dd.classList.contains("show");
  const wasMenu = dd.dataset.currentMenu;
  dd.classList.remove("show");

  // Toggle off if clicking the same menu
  if (wasOpen && wasMenu === menu) return;

  const btn = event?.target?.closest?.(".header-menu-btn");
  if (btn) {
    dd.dataset.currentMenu = menu;
    showMenu(menu, btn);
  }
};

// ═══════════════════════════════════════════════════════════════
//  Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════════

function kbInit() {
  document.addEventListener("keydown", (e) => {
    // Don't capture if typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key.toLowerCase();

    switch (key) {
      case "v":
        setTool("select");
        break;
      case "g":
        setTool("move");
        break;
      case "r":
        setTool("rotate");
        break;
      case "s":
        if (!e.ctrlKey) setTool("scale");
        break;
      case "f":
        vpFitAll();
        break;
      case "w":
        vpToggleWireframe();
        break;
      case "e":
        if (!e.ctrlKey) vpToggleEdges();
        break;
      case "h":
        if (selectedObjId) toggleVisibility(selectedObjId);
        break;
      case "delete":
      case "backspace":
        if (selectedObjId) deleteObject(selectedObjId);
        break;
      case "escape":
        if (sketchMode) {
          skFinishSketch();
        } else {
          deselectAll();
        }
        break;
      case "d":
        if (e.ctrlKey && selectedObjId) {
          e.preventDefault();
          duplicateObject(selectedObjId);
        }
        break;
      case "i":
        if (e.ctrlKey) {
          e.preventDefault();
          $("#hiddenFileInput").click();
        }
        break;
      case "1":
        vpSetView("front");
        break;
      case "2":
        vpSetView("right");
        break;
      case "3":
        vpSetView("top");
        break;
      case "4":
        vpSetView("iso");
        break;
      case "f2":
        if (selectedObjId) {
          e.preventDefault();
          $("#propName").focus();
          $("#propName").select();
        }
        break;
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  Panel section collapse
// ═══════════════════════════════════════════════════════════════

function panelInit() {
  $$(".panel-section-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.classList.toggle("collapsed");
      const body = header.nextElementSibling;
      if (body) body.classList.toggle("collapsed");
    });
  });

  // Property change handlers
  const transformInputs = [
    "propPosX", "propPosY", "propPosZ",
    "propRotX", "propRotY", "propRotZ",
    "propScaleX", "propScaleY", "propScaleZ",
  ];
  for (const id of transformInputs) {
    $(`#${id}`).addEventListener("change", () => {
      ppApplyTransformToMesh();
      ppSaveTransform();
    });
  }

  // Name
  $("#propName").addEventListener("change", () => ppSaveName());

  // Material handlers
  $("#propColor").addEventListener("input", (e) => {
    $("#propColorHex").value = e.target.value;
    ppSaveMaterial();
  });
  $("#propColorHex").addEventListener("change", (e) => {
    $("#propColor").value = e.target.value;
    ppSaveMaterial();
  });
  $("#propMetalness").addEventListener("input", (e) => {
    $("#propMetalnessVal").textContent = parseFloat(e.target.value).toFixed(2);
    ppSaveMaterial();
  });
  $("#propRoughness").addEventListener("input", (e) => {
    $("#propRoughnessVal").textContent = parseFloat(e.target.value).toFixed(2);
    ppSaveMaterial();
  });
  $("#propOpacity").addEventListener("input", (e) => {
    $("#propOpacityVal").textContent = parseFloat(e.target.value).toFixed(2);
    ppSaveMaterial();
  });
}

function ppApplyTransformToMesh() {
  if (!selectedObjId || !sceneObjects[selectedObjId]) return;
  const mesh = sceneObjects[selectedObjId].mesh;
  mesh.position.set(
    parseFloat($("#propPosX").value) || 0,
    parseFloat($("#propPosY").value) || 0,
    parseFloat($("#propPosZ").value) || 0,
  );
  mesh.rotation.set(
    (parseFloat($("#propRotX").value) || 0) * Math.PI / 180,
    (parseFloat($("#propRotY").value) || 0) * Math.PI / 180,
    (parseFloat($("#propRotZ").value) || 0) * Math.PI / 180,
  );
  mesh.scale.set(
    parseFloat($("#propScaleX").value) || 1,
    parseFloat($("#propScaleY").value) || 1,
    parseFloat($("#propScaleZ").value) || 1,
  );
  vpSyncEdges(selectedObjId);
}

// ═══════════════════════════════════════════════════════════════
//  Scene Management
// ═══════════════════════════════════════════════════════════════

async function initScene() {
  try {
    const resp = await fetch("/api/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Untitled" }),
    });
    if (!resp.ok) throw new Error("Failed to create scene");
    sceneData = await resp.json();
    sceneId = sceneData.id;
    sceneData.objects = sceneData.objects || {};
    sceneData.feature_order = sceneData.feature_order || [];
    $("#sceneBadge").textContent = `Scene: ${sceneData.name}`;
    setStatus("Ready");
  } catch (e) {
    toast("Failed to initialize scene", "error");
    console.error(e);
  }
}

async function newScene() {
  // Clear viewport
  for (const objId of Object.keys(sceneObjects)) {
    vpRemoveObject(objId);
  }
  selectedObjId = null;
  transformControls.detach();

  // Create new scene
  await initScene();
  ftRender();
  ppRender(null);
  colorIdx = 0;
  toast("New scene created", "success");
}

async function loadInfo() {
  try {
    const resp = await fetch("/api/info");
    if (resp.ok) {
      const info = await resp.json();
      const badge = info.capabilities?.solvespace ? "SolveSpace ✓" : "Fallback solver";
      $("#solverBadge").textContent = `Solver: ${badge}`;
    }
  } catch (e) {
    console.warn("Could not load system info");
  }
}

// ═══════════════════════════════════════════════════════════════
//  Status
// ═══════════════════════════════════════════════════════════════

function setStatus(msg) {
  $("#statusText").textContent = msg;
}

// ═══════════════════════════════════════════════════════════════
//  DOMContentLoaded — Bootstrap
// ═══════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  // Init viewport
  vpInit();

  // Init modules
  tbInit();
  ieInit();
  ctxInit();
  kbInit();
  panelInit();

  // Load system info
  await loadInfo();

  // Create initial scene
  await initScene();

  // Render feature tree
  ftRender();

  // Focus viewport
  vpFitAll();

  setStatus("Ready — Add a shape or import a model");
});
