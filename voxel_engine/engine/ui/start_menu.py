"""Start menu UI for VoxEx.

Displays the main menu before game starts with title, seed input, and buttons.
Styled to match voxEx.html start menu design.
"""
from typing import List
import random

from .ui_renderer import UIRenderer
from .pause_menu import Button, MenuAction
from .constants import (
    START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT, START_MENU_BUTTON_SPACING,
    START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER,
    START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER,
    MENU_TEXT_COLOR
)


# Panel colors (matching voxEx.html #seed-menu styling)
PANEL_BG_COLOR = (0, 0, 0, 216)  # rgba(0,0,0,0.85)
PANEL_BORDER_COLOR = (68, 68, 68, 255)  # #444
INPUT_BG_COLOR = (30, 30, 30, 255)  # #1e1e1e
INPUT_BORDER_COLOR = (68, 68, 68, 255)  # #444
TITLE_COLOR = (255, 255, 255, 255)
SUBTITLE_COLOR = (170, 170, 170, 255)  # #aaa
HINT_COLOR = (136, 136, 136, 255)  # #888


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

    Displays a centered panel with title, seed display, and action buttons.
    Styled to match the HTML version's #seed-menu.
    """

    __slots__ = (
        '_visible', '_buttons', '_seed', '_screen_width', '_screen_height',
        '_panel_x', '_panel_y', '_panel_width', '_panel_height'
    )

    # Panel dimensions (matching voxEx.html)
    PANEL_WIDTH = 380
    PANEL_PADDING = 30

    def __init__(self):
        """Create start menu."""
        self._visible = False
        self._buttons: List[StartMenuButton] = []
        self._seed: int = random.randint(1, 999999)
        self._screen_width = 0
        self._screen_height = 0
        self._panel_x = 0.0
        self._panel_y = 0.0
        self._panel_width = float(self.PANEL_WIDTH)
        self._panel_height = 0.0

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

        # Calculate panel dimensions
        self._panel_width = float(self.PANEL_WIDTH)
        # Height: title + subtitle + divider + button + gap + seed area + settings button + padding
        self._panel_height = 320.0  # Approximate height to fit content

        # Center panel on screen
        self._panel_x = (screen_width - self._panel_width) / 2
        self._panel_y = (screen_height - self._panel_height) / 2

        # Button dimensions
        btn_width = self._panel_width - 2 * self.PANEL_PADDING
        btn_height = 45.0
        btn_x = self._panel_x + self.PANEL_PADDING

        # Create buttons positioned within panel
        # "Create New World" at top, below title area
        create_y = self._panel_y + 100  # After title and subtitle

        self._buttons = [
            StartMenuButton(
                "Create New World",
                btn_x, create_y,
                btn_width, btn_height,
                MenuAction.CREATE_WORLD,
                START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER
            ),
            StartMenuButton(
                "Settings",
                btn_x, self._panel_y + self._panel_height - self.PANEL_PADDING - btn_height,
                btn_width, btn_height,
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

        px = self._panel_x
        py = self._panel_y
        pw = self._panel_width
        ph = self._panel_height
        pad = float(self.PANEL_PADDING)

        # Draw panel background
        ui.draw_rect(px, py, pw, ph, PANEL_BG_COLOR)

        # Title "VoxEx" (h3 in HTML - smaller)
        title = "VoxEx"
        title_width, title_height = ui.measure_text(title, scale=1.5)
        ui.draw_text(
            title,
            px + (pw - title_width) / 2,
            py + pad,
            TITLE_COLOR,
            scale=1.5
        )

        # Subtitle "The Python Voxel Explorer" (h1 in HTML - larger)
        subtitle = "The Python Voxel Explorer"
        sub_width, sub_height = ui.measure_text(subtitle, scale=1.0)
        ui.draw_text(
            subtitle,
            px + (pw - sub_width) / 2,
            py + pad + title_height + 5,
            SUBTITLE_COLOR,
            scale=1.0
        )

        # Divider line after first button
        divider_y = self._buttons[0].y + self._buttons[0].height + 15
        ui.draw_rect(px + pad, divider_y, pw - 2 * pad, 1, PANEL_BORDER_COLOR)

        # Seed display section
        seed_y = divider_y + 20
        seed_label = "Seed"
        label_width, label_height = ui.measure_text(seed_label, scale=0.9)
        ui.draw_text(seed_label, px + pad, seed_y, SUBTITLE_COLOR, scale=0.9)

        # Seed input box
        input_y = seed_y + label_height + 8
        input_height = 35.0
        input_width = pw - 2 * pad

        # Input border and background
        ui.draw_rect(px + pad - 1, input_y - 1, input_width + 2, input_height + 2, INPUT_BORDER_COLOR)
        ui.draw_rect(px + pad, input_y, input_width, input_height, INPUT_BG_COLOR)

        # Seed value
        seed_text = str(self._seed)
        seed_tw, seed_th = ui.measure_text(seed_text, scale=1.0)
        ui.draw_text(
            seed_text,
            px + pad + 10,
            input_y + (input_height - seed_th) / 2,
            TITLE_COLOR,
            scale=1.0
        )

        # Hint text
        hint = "Press R to randomize"
        hint_width, _ = ui.measure_text(hint, scale=0.7)
        ui.draw_text(
            hint,
            px + pad,
            input_y + input_height + 8,
            HINT_COLOR,
            scale=0.7
        )

        # Second divider before settings
        divider2_y = self._buttons[1].y - 15
        ui.draw_rect(px + pad, divider2_y, pw - 2 * pad, 1, PANEL_BORDER_COLOR)

        # Render buttons
        for button in self._buttons:
            button.render(ui)

        # Footer hint at bottom of screen
        footer = "Press SPACE or click Create to start"
        footer_width, footer_height = ui.measure_text(footer, scale=0.8)
        ui.draw_text(
            footer,
            (ui.width - footer_width) / 2,
            ui.height - 40,
            HINT_COLOR,
            scale=0.8
        )
