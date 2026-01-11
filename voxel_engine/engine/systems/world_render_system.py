"""
World rendering FrameSystem.

Renders the voxel world each frame with:
- Frustum culling for visible chunks
- Two-pass rendering (opaque, then transparent)
- Sky background with day/night cycle
- Fog for distance fade

Usage:
    from voxel_engine.engine.systems import WorldRenderSystem
    from voxel_engine.engine.window import Window

    window = Window()
    render_system = WorldRenderSystem(window)
    game_loop.add_frame_system(render_system)
"""

import numpy as np
from numpy.typing import NDArray
from typing import List, Tuple, Optional, TYPE_CHECKING

from voxel_engine.engine.systems.base import FrameSystem
from voxel_engine.engine.rendering.shaders import (
    VOXEL_VERTEX_SHADER, VOXEL_FRAGMENT_SHADER
)
from voxel_engine.engine.rendering.camera import (
    Camera, fps_view_matrix, rotation_only_view
)
from voxel_engine.engine.rendering.frustum import Frustum
from voxel_engine.engine.rendering.texture import TextureAtlas
from voxel_engine.engine.rendering.chunk_renderer import ChunkRenderer
from voxel_engine.engine.rendering.sky_renderer import SkyRenderer
from voxel_engine.engine.physics.constants import PLAYER_EYE_HEIGHT
from voxel_engine.engine.meshing.constants import CHUNK_SIZE_X, CHUNK_SIZE_Z

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState
    from voxel_engine.engine.window import Window
    from voxel_engine.engine.meshing.chunk_mesh import ChunkMesh
    import moderngl


class WorldRenderSystem(FrameSystem):
    """
    Renders the voxel world each frame.

    Manages camera, frustum culling, chunk VAOs, and sky rendering.
    Uses two-pass rendering for correct transparency.

    Priority: 100 (runs last in frame systems)

    Attributes:
        render_distance: Render distance in chunks.
        draw_calls: Number of draw calls last frame.
        visible_chunk_count: Number of visible chunks last frame.
    """

    __slots__ = (
        '_window', '_camera', '_frustum', '_program', '_atlas',
        '_chunk_renderer', '_sky_renderer', '_draw_calls',
        '_visible_chunks', 'render_distance', '_initialized'
    )

    def __init__(
        self,
        window: "Window",
        render_distance: int = 8
    ):
        """
        Initialize world render system.

        Args:
            window: Window with ModernGL context.
            render_distance: Render distance in chunks (default 8).
        """
        super().__init__(priority=100)
        self._window = window
        self.render_distance = render_distance

        self._camera = Camera(
            fov=75.0,
            aspect=window.width / window.height if window else 16 / 9
        )
        self._frustum = Frustum()
        self._program: Optional["moderngl.Program"] = None
        self._atlas = TextureAtlas()
        self._chunk_renderer: Optional[ChunkRenderer] = None
        self._sky_renderer: Optional[SkyRenderer] = None

        self._draw_calls = 0
        self._visible_chunks: List[Tuple[int, int]] = []
        self._initialized = False

    def initialize(self, state: "GameState") -> None:
        """
        Set up rendering resources.

        Compiles shaders, creates texture atlas, initializes renderers.

        Args:
            state: Game state for initialization.
        """
        # Guard against double initialization
        if self._initialized:
            return

        if self._window is None:
            return

        ctx = self._window.ctx
        if ctx is None:
            return

        # Compile voxel shader
        self._program = ctx.program(
            vertex_shader=VOXEL_VERTEX_SHADER,
            fragment_shader=VOXEL_FRAGMENT_SHADER
        )

        # Initialize texture atlas
        self._atlas.initialize(ctx)

        # Initialize renderers
        self._chunk_renderer = ChunkRenderer(ctx, self._program)
        self._sky_renderer = SkyRenderer(ctx)

        # Set up OpenGL state
        ctx.enable(ctx.DEPTH_TEST)
        ctx.enable(ctx.CULL_FACE)
        ctx.front_face = 'ccw'
        ctx.cull_face = 'back'

        self._initialized = True

    def frame(self, state: "GameState", dt: float, alpha: float) -> None:
        """
        Render the world.

        Args:
            state: Game state to render.
            dt: Frame delta time.
            alpha: Interpolation factor between ticks.
        """
        if not self._initialized or self._window is None:
            return

        ctx = self._window.ctx
        if ctx is None:
            return

        player = state.player

        # Interpolate player position for smooth rendering
        pos = player.prev_position + alpha * (player.position - player.prev_position)
        eye_pos = pos.copy()
        eye_pos[1] += PLAYER_EYE_HEIGHT

        # Update camera
        view = fps_view_matrix(eye_pos.astype(np.float32), player.yaw, player.pitch)
        projection = self._camera.projection

        # Update frustum
        vp = projection @ view
        self._frustum.update(vp)

        # Find visible chunks
        self._visible_chunks.clear()
        player_cx = int(pos[0]) // CHUNK_SIZE_X
        player_cz = int(pos[2]) // CHUNK_SIZE_Z

        for dx in range(-self.render_distance, self.render_distance + 1):
            for dz in range(-self.render_distance, self.render_distance + 1):
                cx, cz = player_cx + dx, player_cz + dz
                if self._frustum.is_chunk_visible(cx, cz):
                    self._visible_chunks.append((cx, cz))

        # Sort transparent chunks back-to-front for correct blending
        def chunk_distance(chunk: Tuple[int, int]) -> float:
            cx, cz = chunk
            center_x = (cx * CHUNK_SIZE_X) + (CHUNK_SIZE_X / 2)
            center_z = (cz * CHUNK_SIZE_Z) + (CHUNK_SIZE_Z / 2)
            dx = center_x - pos[0]
            dz = center_z - pos[2]
            return dx * dx + dz * dz

        transparent_order = sorted(
            self._visible_chunks,
            key=chunk_distance,
            reverse=True
        )

        # Get time of day for sky/lighting
        time_of_day = state.world.get_day_progress()

        # Clear screen
        ctx.clear(0.5, 0.7, 1.0, 1.0, depth=1.0)

        # Render sky first
        view_rot = rotation_only_view(player.yaw, player.pitch).astype(np.float32)
        self._sky_renderer.render(view_rot, projection, time_of_day)

        # Set voxel shader uniforms
        model = np.eye(4, dtype=np.float32)
        self._program['u_model'].write(model.tobytes())
        self._program['u_view'].write(view.tobytes())
        self._program['u_projection'].write(projection.tobytes())

        # Lighting uniforms
        sun_dir = self._sky_renderer.get_sun_direction(time_of_day)
        day_factor = float(max(0.0, np.sin(time_of_day * np.pi)) ** 0.5)

        self._program['u_sun_direction'].value = tuple(sun_dir)
        self._program['u_sun_color'].value = (
            1.0 * day_factor,
            0.95 * day_factor,
            0.9 * day_factor
        )
        self._program['u_ambient_color'].value = (
            0.3 * day_factor + 0.1 * (1 - day_factor),
            0.35 * day_factor + 0.1 * (1 - day_factor),
            0.4 * day_factor + 0.15 * (1 - day_factor)
        )

        # Fog uniforms (match horizon color)
        _, sky_horizon = self._sky_renderer.get_sky_colors(time_of_day)
        self._program['u_fog_color'].value = tuple(sky_horizon)
        self._program['u_fog_start'].value = float(self.render_distance * CHUNK_SIZE_X * 0.75)
        self._program['u_fog_end'].value = float(self.render_distance * CHUNK_SIZE_X)

        # Bind texture
        self._atlas.use(0)
        self._program['u_texture'].value = 0

        # Render opaque geometry
        self._draw_calls = self._chunk_renderer.render_opaque(self._visible_chunks)

        # Render transparent geometry with blending
        ctx.enable(ctx.BLEND)
        ctx.blend_func = ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA
        self._draw_calls += self._chunk_renderer.render_transparent(transparent_order)
        ctx.disable(ctx.BLEND)

        # Swap buffers
        self._window.swap_buffers()

    def upload_chunk_mesh(self, mesh: "ChunkMesh") -> None:
        """
        Upload a chunk mesh to GPU.

        Args:
            mesh: ChunkMesh with geometry data.
        """
        if self._chunk_renderer is not None:
            self._chunk_renderer.upload_mesh(mesh)

    def remove_chunk(self, cx: int, cz: int) -> None:
        """
        Remove chunk from GPU.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        if self._chunk_renderer is not None:
            self._chunk_renderer.remove_chunk(cx, cz)

    def has_chunk(self, cx: int, cz: int) -> bool:
        """
        Check if chunk is uploaded to GPU.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            bool: True if chunk has GPU resources.
        """
        if self._chunk_renderer is not None:
            return self._chunk_renderer.has_chunk(cx, cz)
        return False

    @property
    def draw_calls(self) -> int:
        """Get draw call count from last frame."""
        return self._draw_calls

    @property
    def visible_chunk_count(self) -> int:
        """Get visible chunk count from last frame."""
        return len(self._visible_chunks)

    @property
    def camera(self) -> Camera:
        """Get camera object for external manipulation."""
        return self._camera

    def get_stats(self) -> dict:
        """
        Get rendering statistics.

        Returns:
            dict: Stats including draw calls, chunks, faces.
        """
        stats = {
            'draw_calls': self._draw_calls,
            'visible_chunks': len(self._visible_chunks),
            'render_distance': self.render_distance,
        }

        if self._chunk_renderer is not None:
            stats.update(self._chunk_renderer.get_stats())

        return stats

    def shutdown(self) -> None:
        """Release all GPU resources."""
        if self._chunk_renderer is not None:
            self._chunk_renderer.release_all()
            self._chunk_renderer = None

        if self._sky_renderer is not None:
            self._sky_renderer.release()
            self._sky_renderer = None

        if self._atlas is not None:
            self._atlas.release()

        if self._program is not None:
            self._program.release()
            self._program = None

        self._initialized = False
