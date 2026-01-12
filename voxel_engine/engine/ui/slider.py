"""Slider component for VoxEx UI.

Provides a draggable slider for selecting numeric values within a range.
Used for settings like render distance, terrain amplitude, sea level, etc.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Callable

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Slider colors
SLIDER_BG_COLOR = (50, 50, 50, 255)
SLIDER_FILL_COLOR = (76, 175, 80, 255)
SLIDER_HANDLE_COLOR = (200, 200, 200, 255)
SLIDER_LABEL_COLOR = (170, 170, 170, 255)
SLIDER_VALUE_COLOR = (255, 255, 255, 255)
SLIDER_DISABLED_BG = (40, 40, 40, 255)
SLIDER_DISABLED_FILL = (60, 60, 60, 255)


@dataclass
class Slider:
    """
    Draggable slider for numeric value selection.

    Renders a horizontal slider bar with a draggable handle.
    Supports integer or float values with customizable range.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 200.0
    height: float = 20.0

    min_value: float = 0.0
    max_value: float = 100.0
    value: float = 50.0
    step: float = 1.0  # Step size for snapping (0 = continuous)

    label: str = ""  # Label shown above slider
    value_format: str = "{:.0f}"  # Format string for value display
    suffix: str = ""  # Suffix after value (e.g., "%", "m")

    enabled: bool = True
    dragging: bool = False

    # Callback when value changes
    on_change: Optional[Callable[[float], None]] = field(default=None, repr=False)

    def __post_init__(self):
        """Ensure value is within bounds."""
        self.value = max(self.min_value, min(self.max_value, self.value))

    @property
    def normalized(self) -> float:
        """Get value as 0-1 ratio."""
        range_val = self.max_value - self.min_value
        if range_val <= 0:
            return 0.0
        return (self.value - self.min_value) / range_val

    def set_normalized(self, ratio: float) -> None:
        """
        Set value from a 0-1 ratio.

        @param ratio: Value between 0 and 1.
        """
        ratio = max(0.0, min(1.0, ratio))
        range_val = self.max_value - self.min_value
        new_value = self.min_value + ratio * range_val

        # Apply step snapping if set
        if self.step > 0:
            new_value = round(new_value / self.step) * self.step

        # Clamp to range
        new_value = max(self.min_value, min(self.max_value, new_value))

        if new_value != self.value:
            self.value = new_value
            if self.on_change:
                self.on_change(self.value)

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the slider track.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click to start dragging.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if click started a drag.
        """
        if not self.enabled:
            return False

        if self.contains(mx, my):
            self.dragging = True
            self._update_from_mouse(mx)
            return True
        return False

    def handle_drag(self, mx: float, my: float) -> None:
        """
        Handle mouse drag to update value.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        if self.dragging and self.enabled:
            self._update_from_mouse(mx)

    def handle_release(self) -> None:
        """Handle mouse release to stop dragging."""
        self.dragging = False

    def _update_from_mouse(self, mx: float) -> None:
        """Update value based on mouse X position."""
        if self.width <= 0:
            return
        relative_x = mx - self.x
        ratio = relative_x / self.width
        self.set_normalized(ratio)

    def get_value(self) -> float:
        """Get the current value."""
        return self.value

    def get_int_value(self) -> int:
        """Get the current value as an integer."""
        return int(round(self.value))

    def set_value(self, value: float) -> None:
        """
        Set the slider value directly.

        @param value: New value.
        """
        value = max(self.min_value, min(self.max_value, value))
        if self.step > 0:
            value = round(value / self.step) * self.step
        if value != self.value:
            self.value = value
            if self.on_change:
                self.on_change(self.value)

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the slider.

        @param ui: UI renderer.
        """
        # Draw label if present
        if self.label:
            label_w, label_h = ui.measure_text(self.label, scale=0.85)
            ui.draw_text(self.label, self.x, self.y - label_h - 4,
                         SLIDER_LABEL_COLOR, scale=0.85)

        # Choose colors based on enabled state
        bg_color = SLIDER_BG_COLOR if self.enabled else SLIDER_DISABLED_BG
        fill_color = SLIDER_FILL_COLOR if self.enabled else SLIDER_DISABLED_FILL
        handle_color = SLIDER_HANDLE_COLOR if self.enabled else SLIDER_DISABLED_FILL

        # Draw track background
        ui.draw_rect(self.x, self.y, self.width, self.height, bg_color)

        # Draw fill (progress)
        fill_width = self.width * self.normalized
        ui.draw_rect(self.x, self.y, fill_width, self.height, fill_color)

        # Draw handle
        handle_width = 8
        handle_x = self.x + fill_width - handle_width / 2
        handle_x = max(self.x, min(self.x + self.width - handle_width, handle_x))
        ui.draw_rect(handle_x, self.y - 2, handle_width, self.height + 4, handle_color)

        # Draw value text to the right of slider
        value_text = self.value_format.format(self.value) + self.suffix
        value_w, value_h = ui.measure_text(value_text, scale=0.8)
        value_x = self.x + self.width + 10
        value_y = self.y + (self.height - value_h) / 2
        ui.draw_text(value_text, value_x, value_y, SLIDER_VALUE_COLOR, scale=0.8)

    def get_total_width(self, ui: "UIRenderer") -> float:
        """
        Get total width including value text.

        @param ui: UI renderer.
        @returns: Total width in pixels.
        """
        value_text = self.value_format.format(self.value) + self.suffix
        value_w, _ = ui.measure_text(value_text, scale=0.8)
        return self.width + 10 + value_w
