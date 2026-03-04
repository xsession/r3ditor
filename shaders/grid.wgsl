// ============================================================
// Grid Shader — infinite ground grid with fade
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

struct GridUniforms {
    grid_color: vec4<f32>,
    axis_x_color: vec4<f32>,
    axis_z_color: vec4<f32>,
    grid_size: f32,
    grid_fade_start: f32,
    grid_fade_end: f32,
    line_width: f32,
};
@group(1) @binding(0) var<uniform> grid: GridUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
};

// Full-screen quad vertices
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Generate a large quad on the XZ plane
    let positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
    );

    let pos = positions[vertex_index];
    let scale = 1000.0;

    var out: VertexOutput;
    let world_pos = vec3<f32>(pos.x * scale, 0.0, pos.y * scale);
    out.world_pos = world_pos;
    out.clip_position = camera.view_proj * vec4<f32>(world_pos, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let coord = in.world_pos.xz / grid.grid_size;

    // Anti-aliased grid lines using screen-space derivatives
    let grid_deriv = fwidth(coord);
    let grid_line = abs(fract(coord - 0.5) - 0.5) / grid_deriv;
    let line = min(grid_line.x, grid_line.y);
    let grid_alpha = 1.0 - min(line, 1.0);

    if grid_alpha < 0.01 {
        discard;
    }

    // Color: axis lines vs grid lines
    var color = grid.grid_color.rgb;

    // X axis (red line along Z = 0)
    if abs(in.world_pos.z) < grid.grid_size * 0.05 {
        color = grid.axis_x_color.rgb;
    }

    // Z axis (blue line along X = 0)
    if abs(in.world_pos.x) < grid.grid_size * 0.05 {
        color = grid.axis_z_color.rgb;
    }

    // Distance fade
    let dist = length(in.world_pos.xz - camera.camera_position.xz);
    let fade = 1.0 - smoothstep(grid.grid_fade_start, grid.grid_fade_end, dist);

    return vec4<f32>(color, grid_alpha * fade * grid.grid_color.a);
}
