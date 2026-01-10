"""
Render system for VoxEx.

Placeholder FrameSystem that initializes OpenGL state and clears the screen.
Will be extended with actual voxel rendering in future iterations.

Usage:
    from voxel_engine.engine.systems import RenderSystem
    from voxel_engine.engine.window import Window

    window = Window()
    render_system = RenderSystem(window)
    game_loop.add_frame_system(render_system)
"""

from typing import TYPE_CHECKING

from .base import FrameSystem

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState
    from voxel_engine.engine.window.window import Window

try:
    import moderngl
    MODERNGL_AVAILABLE = True
except ImportError:
    MODERNGL_AVAILABLE = False
    moderngl = None


class RenderSystem(FrameSystem):
    """
    Placeholder render system that clears the screen.

    Initializes OpenGL state (depth test, face culling) and clears
    to a sky blue color each frame. Swap buffers after rendering.

    Priority: 100 (runs last in frame systems)
    """

    __slots__ = ('_window', '_initialized')

    # Sky colors (linear RGB) for time-of-day variation
    SKY_DAY = (0.5, 0.7, 1.0, 1.0)       # Light blue
    SKY_SUNSET = (0.9, 0.5, 0.3, 1.0)    # Orange
    SKY_NIGHT = (0.05, 0.05, 0.15, 1.0)  # Dark blue

    def __init__(self, window: "Window"):
        """
        Initialize render system.

        Args:
            window: Window with ModernGL context.
        """
        super().__init__(priority=100)
        self._window = window
        self._initialized = False

    def initialize(self, state: "GameState") -> None:
        """
        Set up OpenGL state.

        Args:
            state: Game state for initialization.
        """
        if self._window is None or not MODERNGL_AVAILABLE:
            return

        ctx = self._window.ctx
        if ctx is None:
            return

        # Enable depth testing (closer objects obscure farther ones)
        ctx.enable(moderngl.DEPTH_TEST)
        ctx.depth_func = '<'  # Pass if depth < buffer

        # Enable backface culling (skip rendering back faces)
        ctx.enable(moderngl.CULL_FACE)
        ctx.cull_face = 'back'
        ctx.front_face = 'ccw'  # Counter-clockwise winding = front

        # Set viewport to window size
        ctx.viewport = (0, 0, self._window.width, self._window.height)

        self._initialized = True

    def shutdown(self) -> None:
        """Clean up render system."""
        self._initialized = False

    def frame(self, state: "GameState", dt: float, alpha: float) -> None:
        """
        Clear screen and swap buffers.

        Args:
            state: Game state (read-only for rendering).
            dt: Frame delta time.
            alpha: Interpolation factor [0, 1) between ticks.
        """
        if self._window is None or not MODERNGL_AVAILABLE:
            return

        ctx = self._window.ctx
        if ctx is None:
            return

        # Calculate sky color based on time of day
        sky_color = self._get_sky_color(state)

        # Clear color and depth buffers
        ctx.clear(
            red=sky_color[0],
            green=sky_color[1],
            blue=sky_color[2],
            alpha=sky_color[3],
            depth=1.0
        )

        # TODO: Actual rendering will go here
        # - Chunk mesh rendering
        # - Entity rendering
        # - UI rendering
        # - Post-processing

        # Swap front/back buffers to present frame
        self._window.swap_buffers()

    def _get_sky_color(self, state: "GameState") -> tuple:
        """
        Calculate sky color based on world time.

        Args:
            state: Game state with world time.

        Returns:
            tuple: (r, g, b, a) color values.
        """
        world = state.world

        # Get time of day (0.0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
        day_progress = world.get_day_progress()

        # Simple day/night cycle
        if 0.2 <= day_progress < 0.3:
            # Sunrise transition
            t = (day_progress - 0.2) / 0.1
            return self._lerp_color(self.SKY_NIGHT, self.SKY_SUNSET, t)
        elif 0.3 <= day_progress < 0.4:
            # Morning transition
            t = (day_progress - 0.3) / 0.1
            return self._lerp_color(self.SKY_SUNSET, self.SKY_DAY, t)
        elif 0.4 <= day_progress < 0.7:
            # Daytime
            return self.SKY_DAY
        elif 0.7 <= day_progress < 0.8:
            # Evening transition
            t = (day_progress - 0.7) / 0.1
            return self._lerp_color(self.SKY_DAY, self.SKY_SUNSET, t)
        elif 0.8 <= day_progress < 0.9:
            # Sunset transition
            t = (day_progress - 0.8) / 0.1
            return self._lerp_color(self.SKY_SUNSET, self.SKY_NIGHT, t)
        else:
            # Nighttime
            return self.SKY_NIGHT

    @staticmethod
    def _lerp_color(
        c1: tuple,
        c2: tuple,
        t: float
    ) -> tuple:
        """
        Linear interpolation between two colors.

        Args:
            c1: Start color (r, g, b, a).
            c2: End color (r, g, b, a).
            t: Interpolation factor [0, 1].

        Returns:
            tuple: Interpolated color.
        """
        t = max(0.0, min(1.0, t))
        return (
            c1[0] + (c2[0] - c1[0]) * t,
            c1[1] + (c2[1] - c1[1]) * t,
            c1[2] + (c2[2] - c1[2]) * t,
            c1[3] + (c2[3] - c1[3]) * t
        )
