"""Preset button component for VoxEx UI.

Provides a selectable button for world generation presets.
Used in a group where only one preset can be selected at a time.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Callable, List

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Preset button colors
PRESET_BG_COLOR = (50, 50, 60, 255)
PRESET_BG_HOVER = (60, 60, 75, 255)
PRESET_BG_SELECTED = (70, 100, 150, 255)
PRESET_BORDER_COLOR = (80, 80, 90, 255)
PRESET_BORDER_SELECTED = (100, 140, 200, 255)
PRESET_TEXT_COLOR = (200, 200, 200, 255)
PRESET_TEXT_SELECTED = (255, 255, 255, 255)


@dataclass
class PresetButton:
    """
    Selectable preset button.

    Used in a group where clicking one deselects others.
    Shows distinct selected state with different background color.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 80.0
    height: float = 32.0
    label: str = "Preset"
    preset_id: str = "default"
    selected: bool = False
    hovered: bool = False

    # Callback when selected
    on_select: Optional[Callable[[str], None]] = field(default=None, repr=False)

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the button.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click to select this preset.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if button was clicked.
        """
        if self.contains(mx, my):
            if not self.selected:
                self.selected = True
                if self.on_select:
                    self.on_select(self.preset_id)
            return True
        return False

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover state based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        self.hovered = self.contains(mx, my)

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the preset button.

        @param ui: UI renderer.
        """
        # Determine colors based on state
        if self.selected:
            bg_color = PRESET_BG_SELECTED
            border_color = PRESET_BORDER_SELECTED
            text_color = PRESET_TEXT_SELECTED
        elif self.hovered:
            bg_color = PRESET_BG_HOVER
            border_color = PRESET_BORDER_COLOR
            text_color = PRESET_TEXT_COLOR
        else:
            bg_color = PRESET_BG_COLOR
            border_color = PRESET_BORDER_COLOR
            text_color = PRESET_TEXT_COLOR

        # Draw border
        ui.draw_rect(self.x - 1, self.y - 1,
                     self.width + 2, self.height + 2, border_color)

        # Draw background
        ui.draw_rect(self.x, self.y, self.width, self.height, bg_color)

        # Draw label centered
        label_w, label_h = ui.measure_text(self.label, scale=0.8)
        label_x = self.x + (self.width - label_w) / 2
        label_y = self.y + (self.height - label_h) / 2
        ui.draw_text(self.label, label_x, label_y, text_color, scale=0.8)


class PresetButtonGroup:
    """
    Group of mutually exclusive preset buttons.

    Only one button can be selected at a time.
    Provides unified click handling and state management.
    """

    def __init__(self):
        """Create an empty preset button group."""
        self.buttons: List[PresetButton] = []
        self.selected_id: Optional[str] = None
        self._on_change: Optional[Callable[[str], None]] = None

    def add_button(self, button: PresetButton) -> None:
        """
        Add a button to the group.

        @param button: PresetButton to add.
        """
        self.buttons.append(button)

        # If this is the first selected button, track it
        if button.selected:
            self.selected_id = button.preset_id

    def set_on_change(self, callback: Callable[[str], None]) -> None:
        """
        Set callback for when selection changes.

        @param callback: Function to call with new preset_id.
        """
        self._on_change = callback

    def select(self, preset_id: str) -> None:
        """
        Select a preset by ID.

        @param preset_id: ID of preset to select.
        """
        if preset_id == self.selected_id:
            return

        for button in self.buttons:
            button.selected = (button.preset_id == preset_id)

        self.selected_id = preset_id

        if self._on_change:
            self._on_change(preset_id)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click on any button in the group.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if any button was clicked.
        """
        for button in self.buttons:
            if button.contains(mx, my):
                if button.preset_id != self.selected_id:
                    self.select(button.preset_id)
                return True
        return False

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover states for all buttons.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        for button in self.buttons:
            button.update_hover(mx, my)

    def render(self, ui: "UIRenderer") -> None:
        """
        Render all buttons in the group.

        @param ui: UI renderer.
        """
        for button in self.buttons:
            button.render(ui)

    def layout_horizontal(self, x: float, y: float, spacing: float = 8.0) -> None:
        """
        Arrange buttons horizontally with equal spacing.

        @param x: Starting X coordinate.
        @param y: Y coordinate for all buttons.
        @param spacing: Space between buttons.
        """
        current_x = x
        for button in self.buttons:
            button.x = current_x
            button.y = y
            current_x += button.width + spacing

    def get_total_width(self, spacing: float = 8.0) -> float:
        """
        Get total width of all buttons including spacing.

        @param spacing: Space between buttons.
        @returns: Total width in pixels.
        """
        if not self.buttons:
            return 0.0

        total = sum(b.width for b in self.buttons)
        total += spacing * (len(self.buttons) - 1)
        return total
