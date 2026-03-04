// ============================================================
// Outline Shader — selection outline via jump-flood algorithm
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

struct OutlineUniforms {
    outline_color: vec4<f32>,
    outline_width: f32,
    _pad: vec3<f32>,
};
@group(1) @binding(0) var<uniform> outline: OutlineUniforms;
@group(1) @binding(1) var selection_mask: texture_2d<f32>;
@group(1) @binding(2) var mask_sampler: sampler;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Full-screen triangle
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    // Full-screen triangle trick
    let uv = vec2<f32>(
        f32((vertex_index << 1u) & 2u),
        f32(vertex_index & 2u),
    );
    out.uv = uv;
    out.clip_position = vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
    out.clip_position.y = -out.clip_position.y;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let texel_size = 1.0 / camera.viewport_size;
    let center = textureSample(selection_mask, mask_sampler, in.uv).r;

    // Sobel-like edge detection on selection mask
    var max_diff = 0.0;
    let width = outline.outline_width;

    for (var x = -width; x <= width; x += 1.0) {
        for (var y = -width; y <= width; y += 1.0) {
            let offset = vec2<f32>(x, y) * texel_size;
            let sample_val = textureSample(selection_mask, mask_sampler, in.uv + offset).r;
            max_diff = max(max_diff, abs(center - sample_val));
        }
    }

    if max_diff < 0.01 {
        discard;
    }

    return vec4<f32>(outline.outline_color.rgb, outline.outline_color.a * max_diff);
}
