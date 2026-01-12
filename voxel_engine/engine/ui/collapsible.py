"""Collapsible section component for VoxEx UI.

Provides a collapsible/expandable section header with arrow indicator.
Used for grouping advanced options that can be hidden by default.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Callable

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Collapsible section colors
SECTION_HEADER_BG = (40, 40, 50, 255)
SECTION_HEADER_HOVER = (50, 50, 65, 255)
SECTION_HEADER_BORDER = (60, 60, 70, 255)
SECTION_TITLE_COLOR = (200, 200, 200, 255)
SECTION_ARROW_COLOR = (150, 150, 150, 255)


@dataclass
class CollapsibleSection:
    """
    Collapsible section with clickable header.

    Shows an arrow indicator (triangle) that rotates when expanded.
    Parent component is responsible for rendering content when expanded.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 300.0
    title: str = "Advanced Options"
    expanded: bool = False
    header_height: float = 28.0
    hovered: bool = False

    # Callback when expansion state changes
    on_toggle: Optional[Callable[[bool], None]] = field(default=None, repr=False)

    def is_expanded(self) -> bool:
        """Check if section is expanded."""
        return self.expanded

    def toggle(self) -> None:
        """Toggle expanded state."""
        self.expanded = not self.expanded
        if self.on_toggle:
            self.on_toggle(self.expanded)

    def expand(self) -> None:
        """Expand the section."""
        if not self.expanded:
            self.expanded = True
            if self.on_toggle:
                self.on_toggle(True)

    def collapse(self) -> None:
        """Collapse the section."""
        if self.expanded:
            self.expanded = False
            if self.on_toggle:
                self.on_toggle(False)

    def contains_header(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the header area.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside header.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.header_height)

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover state based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        self.hovered = self.contains_header(mx, my)

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click to toggle expansion.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if header was clicked.
        """
        if self.contains_header(mx, my):
            self.toggle()
            return True
        return False

    def get_content_y(self) -> float:
        """
        Get Y position where content should start.

        @returns: Y coordinate for content rendering.
        """
        return self.y + self.header_height + 8

    def render_header(self, ui: "UIRenderer") -> float:
        """
        Render just the header.

        @param ui: UI renderer.
        @returns: Height of the header.
        """
        # Choose background based on hover
        bg_color = SECTION_HEADER_HOVER if self.hovered else SECTION_HEADER_BG

        # Draw header background
        ui.draw_rect(self.x, self.y, self.width, self.header_height, bg_color)

        # Draw bottom border
        ui.draw_rect(self.x, self.y + self.header_height - 1,
                     self.width, 1, SECTION_HEADER_BORDER)

        # Draw arrow indicator
        arrow = "v" if self.expanded else ">"
        arrow_w, arrow_h = ui.measure_text(arrow, scale=0.9)
        arrow_x = self.x + 10
        arrow_y = self.y + (self.header_height - arrow_h) / 2
        ui.draw_text(arrow, arrow_x, arrow_y, SECTION_ARROW_COLOR, scale=0.9)

        # Draw title
        title_w, title_h = ui.measure_text(self.title, scale=0.9)
        title_x = self.x + 28
        title_y = self.y + (self.header_height - title_h) / 2
        ui.draw_text(self.title, title_x, title_y, SECTION_TITLE_COLOR, scale=0.9)

        return self.header_height

    def render(self, ui: "UIRenderer") -> float:
        """
        Render the header (content must be rendered separately by parent).

        @param ui: UI renderer.
        @returns: Height of the header.
        """
        return self.render_header(ui)
