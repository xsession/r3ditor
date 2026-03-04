// ============================================================
// Toolpath Visualization Shader — color-coded by feed rate
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

struct ToolpathUniforms {
    model: mat4x4<f32>,
    rapid_color: vec4<f32>,
    feed_color: vec4<f32>,
    plunge_color: vec4<f32>,
    line_width: f32,
    animation_progress: f32, // 0.0 to 1.0 for animated playback
    max_feed_rate: f32,
    _pad: f32,
};
@group(1) @binding(0) var<uniform> toolpath: ToolpathUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) feed_rate: f32,     // mm/min; 0 = rapid
    @location(2) progress: f32,      // 0.0 to 1.0 along path
    @location(3) move_type: u32,     // 0=rapid, 1=feed, 2=plunge
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) progress: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = toolpath.model * vec4<f32>(in.position, 1.0);
    out.clip_position = camera.view_proj * world_pos;

    // Color by move type
    switch in.move_type {
        case 0u: { out.color = toolpath.rapid_color; }  // rapid (yellow dashed)
        case 1u: {
            // Feed — color by feed rate (blue=slow → red=fast)
            let t = clamp(in.feed_rate / toolpath.max_feed_rate, 0.0, 1.0);
            out.color = mix(
                vec4<f32>(0.2, 0.4, 1.0, 1.0), // slow = blue
                vec4<f32>(1.0, 0.2, 0.2, 1.0), // fast = red
                t,
            );
        }
        case 2u: { out.color = toolpath.plunge_color; }  // plunge (green)
        default: { out.color = vec4<f32>(1.0); }
    }

    out.progress = in.progress;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Fade out segments beyond animation progress
    if in.progress > toolpath.animation_progress {
        discard;
    }

    // Highlight leading edge
    let edge_dist = toolpath.animation_progress - in.progress;
    var color = in.color;
    if edge_dist < 0.005 {
        color = vec4<f32>(1.0, 1.0, 1.0, 1.0); // white leading edge
    }

    return color;
}
