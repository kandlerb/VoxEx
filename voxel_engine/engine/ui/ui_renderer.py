"""Core UI rendering utilities."""
import numpy as np
from numpy.typing import NDArray
import moderngl
from typing import List, Tuple, Optional

from engine.ui.shaders import (
    SOLID_VERTEX_SHADER, SOLID_FRAGMENT_SHADER,
    TEXT_VERTEX_SHADER, TEXT_FRAGMENT_SHADER
)
from engine.ui.orthographic import orthographic_matrix
from engine.ui.bitmap_font import BitmapFont


class UIRenderer:
    """
    Batched 2D UI renderer.

    Collects quads and renders in batches for efficiency.
    Supports solid rectangles and text rendering.
    """

    __slots__ = (
        '_ctx', '_width', '_height', '_projection',
        '_solid_program', '_text_program', '_font',
        '_solid_vbo', '_solid_vao',
        '_text_vbo', '_text_vao',
        '_text_vertices', '_text_count', '_max_text_batch'
    )

    def __init__(self, ctx: moderngl.Context, width: int, height: int):
        """
        Create UI renderer.

        @param ctx: ModernGL context.
        @param width: Screen width in pixels.
        @param height: Screen height in pixels.
        """
        self._ctx = ctx
        self._width = width
        self._height = height
        self._projection = orthographic_matrix(width, height)

        # Compile shaders
        self._solid_program = ctx.program(
            vertex_shader=SOLID_VERTEX_SHADER,
            fragment_shader=SOLID_FRAGMENT_SHADER
        )
        self._text_program = ctx.program(
            vertex_shader=TEXT_VERTEX_SHADER,
            fragment_shader=TEXT_FRAGMENT_SHADER
        )

        # Create font
        self._font = BitmapFont(ctx, scale=2)

        # Create VBO for solid shapes (dynamic, reused)
        # Max 6 vertices per rect, 2 floats per vertex
        self._solid_vbo = ctx.buffer(reserve=6 * 2 * 4)
        self._solid_vao = ctx.vertex_array(
            self._solid_program,
            [(self._solid_vbo, '2f', 'in_position')]
        )

        # Create dynamic VBO for text quads
        # Format: x, y, u, v, r, g, b, a (8 floats per vertex, 6 vertices per quad)
        self._max_text_batch = 500
        self._text_vertices: List[float] = []
        self._text_count = 0

        self._text_vbo = ctx.buffer(reserve=self._max_text_batch * 6 * 8 * 4)
        self._text_vao = ctx.vertex_array(
            self._text_program,
            [(self._text_vbo, '2f 2f 4f', 'in_position', 'in_uv', 'in_color')]
        )

    def resize(self, width: int, height: int) -> None:
        """
        Update viewport size.

        @param width: New width in pixels.
        @param height: New height in pixels.
        """
        self._width = width
        self._height = height
        self._projection = orthographic_matrix(width, height)

    def begin(self) -> None:
        """Begin UI rendering frame."""
        self._text_vertices.clear()
        self._text_count = 0

        # Set up 2D rendering state
        self._ctx.disable(moderngl.DEPTH_TEST)
        self._ctx.enable(moderngl.BLEND)
        self._ctx.blend_func = moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA

    def end(self) -> None:
        """End UI rendering frame and flush batches."""
        self._flush_text_batch()

        # Restore 3D state
        self._ctx.enable(moderngl.DEPTH_TEST)
        self._ctx.disable(moderngl.BLEND)

    def _flush_text_batch(self) -> None:
        """Flush pending text quads."""
        if self._text_count == 0:
            return

        # Upload vertex data
        data = np.array(self._text_vertices, dtype=np.float32)
        self._text_vbo.write(data.tobytes())

        # Set uniforms
        self._text_program['u_projection'].write(self._projection.tobytes())
        self._font.texture.use(0)
        self._text_program['u_texture'].value = 0

        # Draw
        self._text_vao.render(moderngl.TRIANGLES, vertices=self._text_count * 6)

        # Clear batch
        self._text_vertices.clear()
        self._text_count = 0

    def draw_rect(self, x: float, y: float, w: float, h: float,
                  color: Tuple[int, int, int, int]) -> None:
        """
        Draw a solid colored rectangle.

        @param x: Left edge X coordinate.
        @param y: Top edge Y coordinate.
        @param w: Width in pixels.
        @param h: Height in pixels.
        @param color: RGBA color tuple (0-255 each).
        """
        # Flush any pending text quads first
        self._flush_text_batch()

        vertices = np.array([
            x, y,
            x + w, y,
            x + w, y + h,
            x, y,
            x + w, y + h,
            x, y + h
        ], dtype=np.float32)

        self._solid_vbo.write(vertices.tobytes())

        self._solid_program['u_projection'].write(self._projection.tobytes())
        self._solid_program['u_color'].write(np.array([
            color[0] / 255.0, color[1] / 255.0,
            color[2] / 255.0, color[3] / 255.0
        ], dtype=np.float32).tobytes())

        self._solid_vao.render(moderngl.TRIANGLES, vertices=6)

    def draw_text(self, text: str, x: float, y: float,
                  color: Tuple[int, int, int, int] = (255, 255, 255, 255),
                  scale: float = 1.0) -> None:
        """
        Draw text string.

        @param text: Text to render.
        @param x: Left edge X coordinate.
        @param y: Top edge Y coordinate.
        @param color: RGBA color tuple (0-255 each).
        @param scale: Additional scale factor.
        """
        r = color[0] / 255.0
        g = color[1] / 255.0
        b = color[2] / 255.0
        a = color[3] / 255.0
        char_w = self._font.char_width * scale
        char_h = self._font.char_height * scale

        cursor_x = x
        start_x = x

        for char in text:
            if char == '\n':
                cursor_x = start_x
                y += char_h
                continue

            u0, v0, u1, v1 = self._font.get_char_uv(char)

            # Add quad vertices (2 triangles)
            # Vertex format: x, y, u, v, r, g, b, a
            self._text_vertices.extend([
                cursor_x, y, u0, v0, r, g, b, a,
                cursor_x + char_w, y, u1, v0, r, g, b, a,
                cursor_x + char_w, y + char_h, u1, v1, r, g, b, a,
                cursor_x, y, u0, v0, r, g, b, a,
                cursor_x + char_w, y + char_h, u1, v1, r, g, b, a,
                cursor_x, y + char_h, u0, v1, r, g, b, a,
            ])

            self._text_count += 1
            cursor_x += char_w

            # Flush if batch full
            if self._text_count >= self._max_text_batch:
                self._flush_text_batch()

    def draw_crosshair(self, size: int = 20, thickness: int = 2,
                       color: Tuple[int, int, int, int] = (255, 255, 255, 200)) -> None:
        """
        Draw crosshair at screen center.

        @param size: Total size in pixels.
        @param thickness: Line thickness in pixels.
        @param color: RGBA color tuple.
        """
        cx = self._width // 2
        cy = self._height // 2
        half = size // 2
        ht = thickness // 2

        # Horizontal line
        self.draw_rect(cx - half, cy - ht, size, thickness, color)
        # Vertical line
        self.draw_rect(cx - ht, cy - half, thickness, size, color)

    def measure_text(self, text: str, scale: float = 1.0) -> Tuple[float, float]:
        """
        Measure text dimensions.

        @param text: Text to measure.
        @param scale: Scale factor.
        @returns: Tuple of (width, height) in pixels.
        """
        lines = text.split('\n')
        max_width = max(len(line) for line in lines) if lines else 0

        width = max_width * self._font.char_width * scale
        height = len(lines) * self._font.char_height * scale

        return (width, height)

    @property
    def width(self) -> int:
        """Get screen width."""
        return self._width

    @property
    def height(self) -> int:
        """Get screen height."""
        return self._height

    def release(self) -> None:
        """Release GPU resources."""
        self._text_vao.release()
        self._text_vbo.release()
        self._solid_vao.release()
        self._solid_vbo.release()
        self._solid_program.release()
        self._text_program.release()
        self._font.release()
