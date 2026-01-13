"""
Create World menu for PythonicVox.

A scrollable world creation screen with multiple input types including
buttons, text fields, sliders, toggles, a collapsible section, and a
live terrain preview.
"""

import pygame
import random
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')

import settings
from ui.components import (
    Button, TextInput, Slider, Toggle,
    CollapsibleSection, ScrollableArea
)
from world.preview import TerrainPreview
from utils.helpers import draw_text_centered


class CreateWorldMenu:
    """
    World creation menu with comprehensive world configuration options.

    Features terrain preview, world type selection, biome toggles,
    structure options, terrain settings, and advanced options.
    """

    def __init__(self, screen):
        """
        Initialize the CreateWorldMenu.

        Args:
            screen (pygame.Surface): The pygame display surface.
        """
        self.screen = screen
        self.screen_width = screen.get_width()
        self.screen_height = screen.get_height()

        # Current settings (copy defaults)
        self.world_settings = settings.DEFAULT_WORLD_SETTINGS.copy()
        self.world_settings["selected_biomes"] = settings.DEFAULT_WORLD_SETTINGS["selected_biomes"].copy()

        # Layout constants
        self.header_height = 70
        self.footer_height = 60
        self.content_padding = 30
        self.section_spacing = 25

        # Initialize fonts
        self.title_font = pygame.font.Font(None, settings.FONT_SIZE_TITLE)
        self.section_font = pygame.font.Font(None, settings.FONT_SIZE_LARGE)
        self.label_font = pygame.font.Font(None, settings.FONT_SIZE_MEDIUM)

        # Initialize terrain preview
        self.preview = TerrainPreview(280, 160)

        # Initialize all UI components
        self._init_components()

        # Calculate total content height
        self._calculate_content_height()

    def _init_components(self):
        """Initialize all UI components."""
        content_width = self.screen_width - (self.content_padding * 2) - 20

        # Header components
        self.start_button = Button(
            rect=(self.screen_width - 180, 15, 150, 40),
            text="Start Game",
            color=settings.COLOR_PRIMARY,
            hover_color=settings.COLOR_PRIMARY_HOVER
        )

        # Footer
        self.back_button = Button(
            rect=(self.content_padding, self.screen_height - 50, 150, 40),
            text="< Back",
            color=settings.COLOR_INPUT_BG,
            hover_color=settings.COLOR_PANEL_BG
        )

        # Scrollable area
        scroll_rect = (0, self.header_height,
                       self.screen_width,
                       self.screen_height - self.header_height - self.footer_height)
        self.scroll_area = ScrollableArea(scroll_rect, content_height=1200)

        # World type buttons (6 in 3x2 grid)
        self.world_type_buttons = []
        button_width = (content_width - 20) // 3
        for i, wt in enumerate(settings.WORLD_TYPES):
            btn = Button(
                rect=(0, 0, button_width - 10, 45),
                text=wt["name"],
                icon=wt["icon"],
                color=settings.COLOR_INPUT_BG,
                border_color=settings.COLOR_BORDER,
                border_width=2,
                font_size=settings.FONT_SIZE_MEDIUM
            )
            btn.data_id = wt["id"]
            btn.is_selected = (wt["id"] == self.world_settings["world_type"])
            self.world_type_buttons.append(btn)

        # World name input
        self.world_name_input = TextInput(
            rect=(0, 0, content_width - 100, settings.INPUT_HEIGHT),
            placeholder="Enter world name...",
            default_value="New World"
        )

        # Seed input and buttons
        seed_input_width = content_width - 180
        self.seed_input = TextInput(
            rect=(0, 0, seed_input_width, settings.INPUT_HEIGHT),
            placeholder="Leave blank for random..."
        )
        self.random_seed_button = Button(
            rect=(0, 0, 50, settings.INPUT_HEIGHT),
            text="?",
            color=settings.COLOR_INPUT_BG,
            hover_color=settings.COLOR_PANEL_BG,
            font_size=settings.FONT_SIZE_LARGE
        )
        self.copy_seed_button = Button(
            rect=(0, 0, 50, settings.INPUT_HEIGHT),
            text="C",
            color=settings.COLOR_INPUT_BG,
            hover_color=settings.COLOR_PANEL_BG,
            font_size=settings.FONT_SIZE_MEDIUM
        )

        # Biome selection buttons
        self.biome_buttons = []
        biome_btn_width = (content_width - 20) // 3
        for biome in settings.BIOMES:
            btn = Button(
                rect=(0, 0, biome_btn_width - 10, 38),
                text=biome["name"],
                icon=biome["icon"],
                color=settings.COLOR_INPUT_BG,
                border_color=settings.COLOR_BORDER,
                border_width=2,
                font_size=settings.FONT_SIZE_MEDIUM
            )
            btn.data_id = biome["id"]
            btn.is_selected = biome["id"] in self.world_settings["selected_biomes"]
            self.biome_buttons.append(btn)

        # Structure toggles
        self.trees_toggle = Toggle(pos=(0, 0), label="Trees", icon="T", default_on=True)
        self.caves_toggle = Toggle(pos=(0, 0), label="Caves", icon="C", default_on=True)
        self.rivers_toggle = Toggle(pos=(0, 0), label="Rivers", icon="R", default_on=True)

        # Cave density slider
        self.cave_density_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=0, max_val=200, default_val=100,
            suffix="%"
        )

        # Terrain sliders
        self.tree_density_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=0, max_val=200, default_val=100,
            suffix="%"
        )
        self.terrain_amplitude_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=25, max_val=200, default_val=100,
            suffix="%"
        )
        self.sea_level_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=40, max_val=80, default_val=60,
            suffix=" blk"
        )

        # Advanced options section
        self.advanced_section = CollapsibleSection(
            pos=(self.content_padding, 0),
            width=content_width,
            title="Advanced Options",
            icon="+"
        )
        self.advanced_section.content_height = 180

        # Advanced sliders
        self.biome_size_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=25, max_val=400, default_val=100,
            suffix="%"
        )
        self.noise_persistence_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=0.20, max_val=0.80, default_val=0.50,
            step=0.01
        )
        self.noise_lacunarity_slider = Slider(
            rect=(0, 0, 200, 30),
            min_val=1.5, max_val=3.0, default_val=2.0,
            step=0.1
        )
        self.spawn_x_input = TextInput(
            rect=(0, 0, 70, settings.INPUT_HEIGHT - 4),
            default_value="0",
            max_length=6
        )
        self.spawn_z_input = TextInput(
            rect=(0, 0, 70, settings.INPUT_HEIGHT - 4),
            default_value="0",
            max_length=6
        )

    def _calculate_content_height(self):
        """Calculate total scrollable content height."""
        height = 30  # Initial padding
        height += 180  # Preview section
        height += 140  # World type section
        height += 130  # World info section
        height += 90   # Biome selection
        height += 160  # Structures section
        height += 160  # Terrain settings
        height += 50 + (self.advanced_section.content_height if self.advanced_section.is_expanded else 0)
        height += 50   # Bottom padding
        self.scroll_area.set_content_height(height)

    def update(self, events):
        """
        Update all components and handle input.

        Args:
            events (list): pygame events for this frame.

        Returns:
            tuple: (state_change, world_config) or (None, None).
        """
        mouse_pos = pygame.mouse.get_pos()
        mouse_clicked = False
        mouse_down = pygame.mouse.get_pressed()[0]

        for event in events:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    return ("main_menu", None)
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                mouse_clicked = True

        # Update scroll area
        self.scroll_area.update(events, mouse_pos)
        scroll_offset = self.scroll_area.get_offset()

        # Adjust mouse pos for scrolled content
        content_mouse_pos = (mouse_pos[0], mouse_pos[1] + scroll_offset - self.header_height)

        # Header buttons (not scrolled)
        if self.start_button.update(mouse_pos, mouse_clicked):
            return ("start_game", self._collect_settings())

        # Footer button (not scrolled)
        if self.back_button.update(mouse_pos, mouse_clicked):
            return ("main_menu", None)

        # Random seed button
        if self.random_seed_button.update(content_mouse_pos, mouse_clicked):
            self.seed_input.text = str(random.randint(0, 999999999))

        # World type selection
        for btn in self.world_type_buttons:
            if btn.update(content_mouse_pos, mouse_clicked):
                self.world_settings["world_type"] = btn.data_id
                for b in self.world_type_buttons:
                    b.is_selected = (b.data_id == self.world_settings["world_type"])

        # Biome toggles
        for btn in self.biome_buttons:
            if btn.update(content_mouse_pos, mouse_clicked):
                btn.is_selected = not btn.is_selected
                if btn.is_selected:
                    if btn.data_id not in self.world_settings["selected_biomes"]:
                        self.world_settings["selected_biomes"].append(btn.data_id)
                else:
                    if btn.data_id in self.world_settings["selected_biomes"]:
                        self.world_settings["selected_biomes"].remove(btn.data_id)

        # Text inputs
        self.world_name_input.update(events, content_mouse_pos, mouse_clicked)
        self.seed_input.update(events, content_mouse_pos, mouse_clicked)

        # Structure toggles
        self.trees_toggle.update(content_mouse_pos, mouse_clicked)
        self.caves_toggle.update(content_mouse_pos, mouse_clicked)
        self.rivers_toggle.update(content_mouse_pos, mouse_clicked)

        # Sliders
        self.cave_density_slider.update(content_mouse_pos, mouse_down, mouse_clicked)
        self.tree_density_slider.update(content_mouse_pos, mouse_down, mouse_clicked)
        self.terrain_amplitude_slider.update(content_mouse_pos, mouse_down, mouse_clicked)
        self.sea_level_slider.update(content_mouse_pos, mouse_down, mouse_clicked)

        # Advanced section
        self.advanced_section.update(content_mouse_pos, mouse_clicked)
        if self.advanced_section.is_content_visible():
            self.biome_size_slider.update(content_mouse_pos, mouse_down, mouse_clicked)
            self.noise_persistence_slider.update(content_mouse_pos, mouse_down, mouse_clicked)
            self.noise_lacunarity_slider.update(content_mouse_pos, mouse_down, mouse_clicked)
            self.spawn_x_input.update(events, content_mouse_pos, mouse_clicked)
            self.spawn_z_input.update(events, content_mouse_pos, mouse_clicked)

        # Recalculate content height
        self._calculate_content_height()

        # Update terrain preview
        self._update_preview()

        return (None, None)

    def _update_preview(self):
        """Regenerate preview if settings changed."""
        seed_text = self.seed_input.text
        seed = int(seed_text) if seed_text.isdigit() else 0
        preview_settings = {
            "terrain_amplitude": self.terrain_amplitude_slider.get_value(),
            "sea_level": self.sea_level_slider.get_value(),
        }
        self.preview.generate(seed, self.world_settings["world_type"], preview_settings)

    def _collect_settings(self):
        """Gather all settings into a config dict."""
        return {
            "world_name": self.world_name_input.get_value() or "New World",
            "seed": self.seed_input.get_value(),
            "world_type": self.world_settings["world_type"],
            "selected_biomes": self.world_settings["selected_biomes"].copy(),
            "trees_enabled": self.trees_toggle.get_value(),
            "caves_enabled": self.caves_toggle.get_value(),
            "cave_density": self.cave_density_slider.get_value(),
            "rivers_enabled": self.rivers_toggle.get_value(),
            "tree_density": self.tree_density_slider.get_value(),
            "terrain_amplitude": self.terrain_amplitude_slider.get_value(),
            "sea_level": self.sea_level_slider.get_value(),
            "biome_size": self.biome_size_slider.get_value(),
            "noise_persistence": self.noise_persistence_slider.get_value(),
            "noise_lacunarity": self.noise_lacunarity_slider.get_value(),
            "spawn_x": int(self.spawn_x_input.get_value() or 0),
            "spawn_z": int(self.spawn_z_input.get_value() or 0),
        }

    def draw(self, screen):
        """
        Render the entire create world menu.

        Args:
            screen (pygame.Surface): Surface to draw on.
        """
        screen.fill(settings.COLOR_DARK_BG)

        scroll_offset = self.scroll_area.get_offset()
        base_y = self.header_height - scroll_offset

        # Clip rect for scrollable content
        content_clip = pygame.Rect(
            0, self.header_height,
            self.screen_width,
            self.screen_height - self.header_height - self.footer_height
        )

        self._draw_header(screen)
        self._draw_content(screen, base_y, content_clip)
        self._draw_footer(screen)
        self.scroll_area.draw_scrollbar(screen)

    def _draw_header(self, screen):
        """Draw fixed header."""
        pygame.draw.rect(screen, settings.COLOR_PANEL_BG,
                         (0, 0, self.screen_width, self.header_height))

        title_surf = self.title_font.render("Create New World", True, settings.COLOR_PRIMARY)
        screen.blit(title_surf, (self.content_padding, 20))

        self.start_button.draw(screen)

    def _draw_footer(self, screen):
        """Draw fixed footer."""
        footer_y = self.screen_height - self.footer_height
        pygame.draw.rect(screen, settings.COLOR_PANEL_BG,
                         (0, footer_y, self.screen_width, self.footer_height))
        self.back_button.rect.y = footer_y + 10
        self.back_button.draw(screen)

    def _draw_content(self, screen, base_y, clip_rect):
        """Draw all scrollable content."""
        screen.set_clip(clip_rect)
        content_width = self.screen_width - (self.content_padding * 2) - 20

        y = base_y + 20

        # 1. Preview section
        y = self._draw_section_title(screen, "Terrain Preview", y)
        self.preview.draw(screen, (self.content_padding, y))
        y += 170

        # 2. World Type
        y = self._draw_section_title(screen, "World Type", y)
        y = self._draw_world_type_grid(screen, y)

        # 3. World Info
        y = self._draw_section_title(screen, "World Info", y)
        self._draw_label(screen, "World Name", self.content_padding, y)
        self.world_name_input.rect.x = self.content_padding
        self.world_name_input.rect.y = y + 20
        self.world_name_input.draw(screen)
        y += 60

        self._draw_label(screen, "Seed", self.content_padding, y)
        self.seed_input.rect.x = self.content_padding
        self.seed_input.rect.y = y + 20
        seed_right = self.seed_input.rect.right
        self.random_seed_button.rect.x = seed_right + 10
        self.random_seed_button.rect.y = y + 20
        self.copy_seed_button.rect.x = seed_right + 70
        self.copy_seed_button.rect.y = y + 20
        self.seed_input.draw(screen)
        self.random_seed_button.draw(screen)
        self.copy_seed_button.draw(screen)
        y += 70

        # 4. Biome Selection
        y = self._draw_section_title(screen, "Biome Selection", y)
        y = self._draw_biome_grid(screen, y)

        # 5. Structures
        y = self._draw_section_title(screen, "Structures", y)
        y = self._draw_structures(screen, y)

        # 6. Terrain Settings
        y = self._draw_section_title(screen, "Terrain Settings", y)
        y = self._draw_terrain_sliders(screen, y)

        # 7. Advanced Options
        self.advanced_section.x = self.content_padding
        self.advanced_section.y = y
        self.advanced_section.header_rect.x = self.content_padding
        self.advanced_section.header_rect.y = y
        self.advanced_section.draw_header(screen)
        y += self.advanced_section.header_height

        if self.advanced_section.is_content_visible():
            y = self._draw_advanced_options(screen, y)

        screen.set_clip(None)

    def _draw_section_title(self, screen, title, y):
        """Draw section title and return new y."""
        surf = self.section_font.render(title, True, settings.COLOR_TEXT_PRIMARY)
        screen.blit(surf, (self.content_padding, y))
        return y + 30

    def _draw_label(self, screen, text, x, y):
        """Draw a form label."""
        surf = self.label_font.render(text, True, settings.COLOR_TEXT_SECONDARY)
        screen.blit(surf, (x, y))

    def _draw_world_type_grid(self, screen, y):
        """Draw world type button grid."""
        content_width = self.screen_width - (self.content_padding * 2) - 20
        btn_width = (content_width - 20) // 3

        for i, btn in enumerate(self.world_type_buttons):
            col = i % 3
            row = i // 3
            btn.rect.x = self.content_padding + col * (btn_width + 10)
            btn.rect.y = y + row * 55
            btn.is_selected = (btn.data_id == self.world_settings["world_type"])
            btn.draw(screen)

        return y + 120

    def _draw_biome_grid(self, screen, y):
        """Draw biome selection buttons."""
        content_width = self.screen_width - (self.content_padding * 2) - 20
        btn_width = (content_width - 20) // 3

        for i, btn in enumerate(self.biome_buttons):
            col = i % 3
            row = i // 3
            btn.rect.x = self.content_padding + col * (btn_width + 10)
            btn.rect.y = y + row * 48
            btn.draw(screen)

        return y + 100

    def _draw_structures(self, screen, y):
        """Draw structure toggles."""
        toggle_x = self.content_padding + 120

        self.trees_toggle.x = toggle_x
        self.trees_toggle.y = y
        self.trees_toggle.rect.x = toggle_x
        self.trees_toggle.rect.y = y
        self.trees_toggle.draw(screen)
        y += 35

        self.caves_toggle.x = toggle_x
        self.caves_toggle.y = y
        self.caves_toggle.rect.x = toggle_x
        self.caves_toggle.rect.y = y
        self.caves_toggle.draw(screen)
        y += 35

        if self.caves_toggle.get_value():
            self._draw_label(screen, "Density", self.content_padding + 50, y + 5)
            self.cave_density_slider.rect.x = self.content_padding + 130
            self.cave_density_slider.rect.y = y
            self.cave_density_slider.draw(screen)
            y += 35

        self.rivers_toggle.x = toggle_x
        self.rivers_toggle.y = y
        self.rivers_toggle.rect.x = toggle_x
        self.rivers_toggle.rect.y = y
        self.rivers_toggle.draw(screen)
        y += 45

        return y

    def _draw_terrain_sliders(self, screen, y):
        """Draw terrain setting sliders."""
        slider_x = self.content_padding + 160

        self._draw_label(screen, "Tree Density", self.content_padding, y + 5)
        self.tree_density_slider.rect.x = slider_x
        self.tree_density_slider.rect.y = y
        self.tree_density_slider.draw(screen)
        y += 40

        self._draw_label(screen, "Amplitude", self.content_padding, y + 5)
        self.terrain_amplitude_slider.rect.x = slider_x
        self.terrain_amplitude_slider.rect.y = y
        self.terrain_amplitude_slider.draw(screen)
        y += 40

        self._draw_label(screen, "Sea Level", self.content_padding, y + 5)
        self.sea_level_slider.rect.x = slider_x
        self.sea_level_slider.rect.y = y
        self.sea_level_slider.draw(screen)
        y += 50

        return y

    def _draw_advanced_options(self, screen, y):
        """Draw advanced options content."""
        box_rect = pygame.Rect(
            self.content_padding, y,
            self.screen_width - self.content_padding * 2 - 20,
            self.advanced_section.content_height - 10
        )
        pygame.draw.rect(screen, settings.COLOR_PANEL_BG, box_rect)
        pygame.draw.rect(screen, settings.COLOR_BORDER, box_rect, 1)

        inner_y = y + 12
        slider_x = self.content_padding + 160

        self._draw_label(screen, "Biome Size", self.content_padding + 15, inner_y + 5)
        self.biome_size_slider.rect.x = slider_x
        self.biome_size_slider.rect.y = inner_y
        self.biome_size_slider.draw(screen)
        inner_y += 38

        self._draw_label(screen, "Persistence", self.content_padding + 15, inner_y + 5)
        self.noise_persistence_slider.rect.x = slider_x
        self.noise_persistence_slider.rect.y = inner_y
        self.noise_persistence_slider.draw(screen)
        inner_y += 38

        self._draw_label(screen, "Lacunarity", self.content_padding + 15, inner_y + 5)
        self.noise_lacunarity_slider.rect.x = slider_x
        self.noise_lacunarity_slider.rect.y = inner_y
        self.noise_lacunarity_slider.draw(screen)
        inner_y += 38

        self._draw_label(screen, "Spawn", self.content_padding + 15, inner_y + 5)
        self._draw_label(screen, "X:", slider_x, inner_y + 5)
        self.spawn_x_input.rect.x = slider_x + 20
        self.spawn_x_input.rect.y = inner_y
        self.spawn_x_input.draw(screen)
        self._draw_label(screen, "Z:", slider_x + 110, inner_y + 5)
        self.spawn_z_input.rect.x = slider_x + 130
        self.spawn_z_input.rect.y = inner_y
        self.spawn_z_input.draw(screen)

        return y + self.advanced_section.content_height
