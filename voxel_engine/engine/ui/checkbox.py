"""Checkbox component for VoxEx UI.

Provides a toggleable checkbox with label for boolean settings.
Used for biome selection, structure toggles, and feature flags.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Callable

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Checkbox colors
CHECKBOX_BG_COLOR = (40, 40, 50, 255)
CHECKBOX_BORDER_COLOR = (100, 100, 100, 255)
CHECKBOX_CHECKED_COLOR = (76, 175, 80, 255)
CHECKBOX_CHECK_COLOR = (255, 255, 255, 255)
CHECKBOX_LABEL_COLOR = (220, 220, 220, 255)
CHECKBOX_DISABLED_BG = (30, 30, 30, 255)
CHECKBOX_DISABLED_BORDER = (60, 60, 60, 255)
CHECKBOX_DISABLED_LABEL = (100, 100, 100, 255)


@dataclass
class Checkbox:
    """
    Toggleable checkbox with label.

    Renders a square box with a checkmark when checked.
    Label is displayed to the right of the box.
    """

    x: float = 0.0
    y: float = 0.0
    label: str = ""
    checked: bool = True
    enabled: bool = True
    size: float = 18.0  # Box size in pixels
    hovered: bool = False

    # Callback when toggled
    on_change: Optional[Callable[[bool], None]] = field(default=None, repr=False)

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the clickable area (box + label).

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        # Clickable area includes box and label
        # Use a reasonable width for label click area
        total_width = self.size + 8 + len(self.label) * 10  # Approximate
        return (self.x <= mx <= self.x + total_width and
                self.y <= my <= self.y + self.size)

    def contains_box(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the checkbox box only.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside box.
        """
        return (self.x <= mx <= self.x + self.size and
                self.y <= my <= self.y + self.size)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click to toggle checked state.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if checkbox was toggled.
        """
        if not self.enabled:
            return False

        if self.contains(mx, my):
            self.checked = not self.checked
            if self.on_change:
                self.on_change(self.checked)
            return True
        return False

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover state based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        self.hovered = self.enabled and self.contains(mx, my)

    def set_checked(self, checked: bool) -> None:
        """
        Set checked state programmatically.

        @param checked: New checked state.
        """
        if checked != self.checked:
            self.checked = checked
            if self.on_change:
                self.on_change(self.checked)

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the checkbox with label.

        @param ui: UI renderer.
        """
        # Choose colors based on state
        if self.enabled:
            border_color = CHECKBOX_BORDER_COLOR
            label_color = CHECKBOX_LABEL_COLOR
            if self.checked:
                bg_color = CHECKBOX_CHECKED_COLOR
            else:
                bg_color = CHECKBOX_BG_COLOR
        else:
            bg_color = CHECKBOX_DISABLED_BG
            border_color = CHECKBOX_DISABLED_BORDER
            label_color = CHECKBOX_DISABLED_LABEL

        # Add hover effect
        if self.hovered and self.enabled:
            # Slightly lighten the border
            border_color = (140, 140, 140, 255)

        # Draw box border
        ui.draw_rect(self.x - 1, self.y - 1,
                     self.size + 2, self.size + 2, border_color)

        # Draw box background
        ui.draw_rect(self.x, self.y, self.size, self.size, bg_color)

        # Draw checkmark if checked
        if self.checked:
            # Draw a simple checkmark using text
            check_w, check_h = ui.measure_text("X", scale=0.9)
            check_x = self.x + (self.size - check_w) / 2
            check_y = self.y + (self.size - check_h) / 2
            ui.draw_text("X", check_x, check_y, CHECKBOX_CHECK_COLOR, scale=0.9)

        # Draw label to the right of box
        if self.label:
            label_x = self.x + self.size + 8
            label_w, label_h = ui.measure_text(self.label, scale=0.9)
            label_y = self.y + (self.size - label_h) / 2
            ui.draw_text(self.label, label_x, label_y, label_color, scale=0.9)

    def get_total_width(self, ui: "UIRenderer") -> float:
        """
        Get total width of checkbox including label.

        @param ui: UI renderer.
        @returns: Total width in pixels.
        """
        if not self.label:
            return self.size

        label_w, _ = ui.measure_text(self.label, scale=0.9)
        return self.size + 8 + label_w

    def get_height(self) -> float:
        """Get height of checkbox."""
        return self.size
