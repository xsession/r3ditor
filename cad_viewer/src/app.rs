use std::{
    path::PathBuf,
    time::Instant,
};

use anyhow::Result;
use crossbeam_channel::{unbounded, Receiver, Sender};
use fyrox::{
    core::{
        algebra::{Matrix4, UnitQuaternion, Vector2, Vector3},
        color::Color,
        pool::Handle,
    },
    engine::executor::Executor,
    event::{DeviceEvent, ElementState, Event, MouseScrollDelta, WindowEvent},
    plugin::{Plugin, PluginConstructor, PluginContext},
    resource::model::Model,
    scene::{
        base::BaseBuilder,
        camera::CameraBuilder,
        graph::Graph,
        light::DirectionalLightBuilder,
        mesh::{MeshBuilder, surface::SurfaceData, SurfaceBuilder, SurfaceResource},
        node::Node,
        transform::TransformBuilder,
    },
    material::{Material, MaterialResource},
    resource::{ResourceKind},
};
use uuid::Uuid;

use cad_core::import::{ImportJob, ImportResult};

pub fn run() -> Result<()> {
    // Fyrox handles event loop + windowing.
    let mut executor = Executor::new();
    executor.add_plugin_constructor(CadViewerConstructor);
    executor.run();
    Ok(())
}

struct CadViewerConstructor;

impl PluginConstructor for CadViewerConstructor {
    fn create_instance(&self, scene_path: Option<&str>, context: PluginContext) -> Box<dyn Plugin> {
        Box::new(CadViewer::new(scene_path, context))
    }
}

struct CadViewer {
    scene: Handle<fyrox::scene::Scene>,
    model_node: Handle<Node>,

    // Import pipeline
    tx: Sender<anyhow::Result<ImportResult>>,
    rx: Receiver<anyhow::Result<ImportResult>>,
    import_started: bool,

    // Camera controls
    yaw: f32,
    pitch: f32,
    distance: f32,
    target: Vector3<f32>,
    dragging: bool,
    last_mouse: Vector2<f32>,
    camera: Handle<Node>,
}

impl CadViewer {
    fn new(_scene_path: Option<&str>, mut context: PluginContext) -> Self {
        let (tx, rx) = unbounded();

        // Create empty scene.
        let mut scene = fyrox::scene::Scene::new();
        scene.rendering_options.ambient_lighting_color = Color::opaque(40, 40, 40);

        let camera = CameraBuilder::new(
            BaseBuilder::new()
                .with_local_transform(
                    TransformBuilder::new()
                        .with_local_position(Vector3::new(0.0, 1.0, -5.0))
                        .build(),
                )
        )
        .build(&mut scene.graph);

        DirectionalLightBuilder::new(BaseBuilder::new())
            .with_intensity(1.2)
            .build(&mut scene.graph);

        let scene_handle = context.scenes.add(scene);

        Self {
            scene: scene_handle,
            model_node: Handle::NONE,

            tx,
            rx,
            import_started: false,

            yaw: 0.0,
            pitch: 0.3,
            distance: 5.0,
            target: Vector3::new(0.0, 0.0, 0.0),
            dragging: false,
            last_mouse: Vector2::new(0.0, 0.0),
            camera,
        }
    }

    fn start_import_if_needed(&mut self) {
        if self.import_started {
            return;
        }
        self.import_started = true;

        let path = std::env::args().nth(1).map(PathBuf::from);
        let Some(path) = path else {
            log::warn!("No file path provided. Run: cargo run -p cad_viewer --release -- <file.stl>");
            return;
        };

        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let job = ImportJob { path };
            let res = cad_core::import::import(job);
            let _ = tx.send(res);
        });
    }

    fn build_fyrox_mesh(&mut self, context: &mut PluginContext, res: ImportResult) {
        let scene = &mut context.scenes[self.scene];

        // Remove previous model.
        if self.model_node.is_some() {
            scene.graph.remove_node(self.model_node);
            self.model_node = Handle::NONE;
        }

        let m = res.mesh;
        let (center, radius) = m.center_and_radius();
        self.target = Vector3::new(center[0], center[1], center[2]);
        self.distance = (radius * 2.5).max(0.5);

        // Build SurfaceData from raw vertex buffers.
        // We keep it simple: positions/normals, no UVs.
        use fyrox::scene::mesh::buffer::{TriangleBuffer, VertexBuffer};
        use fyrox::scene::mesh::vertex::StaticVertex;
        use fyrox::core::algebra::{Vector4};

        let mut vertices: Vec<StaticVertex> = Vec::with_capacity(m.positions.len());
        for (p, n) in m.positions.iter().zip(m.normals.iter()) {
            vertices.push(StaticVertex {
                position: Vector3::new(p[0], p[1], p[2]).into(),
                tex_coord: Vector2::new(0.0, 0.0).into(),
                normal: Vector3::new(n[0], n[1], n[2]).into(),
                tangent: Vector4::new(0.0, 0.0, 0.0, 0.0).into(),
            });
        }

        let vb = VertexBuffer::new(vertices.len(), StaticVertex::layout());
        let mut vb = vb;
        vb.set_buffer_data(&vertices);

        let triangles = TriangleBuffer::new(m.indices.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect());

        let surface_data = SurfaceData::new(vb, triangles);

        let mut material = Material::standard();
        // Make it a bit matte so lighting reads well.
        material
            .set_property("roughnessFactor", 0.85f32)
            .ok();

        let surface = SurfaceBuilder::new(SurfaceResource::new_ok(
            Uuid::new_v4(),
            ResourceKind::Embedded,
            surface_data,
        ))
        .with_material(MaterialResource::new_ok(
            Uuid::new_v4(),
            ResourceKind::Embedded,
            material,
        ))
        .build();

        self.model_node = MeshBuilder::new(
            BaseBuilder::new().with_local_transform(
                TransformBuilder::new()
                    .with_local_position(Vector3::new(0.0, 0.0, 0.0))
                    .build(),
            ),
        )
        .with_surfaces(vec![surface])
        .build(&mut scene.graph);

        log::info!("Loaded: {:?}", res.source_path);
    }

    fn update_camera(&mut self, context: &mut PluginContext) {
        let scene = &mut context.scenes[self.scene];
        let graph: &mut Graph = &mut scene.graph;

        if let Some(cam) = graph.try_get_mut(self.camera).ok() {
            // Orbit around target using yaw/pitch and distance
            let rot = UnitQuaternion::from_euler_angles(self.pitch, self.yaw, 0.0);
            let offset = rot.transform_vector(&Vector3::new(0.0, 0.0, self.distance));
            let pos = self.target + offset;

            cam.local_transform_mut()
                .set_position(pos)
                .look_at(self.target, Vector3::y());
        }
    }

    fn reset_view(&mut self) {
        self.yaw = 0.0;
        self.pitch = 0.3;
    }
}

impl Plugin for CadViewer {
    fn update(&mut self, context: &mut PluginContext) {
        self.start_import_if_needed();

        // Apply import results, if any.
        while let Ok(msg) = self.rx.try_recv() {
            match msg {
                Ok(res) => self.build_fyrox_mesh(context, res),
                Err(e) => log::error!("Import error: {e:#}"),
            }
        }

        self.update_camera(context);
    }

    fn on_os_event(&mut self, event: &Event<()>, _context: PluginContext) {
        match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::MouseInput { state, button, .. } => {
                    if *button == fyrox::event::MouseButton::Left {
                        self.dragging = *state == ElementState::Pressed;
                    }
                }
                WindowEvent::CursorMoved { position, .. } => {
                    let pos = Vector2::new(position.x as f32, position.y as f32);
                    if self.dragging {
                        let delta = pos - self.last_mouse;
                        self.yaw -= delta.x * 0.005;
                        self.pitch = (self.pitch - delta.y * 0.005).clamp(-1.5, 1.5);
                    }
                    self.last_mouse = pos;
                }
                WindowEvent::MouseWheel { delta, .. } => {
                    let scroll = match delta {
                        MouseScrollDelta::LineDelta(_, y) => *y as f32,
                        MouseScrollDelta::PixelDelta(p) => p.y as f32 * 0.01,
                    };
                    self.distance = (self.distance * (1.0 - scroll * 0.08)).clamp(0.05, 1.0e6);
                }
                WindowEvent::KeyboardInput { event, .. } => {
                    if event.state == ElementState::Pressed {
                        if let fyrox::event::Key::Character(c) = &event.logical_key {
                            if c.eq_ignore_ascii_case("r") {
                                self.reset_view();
                            }
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
}
