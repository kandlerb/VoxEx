"""World card component for VoxEx UI.

Displays saved world information in a clickable card format.
Shows world name, seed, last modified date, and file size.
"""

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Tuple

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Card colors
CARD_BG_COLOR = (40, 40, 50, 255)
CARD_BG_HOVER = (50, 50, 65, 255)
CARD_BG_SELECTED = (55, 70, 90, 255)
CARD_BORDER_COLOR = (68, 68, 68, 255)
CARD_BORDER_SELECTED = (100, 140, 200, 255)
CARD_TITLE_COLOR = (255, 255, 255, 255)
CARD_DETAIL_COLOR = (170, 170, 170, 255)
CARD_SEED_COLOR = (136, 136, 136, 255)

# Delete button colors
DELETE_BTN_COLOR = (120, 50, 50, 255)
DELETE_BTN_HOVER = (160, 60, 60, 255)
DELETE_BTN_TEXT = (255, 255, 255, 255)

# Manage button colors
MANAGE_BTN_COLOR = (70, 70, 85, 255)
MANAGE_BTN_HOVER = (90, 90, 110, 255)
MANAGE_BTN_TEXT = (200, 200, 200, 255)


@dataclass
class WorldCard:
    """
    Displays a saved world as a clickable card.

    Shows world name, seed, formatted date, and size.
    Includes a delete button in the corner.
    """

    name: str = "Unnamed World"
    seed: int = 0
    timestamp: float = 0.0  # Unix timestamp of last modification
    size_bytes: int = 0
    playtime_seconds: float = 0.0

    # Position and size
    x: float = 0.0
    y: float = 0.0
    width: float = 300.0
    height: float = 80.0

    # State
    selected: bool = False
    hovered: bool = False
    delete_hovered: bool = False
    manage_hovered: bool = False

    # Button dimensions
    BTN_SIZE: float = 24.0
    BTN_MARGIN: float = 8.0
    BTN_SPACING: float = 4.0

    # Legacy aliases
    DELETE_BTN_SIZE: float = 24.0
    DELETE_BTN_MARGIN: float = 8.0

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the card.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def contains_delete(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the delete button.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside delete button.
        """
        btn_x = self.x + self.width - self.BTN_SIZE - self.BTN_MARGIN
        btn_y = self.y + self.BTN_MARGIN
        return (btn_x <= mx <= btn_x + self.BTN_SIZE and
                btn_y <= my <= btn_y + self.BTN_SIZE)

    def contains_manage(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the manage button.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside manage button.
        """
        # Manage button is to the left of delete button
        btn_x = self.x + self.width - 2 * self.BTN_SIZE - self.BTN_MARGIN - self.BTN_SPACING
        btn_y = self.y + self.BTN_MARGIN
        return (btn_x <= mx <= btn_x + self.BTN_SIZE and
                btn_y <= my <= btn_y + self.BTN_SIZE)

    def update_hover(self, mx: float, my: float) -> None:
        """
        Update hover states based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        self.hovered = self.contains(mx, my)
        if self.hovered:
            self.delete_hovered = self.contains_delete(mx, my)
            self.manage_hovered = self.contains_manage(mx, my)
        else:
            self.delete_hovered = False
            self.manage_hovered = False

    def format_date(self) -> str:
        """
        Format the timestamp as a human-readable date string.

        @returns: Formatted date string.
        """
        if self.timestamp <= 0:
            return "Unknown"

        try:
            local_time = time.localtime(self.timestamp)
            return time.strftime("%Y-%m-%d %H:%M", local_time)
        except (OSError, ValueError):
            return "Unknown"

    def format_size(self) -> str:
        """
        Format the file size as a human-readable string.

        @returns: Formatted size string.
        """
        if self.size_bytes <= 0:
            return "0 B"

        units = ['B', 'KB', 'MB', 'GB']
        size = float(self.size_bytes)
        unit_idx = 0

        while size >= 1024 and unit_idx < len(units) - 1:
            size /= 1024
            unit_idx += 1

        if unit_idx == 0:
            return f"{int(size)} {units[unit_idx]}"
        return f"{size:.1f} {units[unit_idx]}"

    def format_playtime(self) -> str:
        """
        Format the playtime as a human-readable string.

        @returns: Formatted playtime string.
        """
        if self.playtime_seconds <= 0:
            return "0m"

        total_minutes = int(self.playtime_seconds / 60)
        hours = total_minutes // 60
        minutes = total_minutes % 60

        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the world card.

        @param ui: UI renderer.
        """
        # Determine background and border colors based on state
        if self.selected:
            bg_color = CARD_BG_SELECTED
            border_color = CARD_BORDER_SELECTED
        elif self.hovered:
            bg_color = CARD_BG_HOVER
            border_color = CARD_BORDER_COLOR
        else:
            bg_color = CARD_BG_COLOR
            border_color = CARD_BORDER_COLOR

        # Draw border
        ui.draw_rect(self.x - 1, self.y - 1, self.width + 2, self.height + 2, border_color)

        # Draw background
        ui.draw_rect(self.x, self.y, self.width, self.height, bg_color)

        # Padding
        padding = 12.0
        text_x = self.x + padding
        text_y = self.y + padding

        # Draw world name (larger, bold-ish via scale)
        ui.draw_text(self.name, text_x, text_y, CARD_TITLE_COLOR, scale=1.1)

        # Second line: Seed
        line2_y = text_y + 22
        seed_text = f"Seed: {self.seed}"
        ui.draw_text(seed_text, text_x, line2_y, CARD_SEED_COLOR, scale=0.8)

        # Third line: Date and playtime
        line3_y = line2_y + 18
        detail_text = f"{self.format_date()}  |  {self.format_playtime()}"
        ui.draw_text(detail_text, text_x, line3_y, CARD_DETAIL_COLOR, scale=0.7)

        # Draw delete button (X) in top-right corner
        del_x = self.x + self.width - self.BTN_SIZE - self.BTN_MARGIN
        del_y = self.y + self.BTN_MARGIN
        del_color = DELETE_BTN_HOVER if self.delete_hovered else DELETE_BTN_COLOR

        ui.draw_rect(del_x, del_y, self.BTN_SIZE, self.BTN_SIZE, del_color)

        # Draw X inside delete button
        x_text = "X"
        x_w, x_h = ui.measure_text(x_text, scale=0.8)
        x_x = del_x + (self.BTN_SIZE - x_w) / 2
        x_y = del_y + (self.BTN_SIZE - x_h) / 2
        ui.draw_text(x_text, x_x, x_y, DELETE_BTN_TEXT, scale=0.8)

        # Draw manage button (gear icon) to the left of delete
        mgr_x = self.x + self.width - 2 * self.BTN_SIZE - self.BTN_MARGIN - self.BTN_SPACING
        mgr_y = self.y + self.BTN_MARGIN
        mgr_color = MANAGE_BTN_HOVER if self.manage_hovered else MANAGE_BTN_COLOR

        ui.draw_rect(mgr_x, mgr_y, self.BTN_SIZE, self.BTN_SIZE, mgr_color)

        # Draw gear icon (simple dots pattern as placeholder)
        gear_text = "*"
        g_w, g_h = ui.measure_text(gear_text, scale=0.9)
        g_x = mgr_x + (self.BTN_SIZE - g_w) / 2
        g_y = mgr_y + (self.BTN_SIZE - g_h) / 2
        ui.draw_text(gear_text, g_x, g_y, MANAGE_BTN_TEXT, scale=0.9)


@dataclass
class WorldListPanel:
    """
    Scrollable list of WorldCard components.

    Displays saved worlds and handles selection, scrolling, and deletion.
    """

    x: float = 0.0
    y: float = 0.0
    width: float = 300.0
    height: float = 200.0

    cards: list = field(default_factory=list)  # List[WorldCard]
    selected_index: int = -1
    scroll_offset: float = 0.0

    # Spacing between cards
    CARD_SPACING: float = 8.0
    CARD_HEIGHT: float = 80.0

    def __post_init__(self):
        """Ensure cards is a list."""
        if self.cards is None:
            self.cards = []

    @property
    def selected_card(self) -> Optional[WorldCard]:
        """Get the currently selected card, or None."""
        if 0 <= self.selected_index < len(self.cards):
            return self.cards[self.selected_index]
        return None

    @property
    def has_selection(self) -> bool:
        """Check if a card is selected."""
        return 0 <= self.selected_index < len(self.cards)

    def clear(self) -> None:
        """Clear all cards and reset selection."""
        self.cards.clear()
        self.selected_index = -1
        self.scroll_offset = 0.0

    def add_card(self, card: WorldCard) -> None:
        """
        Add a card to the list.

        @param card: WorldCard to add.
        """
        self.cards.append(card)

    def get_content_height(self) -> float:
        """Get total height of all cards."""
        if not self.cards:
            return 0.0
        return len(self.cards) * (self.CARD_HEIGHT + self.CARD_SPACING) - self.CARD_SPACING

    def get_max_scroll(self) -> float:
        """Get maximum scroll offset."""
        content_height = self.get_content_height()
        if content_height <= self.height:
            return 0.0
        return content_height - self.height

    def handle_scroll(self, delta: float) -> None:
        """
        Handle mouse wheel scrolling.

        @param delta: Scroll delta (positive = scroll up, negative = scroll down).
        """
        scroll_speed = 30.0
        self.scroll_offset -= delta * scroll_speed
        self.scroll_offset = max(0.0, min(self.get_max_scroll(), self.scroll_offset))

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update hover states for all cards.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        # Check if mouse is within panel bounds
        in_panel = (self.x <= mx <= self.x + self.width and
                    self.y <= my <= self.y + self.height)

        for i, card in enumerate(self.cards):
            # Update card position for hit testing
            card_y = self.y + i * (self.CARD_HEIGHT + self.CARD_SPACING) - self.scroll_offset

            # Only hover if card is visible and mouse is in panel
            if in_panel and self.y <= card_y + self.CARD_HEIGHT and card_y <= self.y + self.height:
                card.x = self.x
                card.y = card_y
                card.width = self.width
                card.height = self.CARD_HEIGHT
                card.update_hover(mx, my)
            else:
                card.hovered = False
                card.delete_hovered = False
                card.manage_hovered = False

    def handle_click(self, mx: float, my: float) -> Tuple[Optional[str], Optional[int]]:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: Tuple of (action, index) where action is 'select', 'delete', 'manage', or None.
        """
        # Check if click is within panel bounds
        if not (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height):
            return (None, None)

        for i, card in enumerate(self.cards):
            card_y = self.y + i * (self.CARD_HEIGHT + self.CARD_SPACING) - self.scroll_offset

            # Skip if card is not visible
            if card_y + self.CARD_HEIGHT < self.y or card_y > self.y + self.height:
                continue

            # Update card position for hit testing
            card.x = self.x
            card.y = card_y
            card.width = self.width
            card.height = self.CARD_HEIGHT

            # Check buttons first (manage, then delete)
            if card.contains_manage(mx, my):
                return ('manage', i)

            if card.contains_delete(mx, my):
                return ('delete', i)

            # Check card body
            if card.contains(mx, my):
                # Update selection
                self.selected_index = i

                # Update selected state on all cards
                for j, c in enumerate(self.cards):
                    c.selected = (j == i)

                return ('select', i)

        return (None, None)

    def refresh_from_saves(self, saves: list) -> None:
        """
        Refresh card list from save metadata.

        @param saves: List of SaveMetadata objects.
        """
        self.cards.clear()
        self.selected_index = -1
        self.scroll_offset = 0.0

        for save in saves:
            card = WorldCard(
                name=save.name,
                seed=getattr(save, 'seed', 0),  # May not exist on older saves
                timestamp=save.modified_at,
                playtime_seconds=save.playtime_seconds,
                size_bytes=0  # Could calculate from file if needed
            )
            self.cards.append(card)

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the world list panel.

        @param ui: UI renderer.
        """
        if not self.cards:
            # Show empty message
            msg = "No saved worlds"
            msg_w, msg_h = ui.measure_text(msg, scale=0.9)
            msg_x = self.x + (self.width - msg_w) / 2
            msg_y = self.y + (self.height - msg_h) / 2
            ui.draw_text(msg, msg_x, msg_y, (100, 100, 100, 255), scale=0.9)
            return

        # Render visible cards
        for i, card in enumerate(self.cards):
            card_y = self.y + i * (self.CARD_HEIGHT + self.CARD_SPACING) - self.scroll_offset

            # Skip if card is fully outside visible area
            if card_y + self.CARD_HEIGHT < self.y or card_y > self.y + self.height:
                continue

            # Update card position and dimensions
            card.x = self.x
            card.y = card_y
            card.width = self.width
            card.height = self.CARD_HEIGHT
            card.selected = (i == self.selected_index)

            # Render the card
            card.render(ui)
