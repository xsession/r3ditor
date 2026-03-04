// ============================================================
// PBR Shader — Physically Based Rendering (Cook-Torrance BRDF)
// r3ditor GPU pipeline
// ============================================================

// -- Bind Group 0: Camera --
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

// -- Bind Group 1: Object --
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

// -- Bind Group 2: Lighting --
struct DirectionalLight {
    direction: vec3<f32>,
    _pad0: f32,
    color: vec3<f32>,
    intensity: f32,
};

struct PointLight {
    position: vec3<f32>,
    _pad0: f32,
    color: vec3<f32>,
    intensity: f32,
    range: f32,
    _pad1: vec3<f32>,
};

struct LightUniforms {
    directional: DirectionalLight,
    ambient_color: vec3<f32>,
    ambient_intensity: f32,
    point_light_count: u32,
    _pad: vec3<u32>,
};
@group(2) @binding(0) var<uniform> lights: LightUniforms;
@group(2) @binding(1) var<storage, read> point_lights: array<PointLight>;

// -- Vertex input/output --
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

// ============================================================
// Vertex Shader
// ============================================================
@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    let world_pos = object.model * vec4<f32>(in.position, 1.0);
    out.world_position = world_pos.xyz;
    out.clip_position = camera.view_proj * world_pos;
    out.world_normal = normalize((object.normal_matrix * vec4<f32>(in.normal, 0.0)).xyz);
    out.uv = in.uv;

    return out;
}

// ============================================================
// PBR Functions
// ============================================================
const PI: f32 = 3.14159265359;

// Trowbridge-Reitz GGX Normal Distribution Function
fn distribution_ggx(n: vec3<f32>, h: vec3<f32>, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let n_dot_h = max(dot(n, h), 0.0);
    let n_dot_h2 = n_dot_h * n_dot_h;

    let denom = n_dot_h2 * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom);
}

// Schlick-GGX Geometry Function
fn geometry_schlick_ggx(n_dot_v: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return n_dot_v / (n_dot_v * (1.0 - k) + k);
}

// Smith's Geometry Function
fn geometry_smith(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, roughness: f32) -> f32 {
    let n_dot_v = max(dot(n, v), 0.0);
    let n_dot_l = max(dot(n, l), 0.0);
    let ggx1 = geometry_schlick_ggx(n_dot_v, roughness);
    let ggx2 = geometry_schlick_ggx(n_dot_l, roughness);
    return ggx1 * ggx2;
}

// Fresnel-Schlick Approximation
fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

// Calculate Cook-Torrance BRDF for a single light
fn cook_torrance_brdf(
    n: vec3<f32>,
    v: vec3<f32>,
    l: vec3<f32>,
    light_color: vec3<f32>,
    light_intensity: f32,
    albedo: vec3<f32>,
    metallic: f32,
    roughness: f32,
) -> vec3<f32> {
    let h = normalize(v + l);

    let n_dot_l = max(dot(n, l), 0.0);
    if n_dot_l <= 0.0 {
        return vec3<f32>(0.0);
    }

    // F0 — reflectance at normal incidence
    let f0 = mix(vec3<f32>(0.04), albedo, metallic);

    // Cook-Torrance BRDF terms
    let d = distribution_ggx(n, h, roughness);
    let g = geometry_smith(n, v, l, roughness);
    let f = fresnel_schlick(max(dot(h, v), 0.0), f0);

    // Specular
    let numerator = d * g * f;
    let denominator = 4.0 * max(dot(n, v), 0.0) * n_dot_l + 0.0001;
    let specular = numerator / denominator;

    // Energy conservation
    let ks = f;
    let kd = (vec3<f32>(1.0) - ks) * (1.0 - metallic);

    // Lambertian diffuse
    let diffuse = kd * albedo / PI;

    let radiance = light_color * light_intensity;
    return (diffuse + specular) * radiance * n_dot_l;
}

// ============================================================
// Fragment Shader
// ============================================================
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let n = normalize(in.world_normal);
    let v = normalize(camera.camera_position - in.world_position);

    let albedo = object.base_color.rgb;
    let metallic = object.metallic;
    let roughness = max(object.roughness, 0.04); // minimum roughness to avoid divide-by-zero
    let alpha = object.base_color.a;

    var lo = vec3<f32>(0.0);

    // Directional light
    let dir_l = normalize(-lights.directional.direction);
    lo += cook_torrance_brdf(
        n, v, dir_l,
        lights.directional.color,
        lights.directional.intensity,
        albedo, metallic, roughness,
    );

    // Point lights
    for (var i = 0u; i < lights.point_light_count; i++) {
        let light = point_lights[i];
        let light_vec = light.position - in.world_position;
        let distance = length(light_vec);

        if distance > light.range {
            continue;
        }

        let l = normalize(light_vec);
        let attenuation = 1.0 / (distance * distance + 1.0);
        let effective_intensity = light.intensity * attenuation;

        lo += cook_torrance_brdf(
            n, v, l,
            light.color,
            effective_intensity,
            albedo, metallic, roughness,
        );
    }

    // Ambient
    let ambient = lights.ambient_color * lights.ambient_intensity * albedo;
    var color = ambient + lo;

    // Emissive
    color += albedo * object.emissive_strength;

    // Selection highlight (additive rim light)
    if object.selected > 0.5 {
        let rim = 1.0 - max(dot(n, v), 0.0);
        let rim_power = pow(rim, 3.0);
        color += vec3<f32>(0.2, 0.5, 1.0) * rim_power * 0.8;
    }

    // Tone mapping (ACES approximation)
    color = aces_tonemap(color);

    // Gamma correction
    color = pow(color, vec3<f32>(1.0 / 2.2));

    return vec4<f32>(color, alpha);
}

// ACES Filmic Tone Mapping
fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

// ============================================================
// Wireframe Fragment Variant
// ============================================================
@fragment
fn fs_wireframe(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.8, 0.8, 0.8, 1.0);
}

// ============================================================
// X-Ray Fragment Variant (semi-transparent + edge highlight)
// ============================================================
@fragment
fn fs_xray(in: VertexOutput) -> @location(0) vec4<f32> {
    let n = normalize(in.world_normal);
    let v = normalize(camera.camera_position - in.world_position);
    let facing = abs(dot(n, v));

    // Edges appear brighter, faces more transparent
    let edge_factor = 1.0 - facing;
    let color = mix(
        object.base_color.rgb * 0.3,
        vec3<f32>(0.6, 0.8, 1.0),
        edge_factor,
    );
    let alpha_val = mix(0.1, 0.8, edge_factor);

    return vec4<f32>(color, alpha_val);
}
