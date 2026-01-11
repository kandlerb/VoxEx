"""Start menu UI for VoxEx.

Displays the main menu before game starts with title, seed input, and buttons.
Inspired by the voxEx.html start menu design.
"""
from typing import List, Optional, Callable
import random

from .ui_renderer import UIRenderer
from .pause_menu import Button, MenuAction
from .constants import (
    START_MENU_BG_COLOR, START_MENU_TITLE_COLOR, START_MENU_SUBTITLE_COLOR,
    START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT, START_MENU_BUTTON_SPACING,
    START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER,
    START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER,
    START_MENU_INPUT_BG_COLOR, START_MENU_INPUT_BORDER_COLOR,
    MENU_TEXT_COLOR
)


class StartMenuButton(Button):
    """Button with custom colors for start menu."""

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

    def render(self, ui: UIRenderer) -> None:
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


class StartMenu:
    """
    Start menu shown before game begins.

    Displays title, subtitle, seed input, and action buttons.
    """

    __slots__ = (
        '_visible', '_buttons', '_seed', '_screen_width', '_screen_height'
    )

    def __init__(self):
        """Create start menu."""
        self._visible = False
        self._buttons: List[StartMenuButton] = []
        self._seed: int = random.randint(1, 999999)
        self._screen_width = 0
        self._screen_height = 0

    @property
    def visible(self) -> bool:
        """Check if start menu is visible."""
        return self._visible

    @property
    def seed(self) -> int:
        """Get the current seed value."""
        return self._seed

    @seed.setter
    def seed(self, value: int) -> None:
        """Set the seed value."""
        self._seed = value

    def randomize_seed(self) -> int:
        """
        Generate a new random seed.

        @returns: The new seed value.
        """
        self._seed = random.randint(1, 999999)
        return self._seed

    def show(self, screen_width: int, screen_height: int) -> None:
        """
        Show start menu and create buttons.

        @param screen_width: Screen width in pixels.
        @param screen_height: Screen height in pixels.
        """
        self._visible = True
        self._screen_width = screen_width
        self._screen_height = screen_height

        # Create buttons centered on screen
        button_x = (screen_width - START_MENU_BUTTON_WIDTH) / 2
        center_y = screen_height / 2

        # Position buttons below title area
        button_start_y = center_y + 40

        self._buttons = [
            StartMenuButton(
                "CREATE NEW WORLD",
                button_x, button_start_y,
                START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT,
                MenuAction.CREATE_WORLD,
                START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER
            ),
            StartMenuButton(
                "SETTINGS",
                button_x, button_start_y + START_MENU_BUTTON_HEIGHT + START_MENU_BUTTON_SPACING,
                START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT,
                MenuAction.SETTINGS,
                START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER
            ),
        ]

    def hide(self) -> None:
        """Hide start menu."""
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
        Render start menu.

        @param ui: UI renderer.
        """
        if not self._visible:
            return

        # Fill background
        ui.draw_rect(0, 0, ui.width, ui.height, START_MENU_BG_COLOR)

        center_x = ui.width / 2
        center_y = ui.height / 2

        # Title "VoxEx"
        title = "VoxEx"
        title_width, title_height = ui.measure_text(title, scale=2.5)
        ui.draw_text(
            title,
            center_x - title_width / 2,
            center_y - 120,
            START_MENU_TITLE_COLOR,
            scale=2.5
        )

        # Subtitle
        subtitle = "The Python Voxel Explorer"
        sub_width, sub_height = ui.measure_text(subtitle, scale=1.0)
        ui.draw_text(
            subtitle,
            center_x - sub_width / 2,
            center_y - 70,
            START_MENU_SUBTITLE_COLOR,
            scale=1.0
        )

        # Seed display
        seed_label = f"Seed: {self._seed}"
        seed_width, seed_height = ui.measure_text(seed_label, scale=1.0)

        # Draw seed input background
        input_width = START_MENU_BUTTON_WIDTH
        input_height = 35
        input_x = center_x - input_width / 2
        input_y = center_y - 10

        # Border
        ui.draw_rect(
            input_x - 2, input_y - 2,
            input_width + 4, input_height + 4,
            START_MENU_INPUT_BORDER_COLOR
        )
        # Background
        ui.draw_rect(
            input_x, input_y,
            input_width, input_height,
            START_MENU_INPUT_BG_COLOR
        )
        # Seed text
        ui.draw_text(
            seed_label,
            input_x + 10,
            input_y + (input_height - seed_height) / 2,
            MENU_TEXT_COLOR,
            scale=1.0
        )

        # Buttons
        for button in self._buttons:
            button.render(ui)

        # Footer hint
        hint = "Press SPACE or click Create to start"
        hint_width, hint_height = ui.measure_text(hint, scale=0.8)
        ui.draw_text(
            hint,
            center_x - hint_width / 2,
            ui.height - 50,
            START_MENU_SUBTITLE_COLOR,
            scale=0.8
        )
