"""
GLSL shader sources for voxel rendering.

Contains vertex and fragment shaders for:
- Voxel terrain (textured with AO, lighting, fog)
- Sky background (gradient with sun glow)

Targets OpenGL 3.3 core profile for broad compatibility.
"""

# =============================================================================
# VOXEL TERRAIN SHADERS
# =============================================================================

VOXEL_VERTEX_SHADER: str = """
#version 330 core

// Vertex attributes
in vec3 in_position;
in vec3 in_normal;
in vec2 in_uv;
in vec3 in_color;  // AO baked into vertex color

// Uniforms
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

// Outputs to fragment shader
out vec3 v_position;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_color;
out float v_fog_depth;

void main() {
    vec4 world_pos = u_model * vec4(in_position, 1.0);
    vec4 view_pos = u_view * world_pos;

    gl_Position = u_projection * view_pos;

    v_position = world_pos.xyz;
    v_normal = mat3(u_model) * in_normal;
    v_uv = in_uv;
    v_color = in_color;
    v_fog_depth = length(view_pos.xyz);
}
"""

VOXEL_FRAGMENT_SHADER: str = """
#version 330 core

// Inputs from vertex shader
in vec3 v_position;
in vec3 v_normal;
in vec2 v_uv;
in vec3 v_color;
in float v_fog_depth;

// Uniforms
uniform sampler2D u_texture;
uniform vec3 u_sun_direction;
uniform vec3 u_sun_color;
uniform vec3 u_ambient_color;
uniform vec3 u_fog_color;
uniform float u_fog_start;
uniform float u_fog_end;

// Output
out vec4 frag_color;

void main() {
    // Sample texture
    vec4 tex_color = texture(u_texture, v_uv);

    // Discard fully transparent pixels
    if (tex_color.a < 0.1) {
        discard;
    }

    // Simple directional lighting
    vec3 normal = normalize(v_normal);
    float n_dot_l = max(dot(normal, u_sun_direction), 0.0);
    vec3 diffuse = u_sun_color * n_dot_l;

    // Combine lighting with AO (v_color is grayscale AO)
    vec3 lighting = (u_ambient_color + diffuse) * v_color;

    // Apply lighting to texture
    vec3 lit_color = tex_color.rgb * lighting;

    // Fog calculation (linear)
    float fog_factor = clamp((v_fog_depth - u_fog_start) / (u_fog_end - u_fog_start), 0.0, 1.0);
    vec3 final_color = mix(lit_color, u_fog_color, fog_factor);

    frag_color = vec4(final_color, tex_color.a);
}
"""

# =============================================================================
# SKY SHADERS
# =============================================================================

SKY_VERTEX_SHADER: str = """
#version 330 core

in vec3 in_position;
out vec3 v_direction;

uniform mat4 u_view_rotation;
uniform mat4 u_projection;

void main() {
    v_direction = in_position;
    vec4 pos = u_projection * u_view_rotation * vec4(in_position, 1.0);
    gl_Position = pos.xyww;  // Force depth to max (behind everything)
}
"""

SKY_FRAGMENT_SHADER: str = """
#version 330 core

in vec3 v_direction;
out vec4 frag_color;

uniform vec3 u_sky_top;
uniform vec3 u_sky_horizon;
uniform vec3 u_sun_direction;

void main() {
    vec3 dir = normalize(v_direction);

    // Gradient from horizon to top
    float t = max(dir.y, 0.0);
    vec3 sky_color = mix(u_sky_horizon, u_sky_top, t);

    // Simple sun glow
    float sun_dot = max(dot(dir, u_sun_direction), 0.0);
    float sun_glow = pow(sun_dot, 64.0);
    sky_color += vec3(1.0, 0.9, 0.7) * sun_glow * 0.5;

    frag_color = vec4(sky_color, 1.0);
}
"""

# =============================================================================
# DEBUG SHADERS (for visualizing normals, wireframes, etc.)
# =============================================================================

DEBUG_VERTEX_SHADER: str = """
#version 330 core

in vec3 in_position;
in vec3 in_color;

uniform mat4 u_mvp;

out vec3 v_color;

void main() {
    gl_Position = u_mvp * vec4(in_position, 1.0);
    v_color = in_color;
}
"""

DEBUG_FRAGMENT_SHADER: str = """
#version 330 core

in vec3 v_color;
out vec4 frag_color;

void main() {
    frag_color = vec4(v_color, 1.0);
}
"""
