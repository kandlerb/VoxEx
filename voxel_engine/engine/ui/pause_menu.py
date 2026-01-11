"""Pause menu UI."""
from typing import List
from enum import Enum, auto

from .ui_renderer import UIRenderer
from .constants import (
    MENU_BG_COLOR, MENU_BUTTON_WIDTH, MENU_BUTTON_HEIGHT,
    MENU_BUTTON_SPACING, MENU_BUTTON_COLOR, MENU_BUTTON_HOVER_COLOR,
    MENU_TEXT_COLOR
)


class MenuAction(Enum):
    """Actions that can be triggered from menus."""
    NONE = auto()
    RESUME = auto()
    SETTINGS = auto()
    QUIT = auto()
    START_GAME = auto()
    CREATE_WORLD = auto()
    BACK = auto()


class Button:
    """Simple button component."""

    __slots__ = ('text', 'x', 'y', 'width', 'height', 'action', 'hovered')

    def __init__(self, text: str, x: float, y: float,
                 width: float, height: float, action: MenuAction):
        """
        Create a button.

        @param text: Button label.
        @param x: Left edge X coordinate.
        @param y: Top edge Y coordinate.
        @param width: Button width.
        @param height: Button height.
        @param action: Action to trigger when clicked.
        """
        self.text = text
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.action = action
        self.hovered = False

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside button.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside button.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def render(self, ui: UIRenderer) -> None:
        """
        Render button.

        @param ui: UI renderer.
        """
        color = MENU_BUTTON_HOVER_COLOR if self.hovered else MENU_BUTTON_COLOR
        ui.draw_rect(self.x, self.y, self.width, self.height, color)

        # Center text
        text_width, text_height = ui.measure_text(self.text)
        text_x = self.x + (self.width - text_width) / 2
        text_y = self.y + (self.height - text_height) / 2
        ui.draw_text(self.text, text_x, text_y, MENU_TEXT_COLOR)


class PauseMenu:
    """Pause menu with buttons."""

    __slots__ = ('_visible', '_buttons', '_selected_action')

    def __init__(self):
        """Create pause menu."""
        self._visible = False
        self._buttons: List[Button] = []
        self._selected_action = MenuAction.NONE

    @property
    def visible(self) -> bool:
        """Check if pause menu is visible."""
        return self._visible

    def show(self, screen_width: int, screen_height: int) -> None:
        """
        Show pause menu and create buttons.

        @param screen_width: Screen width in pixels.
        @param screen_height: Screen height in pixels.
        """
        self._visible = True
        self._selected_action = MenuAction.NONE

        # Create buttons centered on screen
        button_x = (screen_width - MENU_BUTTON_WIDTH) / 2
        total_height = (3 * MENU_BUTTON_HEIGHT + 2 * MENU_BUTTON_SPACING)
        start_y = (screen_height - total_height) / 2

        self._buttons = [
            Button("RESUME", button_x, start_y,
                   MENU_BUTTON_WIDTH, MENU_BUTTON_HEIGHT, MenuAction.RESUME),
            Button("SETTINGS", button_x,
                   start_y + MENU_BUTTON_HEIGHT + MENU_BUTTON_SPACING,
                   MENU_BUTTON_WIDTH, MENU_BUTTON_HEIGHT, MenuAction.SETTINGS),
            Button("QUIT", button_x,
                   start_y + 2 * (MENU_BUTTON_HEIGHT + MENU_BUTTON_SPACING),
                   MENU_BUTTON_WIDTH, MENU_BUTTON_HEIGHT, MenuAction.QUIT),
        ]

    def hide(self) -> None:
        """Hide pause menu."""
        self._visible = False
        self._buttons.clear()

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update button hover states.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        for button in self._buttons:
            button.hovered = button.contains(mx, my)

    def click(self, mx: float, my: float) -> MenuAction:
        """
        Handle mouse click, return action if button clicked.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: MenuAction if a button was clicked, else NONE.
        """
        for button in self._buttons:
            if button.contains(mx, my):
                return button.action
        return MenuAction.NONE

    def render(self, ui: UIRenderer) -> None:
        """
        Render pause menu.

        @param ui: UI renderer.
        """
        if not self._visible:
            return

        # Darken background
        ui.draw_rect(0, 0, ui.width, ui.height, MENU_BG_COLOR)

        # Title
        title = "PAUSED"
        title_width, _ = ui.measure_text(title, scale=1.5)
        ui.draw_text(title, (ui.width - title_width) / 2,
                     ui.height / 4, MENU_TEXT_COLOR, scale=1.5)

        # Buttons
        for button in self._buttons:
            button.render(ui)
