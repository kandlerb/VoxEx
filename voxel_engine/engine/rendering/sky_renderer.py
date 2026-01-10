"""
Sky rendering with gradient and sun.

Renders a sky background using a cube geometry that always appears
behind all other geometry. Supports day/night cycle with gradient
colors and sun glow effect.

Usage:
    from voxel_engine.engine.rendering.sky_renderer import SkyRenderer

    sky = SkyRenderer(ctx)
    sky.render(view_rotation, projection, time_of_day=0.5)
"""

import numpy as np
from numpy.typing import NDArray
from typing import TYPE_CHECKING

from voxel_engine.engine.rendering.shaders import (
    SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER
)

if TYPE_CHECKING:
    import moderngl


class SkyRenderer:
    """
    Renders sky background.

    Uses a cube rendered at maximum depth to create an infinite
    sky effect. Supports time-of-day coloring.
    """

    __slots__ = ('_ctx', '_program', '_vao', '_vbo', '_ibo')

    def __init__(self, ctx: "moderngl.Context"):
        """
        Initialize sky renderer.

        Args:
            ctx: ModernGL context.
        """
        self._ctx = ctx

        # Compile sky shader
        self._program = ctx.program(
            vertex_shader=SKY_VERTEX_SHADER,
            fragment_shader=SKY_FRAGMENT_SHADER
        )

        # Create skybox cube geometry
        # Simple cube vertices (will be transformed by rotation only)
        vertices = np.array([
            # Back face (-Z)
            -1, -1, -1,   1, -1, -1,   1,  1, -1,  -1,  1, -1,
            # Front face (+Z)
            -1, -1,  1,  -1,  1,  1,   1,  1,  1,   1, -1,  1,
            # Top face (+Y)
            -1,  1, -1,  -1,  1,  1,   1,  1,  1,   1,  1, -1,
            # Bottom face (-Y)
            -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,
            # Left face (-X)
            -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1,
            # Right face (+X)
             1, -1, -1,   1,  1, -1,   1,  1,  1,   1, -1,  1,
        ], dtype=np.float32)

        # Indices for 6 faces (2 triangles each)
        indices = np.array([
            0, 1, 2, 0, 2, 3,        # Back
            4, 5, 6, 4, 6, 7,        # Front
            8, 9, 10, 8, 10, 11,     # Top
            12, 13, 14, 12, 14, 15,  # Bottom
            16, 17, 18, 16, 18, 19,  # Left
            20, 21, 22, 20, 22, 23,  # Right
        ], dtype=np.uint32)

        self._vbo = ctx.buffer(vertices.tobytes())
        self._ibo = ctx.buffer(indices.tobytes())
        self._vao = ctx.vertex_array(
            self._program,
            [(self._vbo, '3f', 'in_position')],
            self._ibo
        )

    def render(
        self,
        view_rotation: NDArray[np.float32],
        projection: NDArray[np.float32],
        time_of_day: float = 0.5
    ) -> None:
        """
        Render sky.

        Should be called before rendering terrain, with depth test disabled.

        Args:
            view_rotation: View matrix with only rotation (no translation).
            projection: Projection matrix.
            time_of_day: Progress through day cycle (0.0=midnight, 0.5=noon).
        """
        # Calculate sky colors based on time
        # 0.0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 1.0 = midnight
        day_factor = self._calculate_day_factor(time_of_day)

        # Base colors for day
        sky_top_day = np.array([0.2, 0.4, 0.8], dtype=np.float32)
        sky_horizon_day = np.array([0.6, 0.7, 0.9], dtype=np.float32)

        # Base colors for night
        sky_top_night = np.array([0.05, 0.05, 0.15], dtype=np.float32)
        sky_horizon_night = np.array([0.1, 0.1, 0.2], dtype=np.float32)

        # Interpolate colors
        sky_top = sky_top_day * day_factor + sky_top_night * (1 - day_factor)
        sky_horizon = sky_horizon_day * day_factor + sky_horizon_night * (1 - day_factor)

        # Sun direction based on time
        sun_dir = self._calculate_sun_direction(time_of_day)

        # Set uniforms
        self._program['u_view_rotation'].write(view_rotation.tobytes())
        self._program['u_projection'].write(projection.tobytes())
        self._program['u_sky_top'].write(sky_top.tobytes())
        self._program['u_sky_horizon'].write(sky_horizon.tobytes())
        self._program['u_sun_direction'].write(sun_dir.tobytes())

        # Render with depth test disabled (always behind)
        # The shader sets gl_Position.z = gl_Position.w to push to far plane
        self._ctx.disable(self._ctx.DEPTH_TEST)
        self._vao.render()
        self._ctx.enable(self._ctx.DEPTH_TEST)

    def _calculate_day_factor(self, time_of_day: float) -> float:
        """
        Calculate daylight factor from time.

        Args:
            time_of_day: 0.0 = midnight, 0.5 = noon.

        Returns:
            float: Brightness factor 0.0 (night) to 1.0 (day).
        """
        # Smooth transition using sin curve
        # Peak at 0.5 (noon), trough at 0.0/1.0 (midnight)
        import math
        return max(0.0, math.sin(time_of_day * math.pi)) ** 0.5

    def _calculate_sun_direction(self, time_of_day: float) -> NDArray[np.float32]:
        """
        Calculate sun direction from time.

        Args:
            time_of_day: Progress through day cycle.

        Returns:
            NDArray: Normalized sun direction vector.
        """
        import math

        # Sun rises at 0.25, peaks at 0.5, sets at 0.75
        sun_angle = (time_of_day - 0.25) * math.pi * 2

        sun_dir = np.array([
            math.cos(sun_angle),
            math.sin(sun_angle),
            0.3  # Slight tilt toward north
        ], dtype=np.float32)

        # Normalize
        length = np.linalg.norm(sun_dir)
        if length > 0:
            sun_dir /= length

        return sun_dir

    def get_sun_direction(self, time_of_day: float) -> NDArray[np.float32]:
        """
        Get sun direction for external use (e.g., lighting).

        Args:
            time_of_day: Progress through day cycle.

        Returns:
            NDArray: Normalized sun direction vector.
        """
        return self._calculate_sun_direction(time_of_day)

    def get_sky_colors(self, time_of_day: float) -> tuple:
        """
        Get sky colors for fog matching.

        Args:
            time_of_day: Progress through day cycle.

        Returns:
            tuple: (sky_top, sky_horizon) as float32 arrays.
        """
        day_factor = self._calculate_day_factor(time_of_day)

        sky_top_day = np.array([0.2, 0.4, 0.8], dtype=np.float32)
        sky_horizon_day = np.array([0.6, 0.7, 0.9], dtype=np.float32)
        sky_top_night = np.array([0.05, 0.05, 0.15], dtype=np.float32)
        sky_horizon_night = np.array([0.1, 0.1, 0.2], dtype=np.float32)

        sky_top = sky_top_day * day_factor + sky_top_night * (1 - day_factor)
        sky_horizon = sky_horizon_day * day_factor + sky_horizon_night * (1 - day_factor)

        return sky_top, sky_horizon

    def release(self) -> None:
        """Release GPU resources."""
        if self._vao is not None:
            self._vao.release()
            self._vao = None
        if self._vbo is not None:
            self._vbo.release()
            self._vbo = None
        if self._ibo is not None:
            self._ibo.release()
            self._ibo = None
        if self._program is not None:
            self._program.release()
            self._program = None
