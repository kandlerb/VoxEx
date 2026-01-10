"""
Block selection outline rendering.

Renders a wireframe cube around the currently targeted block
to show the player which block they're looking at.

Usage:
    from voxel_engine.engine.rendering.block_outline import BlockOutlineRenderer

    outline = BlockOutlineRenderer(ctx)
    outline.set_target((10, 64, 10))
    outline.render(view, projection)
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    import moderngl


# Simple wireframe shader
OUTLINE_VERTEX_SHADER = """
#version 330 core

in vec3 in_position;

uniform mat4 u_mvp;

void main() {
    gl_Position = u_mvp * vec4(in_position, 1.0);
}
"""

OUTLINE_FRAGMENT_SHADER = """
#version 330 core

uniform vec3 u_color;

out vec4 frag_color;

void main() {
    frag_color = vec4(u_color, 1.0);
}
"""

# Line vertices for a unit cube wireframe (24 vertices for 12 lines)
# Each line has 2 vertices, each vertex has 3 floats (x, y, z)
CUBE_LINES = np.array([
    # Bottom face (y=0)
    0, 0, 0,  1, 0, 0,
    1, 0, 0,  1, 0, 1,
    1, 0, 1,  0, 0, 1,
    0, 0, 1,  0, 0, 0,
    # Top face (y=1)
    0, 1, 0,  1, 1, 0,
    1, 1, 0,  1, 1, 1,
    1, 1, 1,  0, 1, 1,
    0, 1, 1,  0, 1, 0,
    # Vertical edges
    0, 0, 0,  0, 1, 0,
    1, 0, 0,  1, 1, 0,
    1, 0, 1,  1, 1, 1,
    0, 0, 1,  0, 1, 1,
], dtype=np.float32)


class BlockOutlineRenderer:
    """
    Renders wireframe outline around selected block.

    Uses a pre-built unit cube that is translated to the target
    block position via the model matrix.
    """

    __slots__ = (
        '_ctx', '_program', '_vao', '_vbo', '_visible',
        '_block_pos', '_outline_scale', '_color'
    )

    def __init__(self, ctx: "moderngl.Context"):
        """
        Initialize block outline renderer.

        Args:
            ctx: ModernGL context.
        """
        self._ctx = ctx
        self._visible = False
        self._block_pos: Optional[Tuple[int, int, int]] = None
        self._outline_scale = 1.002  # Slightly larger to prevent z-fighting
        self._color = np.array([0.1, 0.1, 0.1], dtype=np.float32)  # Dark gray

        # Compile shader
        self._program = ctx.program(
            vertex_shader=OUTLINE_VERTEX_SHADER,
            fragment_shader=OUTLINE_FRAGMENT_SHADER
        )

        # Create VAO
        self._vbo = ctx.buffer(CUBE_LINES.tobytes())
        self._vao = ctx.vertex_array(
            self._program,
            [(self._vbo, '3f', 'in_position')]
        )

    def set_target(self, block_pos: Optional[Tuple[int, int, int]]) -> None:
        """
        Set the block to highlight, or None to hide.

        Args:
            block_pos: (x, y, z) position of block to highlight, or None.
        """
        self._block_pos = block_pos
        self._visible = block_pos is not None

    def set_color(self, r: float, g: float, b: float) -> None:
        """
        Set the outline color.

        Args:
            r: Red component (0-1).
            g: Green component (0-1).
            b: Blue component (0-1).
        """
        self._color[0] = r
        self._color[1] = g
        self._color[2] = b

    @property
    def visible(self) -> bool:
        """Whether the outline is visible."""
        return self._visible

    @visible.setter
    def visible(self, value: bool) -> None:
        """Set outline visibility."""
        self._visible = value

    def render(
        self,
        view: NDArray[np.float32],
        projection: NDArray[np.float32]
    ) -> None:
        """
        Render the block outline.

        Args:
            view: View matrix (4x4 float32).
            projection: Projection matrix (4x4 float32).
        """
        if not self._visible or self._block_pos is None:
            return

        bx, by, bz = self._block_pos

        # Create model matrix (translate to block position with slight scale)
        # We scale from the center of the block to prevent z-fighting
        model = np.eye(4, dtype=np.float32)

        # Scale factor and offset to center the scale
        scale = self._outline_scale
        offset = (1.0 - scale) / 2.0

        model[0, 0] = scale
        model[1, 1] = scale
        model[2, 2] = scale
        model[3, 0] = bx - offset
        model[3, 1] = by - offset
        model[3, 2] = bz - offset

        # Calculate MVP (row-major matrices for OpenGL)
        mvp = projection @ view @ model

        # Set uniforms
        self._program['u_mvp'].write(mvp.tobytes())
        self._program['u_color'].write(self._color.tobytes())

        # Render lines with depth test on but write disabled
        # This ensures outline is hidden when behind blocks
        self._vao.render(mode=self._ctx.LINES)

    def release(self) -> None:
        """Release GPU resources."""
        if self._vao is not None:
            self._vao.release()
            self._vao = None
        if self._vbo is not None:
            self._vbo.release()
            self._vbo = None
        if self._program is not None:
            self._program.release()
            self._program = None
