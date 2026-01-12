"""Comprehensive settings panel for VoxEx UI.

Provides a full-featured settings panel with category navigation,
profile selection, and settings rows for each category.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer

from .text_input import TextInput
from .setting_row import SettingRow, create_setting_row
from .dropdown import Dropdown
from .slider import Slider
from .preset_button import PresetButton, PresetButtonGroup
from ..settings import (
    GameSettings,
    SETTING_DEFINITIONS,
    SETTINGS_PROFILES,
    TIME_PRESETS,
    CATEGORY_INFO,
    SettingType,
    search_settings,
)


# Panel colors
PANEL_BG_COLOR = (25, 25, 32, 250)
PANEL_BORDER_COLOR = (60, 60, 75, 255)
HEADER_BG_COLOR = (35, 35, 45, 255)
HEADER_TEXT_COLOR = (255, 255, 255, 255)

# Sidebar colors
SIDEBAR_BG_COLOR = (30, 30, 40, 255)
SIDEBAR_ITEM_COLOR = (40, 40, 52, 255)
SIDEBAR_ITEM_HOVER = (50, 55, 70, 255)
SIDEBAR_ITEM_SELECTED = (60, 80, 120, 255)
SIDEBAR_TEXT_COLOR = (180, 180, 190, 255)
SIDEBAR_TEXT_SELECTED = (255, 255, 255, 255)
SIDEBAR_ICON_COLOR = (100, 100, 120, 255)

# Content area colors
CONTENT_BG_COLOR = (28, 28, 36, 255)
CONTENT_SCROLL_BG = (40, 40, 50, 255)
CONTENT_SCROLL_THUMB = (80, 80, 100, 255)

# Profile bar colors
PROFILE_BG_COLOR = (35, 35, 45, 255)
PROFILE_BTN_COLOR = (50, 50, 65, 255)
PROFILE_BTN_HOVER = (60, 60, 80, 255)
PROFILE_BTN_SELECTED = (70, 100, 150, 255)

# Search colors
SEARCH_BG_COLOR = (40, 40, 50, 255)
SEARCH_BORDER_COLOR = (60, 60, 75, 255)
SEARCH_TEXT_COLOR = (200, 200, 210, 255)
SEARCH_PLACEHOLDER_COLOR = (100, 100, 110, 255)

# Time preset colors
TIME_PRESET_BG = (45, 45, 55, 255)
TIME_PRESET_HOVER = (55, 55, 70, 255)
TIME_PRESET_SELECTED = (65, 85, 120, 255)

# Back button colors
BACK_BTN_COLOR = (100, 60, 60, 255)
BACK_BTN_HOVER = (130, 80, 80, 255)


@dataclass
class CategoryTab:
    """A category tab in the sidebar."""

    key: str
    display_name: str
    icon: str
    description: str
    x: float = 0.0
    y: float = 0.0
    width: float = 150.0
    height: float = 40.0
    selected: bool = False
    hovered: bool = False

    def contains(self, mx: float, my: float) -> bool:
        """Check if point is inside tab."""
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)


@dataclass
class ExtendedSettingsPanel:
    """
    Full-featured settings panel with categories.

    Features:
    - Category navigation sidebar
    - Profile quick-select bar
    - Search functionality
    - Scrollable settings list
    - Time of day presets for world category
    """

    # Position and size
    x: float = 0.0
    y: float = 0.0
    width: float = 800.0
    height: float = 600.0

    # State
    visible: bool = False
    current_category: str = "performance"
    scroll_offset: float = 0.0
    search_query: str = ""

    # Components
    category_tabs: List[CategoryTab] = field(default_factory=list)
    setting_rows: List[SettingRow] = field(default_factory=list)
    profile_buttons: List[PresetButton] = field(default_factory=list)
    time_preset_buttons: List[PresetButton] = field(default_factory=list)
    search_input: Optional[TextInput] = None
    back_button_hovered: bool = False

    # Settings reference
    settings: Optional[GameSettings] = None

    # Layout constants
    SIDEBAR_WIDTH: float = 160.0
    HEADER_HEIGHT: float = 50.0
    PROFILE_BAR_HEIGHT: float = 45.0
    SEARCH_BAR_HEIGHT: float = 40.0
    CONTENT_PADDING: float = 16.0
    ROW_HEIGHT: float = 50.0
    ROW_SPACING: float = 4.0
    BACK_BTN_WIDTH: float = 100.0
    BACK_BTN_HEIGHT: float = 36.0

    # Callbacks
    on_close: Optional[Callable[[], None]] = None
    on_setting_change: Optional[Callable[[str, str, Any], None]] = None

    def __post_init__(self):
        """Initialize components."""
        self._init_category_tabs()
        self._init_search_input()

    def _init_category_tabs(self) -> None:
        """Create category tabs from CATEGORY_INFO."""
        self.category_tabs = []
        for key, info in CATEGORY_INFO.items():
            tab = CategoryTab(
                key=key,
                display_name=info["display_name"],
                icon=info["icon"],
                description=info["description"],
                selected=(key == self.current_category),
            )
            self.category_tabs.append(tab)

    def _init_search_input(self) -> None:
        """Create search input."""
        self.search_input = TextInput(
            text="",
            placeholder="Search settings...",
            max_length=50,
        )

    def _init_profile_buttons(self) -> None:
        """Create profile quick-select buttons."""
        self.profile_buttons = []
        for name, profile in SETTINGS_PROFILES.items():
            btn = PresetButton(
                text=profile["display_name"],
                value=name,
                width=90.0,
                height=30.0,
            )
            self.profile_buttons.append(btn)

    def _init_time_presets(self) -> None:
        """Create time of day preset buttons."""
        self.time_preset_buttons = []
        for name, preset in TIME_PRESETS.items():
            btn = PresetButton(
                text=preset["display_name"],
                value=name,
                width=70.0,
                height=28.0,
            )
            self.time_preset_buttons.append(btn)

    def set_settings(self, settings: GameSettings) -> None:
        """
        Set the settings object to display/modify.

        @param settings: GameSettings instance.
        """
        self.settings = settings
        self._rebuild_setting_rows()
        self._update_profile_selection()

    def _rebuild_setting_rows(self) -> None:
        """Rebuild setting rows for current category."""
        self.setting_rows = []
        self.scroll_offset = 0.0

        if not self.settings:
            return

        # Get definitions for current category
        definitions = SETTING_DEFINITIONS.get(self.current_category, [])

        # Filter by search if active
        if self.search_query:
            matching = search_settings(self.search_query)
            definitions = [d for d in definitions if d in matching]

        # Calculate content area
        content_x = self.x + self.SIDEBAR_WIDTH + self.CONTENT_PADDING
        content_width = self.width - self.SIDEBAR_WIDTH - 2 * self.CONTENT_PADDING

        # Create rows
        for i, definition in enumerate(definitions):
            row = create_setting_row(
                definition,
                x=content_x,
                y=0,  # Will be set during render
                width=content_width,
                on_change=self._on_row_change,
            )

            # Set current value from settings
            current_value = self.settings.get_value(definition.category, definition.key)
            if current_value is not None:
                row.set_value(current_value)

            self.setting_rows.append(row)

    def _on_row_change(self, category: str, key: str, value: Any) -> None:
        """Handle setting row value change."""
        if self.settings:
            self.settings.set_value(category, key, value)
            self._update_profile_selection()

        if self.on_setting_change:
            self.on_setting_change(category, key, value)

    def _update_profile_selection(self) -> None:
        """Update profile button selection state."""
        if not self.settings:
            return

        current_profile = self.settings.current_profile
        for btn in self.profile_buttons:
            btn.selected = (btn.value == current_profile)

    def show(self, screen_width: int, screen_height: int) -> None:
        """
        Show the settings panel.

        @param screen_width: Screen width.
        @param screen_height: Screen height.
        """
        self.visible = True

        # Center and size panel
        max_width = min(900.0, screen_width - 80)
        max_height = min(650.0, screen_height - 80)
        self.width = max_width
        self.height = max_height
        self.x = (screen_width - self.width) / 2
        self.y = (screen_height - self.height) / 2

        # Initialize components
        self._init_profile_buttons()
        self._init_time_presets()
        self._rebuild_setting_rows()

    def hide(self) -> None:
        """Hide the settings panel."""
        self.visible = False
        self.search_query = ""
        if self.search_input:
            self.search_input.set_text("")
            self.search_input.focused = False

    def select_category(self, category: str) -> None:
        """
        Select a category tab.

        @param category: Category key.
        """
        if category == self.current_category:
            return

        self.current_category = category
        for tab in self.category_tabs:
            tab.selected = (tab.key == category)

        self._rebuild_setting_rows()

    def apply_profile(self, profile_name: str) -> None:
        """
        Apply a settings profile.

        @param profile_name: Profile name.
        """
        if self.settings:
            self.settings.apply_profile(profile_name)
            self._rebuild_setting_rows()
            self._update_profile_selection()

    def apply_time_preset(self, preset_name: str) -> None:
        """
        Apply a time of day preset.

        @param preset_name: Preset name.
        """
        if not self.settings or preset_name not in TIME_PRESETS:
            return

        preset = TIME_PRESETS[preset_name]
        self.settings.set_value("world", "time_of_day", preset["time"])

        # Also set fog color if present
        if "fog_color" in preset:
            self.settings.set_value("graphics", "fog_color", preset["fog_color"])

        self._rebuild_setting_rows()

    def _get_content_height(self) -> float:
        """Get total height of content area."""
        row_count = len(self.setting_rows)
        extra_height = 0.0

        # Add height for time presets in world category
        if self.current_category == "world":
            extra_height = 60.0

        return row_count * (self.ROW_HEIGHT + self.ROW_SPACING) + extra_height

    def _get_max_scroll(self) -> float:
        """Get maximum scroll offset."""
        content_top = (self.y + self.HEADER_HEIGHT + self.PROFILE_BAR_HEIGHT +
                       self.SEARCH_BAR_HEIGHT + self.CONTENT_PADDING)
        content_bottom = self.y + self.height - self.CONTENT_PADDING - self.BACK_BTN_HEIGHT - 20
        visible_height = content_bottom - content_top

        content_height = self._get_content_height()
        if content_height <= visible_height:
            return 0.0
        return content_height - visible_height

    def handle_scroll(self, delta: float) -> None:
        """
        Handle mouse wheel scrolling.

        @param delta: Scroll delta.
        """
        scroll_speed = 30.0
        self.scroll_offset -= delta * scroll_speed
        self.scroll_offset = max(0.0, min(self._get_max_scroll(), self.scroll_offset))

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update hover states.

        @param mx: Mouse X.
        @param my: Mouse Y.
        """
        if not self.visible:
            return

        # Update category tabs
        for tab in self.category_tabs:
            tab.hovered = tab.contains(mx, my)

        # Update profile buttons
        for btn in self.profile_buttons:
            btn.hovered = btn.contains(mx, my)

        # Update time presets
        for btn in self.time_preset_buttons:
            btn.hovered = btn.contains(mx, my)

        # Update setting rows
        for row in self.setting_rows:
            row.update_hover(mx, my)

        # Update back button hover
        back_btn_x = self.x + self.width - self.CONTENT_PADDING - self.BACK_BTN_WIDTH
        back_btn_y = self.y + self.height - self.CONTENT_PADDING - self.BACK_BTN_HEIGHT
        self.back_button_hovered = (
            back_btn_x <= mx <= back_btn_x + self.BACK_BTN_WIDTH and
            back_btn_y <= my <= back_btn_y + self.BACK_BTN_HEIGHT
        )

    def handle_click(self, mx: float, my: float) -> bool:
        """
        Handle mouse click.

        @param mx: Mouse X.
        @param my: Mouse Y.
        @returns: True if click was handled.
        """
        if not self.visible:
            return False

        # Check back button
        back_btn_x = self.x + self.width - self.CONTENT_PADDING - self.BACK_BTN_WIDTH
        back_btn_y = self.y + self.height - self.CONTENT_PADDING - self.BACK_BTN_HEIGHT
        if (back_btn_x <= mx <= back_btn_x + self.BACK_BTN_WIDTH and
                back_btn_y <= my <= back_btn_y + self.BACK_BTN_HEIGHT):
            if self.on_close:
                self.on_close()
            return True

        # Check category tabs
        for tab in self.category_tabs:
            if tab.contains(mx, my):
                self.select_category(tab.key)
                return True

        # Check profile buttons
        for btn in self.profile_buttons:
            if btn.contains(mx, my):
                self.apply_profile(btn.value)
                return True

        # Check time presets (only in world category)
        if self.current_category == "world":
            for btn in self.time_preset_buttons:
                if btn.contains(mx, my):
                    self.apply_time_preset(btn.value)
                    return True

        # Check search input
        if self.search_input:
            if self.search_input.handle_click(mx, my):
                return True

        # Check setting rows
        for row in self.setting_rows:
            if row.handle_click(mx, my):
                return True

        return False

    def handle_drag(self, mx: float, my: float) -> bool:
        """Handle mouse drag."""
        for row in self.setting_rows:
            if row.handle_drag(mx, my):
                return True
        return False

    def handle_release(self, mx: float, my: float) -> bool:
        """Handle mouse release."""
        for row in self.setting_rows:
            if row.handle_release(mx, my):
                return True
        return False

    def handle_key(self, key: str, mods: int = 0) -> bool:
        """
        Handle keyboard input.

        @param key: Key identifier.
        @param mods: Modifier flags.
        @returns: True if key was handled.
        """
        if not self.visible:
            return False

        # ESC closes panel
        if key == "escape":
            if self.on_close:
                self.on_close()
            return True

        # Pass to search input
        if self.search_input and self.search_input.focused:
            if self.search_input.handle_key(key, mods):
                # Update search results
                self.search_query = self.search_input.text
                self._rebuild_setting_rows()
                return True

        return False

    def handle_text_input(self, char: str) -> bool:
        """
        Handle text input.

        @param char: Character to insert.
        @returns: True if handled.
        """
        if self.search_input and self.search_input.focused:
            if self.search_input.handle_text_input(char):
                self.search_query = self.search_input.text
                self._rebuild_setting_rows()
                return True
        return False

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the settings panel.

        @param ui: UI renderer.
        """
        if not self.visible:
            return

        # Draw panel background with border
        ui.draw_rect(
            self.x - 2, self.y - 2,
            self.width + 4, self.height + 4,
            PANEL_BORDER_COLOR
        )
        ui.draw_rect(self.x, self.y, self.width, self.height, PANEL_BG_COLOR)

        # Render sections
        self._render_header(ui)
        self._render_sidebar(ui)
        self._render_profile_bar(ui)
        self._render_search_bar(ui)
        self._render_content(ui)
        self._render_back_button(ui)

    def _render_header(self, ui: "UIRenderer") -> None:
        """Render panel header."""
        ui.draw_rect(
            self.x, self.y,
            self.width, self.HEADER_HEIGHT,
            HEADER_BG_COLOR
        )

        title = "Settings"
        title_w, title_h = ui.measure_text(title, scale=1.3)
        ui.draw_text(
            title,
            self.x + self.width / 2 - title_w / 2,
            self.y + (self.HEADER_HEIGHT - title_h) / 2,
            HEADER_TEXT_COLOR,
            scale=1.3
        )

    def _render_sidebar(self, ui: "UIRenderer") -> None:
        """Render category sidebar."""
        sidebar_y = self.y + self.HEADER_HEIGHT
        sidebar_height = self.height - self.HEADER_HEIGHT

        ui.draw_rect(
            self.x, sidebar_y,
            self.SIDEBAR_WIDTH, sidebar_height,
            SIDEBAR_BG_COLOR
        )

        # Render category tabs
        tab_y = sidebar_y + 10
        tab_height = 40.0

        for tab in self.category_tabs:
            tab.x = self.x + 5
            tab.y = tab_y
            tab.width = self.SIDEBAR_WIDTH - 10
            tab.height = tab_height

            # Background
            if tab.selected:
                bg_color = SIDEBAR_ITEM_SELECTED
                text_color = SIDEBAR_TEXT_SELECTED
            elif tab.hovered:
                bg_color = SIDEBAR_ITEM_HOVER
                text_color = SIDEBAR_TEXT_SELECTED
            else:
                bg_color = SIDEBAR_ITEM_COLOR
                text_color = SIDEBAR_TEXT_COLOR

            ui.draw_rect(tab.x, tab.y, tab.width, tab.height, bg_color)

            # Icon
            icon_x = tab.x + 10
            icon_y = tab.y + (tab.height - 12) / 2
            ui.draw_text(tab.icon, icon_x, icon_y, SIDEBAR_ICON_COLOR, scale=0.9)

            # Text
            text_x = tab.x + 30
            text_y = tab.y + (tab.height - 12) / 2
            ui.draw_text(tab.display_name, text_x, text_y, text_color, scale=0.85)

            tab_y += tab_height + 4

    def _render_profile_bar(self, ui: "UIRenderer") -> None:
        """Render profile quick-select bar."""
        bar_x = self.x + self.SIDEBAR_WIDTH
        bar_y = self.y + self.HEADER_HEIGHT
        bar_width = self.width - self.SIDEBAR_WIDTH

        ui.draw_rect(bar_x, bar_y, bar_width, self.PROFILE_BAR_HEIGHT, PROFILE_BG_COLOR)

        # Label
        label = "Profile:"
        label_w, label_h = ui.measure_text(label, scale=0.8)
        ui.draw_text(
            label,
            bar_x + 15,
            bar_y + (self.PROFILE_BAR_HEIGHT - label_h) / 2,
            SIDEBAR_TEXT_COLOR,
            scale=0.8
        )

        # Profile buttons
        btn_x = bar_x + 15 + label_w + 15
        btn_y = bar_y + (self.PROFILE_BAR_HEIGHT - 30) / 2

        for btn in self.profile_buttons:
            btn.x = btn_x
            btn.y = btn_y

            # Colors
            if btn.selected:
                bg = PROFILE_BTN_SELECTED
            elif btn.hovered:
                bg = PROFILE_BTN_HOVER
            else:
                bg = PROFILE_BTN_COLOR

            ui.draw_rect(btn.x, btn.y, btn.width, btn.height, bg)

            text_w, text_h = ui.measure_text(btn.text, scale=0.75)
            ui.draw_text(
                btn.text,
                btn.x + (btn.width - text_w) / 2,
                btn.y + (btn.height - text_h) / 2,
                (220, 220, 230, 255),
                scale=0.75
            )

            btn_x += btn.width + 8

    def _render_search_bar(self, ui: "UIRenderer") -> None:
        """Render search bar."""
        bar_x = self.x + self.SIDEBAR_WIDTH
        bar_y = self.y + self.HEADER_HEIGHT + self.PROFILE_BAR_HEIGHT
        bar_width = self.width - self.SIDEBAR_WIDTH

        ui.draw_rect(bar_x, bar_y, bar_width, self.SEARCH_BAR_HEIGHT, SEARCH_BG_COLOR)

        # Search input
        if self.search_input:
            self.search_input.x = bar_x + 15
            self.search_input.y = bar_y + 5
            self.search_input.width = bar_width - 30
            self.search_input.height = self.SEARCH_BAR_HEIGHT - 10
            self.search_input.render(ui)

    def _render_content(self, ui: "UIRenderer") -> None:
        """Render content area with setting rows."""
        content_x = self.x + self.SIDEBAR_WIDTH + self.CONTENT_PADDING
        content_top = (self.y + self.HEADER_HEIGHT + self.PROFILE_BAR_HEIGHT +
                       self.SEARCH_BAR_HEIGHT + self.CONTENT_PADDING)
        content_bottom = self.y + self.height - self.CONTENT_PADDING - self.BACK_BTN_HEIGHT - 20
        content_width = self.width - self.SIDEBAR_WIDTH - 2 * self.CONTENT_PADDING

        # Content background
        ui.draw_rect(
            content_x - 5, content_top - 5,
            content_width + 10, content_bottom - content_top + 10,
            CONTENT_BG_COLOR
        )

        # Category description
        current_info = CATEGORY_INFO.get(self.current_category, {})
        desc = current_info.get("description", "")
        if desc:
            desc_w, desc_h = ui.measure_text(desc, scale=0.75)
            ui.draw_text(desc, content_x, content_top, SIDEBAR_TEXT_COLOR, scale=0.75)
            content_top += desc_h + 10

        # Time presets for world category
        if self.current_category == "world":
            self._render_time_presets(ui, content_x, content_top, content_width)
            content_top += 50

        # Render setting rows
        row_y = content_top - self.scroll_offset

        for row in self.setting_rows:
            # Skip if outside visible area
            if row_y + self.ROW_HEIGHT < content_top - 10:
                row_y += self.ROW_HEIGHT + self.ROW_SPACING
                continue
            if row_y > content_bottom + 10:
                break

            row.x = content_x
            row.y = row_y
            row.width = content_width
            row.render(ui)

            row_y += self.ROW_HEIGHT + self.ROW_SPACING

    def _render_time_presets(self, ui: "UIRenderer", x: float, y: float, width: float) -> None:
        """Render time of day presets."""
        label = "Time of Day:"
        label_w, label_h = ui.measure_text(label, scale=0.8)
        ui.draw_text(label, x, y, SIDEBAR_TEXT_COLOR, scale=0.8)

        # Preset buttons
        btn_x = x
        btn_y = y + label_h + 8

        for i, btn in enumerate(self.time_preset_buttons):
            if btn_x + btn.width > x + width:
                btn_x = x
                btn_y += btn.height + 5

            btn.x = btn_x
            btn.y = btn_y

            # Colors
            if btn.selected:
                bg = TIME_PRESET_SELECTED
            elif btn.hovered:
                bg = TIME_PRESET_HOVER
            else:
                bg = TIME_PRESET_BG

            ui.draw_rect(btn.x, btn.y, btn.width, btn.height, bg)

            text_w, text_h = ui.measure_text(btn.text, scale=0.7)
            ui.draw_text(
                btn.text,
                btn.x + (btn.width - text_w) / 2,
                btn.y + (btn.height - text_h) / 2,
                (200, 200, 210, 255),
                scale=0.7
            )

            btn_x += btn.width + 6

    def _render_back_button(self, ui: "UIRenderer") -> None:
        """Render back button."""
        btn_x = self.x + self.width - self.CONTENT_PADDING - self.BACK_BTN_WIDTH
        btn_y = self.y + self.height - self.CONTENT_PADDING - self.BACK_BTN_HEIGHT

        bg = BACK_BTN_HOVER if self.back_button_hovered else BACK_BTN_COLOR
        ui.draw_rect(btn_x, btn_y, self.BACK_BTN_WIDTH, self.BACK_BTN_HEIGHT, bg)

        text = "Back"
        text_w, text_h = ui.measure_text(text, scale=0.9)
        ui.draw_text(
            text,
            btn_x + (self.BACK_BTN_WIDTH - text_w) / 2,
            btn_y + (self.BACK_BTN_HEIGHT - text_h) / 2,
            (255, 255, 255, 255),
            scale=0.9
        )
