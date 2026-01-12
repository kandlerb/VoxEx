"""Shared button components for VoxEx UI.

This module contains button components that are shared across multiple UI modules,
extracted to avoid circular import dependencies.
"""
from typing import TYPE_CHECKING

from .pause_menu import Button, MenuAction
from .constants import MENU_TEXT_COLOR

# Debug logging with fallback
try:
    from ..utils.debug import debug_ui
except ImportError:
    def debug_ui(msg, *args, **kwargs):
        pass

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


class StartMenuButton(Button):
    """Button with custom colors for start menu.

    Extends the base Button class to allow custom normal and hover colors,
    used throughout the start menu UI.
    """

    __slots__ = ('_normal_color', '_hover_color')

    def __init__(self, text: str, x: float, y: float,
                 width: float, height: float, action: MenuAction,
                 normal_color: tuple, hover_color: tuple):
        """
        Create a start menu button with custom colors.

        @param text: Button label.
        @param x: Left edge X coordinate.
        @param y: Top edge Y coordinate.
        @param width: Button width.
        @param height: Button height.
        @param action: Action to trigger when clicked.
        @param normal_color: RGBA color when not hovered.
        @param hover_color: RGBA color when hovered.
        """
        super().__init__(text, x, y, width, height, action)
        self._normal_color = normal_color
        self._hover_color = hover_color

    def render(self, ui: "UIRenderer") -> None:
        """
        Render button with custom colors.

        @param ui: UI renderer.
        """
        color = self._hover_color if self.hovered else self._normal_color
        ui.draw_rect(self.x, self.y, self.width, self.height, color)

        # Center text
        text_width, text_height = ui.measure_text(self.text)
        text_x = self.x + (self.width - text_width) / 2
        text_y = self.y + (self.height - text_height) / 2
        ui.draw_text(self.text, text_x, text_y, MENU_TEXT_COLOR)
