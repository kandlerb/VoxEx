"""Start menu UI for VoxEx.

Displays the main menu before game starts with title, seed input, and buttons.
Styled to match voxEx.html start menu design.
"""
from typing import List, Dict, Any, Optional
import random

from .ui_renderer import UIRenderer
from .pause_menu import Button, MenuAction
from .constants import (
    START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT, START_MENU_BUTTON_SPACING,
    START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER,
    START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER,
    MENU_TEXT_COLOR
)


# Settings panel colors
SETTINGS_SLIDER_BG = (50, 50, 50, 255)
SETTINGS_SLIDER_FILL = (76, 175, 80, 255)
SETTINGS_SLIDER_HANDLE = (200, 200, 200, 255)
SETTINGS_BACK_COLOR = (100, 60, 60, 255)
SETTINGS_BACK_HOVER = (130, 80, 80, 255)


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


class SettingsPanel:
    """
    Settings panel for configuring game options.

    Displays render distance slider and back button.
    """

    __slots__ = (
        '_visible', '_back_button', '_screen_width', '_screen_height',
        '_panel_x', '_panel_y', '_panel_width', '_panel_height',
        '_render_distance', '_slider_dragging', '_slider_x', '_slider_y',
        '_slider_width', '_slider_height'
    )

    MIN_PANEL_WIDTH = 350
    PANEL_PADDING = 30
    SLIDER_HEIGHT = 20

    # Render distance range
    MIN_RENDER_DISTANCE = 2
    MAX_RENDER_DISTANCE = 16

    def __init__(self):
        """Create settings panel."""
        self._visible = False
        self._back_button: Optional[StartMenuButton] = None
        self._screen_width = 0
        self._screen_height = 0
        self._panel_x = 0.0
        self._panel_y = 0.0
        self._panel_width = float(self.MIN_PANEL_WIDTH)
        self._panel_height = 280.0
        self._render_distance = 4  # Default render distance
        self._slider_dragging = False
        self._slider_x = 0.0
        self._slider_y = 0.0
        self._slider_width = 0.0
        self._slider_height = float(self.SLIDER_HEIGHT)

    @property
    def visible(self) -> bool:
        """Check if settings panel is visible."""
        return self._visible

    @property
    def render_distance(self) -> int:
        """Get current render distance setting."""
        return self._render_distance

    @render_distance.setter
    def render_distance(self, value: int) -> None:
        """Set render distance."""
        self._render_distance = max(
            self.MIN_RENDER_DISTANCE,
            min(self.MAX_RENDER_DISTANCE, value)
        )

    def show(self, screen_width: int, screen_height: int) -> None:
        """
        Show settings panel.

        @param screen_width: Screen width in pixels.
        @param screen_height: Screen height in pixels.
        """
        self._visible = True
        self._screen_width = screen_width
        self._screen_height = screen_height

        self._panel_width = float(self.MIN_PANEL_WIDTH)
        self._panel_x = (screen_width - self._panel_width) / 2
        self._panel_y = (screen_height - self._panel_height) / 2

        # Create back button
        self._back_button = StartMenuButton(
            "Back",
            0, 0, 100, 45.0,
            MenuAction.BACK,
            SETTINGS_BACK_COLOR, SETTINGS_BACK_HOVER
        )

    def hide(self) -> None:
        """Hide settings panel."""
        self._visible = False
        self._back_button = None
        self._slider_dragging = False

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update hover states and slider dragging.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        if self._back_button:
            self._back_button.hovered = self._back_button.contains(mx, my)

        # Update slider if dragging
        if self._slider_dragging and self._slider_width > 0:
            # Calculate new value based on mouse position
            relative_x = mx - self._slider_x
            ratio = max(0.0, min(1.0, relative_x / self._slider_width))
            range_val = self.MAX_RENDER_DISTANCE - self.MIN_RENDER_DISTANCE
            self._render_distance = int(
                self.MIN_RENDER_DISTANCE + ratio * range_val + 0.5
            )

    def start_drag(self, mx: float, my: float) -> bool:
        """
        Start slider drag if click is on slider.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if drag started.
        """
        # Check if click is on slider area
        if (self._slider_x <= mx <= self._slider_x + self._slider_width and
                self._slider_y <= my <= self._slider_y + self._slider_height):
            self._slider_dragging = True
            self.update_mouse(mx, my)  # Update value immediately
            return True
        return False

    def stop_drag(self) -> None:
        """Stop slider dragging."""
        self._slider_dragging = False

    def click(self, mx: float, my: float) -> MenuAction:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: MenuAction if button clicked, else NONE.
        """
        if self._back_button and self._back_button.contains(mx, my):
            return MenuAction.BACK
        return MenuAction.NONE

    def render(self, ui: UIRenderer) -> None:
        """
        Render settings panel.

        @param ui: UI renderer.
        """
        if not self._visible:
            return

        pad = float(self.PANEL_PADDING)
        pw = self._panel_width
        ph = self._panel_height

        # Center panel
        px = (ui.width - pw) / 2
        py = (ui.height - ph) / 2
        self._panel_x = px
        self._panel_y = py

        # Draw panel background
        ui.draw_rect(px, py, pw, ph, PANEL_BG_COLOR)

        # Title
        title = "Settings"
        title_width, title_height = ui.measure_text(title, scale=1.5)
        ui.draw_text(
            title,
            px + (pw - title_width) / 2,
            py + pad,
            TITLE_COLOR,
            scale=1.5
        )

        # Divider after title
        divider_y = py + pad + title_height + 15
        ui.draw_rect(px + pad, divider_y, pw - 2 * pad, 1, PANEL_BORDER_COLOR)

        # Render distance setting
        setting_y = divider_y + 25
        label = f"Render Distance: {self._render_distance}"
        label_width, label_height = ui.measure_text(label, scale=0.9)
        ui.draw_text(label, px + pad, setting_y, SUBTITLE_COLOR, scale=0.9)

        # Slider
        slider_y = setting_y + label_height + 12
        slider_width = pw - 2 * pad
        slider_height = self._slider_height

        # Store slider position for hit detection
        self._slider_x = px + pad
        self._slider_y = slider_y
        self._slider_width = slider_width

        # Slider background
        ui.draw_rect(px + pad, slider_y, slider_width, slider_height, SETTINGS_SLIDER_BG)

        # Slider fill (based on current value)
        range_val = self.MAX_RENDER_DISTANCE - self.MIN_RENDER_DISTANCE
        ratio = (self._render_distance - self.MIN_RENDER_DISTANCE) / range_val
        fill_width = slider_width * ratio
        ui.draw_rect(px + pad, slider_y, fill_width, slider_height, SETTINGS_SLIDER_FILL)

        # Slider handle
        handle_width = 8
        handle_x = px + pad + fill_width - handle_width / 2
        ui.draw_rect(handle_x, slider_y - 2, handle_width, slider_height + 4, SETTINGS_SLIDER_HANDLE)

        # Hint text
        hint = "Drag slider to adjust (2-16 chunks)"
        ui.draw_text(hint, px + pad, slider_y + slider_height + 8, HINT_COLOR, scale=0.7)

        # Update back button position
        if self._back_button:
            btn_width = pw - 2 * pad
            btn_x = px + pad
            btn_y = py + ph - pad - 45.0
            self._back_button.x = btn_x
            self._back_button.y = btn_y
            self._back_button.width = btn_width
            self._back_button.render(ui)

        # Footer hint
        footer = "Press ESC or click Back to return"
        footer_width, _ = ui.measure_text(footer, scale=0.8)
        ui.draw_text(
            footer,
            (ui.width - footer_width) / 2,
            ui.height - 40,
            HINT_COLOR,
            scale=0.8
        )


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

    # Panel dimensions
    MIN_PANEL_WIDTH = 320
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
        self._panel_width = float(self.MIN_PANEL_WIDTH)
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

        # Panel dimensions will be calculated dynamically in render()
        # based on text measurements. Set initial estimates here.
        self._panel_width = float(self.MIN_PANEL_WIDTH)
        self._panel_height = 320.0
        self._panel_x = (screen_width - self._panel_width) / 2
        self._panel_y = (screen_height - self._panel_height) / 2

        # Create buttons (positions will be updated in render)
        self._buttons = [
            StartMenuButton(
                "Create New World",
                0, 0, 100, 45.0,
                MenuAction.CREATE_WORLD,
                START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER
            ),
            StartMenuButton(
                "Settings",
                0, 0, 100, 45.0,
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

        pad = float(self.PANEL_PADDING)

        # Measure text to calculate dynamic panel width
        title = "VoxEx"
        title_width, title_height = ui.measure_text(title, scale=1.5)

        subtitle = "The Python Voxel Explorer"
        sub_width, sub_height = ui.measure_text(subtitle, scale=1.0)

        # Panel width based on longest text element + padding
        content_width = max(title_width, sub_width, self.MIN_PANEL_WIDTH - 2 * pad)
        pw = content_width + 2 * pad
        ph = self._panel_height

        # Center panel on screen
        px = (ui.width - pw) / 2
        py = (ui.height - ph) / 2

        # Update stored values for click detection
        self._panel_x = px
        self._panel_y = py
        self._panel_width = pw

        # Calculate button dimensions and positions
        btn_width = pw - 2 * pad
        btn_height = 45.0
        btn_x = px + pad
        create_y = py + 100  # After title and subtitle
        settings_y = py + ph - pad - btn_height

        # Update button positions
        self._buttons[0].x = btn_x
        self._buttons[0].y = create_y
        self._buttons[0].width = btn_width
        self._buttons[1].x = btn_x
        self._buttons[1].y = settings_y
        self._buttons[1].width = btn_width

        # Draw panel background
        ui.draw_rect(px, py, pw, ph, PANEL_BG_COLOR)

        # Title "VoxEx"
        ui.draw_text(
            title,
            px + (pw - title_width) / 2,
            py + pad,
            TITLE_COLOR,
            scale=1.5
        )

        # Subtitle
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
        footer_width, _ = ui.measure_text(footer, scale=0.8)
        ui.draw_text(
            footer,
            (ui.width - footer_width) / 2,
            ui.height - 40,
            HINT_COLOR,
            scale=0.8
        )
