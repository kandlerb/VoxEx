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

        # Layout position tracking (set by _update_layout)
        self.preview_y = 0
        self.section_positions = {}

        # Initialize all UI components
        self._init_components()

        # Initial layout calculation
        self._update_layout()

    def _init_components(self):
        """Initialize all UI components."""
        content_width = self.screen_width - (self.content_padding * 2) - 20

        # Header components (fixed position)
        self.start_button = Button(
            rect=(self.screen_width - 180, 15, 150, 40),
            text="Start Game",
            color=settings.COLOR_PRIMARY,
            hover_color=settings.COLOR_PRIMARY_HOVER
        )

        # Footer (fixed position)
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

    def _update_layout(self):
        """
        Calculate screen positions for all components based on scroll state.

        This method MUST be called before hit detection so that component
        rects are in the correct screen-space positions.
        """
        scroll_offset = self.scroll_area.get_offset()
        base_y = self.header_height - scroll_offset
        content_width = self.screen_width - (self.content_padding * 2) - 20

        y = base_y + 20  # Starting content y in screen space

        # 1. Preview section
        self.section_positions['preview_title'] = y
        y += 30  # Section title height
        self.preview_y = y
        y += 170

        # 2. World type section
        self.section_positions['world_type_title'] = y
        y += 30
        button_width = (content_width - 20) // 3
        for i, btn in enumerate(self.world_type_buttons):
            col = i % 3
            row = i // 3
            btn.rect.x = self.content_padding + col * (button_width + 10)
            btn.rect.y = y + row * 55
            btn.rect.width = button_width - 10
            btn.rect.height = 45
        y += 120

        # 3. World info section
        self.section_positions['world_info_title'] = y
        y += 30
        # World name
        self.section_positions['world_name_label'] = y
        self.world_name_input.rect.x = self.content_padding
        self.world_name_input.rect.y = y + 20
        y += 60
        # Seed
        self.section_positions['seed_label'] = y
        seed_input_width = content_width - 180
        self.seed_input.rect.x = self.content_padding
        self.seed_input.rect.y = y + 20
        self.seed_input.rect.width = seed_input_width
        self.random_seed_button.rect.x = self.content_padding + seed_input_width + 10
        self.random_seed_button.rect.y = y + 20
        self.copy_seed_button.rect.x = self.content_padding + seed_input_width + 70
        self.copy_seed_button.rect.y = y + 20
        y += 70

        # 4. Biome selection section
        self.section_positions['biome_title'] = y
        y += 30
        btn_width = (content_width - 20) // 3
        for i, btn in enumerate(self.biome_buttons):
            col = i % 3
            row = i // 3
            btn.rect.x = self.content_padding + col * (btn_width + 10)
            btn.rect.y = y + row * 48
            btn.rect.width = btn_width - 10
            btn.rect.height = 38
        y += 100

        # 5. Structures section
        self.section_positions['structures_title'] = y
        y += 30
        toggle_x = self.content_padding + 120

        self.trees_toggle.rect.x = toggle_x
        self.trees_toggle.rect.y = y
        y += 35

        self.caves_toggle.rect.x = toggle_x
        self.caves_toggle.rect.y = y
        y += 35

        if self.caves_toggle.is_on:
            self.section_positions['cave_density_label'] = y + 5
            self.cave_density_slider.rect.x = self.content_padding + 130
            self.cave_density_slider.rect.y = y
            y += 35

        self.rivers_toggle.rect.x = toggle_x
        self.rivers_toggle.rect.y = y
        y += 45

        # 6. Terrain settings section
        self.section_positions['terrain_title'] = y
        y += 30
        slider_x = self.content_padding + 160

        self.section_positions['tree_density_label'] = y + 5
        self.tree_density_slider.rect.x = slider_x
        self.tree_density_slider.rect.y = y
        y += 40

        self.section_positions['amplitude_label'] = y + 5
        self.terrain_amplitude_slider.rect.x = slider_x
        self.terrain_amplitude_slider.rect.y = y
        y += 40

        self.section_positions['sea_level_label'] = y + 5
        self.sea_level_slider.rect.x = slider_x
        self.sea_level_slider.rect.y = y
        y += 50

        # 7. Advanced options section
        self.advanced_section.header_rect.x = self.content_padding
        self.advanced_section.header_rect.y = y
        y += self.advanced_section.header_height

        if self.advanced_section.is_expanded:
            self.section_positions['advanced_box'] = y
            inner_y = y + 12

            self.section_positions['biome_size_label'] = inner_y + 5
            self.biome_size_slider.rect.x = slider_x
            self.biome_size_slider.rect.y = inner_y
            inner_y += 38

            self.section_positions['persistence_label'] = inner_y + 5
            self.noise_persistence_slider.rect.x = slider_x
            self.noise_persistence_slider.rect.y = inner_y
            inner_y += 38

            self.section_positions['lacunarity_label'] = inner_y + 5
            self.noise_lacunarity_slider.rect.x = slider_x
            self.noise_lacunarity_slider.rect.y = inner_y
            inner_y += 38

            self.section_positions['spawn_label'] = inner_y + 5
            self.spawn_x_input.rect.x = slider_x + 25
            self.spawn_x_input.rect.y = inner_y
            self.spawn_z_input.rect.x = slider_x + 155
            self.spawn_z_input.rect.y = inner_y

            y += self.advanced_section.content_height

        # Update total content height for scroll area
        total_content = y - base_y + 50  # Add bottom padding
        self.scroll_area.set_content_height(total_content)

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

        # Update scroll area FIRST
        self.scroll_area.update(events, mouse_pos)

        # Calculate all component positions based on current scroll
        # This ensures rects are in screen space before hit detection
        self._update_layout()

        # Now all rects are in screen space - use mouse_pos directly

        # Header buttons (always check these - fixed position)
        if self.start_button.update(mouse_pos, mouse_clicked):
            return ("start_game", self._collect_settings())

        # Footer button (always check - fixed position)
        if self.back_button.update(mouse_pos, mouse_clicked):
            return ("main_menu", None)

        # Define scrollable content area
        content_area = pygame.Rect(
            0, self.header_height,
            self.screen_width,
            self.screen_height - self.header_height - self.footer_height
        )

        # Only check scrollable content if mouse is in content area
        if content_area.collidepoint(mouse_pos):
            # World type buttons
            for btn in self.world_type_buttons:
                if btn.update(mouse_pos, mouse_clicked):
                    self.world_settings["world_type"] = btn.data_id
                    for b in self.world_type_buttons:
                        b.is_selected = (b.data_id == self.world_settings["world_type"])

            # Seed buttons
            if self.random_seed_button.update(mouse_pos, mouse_clicked):
                self.seed_input.text = str(random.randint(0, 999999999))

            if self.copy_seed_button.update(mouse_pos, mouse_clicked):
                # Copy to clipboard if available
                try:
                    pygame.scrap.init()
                    pygame.scrap.put(pygame.SCRAP_TEXT, self.seed_input.text.encode())
                except Exception:
                    pass

            # Biome buttons
            for btn in self.biome_buttons:
                if btn.update(mouse_pos, mouse_clicked):
                    btn.is_selected = not btn.is_selected
                    if btn.is_selected:
                        if btn.data_id not in self.world_settings["selected_biomes"]:
                            self.world_settings["selected_biomes"].append(btn.data_id)
                    else:
                        if btn.data_id in self.world_settings["selected_biomes"]:
                            self.world_settings["selected_biomes"].remove(btn.data_id)

            # Text inputs
            self.world_name_input.update(events, mouse_pos, mouse_clicked)
            self.seed_input.update(events, mouse_pos, mouse_clicked)

            # Toggles
            self.trees_toggle.update(mouse_pos, mouse_clicked)
            self.caves_toggle.update(mouse_pos, mouse_clicked)
            self.rivers_toggle.update(mouse_pos, mouse_clicked)

            # Sliders
            if self.caves_toggle.is_on:
                self.cave_density_slider.update(mouse_pos, mouse_down, mouse_clicked)
            self.tree_density_slider.update(mouse_pos, mouse_down, mouse_clicked)
            self.terrain_amplitude_slider.update(mouse_pos, mouse_down, mouse_clicked)
            self.sea_level_slider.update(mouse_pos, mouse_down, mouse_clicked)

            # Advanced section toggle
            self.advanced_section.update(mouse_pos, mouse_clicked)

            # Advanced options (only if expanded)
            if self.advanced_section.is_expanded:
                self.biome_size_slider.update(mouse_pos, mouse_down, mouse_clicked)
                self.noise_persistence_slider.update(mouse_pos, mouse_down, mouse_clicked)
                self.noise_lacunarity_slider.update(mouse_pos, mouse_down, mouse_clicked)
                self.spawn_x_input.update(events, mouse_pos, mouse_clicked)
                self.spawn_z_input.update(events, mouse_pos, mouse_clicked)

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

        # Draw header (fixed)
        self._draw_header(screen)

        # Set clip rect for scrollable content
        content_clip = pygame.Rect(
            0, self.header_height,
            self.screen_width,
            self.screen_height - self.header_height - self.footer_height
        )
        screen.set_clip(content_clip)

        # Draw all sections using pre-calculated positions
        self._draw_sections(screen)

        # Remove clip
        screen.set_clip(None)

        # Draw footer (fixed)
        self._draw_footer(screen)

        # Draw scrollbar on top
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
        self.back_button.draw(screen)

    def _draw_sections(self, screen):
        """Draw all scrollable content sections using pre-calculated positions."""
        slider_x = self.content_padding + 160

        # 1. Preview section
        self._draw_section_title(screen, "Terrain Preview", self.section_positions.get('preview_title', 0))
        self.preview.draw(screen, (self.content_padding, self.preview_y))

        # 2. World Type
        self._draw_section_title(screen, "World Type", self.section_positions.get('world_type_title', 0))
        for btn in self.world_type_buttons:
            btn.is_selected = (btn.data_id == self.world_settings["world_type"])
            btn.draw(screen)

        # 3. World Info
        self._draw_section_title(screen, "World Info", self.section_positions.get('world_info_title', 0))
        self._draw_label(screen, "World Name", self.content_padding, self.section_positions.get('world_name_label', 0))
        self.world_name_input.draw(screen)

        self._draw_label(screen, "Seed", self.content_padding, self.section_positions.get('seed_label', 0))
        self.seed_input.draw(screen)
        self.random_seed_button.draw(screen)
        self.copy_seed_button.draw(screen)

        # 4. Biome Selection
        self._draw_section_title(screen, "Biome Selection", self.section_positions.get('biome_title', 0))
        for btn in self.biome_buttons:
            btn.draw(screen)

        # 5. Structures
        self._draw_section_title(screen, "Structures", self.section_positions.get('structures_title', 0))
        self.trees_toggle.draw(screen)
        self.caves_toggle.draw(screen)

        if self.caves_toggle.is_on:
            self._draw_label(screen, "Density", self.content_padding + 50, self.section_positions.get('cave_density_label', 0))
            self.cave_density_slider.draw(screen)

        self.rivers_toggle.draw(screen)

        # 6. Terrain Settings
        self._draw_section_title(screen, "Terrain Settings", self.section_positions.get('terrain_title', 0))

        self._draw_label(screen, "Tree Density", self.content_padding, self.section_positions.get('tree_density_label', 0))
        self.tree_density_slider.draw(screen)

        self._draw_label(screen, "Amplitude", self.content_padding, self.section_positions.get('amplitude_label', 0))
        self.terrain_amplitude_slider.draw(screen)

        self._draw_label(screen, "Sea Level", self.content_padding, self.section_positions.get('sea_level_label', 0))
        self.sea_level_slider.draw(screen)

        # 7. Advanced Options
        self.advanced_section.draw_header(screen)

        if self.advanced_section.is_content_visible():
            # Draw box background
            box_y = self.section_positions.get('advanced_box', 0)
            box_rect = pygame.Rect(
                self.content_padding, box_y,
                self.screen_width - self.content_padding * 2 - 20,
                self.advanced_section.content_height - 10
            )
            pygame.draw.rect(screen, settings.COLOR_PANEL_BG, box_rect)
            pygame.draw.rect(screen, settings.COLOR_BORDER, box_rect, 1)

            self._draw_label(screen, "Biome Size", self.content_padding + 15, self.section_positions.get('biome_size_label', 0))
            self.biome_size_slider.draw(screen)

            self._draw_label(screen, "Persistence", self.content_padding + 15, self.section_positions.get('persistence_label', 0))
            self.noise_persistence_slider.draw(screen)

            self._draw_label(screen, "Lacunarity", self.content_padding + 15, self.section_positions.get('lacunarity_label', 0))
            self.noise_lacunarity_slider.draw(screen)

            self._draw_label(screen, "Spawn", self.content_padding + 15, self.section_positions.get('spawn_label', 0))
            self._draw_label(screen, "X:", slider_x, self.section_positions.get('spawn_label', 0))
            self.spawn_x_input.draw(screen)
            self._draw_label(screen, "Z:", slider_x + 110, self.section_positions.get('spawn_label', 0))
            self.spawn_z_input.draw(screen)

    def _draw_section_title(self, screen, title, y):
        """Draw section title at given y position."""
        surf = self.section_font.render(title, True, settings.COLOR_TEXT_PRIMARY)
        screen.blit(surf, (self.content_padding, y))

    def _draw_label(self, screen, text, x, y):
        """Draw a form label."""
        surf = self.label_font.render(text, True, settings.COLOR_TEXT_SECONDARY)
        screen.blit(surf, (x, y))
