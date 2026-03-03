use std::path::PathBuf;

use anyhow::Result;
use crossbeam_channel::{unbounded, Receiver, Sender};
use fyrox::{
    asset::untyped::ResourceKind,
    core::{
        algebra::{UnitQuaternion, Vector2, Vector3, Vector4},
        color::Color,
        math::TriangleDefinition,
        pool::Handle,
        reflect::prelude::*,
        visitor::prelude::*,
    },
    engine::executor::Executor,
    event::{ElementState, Event, MouseScrollDelta, WindowEvent},
    keyboard::Key,
    material::{Material, MaterialResource},
    plugin::{Plugin, PluginContext},
    scene::{
        base::BaseBuilder,
        camera::CameraBuilder,
        graph::Graph,
        light::{directional::DirectionalLightBuilder, BaseLightBuilder},
        mesh::{
            buffer::{TriangleBuffer, VertexBuffer},
            surface::{SurfaceBuilder, SurfaceData, SurfaceResource},
            vertex::StaticVertex,
            MeshBuilder,
        },
        node::Node,
        transform::TransformBuilder,
    },
};

use fyrox::graph::BaseSceneGraph;
use cad_core::import::{ImportJob, ImportResult};

pub fn run() -> Result<()> {
    let mut executor = Executor::new();
    executor.add_plugin(CadViewer::default());
    executor.run();
    Ok(())
}

#[derive(Default, Visit, Reflect, Debug)]
struct CadViewer {
    #[visit(skip)]
    #[reflect(hidden)]
    scene: Handle<fyrox::scene::Scene>,
    #[visit(skip)]
    #[reflect(hidden)]
    model_node: Handle<Node>,

    // Import pipeline
    #[visit(skip)]
    #[reflect(hidden)]
    tx: Option<Sender<anyhow::Result<ImportResult>>>,
    #[visit(skip)]
    #[reflect(hidden)]
    rx: Option<Receiver<anyhow::Result<ImportResult>>>,
    #[visit(skip)]
    #[reflect(hidden)]
    import_started: bool,

    // Camera controls
    #[visit(skip)]
    #[reflect(hidden)]
    yaw: f32,
    #[visit(skip)]
    #[reflect(hidden)]
    pitch: f32,
    #[visit(skip)]
    #[reflect(hidden)]
    distance: f32,
    #[visit(skip)]
    #[reflect(hidden)]
    target: Vector3<f32>,
    #[visit(skip)]
    #[reflect(hidden)]
    dragging: bool,
    #[visit(skip)]
    #[reflect(hidden)]
    last_mouse: Vector2<f32>,
    #[visit(skip)]
    #[reflect(hidden)]
    camera: Handle<Node>,
}

impl CadViewer {
    fn initialize(&mut self, context: PluginContext) {
        let (tx, rx) = unbounded();
        self.tx = Some(tx);
        self.rx = Some(rx);

        // Create empty scene.
        let mut scene = fyrox::scene::Scene::new();
        scene.rendering_options.ambient_lighting_color = Color::opaque(40, 40, 40);

        let camera = CameraBuilder::new(
            BaseBuilder::new().with_local_transform(
                TransformBuilder::new()
                    .with_local_position(Vector3::new(0.0, 1.0, -5.0))
                    .build(),
            ),
        )
        .build(&mut scene.graph);

        DirectionalLightBuilder::new(
            BaseLightBuilder::new(BaseBuilder::new()).with_intensity(1.2),
        )
        .build(&mut scene.graph);

        let scene_handle = context.scenes.add(scene);

        self.scene = scene_handle;
        self.model_node = Handle::NONE;
        self.import_started = false;
        self.yaw = 0.0;
        self.pitch = 0.3;
        self.distance = 5.0;
        self.target = Vector3::new(0.0, 0.0, 0.0);
        self.dragging = false;
        self.last_mouse = Vector2::new(0.0, 0.0);
        self.camera = camera;
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

        let tx = self.tx.clone().unwrap();
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

        let mut vertices: Vec<StaticVertex> = Vec::with_capacity(m.positions.len());
        for (p, n) in m.positions.iter().zip(m.normals.iter()) {
            vertices.push(StaticVertex {
                position: Vector3::new(p[0], p[1], p[2]),
                tex_coord: Vector2::new(0.0, 0.0),
                normal: Vector3::new(n[0], n[1], n[2]),
                tangent: Vector4::new(0.0, 0.0, 0.0, 0.0),
            });
        }

        let vb = VertexBuffer::new(vertices.len(), vertices)
            .expect("Failed to create VertexBuffer");

        let triangles = TriangleBuffer::new(
            m.indices
                .chunks_exact(3)
                .map(|c| TriangleDefinition([c[0], c[1], c[2]]))
                .collect(),
        );

        let surface_data = SurfaceData::new(vb, triangles);

        let material = Material::standard();

        let surface = SurfaceBuilder::new(SurfaceResource::new_ok(
            ResourceKind::Embedded,
            surface_data,
        ))
        .with_material(MaterialResource::new_ok(
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

        if let Some(cam) = graph.try_get_mut(self.camera) {
            // Orbit around target using yaw/pitch and distance
            let rot = UnitQuaternion::from_euler_angles(self.pitch, self.yaw, 0.0);
            let offset = rot.transform_vector(&Vector3::new(0.0, 0.0, self.distance));
            let pos = self.target + offset;

            // Compute look-at rotation
            let dir = self.target - pos;
            let look_rot = UnitQuaternion::face_towards(&dir, &Vector3::y());

            cam.local_transform_mut()
                .set_position(pos)
                .set_rotation(look_rot);
        }
    }

    fn reset_view(&mut self) {
        self.yaw = 0.0;
        self.pitch = 0.3;
    }
}

impl Plugin for CadViewer {
    fn init(&mut self, _scene_path: Option<&str>, context: PluginContext) {
        self.initialize(context);
    }

    fn update(&mut self, context: &mut PluginContext) {
        self.start_import_if_needed();

        // Apply import results, if any.
        let mut results = Vec::new();
        if let Some(rx) = &self.rx {
            while let Ok(msg) = rx.try_recv() {
                results.push(msg);
            }
        }
        for msg in results {
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
                        if let Key::Character(c) = &event.logical_key {
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
