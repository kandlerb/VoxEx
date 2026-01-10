"""
Window management for VoxEx.

Provides a GLFW window with ModernGL OpenGL 3.3 core context.
Handles input polling for keyboard, mouse buttons, and cursor position.

Usage:
    from voxel_engine.engine.window import Window

    window = Window(width=1280, height=720, title="VoxEx")
    window.set_cursor_captured(True)

    while not window.should_close:
        window.poll_events()
        # ... render ...
        window.swap_buffers()

    window.close()
"""

from typing import Tuple, Optional
import numpy as np

try:
    import glfw
    GLFW_AVAILABLE = True
except ImportError:
    GLFW_AVAILABLE = False
    glfw = None

try:
    import moderngl
    MODERNGL_AVAILABLE = True
except ImportError:
    MODERNGL_AVAILABLE = False
    moderngl = None


class Window:
    """
    GLFW window with ModernGL OpenGL context.

    Tracks keyboard, mouse button, and cursor state for input polling.
    Uses raw GLFW for maximum control over input and context.
    """

    __slots__ = (
        '_window', '_ctx', 'width', 'height', 'title',
        '_should_close', '_keys', '_mouse_buttons',
        '_mouse_pos', '_mouse_delta', '_last_mouse_pos',
        '_cursor_captured', '_first_mouse'
    )

    def __init__(
        self,
        width: int = 1280,
        height: int = 720,
        title: str = "VoxEx"
    ):
        """
        Create a new window with OpenGL 3.3 core context.

        Args:
            width: Window width in pixels.
            height: Window height in pixels.
            title: Window title.

        Raises:
            RuntimeError: If GLFW or ModernGL not available, or init fails.
        """
        if not GLFW_AVAILABLE:
            raise RuntimeError("GLFW not available. Install with: pip install glfw")
        if not MODERNGL_AVAILABLE:
            raise RuntimeError("ModernGL not available. Install with: pip install moderngl")

        self.width = width
        self.height = height
        self.title = title

        self._should_close = False
        self._cursor_captured = False
        self._first_mouse = True

        # Input state tracking
        # Using numpy arrays for key states (more memory efficient for 512 keys)
        self._keys = np.zeros(512, dtype=np.bool_)
        self._mouse_buttons = np.zeros(8, dtype=np.bool_)
        self._mouse_pos = np.array([0.0, 0.0], dtype=np.float64)
        self._last_mouse_pos = np.array([0.0, 0.0], dtype=np.float64)
        self._mouse_delta = np.array([0.0, 0.0], dtype=np.float64)

        # Initialize GLFW
        if not glfw.init():
            raise RuntimeError("Failed to initialize GLFW")

        # Request OpenGL 3.3 core profile
        glfw.window_hint(glfw.CONTEXT_VERSION_MAJOR, 3)
        glfw.window_hint(glfw.CONTEXT_VERSION_MINOR, 3)
        glfw.window_hint(glfw.OPENGL_PROFILE, glfw.OPENGL_CORE_PROFILE)
        glfw.window_hint(glfw.OPENGL_FORWARD_COMPAT, glfw.TRUE)

        # Create window
        self._window = glfw.create_window(width, height, title, None, None)
        if not self._window:
            glfw.terminate()
            raise RuntimeError("Failed to create GLFW window")

        # Make context current
        glfw.make_context_current(self._window)

        # Create ModernGL context from current GLFW context
        self._ctx = moderngl.create_context()

        # Set up callbacks
        glfw.set_key_callback(self._window, self._key_callback)
        glfw.set_mouse_button_callback(self._window, self._mouse_button_callback)
        glfw.set_cursor_pos_callback(self._window, self._cursor_pos_callback)
        glfw.set_window_close_callback(self._window, self._close_callback)
        glfw.set_framebuffer_size_callback(self._window, self._resize_callback)

        # Initialize mouse position
        mx, my = glfw.get_cursor_pos(self._window)
        self._mouse_pos[:] = [mx, my]
        self._last_mouse_pos[:] = [mx, my]

        # Disable vsync for uncapped framerate (optional)
        # glfw.swap_interval(0)

    # =========================================================================
    # PROPERTIES
    # =========================================================================

    @property
    def ctx(self) -> "moderngl.Context":
        """ModernGL context for rendering."""
        return self._ctx

    @property
    def should_close(self) -> bool:
        """Check if window close was requested."""
        return self._should_close or glfw.window_should_close(self._window)

    @property
    def cursor_captured(self) -> bool:
        """Check if cursor is captured (hidden and locked)."""
        return self._cursor_captured

    # =========================================================================
    # GLFW CALLBACKS
    # =========================================================================

    def _key_callback(self, window, key: int, scancode: int, action: int, mods: int) -> None:
        """Handle key press/release events."""
        if 0 <= key < len(self._keys):
            if action == glfw.PRESS:
                self._keys[key] = True
            elif action == glfw.RELEASE:
                self._keys[key] = False

    def _mouse_button_callback(self, window, button: int, action: int, mods: int) -> None:
        """Handle mouse button press/release events."""
        if 0 <= button < len(self._mouse_buttons):
            if action == glfw.PRESS:
                self._mouse_buttons[button] = True
            elif action == glfw.RELEASE:
                self._mouse_buttons[button] = False

    def _cursor_pos_callback(self, window, xpos: float, ypos: float) -> None:
        """Handle cursor movement."""
        self._mouse_pos[:] = [xpos, ypos]

    def _close_callback(self, window) -> None:
        """Handle window close request."""
        self._should_close = True

    def _resize_callback(self, window, width: int, height: int) -> None:
        """Handle window resize."""
        self.width = width
        self.height = height
        if self._ctx:
            self._ctx.viewport = (0, 0, width, height)

    # =========================================================================
    # INPUT POLLING
    # =========================================================================

    def poll_events(self) -> None:
        """
        Poll GLFW events and update mouse delta.

        Call once per frame before reading input state.
        """
        # Calculate mouse delta before polling (uses accumulated movement)
        if self._first_mouse:
            self._mouse_delta[:] = [0.0, 0.0]
            self._first_mouse = False
        else:
            self._mouse_delta[:] = self._mouse_pos - self._last_mouse_pos

        # Store current position for next frame's delta
        self._last_mouse_pos[:] = self._mouse_pos

        # Poll events (triggers callbacks)
        glfw.poll_events()

    def get_key(self, key: int) -> bool:
        """
        Check if a key is currently pressed.

        Args:
            key: GLFW key code (use Keys constants).

        Returns:
            bool: True if key is pressed.
        """
        if 0 <= key < len(self._keys):
            return bool(self._keys[key])
        return False

    def get_mouse_button(self, button: int) -> bool:
        """
        Check if a mouse button is currently pressed.

        Args:
            button: GLFW mouse button code (use MouseButtons constants).

        Returns:
            bool: True if button is pressed.
        """
        if 0 <= button < len(self._mouse_buttons):
            return bool(self._mouse_buttons[button])
        return False

    def get_mouse_position(self) -> Tuple[float, float]:
        """
        Get current mouse cursor position.

        Returns:
            tuple: (x, y) position in window coordinates.
        """
        return (float(self._mouse_pos[0]), float(self._mouse_pos[1]))

    def get_mouse_delta(self) -> Tuple[float, float]:
        """
        Get mouse movement since last poll_events() call.

        Returns:
            tuple: (dx, dy) movement in pixels.
        """
        return (float(self._mouse_delta[0]), float(self._mouse_delta[1]))

    # =========================================================================
    # CURSOR CONTROL
    # =========================================================================

    def set_cursor_captured(self, captured: bool) -> None:
        """
        Enable or disable cursor capture for FPS-style controls.

        When captured, cursor is hidden and locked to window center.
        Mouse delta still tracks movement for camera control.

        Args:
            captured: True to capture cursor, False to release.
        """
        self._cursor_captured = captured
        if captured:
            glfw.set_input_mode(self._window, glfw.CURSOR, glfw.CURSOR_DISABLED)
            # Enable raw mouse motion if available (more accurate)
            if glfw.raw_mouse_motion_supported():
                glfw.set_input_mode(self._window, glfw.RAW_MOUSE_MOTION, glfw.TRUE)
            # Reset delta tracking to prevent jump on capture
            mx, my = glfw.get_cursor_pos(self._window)
            self._mouse_pos[:] = [mx, my]
            self._last_mouse_pos[:] = [mx, my]
            self._first_mouse = True
        else:
            glfw.set_input_mode(self._window, glfw.CURSOR, glfw.CURSOR_NORMAL)
            if glfw.raw_mouse_motion_supported():
                glfw.set_input_mode(self._window, glfw.RAW_MOUSE_MOTION, glfw.FALSE)

    def center_cursor(self) -> None:
        """Center cursor in window (useful when releasing capture)."""
        center_x = self.width / 2
        center_y = self.height / 2
        glfw.set_cursor_pos(self._window, center_x, center_y)
        self._mouse_pos[:] = [center_x, center_y]
        self._last_mouse_pos[:] = [center_x, center_y]

    # =========================================================================
    # RENDERING
    # =========================================================================

    def swap_buffers(self) -> None:
        """Swap front and back buffers (present frame)."""
        glfw.swap_buffers(self._window)

    def make_current(self) -> None:
        """Make this window's OpenGL context current."""
        glfw.make_context_current(self._window)

    # =========================================================================
    # LIFECYCLE
    # =========================================================================

    def close(self) -> None:
        """
        Clean shutdown of window and OpenGL context.

        Releases ModernGL context and destroys GLFW window.
        """
        if self._ctx:
            self._ctx.release()
            self._ctx = None

        if self._window:
            glfw.destroy_window(self._window)
            self._window = None

        glfw.terminate()

    def __enter__(self) -> "Window":
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit - ensures cleanup."""
        self.close()
