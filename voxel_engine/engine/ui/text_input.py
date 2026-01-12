"""Text input component for VoxEx UI.

Provides an editable text field with cursor, selection, and keyboard input handling.
Styled to match the voxEx.html input field design.
"""

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Colors for text input
INPUT_BG_COLOR = (30, 30, 30, 255)
INPUT_BORDER_COLOR = (68, 68, 68, 255)
INPUT_BORDER_FOCUSED = (100, 140, 200, 255)
INPUT_TEXT_COLOR = (255, 255, 255, 255)
INPUT_PLACEHOLDER_COLOR = (100, 100, 100, 255)
INPUT_CURSOR_COLOR = (255, 255, 255, 255)


@dataclass
class TextInput:
    """
    Editable text input component.

    Renders a text field with border, background, text, and blinking cursor.
    Handles keyboard input for typing, navigation, and editing.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 200.0
    height: float = 35.0
    text: str = ""
    placeholder: str = ""
    focused: bool = False
    cursor_pos: int = 0
    max_length: int = 32
    numeric_only: bool = False

    # Internal state
    _cursor_blink_time: float = field(default=0.0, repr=False)
    _cursor_visible: bool = field(default=True, repr=False)

    # Blink timing
    CURSOR_BLINK_INTERVAL: float = 0.53

    def __post_init__(self):
        """Initialize cursor position to end of text."""
        self.cursor_pos = len(self.text)
        self._cursor_blink_time = time.time()

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the input field.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if click was inside the input.
        """
        if self.contains(mx, my):
            self.focused = True
            # Reset cursor blink on focus
            self._cursor_blink_time = time.time()
            self._cursor_visible = True
            return True
        else:
            self.focused = False
            return False

    def handle_key(self, key: str, mods: int = 0) -> bool:
        """
        Handle keyboard input.

        @param key: Key identifier string (e.g., 'backspace', 'left', or character).
        @param mods: Modifier key flags (unused currently).
        @returns: True if key was handled.
        """
        if not self.focused:
            return False

        # Reset cursor blink on input
        self._cursor_blink_time = time.time()
        self._cursor_visible = True

        key_lower = key.lower()

        # Navigation keys
        if key_lower == 'left':
            if self.cursor_pos > 0:
                self.cursor_pos -= 1
            return True

        if key_lower == 'right':
            if self.cursor_pos < len(self.text):
                self.cursor_pos += 1
            return True

        if key_lower == 'home':
            self.cursor_pos = 0
            return True

        if key_lower == 'end':
            self.cursor_pos = len(self.text)
            return True

        # Editing keys
        if key_lower == 'backspace':
            if self.cursor_pos > 0:
                self.text = self.text[:self.cursor_pos - 1] + self.text[self.cursor_pos:]
                self.cursor_pos -= 1
            return True

        if key_lower == 'delete':
            if self.cursor_pos < len(self.text):
                self.text = self.text[:self.cursor_pos] + self.text[self.cursor_pos + 1:]
            return True

        # Character input (single printable character)
        if len(key) == 1 and key.isprintable():
            # Check max length
            if len(self.text) >= self.max_length:
                return True

            # Filter for numeric only if required
            if self.numeric_only and not key.isdigit():
                return True

            # Insert character at cursor position
            self.text = self.text[:self.cursor_pos] + key + self.text[self.cursor_pos:]
            self.cursor_pos += 1
            return True

        return False

    def handle_text_input(self, char: str) -> bool:
        """
        Handle text character input (for GLFW character callback).

        @param char: Character to insert.
        @returns: True if character was handled.
        """
        if not self.focused:
            return False

        if not char or not char.isprintable():
            return False

        # Check max length
        if len(self.text) >= self.max_length:
            return True

        # Filter for numeric only if required
        if self.numeric_only and not char.isdigit():
            return True

        # Reset cursor blink
        self._cursor_blink_time = time.time()
        self._cursor_visible = True

        # Insert character at cursor position
        self.text = self.text[:self.cursor_pos] + char + self.text[self.cursor_pos:]
        self.cursor_pos += 1
        return True

    def set_text(self, text: str) -> None:
        """
        Set the input text programmatically.

        @param text: New text value.
        """
        if self.numeric_only:
            # Filter to digits only
            text = ''.join(c for c in text if c.isdigit())

        # Truncate to max length
        self.text = text[:self.max_length]
        self.cursor_pos = len(self.text)

    def get_value(self) -> str:
        """
        Get the current text value.

        @returns: Current text string.
        """
        return self.text

    def get_int_value(self, default: int = 0) -> int:
        """
        Get the text as an integer.

        @param default: Value to return if text is empty or invalid.
        @returns: Integer value of text, or default.
        """
        if not self.text:
            return default
        try:
            return int(self.text)
        except ValueError:
            return default

    def clear(self) -> None:
        """Clear the input text."""
        self.text = ""
        self.cursor_pos = 0

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the text input field.

        @param ui: UI renderer.
        """
        # Update cursor blink
        current_time = time.time()
        if current_time - self._cursor_blink_time >= self.CURSOR_BLINK_INTERVAL:
            self._cursor_blink_time = current_time
            self._cursor_visible = not self._cursor_visible

        # Draw border (focused = blue, unfocused = gray)
        border_color = INPUT_BORDER_FOCUSED if self.focused else INPUT_BORDER_COLOR
        ui.draw_rect(self.x - 1, self.y - 1, self.width + 2, self.height + 2, border_color)

        # Draw background
        ui.draw_rect(self.x, self.y, self.width, self.height, INPUT_BG_COLOR)

        # Padding inside the input
        padding = 10.0
        text_x = self.x + padding
        text_y = self.y + (self.height - ui.measure_text("X")[1]) / 2

        # Draw text or placeholder
        if self.text:
            ui.draw_text(self.text, text_x, text_y, INPUT_TEXT_COLOR, scale=1.0)
        elif self.placeholder and not self.focused:
            ui.draw_text(self.placeholder, text_x, text_y, INPUT_PLACEHOLDER_COLOR, scale=1.0)

        # Draw cursor if focused and visible
        if self.focused and self._cursor_visible:
            # Calculate cursor X position based on text before cursor
            text_before_cursor = self.text[:self.cursor_pos]
            cursor_offset, _ = ui.measure_text(text_before_cursor)
            cursor_x = text_x + cursor_offset

            # Draw cursor line
            cursor_height = self.height - 10
            cursor_y = self.y + 5
            ui.draw_rect(cursor_x, cursor_y, 2, cursor_height, INPUT_CURSOR_COLOR)
