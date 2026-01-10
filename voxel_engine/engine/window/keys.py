"""
Key and mouse button constants for VoxEx.

Maps GLFW key codes to readable names for use with Window.get_key().
Designed to match JavaScript key codes where possible for parity with voxEx.html.

Usage:
    from voxel_engine.engine.window import Window, Keys, MouseButtons

    if window.get_key(Keys.W):
        # Move forward
    if window.get_mouse_button(MouseButtons.LEFT):
        # Mine block
"""

try:
    import glfw
    GLFW_AVAILABLE = True
except ImportError:
    GLFW_AVAILABLE = False
    # Provide fallback values if GLFW not installed (for testing/docs)
    glfw = None


class Keys:
    """
    GLFW key code constants.

    Provides readable names for keyboard keys used in VoxEx.
    Values match glfw.KEY_* constants.
    """

    # Movement keys (WASD)
    W: int = 87 if not GLFW_AVAILABLE else glfw.KEY_W
    A: int = 65 if not GLFW_AVAILABLE else glfw.KEY_A
    S: int = 83 if not GLFW_AVAILABLE else glfw.KEY_S
    D: int = 68 if not GLFW_AVAILABLE else glfw.KEY_D

    # Action keys
    SPACE: int = 32 if not GLFW_AVAILABLE else glfw.KEY_SPACE
    LEFT_SHIFT: int = 340 if not GLFW_AVAILABLE else glfw.KEY_LEFT_SHIFT
    RIGHT_SHIFT: int = 344 if not GLFW_AVAILABLE else glfw.KEY_RIGHT_SHIFT
    LEFT_CONTROL: int = 341 if not GLFW_AVAILABLE else glfw.KEY_LEFT_CONTROL
    RIGHT_CONTROL: int = 345 if not GLFW_AVAILABLE else glfw.KEY_RIGHT_CONTROL

    # Game controls
    C: int = 67 if not GLFW_AVAILABLE else glfw.KEY_C  # Crouch
    F: int = 70 if not GLFW_AVAILABLE else glfw.KEY_F  # Toggle torch
    E: int = 69 if not GLFW_AVAILABLE else glfw.KEY_E  # Inventory
    Q: int = 81 if not GLFW_AVAILABLE else glfw.KEY_Q  # Drop item
    R: int = 82 if not GLFW_AVAILABLE else glfw.KEY_R  # Special action

    # Navigation
    ESCAPE: int = 256 if not GLFW_AVAILABLE else glfw.KEY_ESCAPE
    ENTER: int = 257 if not GLFW_AVAILABLE else glfw.KEY_ENTER
    TAB: int = 258 if not GLFW_AVAILABLE else glfw.KEY_TAB
    BACKSPACE: int = 259 if not GLFW_AVAILABLE else glfw.KEY_BACKSPACE

    # Function keys
    F1: int = 290 if not GLFW_AVAILABLE else glfw.KEY_F1
    F2: int = 291 if not GLFW_AVAILABLE else glfw.KEY_F2
    F3: int = 292 if not GLFW_AVAILABLE else glfw.KEY_F3
    F4: int = 293 if not GLFW_AVAILABLE else glfw.KEY_F4
    F5: int = 294 if not GLFW_AVAILABLE else glfw.KEY_F5   # Quick save
    F6: int = 295 if not GLFW_AVAILABLE else glfw.KEY_F6
    F7: int = 296 if not GLFW_AVAILABLE else glfw.KEY_F7
    F8: int = 297 if not GLFW_AVAILABLE else glfw.KEY_F8
    F9: int = 298 if not GLFW_AVAILABLE else glfw.KEY_F9   # Quick load
    F10: int = 299 if not GLFW_AVAILABLE else glfw.KEY_F10
    F11: int = 300 if not GLFW_AVAILABLE else glfw.KEY_F11  # Fullscreen
    F12: int = 301 if not GLFW_AVAILABLE else glfw.KEY_F12

    # Debug key (tilde/grave accent)
    GRAVE_ACCENT: int = 96 if not GLFW_AVAILABLE else glfw.KEY_GRAVE_ACCENT

    # Number keys (top row) for hotbar
    KEY_0: int = 48 if not GLFW_AVAILABLE else glfw.KEY_0
    KEY_1: int = 49 if not GLFW_AVAILABLE else glfw.KEY_1
    KEY_2: int = 50 if not GLFW_AVAILABLE else glfw.KEY_2
    KEY_3: int = 51 if not GLFW_AVAILABLE else glfw.KEY_3
    KEY_4: int = 52 if not GLFW_AVAILABLE else glfw.KEY_4
    KEY_5: int = 53 if not GLFW_AVAILABLE else glfw.KEY_5
    KEY_6: int = 54 if not GLFW_AVAILABLE else glfw.KEY_6
    KEY_7: int = 55 if not GLFW_AVAILABLE else glfw.KEY_7
    KEY_8: int = 56 if not GLFW_AVAILABLE else glfw.KEY_8
    KEY_9: int = 57 if not GLFW_AVAILABLE else glfw.KEY_9

    # Arrow keys (for menu navigation)
    UP: int = 265 if not GLFW_AVAILABLE else glfw.KEY_UP
    DOWN: int = 264 if not GLFW_AVAILABLE else glfw.KEY_DOWN
    LEFT: int = 263 if not GLFW_AVAILABLE else glfw.KEY_LEFT
    RIGHT: int = 262 if not GLFW_AVAILABLE else glfw.KEY_RIGHT

    # Numpad keys
    KP_0: int = 320 if not GLFW_AVAILABLE else glfw.KEY_KP_0
    KP_1: int = 321 if not GLFW_AVAILABLE else glfw.KEY_KP_1
    KP_2: int = 322 if not GLFW_AVAILABLE else glfw.KEY_KP_2
    KP_3: int = 323 if not GLFW_AVAILABLE else glfw.KEY_KP_3
    KP_4: int = 324 if not GLFW_AVAILABLE else glfw.KEY_KP_4
    KP_5: int = 325 if not GLFW_AVAILABLE else glfw.KEY_KP_5
    KP_6: int = 326 if not GLFW_AVAILABLE else glfw.KEY_KP_6
    KP_7: int = 327 if not GLFW_AVAILABLE else glfw.KEY_KP_7
    KP_8: int = 328 if not GLFW_AVAILABLE else glfw.KEY_KP_8
    KP_9: int = 329 if not GLFW_AVAILABLE else glfw.KEY_KP_9

    @classmethod
    def get_hotbar_slot(cls, key: int) -> int:
        """
        Convert a key code to hotbar slot number.

        Args:
            key: GLFW key code.

        Returns:
            int: Hotbar slot 0-8, or -1 if not a number key.
        """
        if cls.KEY_1 <= key <= cls.KEY_9:
            return key - cls.KEY_1  # 0-8
        return -1


class MouseButtons:
    """
    GLFW mouse button constants.

    Provides readable names for mouse buttons used in VoxEx.
    Values match glfw.MOUSE_BUTTON_* constants.
    """

    LEFT: int = 0 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_LEFT
    RIGHT: int = 1 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_RIGHT
    MIDDLE: int = 2 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_MIDDLE

    # Additional buttons (for mice with extra buttons)
    BUTTON_4: int = 3 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_4
    BUTTON_5: int = 4 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_5
    BUTTON_6: int = 5 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_6
    BUTTON_7: int = 6 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_7
    BUTTON_8: int = 7 if not GLFW_AVAILABLE else glfw.MOUSE_BUTTON_8


# Key name lookup (for debug/UI display)
KEY_NAMES = {
    Keys.W: "W",
    Keys.A: "A",
    Keys.S: "S",
    Keys.D: "D",
    Keys.SPACE: "Space",
    Keys.LEFT_SHIFT: "Shift",
    Keys.LEFT_CONTROL: "Ctrl",
    Keys.C: "C",
    Keys.F: "F",
    Keys.E: "E",
    Keys.ESCAPE: "Escape",
    Keys.F5: "F5",
    Keys.F9: "F9",
    Keys.GRAVE_ACCENT: "~",
}
