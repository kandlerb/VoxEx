"""
VoxEx window management.

Provides GLFW window with ModernGL OpenGL 3.3 context.
Includes key/mouse constants for input polling.

Usage:
    from voxel_engine.engine.window import Window, Keys, MouseButtons

    with Window(width=1280, height=720, title="VoxEx") as window:
        window.set_cursor_captured(True)
        while not window.should_close:
            window.poll_events()
            if window.get_key(Keys.W):
                # Move forward
            window.swap_buffers()
"""

from .window import Window, GLFW_AVAILABLE, MODERNGL_AVAILABLE
from .keys import Keys, MouseButtons, KEY_NAMES

__all__ = [
    "Window",
    "Keys",
    "MouseButtons",
    "KEY_NAMES",
    "GLFW_AVAILABLE",
    "MODERNGL_AVAILABLE",
]
