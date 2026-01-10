"""Shaders for 2D UI rendering."""

UI_VERTEX_SHADER = """
#version 330 core

in vec2 in_position;
in vec2 in_uv;
in vec4 in_color;

uniform mat4 u_projection;

out vec2 v_uv;
out vec4 v_color;

void main() {
    gl_Position = u_projection * vec4(in_position, 0.0, 1.0);
    v_uv = in_uv;
    v_color = in_color;
}
"""

UI_FRAGMENT_SHADER = """
#version 330 core

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;
uniform bool u_use_texture;

out vec4 frag_color;

void main() {
    if (u_use_texture) {
        vec4 tex_color = texture(u_texture, v_uv);
        frag_color = tex_color * v_color;
    } else {
        frag_color = v_color;
    }
}
"""

# Simple solid color shader for shapes
SOLID_VERTEX_SHADER = """
#version 330 core

in vec2 in_position;

uniform mat4 u_projection;

void main() {
    gl_Position = u_projection * vec4(in_position, 0.0, 1.0);
}
"""

SOLID_FRAGMENT_SHADER = """
#version 330 core

uniform vec4 u_color;

out vec4 frag_color;

void main() {
    frag_color = u_color;
}
"""

# Text shader with single-channel texture (for bitmap font)
TEXT_VERTEX_SHADER = """
#version 330 core

in vec2 in_position;
in vec2 in_uv;
in vec4 in_color;

uniform mat4 u_projection;

out vec2 v_uv;
out vec4 v_color;

void main() {
    gl_Position = u_projection * vec4(in_position, 0.0, 1.0);
    v_uv = in_uv;
    v_color = in_color;
}
"""

TEXT_FRAGMENT_SHADER = """
#version 330 core

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;

out vec4 frag_color;

void main() {
    float alpha = texture(u_texture, v_uv).r;
    frag_color = vec4(v_color.rgb, v_color.a * alpha);
}
"""
