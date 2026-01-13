"""
Game constants and configuration for PythonicVox.

This module contains all game settings, constants, and configuration values
that control game behavior, rendering options, and gameplay parameters.

Configuration Categories:
    - Window settings (title, dimensions, FPS)
    - UI settings (colors, button dimensions)
    - World settings (chunk size, render distance, world height)
    - Player settings (movement speed, jump force, health)
    - Graphics settings (FOV, draw distance, lighting options)
    - Audio settings (volume levels, sound toggles)
"""

# =============================================================================
# Window Configuration
# =============================================================================
WINDOW_TITLE = "PythonicVox"
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
FPS_CAP = 60

# =============================================================================
# UI Colors (RGB tuples for pygame)
# =============================================================================
COLOR_BG = (20, 20, 30)
COLOR_BUTTON = (60, 60, 80)
COLOR_BUTTON_HOVER = (80, 80, 120)
COLOR_TEXT = (220, 220, 220)
COLOR_TITLE = (255, 255, 255)
COLOR_SUBTITLE = (150, 150, 170)
COLOR_VERSION = (80, 80, 100)

# =============================================================================
# UI Layout Settings
# =============================================================================
BUTTON_WIDTH = 250
BUTTON_HEIGHT = 50
BUTTON_SPACING = 20
TITLE_FONT_SIZE = 72
BUTTON_FONT_SIZE = 28
VERSION_FONT_SIZE = 18

# =============================================================================
# World Configuration
# =============================================================================
CHUNK_SIZE = 16  # Blocks per chunk (X and Z dimensions)
CHUNK_HEIGHT = 320  # Blocks per chunk (Y dimension)
RENDER_DISTANCE = 8  # Chunks to render in each direction
WORLD_SEED = None  # None for random seed

# =============================================================================
# Player Configuration
# =============================================================================
PLAYER_SPEED = 5.0  # Walking speed
SPRINT_MULTIPLIER = 1.5  # Sprint speed multiplier
JUMP_FORCE = 8.0  # Jump velocity
PLAYER_HEIGHT = 1.8  # Player hitbox height
PLAYER_REACH = 5.0  # Block interaction distance

# =============================================================================
# Graphics Configuration
# =============================================================================
FIELD_OF_VIEW = 75  # Camera FOV in degrees
AMBIENT_OCCLUSION = True  # Enable ambient occlusion
ENABLE_SHADOWS = True  # Enable shadow rendering
ENABLE_FOG = True  # Enable distance fog
FOG_DISTANCE = 100  # Fog start distance

# =============================================================================
# Audio Configuration
# =============================================================================
MASTER_VOLUME = 1.0  # Master volume (0.0 - 1.0)
MUSIC_VOLUME = 0.5  # Music volume (0.0 - 1.0)
SFX_VOLUME = 0.8  # Sound effects volume (0.0 - 1.0)

# =============================================================================
# Settings Menu Configuration
# =============================================================================
SETTINGS_TABS = ["General", "Quality", "Performance", "Physics", "World"]

# Tab styling
TAB_HEIGHT = 40
TAB_PADDING = 20
TAB_COLOR = (50, 50, 70)
TAB_ACTIVE_COLOR = (80, 80, 120)
TAB_HOVER_COLOR = (65, 65, 90)
TAB_UNDERLINE_COLOR = (120, 180, 255)
TAB_UNDERLINE_HEIGHT = 3
TAB_FONT_SIZE = 22

# Settings panel
SETTINGS_PANEL_MARGIN = 60
SETTINGS_PANEL_COLOR = (35, 35, 50)
SETTINGS_PANEL_BORDER_COLOR = (60, 60, 80)

# Close button
CLOSE_BUTTON_SIZE = 32
CLOSE_BUTTON_COLOR = (180, 60, 60)
CLOSE_BUTTON_HOVER_COLOR = (220, 80, 80)

# =============================================================================
# Block Types
# =============================================================================
AIR = 0
GRASS = 1
DIRT = 2
STONE = 3
WOOD = 4
LOG = 5
LEAVES = 6
BEDROCK = 7
SAND = 8
WATER = 9
TORCH = 10
SNOW = 11
GRAVEL = 12
