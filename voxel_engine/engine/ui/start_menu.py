"""Start menu UI for VoxEx.

Displays the main menu before game starts with title, seed input, and buttons.
Styled to match voxEx.html start menu design.
Includes saved worlds list and editable seed input.
"""
from typing import List, Dict, Any, Optional, Tuple, TYPE_CHECKING
import random

from .ui_renderer import UIRenderer
from .pause_menu import MenuAction
from .text_input import TextInput
from .world_card import WorldCard, WorldListPanel
from .world_manage_modal import WorldManageModal
from .modal import ModalResult
from .buttons import StartMenuButton
from .constants import (
    START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT, START_MENU_BUTTON_SPACING,
    START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER,
    START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER,
    MENU_TEXT_COLOR
)

# Debug logging - import with fallback
try:
    from ..utils.debug import debug_ui, format_button_info, format_point
except ImportError:
    def debug_ui(msg, *args, **kwargs):
        pass
    def format_button_info(btn):
        return str(btn)
    def format_point(mx, my):
        return f"({mx}, {my})"

if TYPE_CHECKING:
    from ..persistence.save_manager import SaveManager


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

# Random button colors
RANDOM_BTN_COLOR = (80, 80, 100, 255)
RANDOM_BTN_HOVER = (100, 100, 130, 255)

# Load world button colors (slightly different green)
LOAD_BTN_COLOR = (60, 140, 90, 255)
LOAD_BTN_HOVER = (80, 170, 110, 255)
LOAD_BTN_DISABLED = (60, 60, 60, 255)


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

    Displays a centered panel with title, editable seed input, action buttons,
    and a list of saved worlds. Styled to match the HTML version's #seed-menu.
    """

    __slots__ = (
        '_visible', '_buttons', '_screen_width', '_screen_height',
        '_panel_x', '_panel_y', '_panel_width', '_panel_height',
        '_seed_input', '_random_button', '_world_list', '_load_button',
        '_pending_action', '_selected_world_name', '_manage_modal', '_save_manager'
    )

    # Panel dimensions
    MIN_PANEL_WIDTH = 380
    PANEL_PADDING = 25

    def __init__(self):
        """Create start menu."""
        debug_ui("StartMenu.__init__ called")
        self._visible = False
        self._buttons: List[StartMenuButton] = []
        self._screen_width = 0
        self._screen_height = 0
        self._panel_x = 0.0
        self._panel_y = 0.0
        self._panel_width = float(self.MIN_PANEL_WIDTH)
        self._panel_height = 0.0

        # Seed input component
        initial_seed = str(random.randint(1, 999999))
        debug_ui("  Initial seed: {}", initial_seed)
        self._seed_input = TextInput(
            text=initial_seed,
            placeholder="Enter seed...",
            max_length=12,
            numeric_only=True
        )

        # Random button (positioned next to seed input)
        self._random_button: Optional[StartMenuButton] = None

        # World list for saved games
        self._world_list = WorldListPanel()

        # Load button (for selected world)
        self._load_button: Optional[StartMenuButton] = None

        # Pending action result
        self._pending_action: Optional[Tuple[MenuAction, Optional[str]]] = None
        self._selected_world_name: Optional[str] = None

        # World management modal
        self._manage_modal = WorldManageModal()
        self._save_manager: Optional["SaveManager"] = None
        debug_ui("StartMenu initialized")

    def set_save_manager(self, save_manager: "SaveManager") -> None:
        """
        Set the save manager for world operations.

        @param save_manager: SaveManager instance.
        """
        self._save_manager = save_manager
        self._setup_modal_callbacks()

    def _setup_modal_callbacks(self) -> None:
        """Wire modal callbacks to save manager."""
        if not self._save_manager:
            return

        self._manage_modal.on_rename = self._handle_world_rename
        self._manage_modal.on_duplicate = self._handle_world_duplicate
        self._manage_modal.on_export = self._handle_world_export
        self._manage_modal.on_import = self._handle_world_import
        self._manage_modal.on_clear_cache = self._handle_world_clear_cache

    def _handle_world_rename(self, old_name: str, new_name: str) -> bool:
        """Handle world rename from modal."""
        if not self._save_manager:
            return False
        success = self._save_manager.rename_world(old_name, new_name)
        if success:
            self.refresh_saved_worlds(self._save_manager)
        return success

    def _handle_world_duplicate(self, source: str, new_name: str) -> bool:
        """Handle world duplicate from modal."""
        if not self._save_manager:
            return False
        success = self._save_manager.duplicate_world(source, new_name)
        if success:
            self.refresh_saved_worlds(self._save_manager)
        return success

    def _handle_world_export(self, world_name: str) -> bool:
        """Handle world export from modal."""
        if not self._save_manager:
            return False
        filepath = self._save_manager.get_default_export_path(world_name)
        return self._save_manager.export_world(world_name, filepath)

    def _handle_world_import(self) -> Optional[str]:
        """Handle world import from modal."""
        # For now, we don't have a file picker in the engine
        # This would need platform-specific implementation
        return None

    def _handle_world_clear_cache(self, world_name: str) -> bool:
        """Handle clear cache from modal."""
        if not self._save_manager:
            return False
        success = self._save_manager.clear_chunk_cache(world_name)
        if success:
            # Refresh storage info in modal
            storage_info = self._save_manager.get_world_storage_info(world_name)
            self._manage_modal.set_storage_info(
                storage_info['chunk_count'],
                storage_info['cache_size_bytes'],
                storage_info['metadata_size_bytes']
            )
        return success

    def _open_manage_modal(self, world_name: str, world_seed: int) -> None:
        """
        Open the world management modal.

        @param world_name: Name of the world to manage.
        @param world_seed: Seed of the world.
        """
        self._manage_modal.set_world(world_name, world_seed)
        self._manage_modal.update_screen_size(self._screen_width, self._screen_height)

        # Get storage info if save manager is available
        if self._save_manager:
            storage_info = self._save_manager.get_world_storage_info(world_name)
            self._manage_modal.set_storage_info(
                storage_info['chunk_count'],
                storage_info['cache_size_bytes'],
                storage_info['metadata_size_bytes']
            )

        self._manage_modal.show()

    @property
    def visible(self) -> bool:
        """Check if start menu is visible."""
        return self._visible

    @property
    def seed(self) -> int:
        """Get the current seed value from the input."""
        return self._seed_input.get_int_value(random.randint(1, 999999))

    @seed.setter
    def seed(self, value: int) -> None:
        """Set the seed value in the input."""
        self._seed_input.set_text(str(value))

    def get_seed(self) -> int:
        """
        Get the seed value for world generation.

        @returns: Integer seed value, or random if empty/invalid.
        """
        debug_ui("StartMenu.get_seed called")
        debug_ui("  Raw seed input text: '{}'", self._seed_input.get_value())
        seed = self._seed_input.get_int_value(0)
        debug_ui("  Parsed int value: {}", seed)
        if seed == 0:
            seed = random.randint(1, 999999)
            debug_ui("  Generated random seed: {}", seed)
            self._seed_input.set_text(str(seed))
        debug_ui("  Returning seed: {}", seed)
        return seed

    def get_selected_world_name(self) -> Optional[str]:
        """
        Get the name of the currently selected world.

        @returns: World name string, or None if no selection.
        """
        return self._selected_world_name

    def randomize_seed(self) -> int:
        """
        Generate a new random seed and update the input.

        @returns: The new seed value.
        """
        new_seed = random.randint(1, 999999)
        self._seed_input.set_text(str(new_seed))
        return new_seed

    def refresh_saved_worlds(self, save_manager: "SaveManager") -> None:
        """
        Refresh the list of saved worlds from the save manager.

        @param save_manager: SaveManager instance to get saves from.
        """
        saves = save_manager.list_saves()
        self._world_list.clear()

        for save in saves:
            # Get seed from world data if available
            seed = 0
            try:
                save_path = save_manager._get_save_path(save.name)
                if save_path.exists():
                    from ..persistence.save_data import SaveFile
                    with open(save_path, 'r') as f:
                        save_file = SaveFile.from_json(f.read())
                        seed = save_file.world.seed
            except Exception:
                pass

            card = WorldCard(
                name=save.name,
                seed=seed,
                timestamp=save.modified_at,
                playtime_seconds=save.playtime_seconds
            )
            self._world_list.add_card(card)

        self._selected_world_name = None

    def show(self, screen_width: int, screen_height: int) -> None:
        """
        Show start menu and create buttons.

        @param screen_width: Screen width in pixels.
        @param screen_height: Screen height in pixels.
        """
        debug_ui("StartMenu.show called: {}x{}", screen_width, screen_height)
        self._visible = True
        self._screen_width = screen_width
        self._screen_height = screen_height

        # Panel dimensions
        self._panel_width = float(self.MIN_PANEL_WIDTH)
        self._panel_height = 520.0
        self._panel_x = (screen_width - self._panel_width) / 2
        self._panel_y = (screen_height - self._panel_height) / 2
        debug_ui("  Panel position: ({:.0f}, {:.0f}), size: {:.0f}x{:.0f}",
                 self._panel_x, self._panel_y, self._panel_width, self._panel_height)

        pad = float(self.PANEL_PADDING)
        btn_width = self._panel_width - 2 * pad

        # Create buttons (positions will be updated in render)
        self._buttons = [
            StartMenuButton(
                "Create New World",
                0, 0, btn_width, 42.0,
                MenuAction.CREATE_WORLD,
                START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER
            ),
            StartMenuButton(
                "Settings",
                0, 0, btn_width, 42.0,
                MenuAction.SETTINGS,
                START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER
            ),
        ]
        debug_ui("  Created {} buttons:", len(self._buttons))
        for i, btn in enumerate(self._buttons):
            debug_ui("    [{}] '{}' -> {}", i, btn.text, btn.action)

        # Random button next to seed input
        self._random_button = StartMenuButton(
            "Random",
            0, 0, 70, 35.0,
            MenuAction.NONE,  # Handled specially
            RANDOM_BTN_COLOR, RANDOM_BTN_HOVER
        )

        # Load selected world button
        self._load_button = StartMenuButton(
            "Play Selected World",
            0, 0, btn_width, 38.0,
            MenuAction.LOAD_WORLD,
            LOAD_BTN_COLOR, LOAD_BTN_HOVER
        )

        # Reset pending action
        self._pending_action = None
        self._selected_world_name = None
        debug_ui("StartMenu.show complete, visible={}", self._visible)

    def hide(self) -> None:
        """Hide start menu."""
        self._visible = False
        self._buttons.clear()
        self._random_button = None
        self._load_button = None
        self._seed_input.focused = False

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update button and component hover states.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        for button in self._buttons:
            button.hovered = button.contains(mx, my)

        if self._random_button:
            self._random_button.hovered = self._random_button.contains(mx, my)

        if self._load_button and self._world_list.has_selection:
            self._load_button.hovered = self._load_button.contains(mx, my)

        # Update world list hover states
        self._world_list.update_mouse(mx, my)

        # Update manage modal if visible
        if self._manage_modal.visible:
            self._manage_modal.update_mouse(mx, my)

    def handle_key(self, key: str, mods: int = 0) -> bool:
        """
        Handle keyboard input for the seed field.

        @param key: Key identifier string.
        @param mods: Modifier key flags.
        @returns: True if key was handled.
        """
        # Handle modal first if visible
        if self._manage_modal.visible:
            return self._manage_modal.handle_key(key, mods)

        return self._seed_input.handle_key(key, mods)

    def handle_text_input(self, char: str) -> bool:
        """
        Handle text character input for the seed field.

        @param char: Character to insert.
        @returns: True if character was handled.
        """
        # Handle modal first if visible
        if self._manage_modal.visible:
            return self._manage_modal.handle_text_input(char)

        return self._seed_input.handle_text_input(char)

    def handle_scroll(self, delta: float) -> None:
        """
        Handle mouse wheel scrolling for the world list.

        @param delta: Scroll delta.
        """
        self._world_list.handle_scroll(delta)

    def update(self, dt: float) -> None:
        """
        Update timers and animations.

        @param dt: Delta time in seconds.
        """
        if self._manage_modal.visible:
            self._manage_modal.update(dt)

    def click(self, mx: float, my: float) -> MenuAction:
        """
        Handle mouse click, return action if button clicked.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: MenuAction if a button was clicked, else NONE.
        """
        debug_ui("StartMenu.click at {}", format_point(mx, my))
        debug_ui("  Menu visible: {}, modal visible: {}", self._visible, self._manage_modal.visible)

        # Handle modal first if visible
        if self._manage_modal.visible:
            debug_ui("  Modal is visible, forwarding click to modal")
            result = self._manage_modal.handle_click(mx, my)
            # Modal consumes all clicks when visible
            debug_ui("  Modal returned: {}, returning NONE", result)
            return MenuAction.NONE

        # Check seed input click
        self._seed_input.handle_click(mx, my)

        # Check random button
        if self._random_button and self._random_button.contains(mx, my):
            debug_ui("  Random button clicked")
            self.randomize_seed()
            return MenuAction.NONE

        # Check main buttons
        debug_ui("  Checking {} main buttons:", len(self._buttons))
        for i, button in enumerate(self._buttons):
            in_bounds = button.contains(mx, my)
            debug_ui("    [{}] '{}' bounds: ({:.0f},{:.0f}) {:.0f}x{:.0f}, contains: {}",
                     i, button.text, button.x, button.y, button.width, button.height, in_bounds)
            if in_bounds:
                debug_ui(">>> BUTTON '{}' CLICKED -> action={} <<<", button.text, button.action)
                return button.action

        # Check load button (only if a world is selected)
        if (self._load_button and
                self._world_list.has_selection and
                self._load_button.contains(mx, my)):
            debug_ui("  Load button clicked")
            selected_card = self._world_list.selected_card
            if selected_card:
                self._selected_world_name = selected_card.name
            return MenuAction.LOAD_WORLD

        # Check world list click
        action, index = self._world_list.handle_click(mx, my)
        if action == 'select' and index is not None:
            debug_ui("  World list selection: index={}", index)
            selected_card = self._world_list.selected_card
            if selected_card:
                self._selected_world_name = selected_card.name
            return MenuAction.NONE
        elif action == 'delete' and index is not None:
            if 0 <= index < len(self._world_list.cards):
                self._selected_world_name = self._world_list.cards[index].name
                debug_ui("  Delete world action: {}", self._selected_world_name)
                return MenuAction.DELETE_WORLD
        elif action == 'manage' and index is not None:
            if 0 <= index < len(self._world_list.cards):
                card = self._world_list.cards[index]
                debug_ui("  Manage world action: {}", card.name)
                self._open_manage_modal(card.name, card.seed)
            return MenuAction.NONE

        debug_ui("  No button clicked, returning NONE")
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

        # Update stored values
        self._panel_x = px
        self._panel_y = py
        self._panel_width = pw

        # Draw panel background
        ui.draw_rect(px, py, pw, ph, PANEL_BG_COLOR)

        # ===== TITLE SECTION =====
        ui.draw_text(
            title,
            px + (pw - title_width) / 2,
            py + pad,
            TITLE_COLOR,
            scale=1.5
        )

        ui.draw_text(
            subtitle,
            px + (pw - sub_width) / 2,
            py + pad + title_height + 5,
            SUBTITLE_COLOR,
            scale=1.0
        )

        # ===== CREATE NEW WORLD SECTION =====
        section_y = py + pad + title_height + sub_height + 25

        # Section header
        header = "Create New World"
        header_w, header_h = ui.measure_text(header, scale=0.95)
        ui.draw_text(header, px + pad, section_y, SUBTITLE_COLOR, scale=0.95)

        # Divider
        divider_y = section_y + header_h + 8
        ui.draw_rect(px + pad, divider_y, pw - 2 * pad, 1, PANEL_BORDER_COLOR)

        # Seed label and input
        seed_label_y = divider_y + 12
        seed_label = "Seed"
        label_w, label_h = ui.measure_text(seed_label, scale=0.85)
        ui.draw_text(seed_label, px + pad, seed_label_y, HINT_COLOR, scale=0.85)

        # Seed input (with room for Random button)
        random_btn_width = 70.0
        random_btn_margin = 8.0
        input_width = pw - 2 * pad - random_btn_width - random_btn_margin
        input_y = seed_label_y + label_h + 6
        input_height = 35.0

        self._seed_input.x = px + pad
        self._seed_input.y = input_y
        self._seed_input.width = input_width
        self._seed_input.height = input_height
        self._seed_input.render(ui)

        # Random button next to input
        if self._random_button:
            self._random_button.x = px + pad + input_width + random_btn_margin
            self._random_button.y = input_y
            self._random_button.width = random_btn_width
            self._random_button.height = input_height
            self._random_button.render(ui)

        # Create button
        btn_width = pw - 2 * pad
        btn_height = 42.0
        create_btn_y = input_y + input_height + 12

        if len(self._buttons) > 0:
            self._buttons[0].x = px + pad
            self._buttons[0].y = create_btn_y
            self._buttons[0].width = btn_width
            self._buttons[0].height = btn_height
            self._buttons[0].render(ui)

        # ===== SAVED WORLDS SECTION =====
        saved_section_y = create_btn_y + btn_height + 20

        # Section header
        saved_header = "Saved Worlds"
        saved_h_w, saved_h_h = ui.measure_text(saved_header, scale=0.95)
        ui.draw_text(saved_header, px + pad, saved_section_y, SUBTITLE_COLOR, scale=0.95)

        # Divider
        saved_div_y = saved_section_y + saved_h_h + 8
        ui.draw_rect(px + pad, saved_div_y, pw - 2 * pad, 1, PANEL_BORDER_COLOR)

        # World list
        list_y = saved_div_y + 10
        list_height = 150.0  # Fixed height for world list

        self._world_list.x = px + pad
        self._world_list.y = list_y
        self._world_list.width = pw - 2 * pad
        self._world_list.height = list_height
        self._world_list.render(ui)

        # Load button (below world list)
        load_btn_y = list_y + list_height + 10

        if self._load_button:
            self._load_button.x = px + pad
            self._load_button.y = load_btn_y
            self._load_button.width = btn_width
            self._load_button.height = 38.0

            # Disable appearance if no selection
            if self._world_list.has_selection:
                self._load_button._normal_color = LOAD_BTN_COLOR
                self._load_button._hover_color = LOAD_BTN_HOVER
            else:
                self._load_button._normal_color = LOAD_BTN_DISABLED
                self._load_button._hover_color = LOAD_BTN_DISABLED
                self._load_button.hovered = False

            self._load_button.render(ui)

        # ===== SETTINGS BUTTON =====
        settings_y = py + ph - pad - 42.0

        if len(self._buttons) > 1:
            self._buttons[1].x = px + pad
            self._buttons[1].y = settings_y
            self._buttons[1].width = btn_width
            self._buttons[1].height = 42.0
            self._buttons[1].render(ui)

        # Divider before settings
        divider2_y = settings_y - 12
        ui.draw_rect(px + pad, divider2_y, pw - 2 * pad, 1, PANEL_BORDER_COLOR)

        # Footer hint at bottom of screen
        footer = "Press SPACE to create world  |  Type to edit seed"
        footer_width, _ = ui.measure_text(footer, scale=0.75)
        ui.draw_text(
            footer,
            (ui.width - footer_width) / 2,
            ui.height - 35,
            HINT_COLOR,
            scale=0.75
        )

        # Render manage modal on top of everything
        if self._manage_modal.visible:
            self._manage_modal.render(ui)
