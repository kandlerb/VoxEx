"""Setting row component for VoxEx UI.

Provides a unified row component for displaying settings with
label, description, and appropriate control type.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, List, Optional, Tuple

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer
    from ..settings.profiles import SettingDefinition

from .slider import Slider
from .checkbox import Checkbox
from .dropdown import Dropdown


# Row colors
ROW_BG_COLOR = (35, 35, 45, 200)
ROW_BG_HOVER = (45, 45, 58, 220)
ROW_LABEL_COLOR = (220, 220, 230, 255)
ROW_DESC_COLOR = (140, 140, 150, 255)
ROW_ADVANCED_BADGE = (80, 80, 100, 255)
ROW_RESTART_BADGE = (120, 80, 40, 255)


@dataclass
class SettingRow:
    """
    A row component for displaying a single setting.

    Automatically creates the appropriate control based on setting type.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 400.0
    height: float = 50.0

    # Setting info
    key: str = ""
    category: str = ""
    label: str = ""
    description: str = ""
    is_advanced: bool = False
    requires_restart: bool = False

    # Control (created based on type)
    control: Any = None
    control_type: str = "bool"  # "bool", "slider", "dropdown"

    # State
    hovered: bool = False

    # Callback
    on_change: Optional[Callable[[str, str, Any], None]] = None

    # Layout
    LABEL_WIDTH_RATIO: float = 0.5
    CONTROL_PADDING: float = 16.0

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the row.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover state based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        self.hovered = self.contains(mx, my)

        # Update control hover
        if self.control is not None:
            if hasattr(self.control, 'update_hover'):
                self.control.update_hover(mx, my)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if click was handled.
        """
        if not self.contains(mx, my):
            # Close dropdown if clicking outside
            if self.control_type == "dropdown" and self.control:
                if hasattr(self.control, 'is_open') and self.control.is_open:
                    self.control.close()
                    return True
            return False

        if self.control is not None:
            if hasattr(self.control, 'handle_click'):
                return self.control.handle_click(mx, my)
        return False

    def handle_drag(self, mx: float, my: float) -> bool:
        """
        Handle mouse drag.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if drag was handled.
        """
        if self.control is not None and self.control_type == "slider":
            if hasattr(self.control, 'handle_drag'):
                return self.control.handle_drag(mx, my)
        return False

    def handle_release(self, mx: float, my: float) -> bool:
        """
        Handle mouse release.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if release was handled.
        """
        if self.control is not None and self.control_type == "slider":
            if hasattr(self.control, 'handle_release'):
                return self.control.handle_release(mx, my)
        return False

    def get_value(self) -> Any:
        """Get the current value of the control."""
        if self.control is None:
            return None

        if self.control_type == "bool":
            return self.control.checked
        elif self.control_type == "slider":
            return self.control.value
        elif self.control_type == "dropdown":
            return self.control.selected_value
        return None

    def set_value(self, value: Any) -> None:
        """
        Set the value of the control.

        @param value: Value to set.
        """
        if self.control is None:
            return

        if self.control_type == "bool":
            self.control.checked = bool(value)
        elif self.control_type == "slider":
            self.control.value = float(value)
        elif self.control_type == "dropdown":
            self.control.set_value(value)

    def _on_control_change(self, value: Any) -> None:
        """Internal callback when control value changes."""
        if self.on_change:
            self.on_change(self.category, self.key, value)

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the setting row.

        @param ui: UI renderer.
        """
        # Draw background
        bg_color = ROW_BG_HOVER if self.hovered else ROW_BG_COLOR
        ui.draw_rect(self.x, self.y, self.width, self.height, bg_color)

        # Calculate layout
        label_x = self.x + self.CONTROL_PADDING
        label_width = self.width * self.LABEL_WIDTH_RATIO - self.CONTROL_PADDING

        # Draw label
        label_y = self.y + 8
        ui.draw_text(self.label, label_x, label_y, ROW_LABEL_COLOR, scale=0.9)

        # Draw description
        if self.description:
            desc_y = label_y + 18
            # Truncate if too long
            desc = self.description
            max_desc_width = label_width - 10
            desc_w, _ = ui.measure_text(desc, scale=0.7)
            while desc_w > max_desc_width and len(desc) > 10:
                desc = desc[:-4] + "..."
                desc_w, _ = ui.measure_text(desc, scale=0.7)
            ui.draw_text(desc, label_x, desc_y, ROW_DESC_COLOR, scale=0.7)

        # Draw badges
        badge_x = label_x
        badge_y = self.y + self.height - 14

        if self.is_advanced:
            badge_text = "ADV"
            bw, bh = ui.measure_text(badge_text, scale=0.6)
            ui.draw_rect(badge_x - 2, badge_y - 1, bw + 4, bh + 2, ROW_ADVANCED_BADGE)
            ui.draw_text(badge_text, badge_x, badge_y, (180, 180, 200, 255), scale=0.6)
            badge_x += bw + 8

        if self.requires_restart:
            badge_text = "RESTART"
            bw, bh = ui.measure_text(badge_text, scale=0.6)
            ui.draw_rect(badge_x - 2, badge_y - 1, bw + 4, bh + 2, ROW_RESTART_BADGE)
            ui.draw_text(badge_text, badge_x, badge_y, (255, 200, 150, 255), scale=0.6)

        # Render control
        if self.control is not None:
            self.control.render(ui)


def create_setting_row(
    definition: "SettingDefinition",
    x: float,
    y: float,
    width: float,
    on_change: Optional[Callable[[str, str, Any], None]] = None
) -> SettingRow:
    """
    Create a SettingRow from a SettingDefinition.

    @param definition: Setting definition with metadata.
    @param x: X position.
    @param y: Y position.
    @param width: Width of the row.
    @param on_change: Callback when value changes.
    @returns: Configured SettingRow.
    """
    from ..settings.profiles import SettingType

    row = SettingRow(
        x=x,
        y=y,
        width=width,
        height=50.0,
        key=definition.key,
        category=definition.category,
        label=definition.display_name,
        description=definition.description,
        is_advanced=definition.advanced,
        requires_restart=definition.requires_restart,
        on_change=on_change,
    )

    # Calculate control position
    control_x = x + width * row.LABEL_WIDTH_RATIO
    control_width = width * (1 - row.LABEL_WIDTH_RATIO) - row.CONTROL_PADDING * 2
    control_y = y + (row.height - 28) / 2

    # Create appropriate control based on type
    if definition.setting_type == SettingType.BOOL:
        row.control_type = "bool"
        checkbox = Checkbox(
            x=control_x + control_width - 24,
            y=control_y + 2,
            size=24.0,
            checked=definition.default,
        )
        checkbox.on_change = lambda checked: row._on_control_change(checked)
        row.control = checkbox

    elif definition.setting_type in (SettingType.SLIDER, SettingType.INT, SettingType.FLOAT):
        row.control_type = "slider"
        slider = Slider(
            x=control_x,
            y=control_y,
            width=control_width,
            height=28.0,
            min_value=definition.min_value or 0.0,
            max_value=definition.max_value or 1.0,
            value=float(definition.default),
            step=definition.step,
            show_value=True,
        )
        slider.on_change = lambda value: row._on_control_change(value)
        row.control = slider

    elif definition.setting_type == SettingType.DROPDOWN:
        row.control_type = "dropdown"
        options = definition.options or []
        dropdown = Dropdown(
            x=control_x,
            y=control_y,
            width=control_width,
            height=28.0,
            options=options,
        )
        # Set default selection
        for i, (_, v) in enumerate(options):
            if v == definition.default:
                dropdown.selected_index = i
                break
        dropdown.on_change = lambda value: row._on_control_change(value)
        row.control = dropdown

    elif definition.setting_type == SettingType.STRING:
        # For string settings, use dropdown if options provided, otherwise text input
        if definition.options:
            row.control_type = "dropdown"
            dropdown = Dropdown(
                x=control_x,
                y=control_y,
                width=control_width,
                height=28.0,
                options=definition.options,
            )
            dropdown.set_value(definition.default)
            dropdown.on_change = lambda value: row._on_control_change(value)
            row.control = dropdown
        # else: could add text input support later

    return row
