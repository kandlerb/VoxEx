"""
Button component for PythonicVox UI.

Provides a clickable button with hover states, optional icon prefix,
and selection state for toggle-style button groups.
"""

import pygame
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')
import settings


class Button:
    """
    Clickable button with hover states and optional icon.

    Attributes:
        rect (pygame.Rect): Button bounds.
        text (str): Button label text.
        icon (str): Optional icon/emoji prefix.
        is_hovered (bool): Whether mouse is over button.
        is_selected (bool): For toggle-style selection groups.
        data_id: Optional data identifier for the button.
    """

    def __init__(self, rect, text, color=None, hover_color=None,
                 text_color=None, icon=None, font_size=None,
                 border_color=None, border_width=0):
        """
        Initialize a new Button.

        Args:
            rect: (x, y, width, height) tuple or pygame.Rect.
            text (str): Button label.
            color: Background color (default: COLOR_BUTTON).
            hover_color: Hover background color (default: COLOR_BUTTON_HOVER).
            text_color: Text color (default: COLOR_TEXT_PRIMARY).
            icon (str): Optional icon prefix.
            font_size (int): Font size (default: FONT_SIZE_MEDIUM).
            border_color: Border color (optional).
            border_width (int): Border width in pixels.
        """
        self.rect = pygame.Rect(rect)
        self.text = text
        self.icon = icon
        self.color = color or settings.COLOR_BUTTON
        self.hover_color = hover_color or settings.COLOR_BUTTON_HOVER
        self.text_color = text_color or settings.COLOR_TEXT_PRIMARY
        self.border_color = border_color
        self.border_width = border_width
        self.is_hovered = False
        self.is_selected = False
        self.data_id = None
        self.font = pygame.font.Font(None, font_size or settings.FONT_SIZE_MEDIUM)

    def update(self, mouse_pos, mouse_clicked):
        """
        Update hover state and check for clicks.

        Args:
            mouse_pos: Current mouse position (x, y).
            mouse_clicked (bool): Whether mouse was clicked this frame.

        Returns:
            bool: True if button was clicked.
        """
        self.is_hovered = self.rect.collidepoint(mouse_pos)
        return self.is_hovered and mouse_clicked

    def draw(self, surface):
        """
        Draw the button with current state styling.

        Args:
            surface (pygame.Surface): Surface to draw on.
        """
        # Determine background color
        if self.is_selected:
            bg_color = self.hover_color
        elif self.is_hovered:
            bg_color = self.hover_color
        else:
            bg_color = self.color

        # Draw background
        pygame.draw.rect(surface, bg_color, self.rect, border_radius=6)

        # Draw border
        if self.border_color or self.is_selected:
            border_col = settings.COLOR_PRIMARY if self.is_selected else self.border_color
            pygame.draw.rect(surface, border_col, self.rect,
                             width=self.border_width or 2, border_radius=6)

        # Build display text
        display_text = f"{self.icon} {self.text}" if self.icon else self.text

        # Render and center text
        text_surface = self.font.render(display_text, True, self.text_color)
        text_rect = text_surface.get_rect(center=self.rect.center)
        surface.blit(text_surface, text_rect)
