"""Create World Panel for VoxEx UI.

Full-featured world creation interface with:
- World name and seed inputs
- World type presets
- Biome selection grid
- Structure toggles
- Terrain sliders
- Advanced options (collapsible)
"""

from typing import Optional, Dict, List, TYPE_CHECKING
import random

from .ui_renderer import UIRenderer
from .pause_menu import MenuAction
from .text_input import TextInput
from .slider import Slider
from .checkbox import Checkbox
from .preset_button import PresetButton, PresetButtonGroup
from .collapsible import CollapsibleSection
from .start_menu import StartMenuButton

if TYPE_CHECKING:
    pass

# Import settings from world module
from ..world.world_gen_settings import (
    WorldGenSettings, BIOME_LIST, WORLD_PRESETS, PRESET_DISPLAY_NAMES
)


# Panel colors
PANEL_BG_COLOR = (0, 0, 0, 230)
PANEL_BORDER_COLOR = (68, 68, 68, 255)
TITLE_COLOR = (255, 255, 255, 255)
SECTION_LABEL_COLOR = (170, 170, 170, 255)
HINT_COLOR = (136, 136, 136, 255)
DIVIDER_COLOR = (60, 60, 60, 255)

# Button colors
BACK_BTN_COLOR = (100, 60, 60, 255)
BACK_BTN_HOVER = (130, 80, 80, 255)
START_BTN_COLOR = (60, 140, 80, 255)
START_BTN_HOVER = (80, 170, 100, 255)
RANDOM_BTN_COLOR = (80, 80, 100, 255)
RANDOM_BTN_HOVER = (100, 100, 130, 255)


class CreateWorldPanel:
    """
    Full world creation panel with all customization options.

    Provides UI for configuring world generation settings before
    starting a new game.
    """

    __slots__ = (
        '_visible', '_screen_width', '_screen_height',
        '_panel_x', '_panel_y', '_panel_width', '_panel_height',
        '_settings', '_scroll_offset', '_max_scroll',
        '_name_input', '_seed_input', '_random_button',
        '_preset_group', '_biome_checkboxes', '_structure_checkboxes',
        '_cave_slider', '_tree_slider', '_amplitude_slider', '_sea_level_slider',
        '_advanced_section', '_biome_size_slider', '_persistence_slider',
        '_lacunarity_slider', '_spawn_x_input', '_spawn_z_input',
        '_back_button', '_start_button', '_dragging_slider'
    )

    PANEL_WIDTH = 450
    PANEL_PADDING = 20
    SECTION_SPACING = 20
    ROW_HEIGHT = 30

    def __init__(self):
        """Create the world creation panel."""
        self._visible = False
        self._screen_width = 0
        self._screen_height = 0
        self._panel_x = 0.0
        self._panel_y = 0.0
        self._panel_width = float(self.PANEL_WIDTH)
        self._panel_height = 0.0
        self._scroll_offset = 0.0
        self._max_scroll = 0.0
        self._dragging_slider: Optional[Slider] = None

        # Settings
        self._settings = WorldGenSettings()

        # Create UI components
        self._create_components()

    def _create_components(self) -> None:
        """Create all UI components."""
        # Name input
        self._name_input = TextInput(
            text="New World",
            placeholder="Enter world name...",
            max_length=32,
            numeric_only=False
        )

        # Seed input
        self._seed_input = TextInput(
            text=str(random.randint(1, 999999)),
            placeholder="Seed...",
            max_length=12,
            numeric_only=True
        )

        # Random button
        self._random_button = StartMenuButton(
            "Random", 0, 0, 65, 32, MenuAction.NONE,
            RANDOM_BTN_COLOR, RANDOM_BTN_HOVER
        )

        # Preset buttons
        self._preset_group = PresetButtonGroup()
        preset_order = ['default', 'amplified', 'flat', 'archipelago', 'superflat', 'caves']
        for preset_id in preset_order:
            display_name = PRESET_DISPLAY_NAMES.get(preset_id, preset_id.title())
            button = PresetButton(
                label=display_name,
                preset_id=preset_id,
                width=68,
                height=28,
                selected=(preset_id == 'default')
            )
            self._preset_group.add_button(button)

        self._preset_group.set_on_change(self._on_preset_change)

        # Biome checkboxes
        self._biome_checkboxes: Dict[str, Checkbox] = {}
        for biome in BIOME_LIST:
            cb = Checkbox(
                label=biome.title(),
                checked=True
            )
            cb.on_change = lambda checked, b=biome: self._on_biome_change(b, checked)
            self._biome_checkboxes[biome] = cb

        # Structure checkboxes
        self._structure_checkboxes: Dict[str, Checkbox] = {
            'trees': Checkbox(label="Trees", checked=True),
            'caves': Checkbox(label="Caves", checked=True),
            'rivers': Checkbox(label="Rivers", checked=True),
        }

        self._structure_checkboxes['trees'].on_change = self._on_trees_change
        self._structure_checkboxes['caves'].on_change = self._on_caves_change
        self._structure_checkboxes['rivers'].on_change = self._on_rivers_change

        # Cave density slider (shown when caves enabled)
        self._cave_slider = Slider(
            min_value=0.0, max_value=2.0, value=1.0, step=0.1,
            width=120, height=16,
            value_format="{:.0%}", suffix=""
        )
        self._cave_slider.on_change = lambda v: setattr(self._settings, 'cave_density', v)

        # Terrain sliders
        self._tree_slider = Slider(
            min_value=0.0, max_value=2.0, value=1.0, step=0.1,
            label="Tree Density", width=180, height=16,
            value_format="{:.0%}", suffix=""
        )
        self._tree_slider.on_change = lambda v: setattr(self._settings, 'tree_density', v)

        self._amplitude_slider = Slider(
            min_value=0.0, max_value=2.0, value=1.0, step=0.05,
            label="Terrain Amplitude", width=180, height=16,
            value_format="{:.0%}", suffix=""
        )
        self._amplitude_slider.on_change = lambda v: setattr(self._settings, 'terrain_amplitude', v)

        self._sea_level_slider = Slider(
            min_value=40.0, max_value=80.0, value=60.0, step=1.0,
            label="Sea Level", width=180, height=16,
            value_format="{:.0f}", suffix=""
        )
        self._sea_level_slider.on_change = lambda v: setattr(self._settings, 'sea_level', int(v))

        # Advanced section
        self._advanced_section = CollapsibleSection(
            title="Advanced Options",
            expanded=False
        )

        # Advanced sliders
        self._biome_size_slider = Slider(
            min_value=0.25, max_value=4.0, value=1.0, step=0.25,
            label="Biome Size", width=160, height=16,
            value_format="{:.0%}", suffix=""
        )
        self._biome_size_slider.on_change = lambda v: setattr(self._settings, 'biome_size', v)

        self._persistence_slider = Slider(
            min_value=0.2, max_value=0.8, value=0.5, step=0.05,
            label="Noise Persistence", width=160, height=16,
            value_format="{:.2f}", suffix=""
        )
        self._persistence_slider.on_change = lambda v: setattr(self._settings, 'noise_persistence', v)

        self._lacunarity_slider = Slider(
            min_value=1.5, max_value=3.0, value=2.0, step=0.1,
            label="Noise Lacunarity", width=160, height=16,
            value_format="{:.1f}", suffix=""
        )
        self._lacunarity_slider.on_change = lambda v: setattr(self._settings, 'noise_lacunarity', v)

        # Spawn position inputs
        self._spawn_x_input = TextInput(
            text="0", placeholder="X", max_length=6, numeric_only=True
        )
        self._spawn_z_input = TextInput(
            text="0", placeholder="Z", max_length=6, numeric_only=True
        )

        # Navigation buttons
        self._back_button = StartMenuButton(
            "Back", 0, 0, 80, 36, MenuAction.BACK,
            BACK_BTN_COLOR, BACK_BTN_HOVER
        )

        self._start_button = StartMenuButton(
            "Start Game", 0, 0, 120, 40, MenuAction.START_GAME,
            START_BTN_COLOR, START_BTN_HOVER
        )

    def _on_preset_change(self, preset_id: str) -> None:
        """Handle preset selection change."""
        self._settings.apply_preset(preset_id)
        self._sync_ui_from_settings()

    def _on_biome_change(self, biome: str, checked: bool) -> None:
        """Handle biome checkbox change."""
        if checked:
            self._settings.enable_biome(biome)
        else:
            # Try to disable, if fails (last biome) recheck the box
            if not self._settings.disable_biome(biome):
                self._biome_checkboxes[biome].checked = True

    def _on_trees_change(self, checked: bool) -> None:
        """Handle trees checkbox change."""
        self._settings.enable_trees = checked
        self._tree_slider.enabled = checked

    def _on_caves_change(self, checked: bool) -> None:
        """Handle caves checkbox change."""
        self._settings.enable_caves = checked
        self._cave_slider.enabled = checked

    def _on_rivers_change(self, checked: bool) -> None:
        """Handle rivers checkbox change."""
        self._settings.enable_rivers = checked

    def _sync_ui_from_settings(self) -> None:
        """Update all UI components to reflect current settings."""
        # Update biome checkboxes
        for biome, cb in self._biome_checkboxes.items():
            cb.checked = self._settings.is_biome_enabled(biome)

        # Update structure checkboxes
        self._structure_checkboxes['trees'].checked = self._settings.enable_trees
        self._structure_checkboxes['caves'].checked = self._settings.enable_caves
        self._structure_checkboxes['rivers'].checked = self._settings.enable_rivers

        # Update sliders
        self._cave_slider.set_value(self._settings.cave_density)
        self._cave_slider.enabled = self._settings.enable_caves
        self._tree_slider.set_value(self._settings.tree_density)
        self._tree_slider.enabled = self._settings.enable_trees
        self._amplitude_slider.set_value(self._settings.terrain_amplitude)
        self._sea_level_slider.set_value(float(self._settings.sea_level))

        # Advanced sliders
        self._biome_size_slider.set_value(self._settings.biome_size)
        self._persistence_slider.set_value(self._settings.noise_persistence)
        self._lacunarity_slider.set_value(self._settings.noise_lacunarity)

        # Spawn inputs
        self._spawn_x_input.set_text(str(self._settings.spawn_x))
        self._spawn_z_input.set_text(str(self._settings.spawn_z))

        # Preset buttons
        self._preset_group.select(self._settings.preset)

    def _sync_settings_from_ui(self) -> None:
        """Update settings from UI components."""
        self._settings.name = self._name_input.get_value() or "New World"

        seed_val = self._seed_input.get_int_value(0)
        self._settings.seed = seed_val if seed_val > 0 else None

        # Spawn positions
        self._settings.spawn_x = self._spawn_x_input.get_int_value(0)
        self._settings.spawn_z = self._spawn_z_input.get_int_value(0)

    @property
    def visible(self) -> bool:
        """Check if panel is visible."""
        return self._visible

    def show(self, screen_width: int, screen_height: int) -> None:
        """
        Show the create world panel.

        @param screen_width: Screen width in pixels.
        @param screen_height: Screen height in pixels.
        """
        self._visible = True
        self._screen_width = screen_width
        self._screen_height = screen_height

        # Calculate panel position
        self._panel_width = float(self.PANEL_WIDTH)
        self._panel_height = float(screen_height - 40)
        self._panel_x = (screen_width - self._panel_width) / 2
        self._panel_y = 20.0

        self._scroll_offset = 0.0

        # Reset to defaults
        self._settings.reset_to_defaults()
        self._seed_input.set_text(str(random.randint(1, 999999)))
        self._name_input.set_text("New World")
        self._sync_ui_from_settings()

    def hide(self) -> None:
        """Hide the panel."""
        self._visible = False
        self._dragging_slider = None

        # Unfocus inputs
        self._name_input.focused = False
        self._seed_input.focused = False
        self._spawn_x_input.focused = False
        self._spawn_z_input.focused = False

    def get_settings(self) -> WorldGenSettings:
        """
        Get the configured world generation settings.

        @returns: WorldGenSettings with current configuration.
        """
        self._sync_settings_from_ui()
        return self._settings

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update hover states and handle slider dragging.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        if not self._visible:
            return

        # Update button hovers
        self._back_button.hovered = self._back_button.contains(mx, my)
        self._start_button.hovered = self._start_button.contains(mx, my)
        self._random_button.hovered = self._random_button.contains(mx, my)

        # Update preset group hovers
        self._preset_group.update_hover(mx, my)

        # Update checkbox hovers
        for cb in self._biome_checkboxes.values():
            cb.update_hover(mx, my)
        for cb in self._structure_checkboxes.values():
            cb.update_hover(mx, my)

        # Update collapsible hover
        self._advanced_section.update_hover(mx, my)

        # Handle slider dragging
        if self._dragging_slider:
            self._dragging_slider.handle_drag(mx, my)

    def handle_click(self, mx: float, my: float) -> MenuAction:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: MenuAction if button clicked, else NONE.
        """
        if not self._visible:
            return MenuAction.NONE

        # Check navigation buttons first
        if self._back_button.contains(mx, my):
            return MenuAction.BACK

        if self._start_button.contains(mx, my):
            return MenuAction.START_GAME

        # Check random button
        if self._random_button.contains(mx, my):
            self._seed_input.set_text(str(random.randint(1, 999999)))
            return MenuAction.NONE

        # Check inputs
        self._name_input.handle_click(mx, my)
        self._seed_input.handle_click(mx, my)

        # Check preset buttons
        if self._preset_group.handle_click(mx, my):
            return MenuAction.NONE

        # Check biome checkboxes
        for cb in self._biome_checkboxes.values():
            if cb.handle_click(mx, my):
                return MenuAction.NONE

        # Check structure checkboxes
        for cb in self._structure_checkboxes.values():
            if cb.handle_click(mx, my):
                return MenuAction.NONE

        # Check sliders
        all_sliders = [
            self._cave_slider, self._tree_slider, self._amplitude_slider,
            self._sea_level_slider, self._biome_size_slider, self._persistence_slider,
            self._lacunarity_slider
        ]

        for slider in all_sliders:
            if slider.handle_click(mx, my):
                self._dragging_slider = slider
                return MenuAction.NONE

        # Check advanced section
        if self._advanced_section.handle_click(mx, my):
            return MenuAction.NONE

        # Check spawn inputs (only when advanced is expanded)
        if self._advanced_section.is_expanded():
            self._spawn_x_input.handle_click(mx, my)
            self._spawn_z_input.handle_click(mx, my)

        return MenuAction.NONE

    def handle_release(self) -> None:
        """Handle mouse button release."""
        if self._dragging_slider:
            self._dragging_slider.handle_release()
            self._dragging_slider = None

    def handle_key(self, key: str, mods: int = 0) -> bool:
        """
        Handle keyboard input.

        @param key: Key identifier string.
        @param mods: Modifier flags.
        @returns: True if key was handled.
        """
        if not self._visible:
            return False

        # Route to focused input
        if self._name_input.focused:
            return self._name_input.handle_key(key, mods)
        if self._seed_input.focused:
            return self._seed_input.handle_key(key, mods)
        if self._spawn_x_input.focused:
            return self._spawn_x_input.handle_key(key, mods)
        if self._spawn_z_input.focused:
            return self._spawn_z_input.handle_key(key, mods)

        return False

    def handle_text_input(self, char: str) -> bool:
        """
        Handle text character input.

        @param char: Character to insert.
        @returns: True if character was handled.
        """
        if not self._visible:
            return False

        if self._name_input.focused:
            return self._name_input.handle_text_input(char)
        if self._seed_input.focused:
            return self._seed_input.handle_text_input(char)
        if self._spawn_x_input.focused:
            return self._spawn_x_input.handle_text_input(char)
        if self._spawn_z_input.focused:
            return self._spawn_z_input.handle_text_input(char)

        return False

    def handle_scroll(self, delta: float) -> None:
        """
        Handle mouse wheel scrolling.

        @param delta: Scroll delta.
        """
        if not self._visible:
            return

        scroll_speed = 30.0
        self._scroll_offset -= delta * scroll_speed
        self._scroll_offset = max(0.0, min(self._max_scroll, self._scroll_offset))

    def render(self, ui: UIRenderer) -> None:
        """
        Render the create world panel.

        @param ui: UI renderer.
        """
        if not self._visible:
            return

        pad = float(self.PANEL_PADDING)
        content_width = self._panel_width - 2 * pad

        # Draw panel background
        ui.draw_rect(self._panel_x, self._panel_y,
                     self._panel_width, self._panel_height, PANEL_BG_COLOR)

        # Track content Y position
        y = self._panel_y + pad - self._scroll_offset

        # ===== HEADER =====
        # Back button (top left)
        self._back_button.x = self._panel_x + pad
        self._back_button.y = self._panel_y + pad
        self._back_button.render(ui)

        # Title (centered)
        title = "Create New World"
        title_w, title_h = ui.measure_text(title, scale=1.2)
        ui.draw_text(title, self._panel_x + (self._panel_width - title_w) / 2,
                     self._panel_y + pad, TITLE_COLOR, scale=1.2)

        y = self._panel_y + pad + max(title_h, 36) + 15

        # ===== WORLD NAME =====
        label = "World Name"
        ui.draw_text(label, self._panel_x + pad, y, SECTION_LABEL_COLOR, scale=0.85)
        y += 22

        self._name_input.x = self._panel_x + pad
        self._name_input.y = y
        self._name_input.width = content_width
        self._name_input.height = 32
        self._name_input.render(ui)
        y += 40

        # ===== SEED =====
        label = "Seed"
        ui.draw_text(label, self._panel_x + pad, y, SECTION_LABEL_COLOR, scale=0.85)
        y += 22

        seed_width = content_width - 75
        self._seed_input.x = self._panel_x + pad
        self._seed_input.y = y
        self._seed_input.width = seed_width
        self._seed_input.height = 32
        self._seed_input.render(ui)

        self._random_button.x = self._panel_x + pad + seed_width + 8
        self._random_button.y = y
        self._random_button.render(ui)
        y += 45

        # Divider
        ui.draw_rect(self._panel_x + pad, y, content_width, 1, DIVIDER_COLOR)
        y += 15

        # ===== WORLD TYPE =====
        label = "World Type"
        ui.draw_text(label, self._panel_x + pad, y, SECTION_LABEL_COLOR, scale=0.85)
        y += 25

        # Layout preset buttons in two rows
        self._preset_group.layout_horizontal(self._panel_x + pad, y, spacing=6)
        # Wrap to two rows if needed
        buttons = self._preset_group.buttons
        row_width = 0
        row_y = y
        for button in buttons:
            if row_width + button.width > content_width:
                row_y += 34
                row_width = 0
            button.x = self._panel_x + pad + row_width
            button.y = row_y
            row_width += button.width + 6
        self._preset_group.render(ui)
        y = row_y + 40

        # Divider
        ui.draw_rect(self._panel_x + pad, y, content_width, 1, DIVIDER_COLOR)
        y += 15

        # ===== BIOMES =====
        label = "Biomes"
        ui.draw_text(label, self._panel_x + pad, y, SECTION_LABEL_COLOR, scale=0.85)
        y += 25

        # Layout biome checkboxes in grid (3 columns)
        col = 0
        col_width = content_width / 3
        start_y = y
        for biome, cb in self._biome_checkboxes.items():
            cb.x = self._panel_x + pad + col * col_width
            cb.y = y
            cb.render(ui)
            col += 1
            if col >= 3:
                col = 0
                y += 26
        if col > 0:
            y += 26
        y += 10

        # Divider
        ui.draw_rect(self._panel_x + pad, y, content_width, 1, DIVIDER_COLOR)
        y += 15

        # ===== STRUCTURES =====
        label = "Structures"
        ui.draw_text(label, self._panel_x + pad, y, SECTION_LABEL_COLOR, scale=0.85)
        y += 25

        # Trees checkbox
        trees_cb = self._structure_checkboxes['trees']
        trees_cb.x = self._panel_x + pad
        trees_cb.y = y
        trees_cb.render(ui)

        # Caves checkbox + slider
        caves_cb = self._structure_checkboxes['caves']
        caves_cb.x = self._panel_x + pad + 100
        caves_cb.y = y
        caves_cb.render(ui)

        self._cave_slider.x = self._panel_x + pad + 180
        self._cave_slider.y = y + 2
        self._cave_slider.render(ui)

        y += 28

        # Rivers checkbox
        rivers_cb = self._structure_checkboxes['rivers']
        rivers_cb.x = self._panel_x + pad
        rivers_cb.y = y
        rivers_cb.render(ui)
        y += 35

        # Divider
        ui.draw_rect(self._panel_x + pad, y, content_width, 1, DIVIDER_COLOR)
        y += 15

        # ===== TERRAIN =====
        label = "Terrain"
        ui.draw_text(label, self._panel_x + pad, y, SECTION_LABEL_COLOR, scale=0.85)
        y += 25

        # Tree Density slider
        self._tree_slider.x = self._panel_x + pad
        self._tree_slider.y = y + 20
        self._tree_slider.render(ui)
        y += 50

        # Terrain Amplitude slider
        self._amplitude_slider.x = self._panel_x + pad
        self._amplitude_slider.y = y + 20
        self._amplitude_slider.render(ui)
        y += 50

        # Sea Level slider
        self._sea_level_slider.x = self._panel_x + pad
        self._sea_level_slider.y = y + 20
        self._sea_level_slider.render(ui)
        y += 55

        # Divider
        ui.draw_rect(self._panel_x + pad, y, content_width, 1, DIVIDER_COLOR)
        y += 10

        # ===== ADVANCED OPTIONS =====
        self._advanced_section.x = self._panel_x + pad
        self._advanced_section.y = y
        self._advanced_section.width = content_width
        self._advanced_section.render(ui)
        y += 35

        if self._advanced_section.is_expanded():
            # Biome Size slider
            self._biome_size_slider.x = self._panel_x + pad + 10
            self._biome_size_slider.y = y + 20
            self._biome_size_slider.render(ui)
            y += 50

            # Noise Persistence slider
            self._persistence_slider.x = self._panel_x + pad + 10
            self._persistence_slider.y = y + 20
            self._persistence_slider.render(ui)
            y += 50

            # Noise Lacunarity slider
            self._lacunarity_slider.x = self._panel_x + pad + 10
            self._lacunarity_slider.y = y + 20
            self._lacunarity_slider.render(ui)
            y += 50

            # Spawn position
            spawn_label = "Spawn Position"
            ui.draw_text(spawn_label, self._panel_x + pad + 10, y, SECTION_LABEL_COLOR, scale=0.8)
            y += 22

            ui.draw_text("X:", self._panel_x + pad + 10, y + 8, HINT_COLOR, scale=0.8)
            self._spawn_x_input.x = self._panel_x + pad + 30
            self._spawn_x_input.y = y
            self._spawn_x_input.width = 70
            self._spawn_x_input.height = 28
            self._spawn_x_input.render(ui)

            ui.draw_text("Z:", self._panel_x + pad + 120, y + 8, HINT_COLOR, scale=0.8)
            self._spawn_z_input.x = self._panel_x + pad + 140
            self._spawn_z_input.y = y
            self._spawn_z_input.width = 70
            self._spawn_z_input.height = 28
            self._spawn_z_input.render(ui)
            y += 40

        y += 10

        # Update max scroll
        content_height = y - (self._panel_y + pad - self._scroll_offset)
        visible_height = self._panel_height - 80  # Leave room for start button
        self._max_scroll = max(0.0, content_height - visible_height)

        # ===== START BUTTON (fixed at bottom) =====
        self._start_button.x = self._panel_x + self._panel_width - pad - 120
        self._start_button.y = self._panel_y + self._panel_height - pad - 40
        self._start_button.render(ui)
