"""Dropdown component for VoxEx UI.

Provides a dropdown select component for choosing from a list of options.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, List, Optional, Tuple

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Dropdown colors
DROPDOWN_BG_COLOR = (50, 50, 60, 255)
DROPDOWN_BG_HOVER = (60, 60, 75, 255)
DROPDOWN_BG_OPEN = (55, 55, 70, 255)
DROPDOWN_BORDER_COLOR = (80, 80, 95, 255)
DROPDOWN_BORDER_FOCUS = (100, 140, 200, 255)
DROPDOWN_TEXT_COLOR = (220, 220, 220, 255)
DROPDOWN_ARROW_COLOR = (150, 150, 160, 255)

# Option list colors
OPTION_BG_COLOR = (45, 45, 55, 255)
OPTION_BG_HOVER = (65, 75, 100, 255)
OPTION_BG_SELECTED = (70, 90, 130, 255)
OPTION_TEXT_COLOR = (220, 220, 220, 255)
OPTION_BORDER_COLOR = (70, 70, 85, 255)


@dataclass
class Dropdown:
    """
    Dropdown select component.

    Displays a button that opens a list of options when clicked.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 150.0
    height: float = 28.0

    # Options: list of (display_text, value) tuples
    options: List[Tuple[str, Any]] = field(default_factory=list)
    selected_index: int = 0

    # State
    is_open: bool = False
    hovered: bool = False
    hovered_option: int = -1

    # Styling
    max_visible_options: int = 6
    option_height: float = 26.0

    # Callback
    on_change: Optional[Callable[[Any], None]] = None

    @property
    def selected_value(self) -> Any:
        """Get the currently selected value."""
        if 0 <= self.selected_index < len(self.options):
            return self.options[self.selected_index][1]
        return None

    @property
    def selected_text(self) -> str:
        """Get the display text of the selected option."""
        if 0 <= self.selected_index < len(self.options):
            return self.options[self.selected_index][0]
        return ""

    def set_value(self, value: Any) -> None:
        """
        Set selection by value.

        @param value: Value to select.
        """
        for i, (_, v) in enumerate(self.options):
            if v == value:
                self.selected_index = i
                return

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the dropdown button.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def contains_options(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the options list.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside options area.
        """
        if not self.is_open:
            return False

        options_height = min(len(self.options), self.max_visible_options) * self.option_height
        options_y = self.y + self.height

        return (self.x <= mx <= self.x + self.width and
                options_y <= my <= options_y + options_height)

    def get_option_at(self, mx: float, my: float) -> int:
        """
        Get the option index at a given position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: Option index, or -1 if not over any option.
        """
        if not self.is_open:
            return -1

        if not (self.x <= mx <= self.x + self.width):
            return -1

        options_y = self.y + self.height
        relative_y = my - options_y

        if relative_y < 0:
            return -1

        index = int(relative_y / self.option_height)
        if 0 <= index < min(len(self.options), self.max_visible_options):
            return index
        return -1

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover state based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        self.hovered = self.contains(mx, my)
        if self.is_open:
            self.hovered_option = self.get_option_at(mx, my)
        else:
            self.hovered_option = -1

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if click was handled.
        """
        # Check if clicking on main button
        if self.contains(mx, my):
            self.is_open = not self.is_open
            return True

        # Check if clicking on an option
        if self.is_open:
            option_idx = self.get_option_at(mx, my)
            if option_idx >= 0:
                old_value = self.selected_value
                self.selected_index = option_idx
                self.is_open = False

                # Fire callback if value changed
                if self.on_change and self.selected_value != old_value:
                    self.on_change(self.selected_value)
                return True

            # Click outside - close dropdown
            self.is_open = False
            return True

        return False

    def close(self) -> None:
        """Close the dropdown."""
        self.is_open = False
        self.hovered_option = -1

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the dropdown.

        @param ui: UI renderer.
        """
        # Determine button colors
        if self.is_open:
            bg_color = DROPDOWN_BG_OPEN
            border_color = DROPDOWN_BORDER_FOCUS
        elif self.hovered:
            bg_color = DROPDOWN_BG_HOVER
            border_color = DROPDOWN_BORDER_COLOR
        else:
            bg_color = DROPDOWN_BG_COLOR
            border_color = DROPDOWN_BORDER_COLOR

        # Draw border
        ui.draw_rect(self.x - 1, self.y - 1, self.width + 2, self.height + 2, border_color)

        # Draw background
        ui.draw_rect(self.x, self.y, self.width, self.height, bg_color)

        # Draw selected text
        padding = 8.0
        text = self.selected_text if self.selected_text else "Select..."
        text_w, text_h = ui.measure_text(text, scale=0.85)
        text_y = self.y + (self.height - text_h) / 2
        ui.draw_text(text, self.x + padding, text_y, DROPDOWN_TEXT_COLOR, scale=0.85)

        # Draw arrow
        arrow = "v" if not self.is_open else "^"
        arrow_w, arrow_h = ui.measure_text(arrow, scale=0.7)
        arrow_x = self.x + self.width - padding - arrow_w
        arrow_y = self.y + (self.height - arrow_h) / 2
        ui.draw_text(arrow, arrow_x, arrow_y, DROPDOWN_ARROW_COLOR, scale=0.7)

        # Draw options list if open
        if self.is_open:
            self._render_options(ui)

    def _render_options(self, ui: "UIRenderer") -> None:
        """
        Render the options list.

        @param ui: UI renderer.
        """
        options_y = self.y + self.height
        visible_count = min(len(self.options), self.max_visible_options)
        options_height = visible_count * self.option_height

        # Draw options border
        ui.draw_rect(
            self.x - 1,
            options_y - 1,
            self.width + 2,
            options_height + 2,
            OPTION_BORDER_COLOR
        )

        # Draw options background
        ui.draw_rect(self.x, options_y, self.width, options_height, OPTION_BG_COLOR)

        # Draw each option
        for i in range(visible_count):
            opt_y = options_y + i * self.option_height

            # Determine option background
            if i == self.selected_index:
                opt_bg = OPTION_BG_SELECTED
            elif i == self.hovered_option:
                opt_bg = OPTION_BG_HOVER
            else:
                opt_bg = OPTION_BG_COLOR

            # Draw option background (if not default)
            if opt_bg != OPTION_BG_COLOR:
                ui.draw_rect(self.x, opt_y, self.width, self.option_height, opt_bg)

            # Draw separator line
            if i > 0:
                ui.draw_rect(
                    self.x + 4,
                    opt_y,
                    self.width - 8,
                    1,
                    (60, 60, 70, 100)
                )

            # Draw option text
            text = self.options[i][0]
            padding = 8.0
            text_w, text_h = ui.measure_text(text, scale=0.8)
            text_y = opt_y + (self.option_height - text_h) / 2
            ui.draw_text(text, self.x + padding, text_y, OPTION_TEXT_COLOR, scale=0.8)
