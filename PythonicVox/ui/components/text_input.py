"""
Text input component for PythonicVox UI.

Provides a text input field with focus state, blinking cursor,
placeholder text, and keyboard input handling.
"""

import pygame
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')
import settings


class TextInput:
    """
    Text input field with focus, cursor, and placeholder.

    Attributes:
        rect (pygame.Rect): Input field bounds.
        text (str): Current input text.
        placeholder (str): Placeholder text shown when empty.
        is_focused (bool): Whether input has keyboard focus.
        cursor_visible (bool): Cursor blink state.
    """

    def __init__(self, rect, placeholder="", default_value="",
                 font_size=None, max_length=50):
        """
        Initialize a new TextInput.

        Args:
            rect: (x, y, width, height) tuple or pygame.Rect.
            placeholder (str): Placeholder text.
            default_value (str): Initial text value.
            font_size (int): Font size (default: FONT_SIZE_MEDIUM).
            max_length (int): Maximum character limit.
        """
        self.rect = pygame.Rect(rect)
        self.text = default_value
        self.placeholder = placeholder
        self.is_focused = False
        self.cursor_visible = True
        self.cursor_timer = 0
        self.max_length = max_length
        self.font = pygame.font.Font(None, font_size or settings.FONT_SIZE_MEDIUM)

    def update(self, events, mouse_pos, mouse_clicked):
        """
        Handle focus and text input.

        Args:
            events (list): pygame events for this frame.
            mouse_pos: Current mouse position (x, y).
            mouse_clicked (bool): Whether mouse was clicked.
        """
        # Handle focus on click
        if mouse_clicked:
            self.is_focused = self.rect.collidepoint(mouse_pos)
            if self.is_focused:
                self.cursor_visible = True
                self.cursor_timer = pygame.time.get_ticks()

        # Handle keyboard input when focused
        if self.is_focused:
            for event in events:
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_BACKSPACE:
                        self.text = self.text[:-1]
                    elif event.key == pygame.K_RETURN:
                        self.is_focused = False
                    elif event.key == pygame.K_ESCAPE:
                        self.is_focused = False
                    elif len(self.text) < self.max_length:
                        # Filter to printable characters
                        if event.unicode and event.unicode.isprintable():
                            self.text += event.unicode

            # Blink cursor every 500ms
            now = pygame.time.get_ticks()
            if now - self.cursor_timer > 500:
                self.cursor_visible = not self.cursor_visible
                self.cursor_timer = now

    def draw(self, surface):
        """
        Draw input field with text/placeholder and cursor.

        Args:
            surface (pygame.Surface): Surface to draw on.
        """
        # Draw background
        pygame.draw.rect(surface, settings.COLOR_INPUT_BG, self.rect, border_radius=4)

        # Draw border (highlighted if focused)
        border_color = settings.INPUT_FOCUS_BORDER_COLOR if self.is_focused else settings.INPUT_BORDER_COLOR
        pygame.draw.rect(surface, border_color, self.rect, width=2, border_radius=4)

        # Draw text or placeholder
        if self.text:
            text_color = settings.COLOR_TEXT_PRIMARY
            display_text = self.text
        else:
            text_color = settings.COLOR_TEXT_PLACEHOLDER
            display_text = self.placeholder

        text_surface = self.font.render(display_text, True, text_color)
        text_x = self.rect.left + settings.INPUT_PADDING
        text_y = self.rect.centery - text_surface.get_height() // 2

        # Clip text to input bounds
        clip_rect = pygame.Rect(
            self.rect.left + 5,
            self.rect.top,
            self.rect.width - 10,
            self.rect.height
        )
        surface.set_clip(clip_rect)
        surface.blit(text_surface, (text_x, text_y))
        surface.set_clip(None)

        # Draw blinking cursor if focused
        if self.is_focused and self.cursor_visible:
            cursor_x = text_x + self.font.size(self.text)[0] + 2
            cursor_y1 = self.rect.centery - 10
            cursor_y2 = self.rect.centery + 10
            pygame.draw.line(surface, settings.COLOR_TEXT_PRIMARY,
                             (cursor_x, cursor_y1), (cursor_x, cursor_y2), 2)

    def get_value(self):
        """
        Get current text value.

        Returns:
            str: Current input text.
        """
        return self.text
