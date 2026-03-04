// ============================================================
// DFM Visualization Shader — color-maps DFM severity on faces
// r3ditor GPU pipeline
// ============================================================

struct CameraUniforms {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_proj: mat4x4<f32>,
    camera_position: vec3<f32>,
    _pad0: f32,
    viewport_size: vec2<f32>,
    near: f32,
    far: f32,
};
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct ObjectUniforms {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    base_color: vec4<f32>,
    metallic: f32,
    roughness: f32,
    emissive_strength: f32,
    selected: f32,
};
@group(1) @binding(0) var<uniform> object: ObjectUniforms;

// DFM data per-vertex (severity 0.0 = ok, 1.0 = critical)
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) dfm_severity: f32,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) severity: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = object.model * vec4<f32>(in.position, 1.0);
    out.world_position = world_pos.xyz;
    out.clip_position = camera.view_proj * world_pos;
    out.world_normal = normalize((object.normal_matrix * vec4<f32>(in.normal, 0.0)).xyz);
    out.severity = in.dfm_severity;
    return out;
}

// Color ramp: green → yellow → orange → red
fn severity_color(severity: f32) -> vec3<f32> {
    let s = clamp(severity, 0.0, 1.0);

    if s < 0.33 {
        // Green → Yellow
        let t = s / 0.33;
        return mix(vec3<f32>(0.2, 0.8, 0.2), vec3<f32>(1.0, 1.0, 0.2), t);
    } else if s < 0.66 {
        // Yellow → Orange
        let t = (s - 0.33) / 0.33;
        return mix(vec3<f32>(1.0, 1.0, 0.2), vec3<f32>(1.0, 0.5, 0.0), t);
    } else {
        // Orange → Red
        let t = (s - 0.66) / 0.34;
        return mix(vec3<f32>(1.0, 0.5, 0.0), vec3<f32>(1.0, 0.1, 0.1), t);
    }
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let n = normalize(in.world_normal);
    let v = normalize(camera.camera_position - in.world_position);

    // Simple directional lighting
    let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.3));
    let diffuse = max(dot(n, light_dir), 0.0) * 0.6 + 0.4;

    let base = severity_color(in.severity);
    let color = base * diffuse;

    return vec4<f32>(color, 1.0);
}
