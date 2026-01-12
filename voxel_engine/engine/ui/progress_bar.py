"""Progress bar component for VoxEx UI.

Provides a horizontal progress bar with optional label and color thresholds.
Used for displaying storage usage, loading progress, and other metrics.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Progress bar colors
PROGRESS_BG_COLOR = (50, 50, 55, 255)
PROGRESS_FILL_COLOR = (76, 175, 80, 255)  # Green
PROGRESS_WARNING_COLOR = (255, 193, 7, 255)  # Yellow at 75%+
PROGRESS_DANGER_COLOR = (244, 67, 54, 255)  # Red at 90%+
PROGRESS_BORDER_COLOR = (80, 80, 90, 255)
PROGRESS_LABEL_COLOR = (200, 200, 200, 255)


@dataclass
class ProgressBar:
    """
    Horizontal progress bar with optional label.

    Shows fill progress from 0 to max_value with automatic color
    changes at warning (75%) and danger (90%) thresholds.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 200.0
    height: float = 20.0

    value: float = 0.0
    max_value: float = 100.0

    # Colors (can be customized per instance)
    background_color: tuple = PROGRESS_BG_COLOR
    fill_color: tuple = PROGRESS_FILL_COLOR
    warning_color: tuple = PROGRESS_WARNING_COLOR
    danger_color: tuple = PROGRESS_DANGER_COLOR
    border_color: tuple = PROGRESS_BORDER_COLOR
    label_color: tuple = PROGRESS_LABEL_COLOR

    # Thresholds for color changes
    warning_threshold: float = 0.75
    danger_threshold: float = 0.90

    # Label options
    show_label: bool = True
    label_format: str = "{percent:.0f}%"  # or "{value:.1f}/{max:.1f}"
    label_position: str = "right"  # "right", "inside", or "above"

    @property
    def percent(self) -> float:
        """Get fill percentage as 0.0 to 1.0."""
        if self.max_value <= 0:
            return 0.0
        return min(1.0, max(0.0, self.value / self.max_value))

    @property
    def percent_display(self) -> float:
        """Get fill percentage as 0 to 100."""
        return self.percent * 100

    @property
    def current_fill_color(self) -> tuple:
        """Get color based on current fill percentage."""
        if self.percent >= self.danger_threshold:
            return self.danger_color
        elif self.percent >= self.warning_threshold:
            return self.warning_color
        return self.fill_color

    def set_value(self, value: float, max_value: Optional[float] = None) -> None:
        """
        Set current and optionally max value.

        @param value: Current value.
        @param max_value: Optional new maximum value.
        """
        self.value = max(0.0, value)
        if max_value is not None:
            self.max_value = max(0.0, max_value)

    def get_label_text(self) -> str:
        """Generate label text from format string."""
        return self.label_format.format(
            percent=self.percent_display,
            value=self.value,
            max=self.max_value
        )

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the progress bar.

        @param ui: UI renderer.
        """
        # Draw border
        ui.draw_rect(
            self.x - 1, self.y - 1,
            self.width + 2, self.height + 2,
            self.border_color
        )

        # Draw background
        ui.draw_rect(self.x, self.y, self.width, self.height, self.background_color)

        # Draw fill
        fill_width = self.width * self.percent
        if fill_width > 0:
            ui.draw_rect(self.x, self.y, fill_width, self.height, self.current_fill_color)

        # Draw label
        if self.show_label:
            label_text = self.get_label_text()
            label_w, label_h = ui.measure_text(label_text, scale=0.8)

            if self.label_position == "right":
                label_x = self.x + self.width + 10
                label_y = self.y + (self.height - label_h) / 2
            elif self.label_position == "inside":
                label_x = self.x + (self.width - label_w) / 2
                label_y = self.y + (self.height - label_h) / 2
            elif self.label_position == "above":
                label_x = self.x
                label_y = self.y - label_h - 4
            else:
                label_x = self.x + self.width + 10
                label_y = self.y + (self.height - label_h) / 2

            ui.draw_text(label_text, label_x, label_y, self.label_color, scale=0.8)

    def get_total_width(self, ui: "UIRenderer") -> float:
        """
        Get total width including label.

        @param ui: UI renderer for text measurement.
        @returns: Total width in pixels.
        """
        if not self.show_label or self.label_position != "right":
            return self.width

        label_text = self.get_label_text()
        label_w, _ = ui.measure_text(label_text, scale=0.8)
        return self.width + 10 + label_w
