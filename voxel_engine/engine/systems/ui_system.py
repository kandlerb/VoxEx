"""UI rendering FrameSystem."""
from typing import Optional

from .base import FrameSystem
from ..state import GameState
from ..window import Window
from ..ui.ui_renderer import UIRenderer
from ..ui.hud import Crosshair, Hotbar, DebugOverlay
from ..ui.pause_menu import PauseMenu, MenuAction
from ..loops import Clock


class UISystem(FrameSystem):
    """
    Renders all UI elements each frame.

    Priority: 110 (after world rendering at 100)
    """

    __slots__ = (
        '_window', '_clock',
        '_ui_renderer', '_crosshair', '_hotbar', '_debug', '_pause_menu',
        '_paused', '_draw_calls', '_chunk_count'
    )

    def __init__(self, window: Window, clock: Clock):
        """
        Create UI system.

        @param window: Window for rendering context and input.
        @param clock: Clock for FPS display.
        """
        super().__init__(priority=110)
        self._window = window
        self._clock = clock

        self._ui_renderer: Optional[UIRenderer] = None
        self._crosshair = Crosshair()
        self._hotbar = Hotbar()
        self._debug = DebugOverlay()
        self._pause_menu = PauseMenu()

        self._paused = False
        self._draw_calls = 0
        self._chunk_count = 0

    def initialize(self, state: GameState) -> None:
        """
        Initialize UI renderer.

        @param state: Game state (unused).
        """
        self._ui_renderer = UIRenderer(
            self._window.ctx,
            self._window.width,
            self._window.height
        )

    def set_stats(self, draw_calls: int, chunk_count: int) -> None:
        """
        Set stats for debug overlay.

        @param draw_calls: Number of draw calls this frame.
        @param chunk_count: Number of loaded chunks.
        """
        self._draw_calls = draw_calls
        self._chunk_count = chunk_count

    @property
    def paused(self) -> bool:
        """Check if game is paused."""
        return self._paused

    def toggle_pause(self) -> None:
        """Toggle pause state."""
        self._paused = not self._paused
        if self._paused:
            self._pause_menu.show(self._window.width, self._window.height)
            self._window.set_cursor_captured(False)
        else:
            self._pause_menu.hide()
            self._window.set_cursor_captured(True)

    def toggle_debug(self) -> None:
        """Toggle debug overlay."""
        self._debug.toggle()

    @property
    def debug_visible(self) -> bool:
        """Check if debug overlay is visible."""
        return self._debug.visible

    def frame(self, state: GameState, dt: float, alpha: float) -> None:
        """
        Render UI elements.

        @param state: Current game state.
        @param dt: Frame delta time.
        @param alpha: Interpolation factor.
        """
        if self._ui_renderer is None:
            return

        # Handle window resize
        if (self._ui_renderer.width != self._window.width or
                self._ui_renderer.height != self._window.height):
            self._ui_renderer.resize(self._window.width, self._window.height)

        # Update debug info
        self._debug.update(
            state,
            self._clock.fps,
            self._draw_calls,
            self._chunk_count
        )

        # Begin UI rendering
        self._ui_renderer.begin()

        if self._paused:
            # Pause menu
            mx, my = self._window.get_mouse_position()
            self._pause_menu.update_mouse(mx, my)
            self._pause_menu.render(self._ui_renderer)
        else:
            # In-game HUD
            self._crosshair.render(self._ui_renderer)
            self._hotbar.render(self._ui_renderer, state.player.selected_slot)

        # Debug overlay (always available)
        self._debug.render(self._ui_renderer)

        # End UI rendering
        self._ui_renderer.end()

    def handle_click(self, mx: float, my: float) -> MenuAction:
        """
        Handle mouse click on menu.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: MenuAction if button was clicked, else NONE.
        """
        if self._paused:
            return self._pause_menu.click(mx, my)
        return MenuAction.NONE

    def shutdown(self) -> None:
        """Release resources."""
        if self._ui_renderer:
            self._ui_renderer.release()
            self._ui_renderer = None
