"""
Game constants and configuration for PythonicVox.

This module contains all game settings, constants, and configuration values
that control game behavior, rendering options, and gameplay parameters.

Configuration Categories:
    - Window settings (title, dimensions, fullscreen)
    - World settings (chunk size, render distance, world height)
    - Player settings (movement speed, jump force, health)
    - Graphics settings (FOV, draw distance, lighting options)
    - Audio settings (volume levels, sound toggles)
    - Control mappings (keyboard and mouse bindings)
    - UI theming (colors for menus and buttons)
"""

from ursina import color

# Window Configuration
WINDOW_TITLE = "PythonicVox"
WINDOW_BORDERLESS = False
FULLSCREEN = False
WINDOW_SIZE = (1280, 720)  # Default window dimensions

# UI Colors (for theming)
MENU_BG_COLOR = color.color(0, 0, 0.1, 0.9)  # Dark semi-transparent background
BUTTON_COLOR = color.color(0, 0, 0.2, 1)  # Dark gray button
BUTTON_HOVER_COLOR = color.color(0, 0, 0.3, 1)  # Lighter on hover
BUTTON_TEXT_COLOR = color.white
TITLE_COLOR = color.color(120, 0.8, 0.9, 1)  # Cyan/teal title

# World Configuration
CHUNK_SIZE = 16  # Blocks per chunk (X and Z dimensions)
CHUNK_HEIGHT = 320  # Blocks per chunk (Y dimension)
RENDER_DISTANCE = 8  # Chunks to render in each direction
WORLD_SEED = None  # None for random seed

# Player Configuration
PLAYER_SPEED = 5.0  # Walking speed
SPRINT_MULTIPLIER = 1.5  # Sprint speed multiplier
JUMP_FORCE = 8.0  # Jump velocity
PLAYER_HEIGHT = 1.8  # Player hitbox height
PLAYER_REACH = 5.0  # Block interaction distance

# Graphics Configuration
FIELD_OF_VIEW = 75  # Camera FOV in degrees
AMBIENT_OCCLUSION = True  # Enable ambient occlusion
ENABLE_SHADOWS = True  # Enable shadow rendering
ENABLE_FOG = True  # Enable distance fog
FOG_DISTANCE = 100  # Fog start distance

# Audio Configuration
MASTER_VOLUME = 1.0  # Master volume (0.0 - 1.0)
MUSIC_VOLUME = 0.5  # Music volume (0.0 - 1.0)
SFX_VOLUME = 0.8  # Sound effects volume (0.0 - 1.0)

# Block Types
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
