"""
VoxEx UI/HUD system.

Provides 2D overlay rendering for crosshair, hotbar, debug info, and menus.

Components:
- UIRenderer: Batched 2D rendering with shapes and text
- Crosshair: Simple centered cross
- Hotbar: 9 slots with block icons and selected highlight
- DebugOverlay: FPS, position, chunk info (~ key toggle)
- PauseMenu: ESC menu with Resume/Settings/Quit buttons

Usage:
    from voxel_engine.engine.ui import UIRenderer, Crosshair, Hotbar
    from voxel_engine.engine.ui import DebugOverlay, PauseMenu, MenuAction

    # Create renderer with OpenGL context
    ui = UIRenderer(ctx, width, height)

    # Begin/end frame rendering
    ui.begin()
    crosshair.render(ui)
    hotbar.render(ui, selected_slot=0)
    debug.render(ui)
    ui.end()
"""

from .constants import (
    CROSSHAIR_SIZE, CROSSHAIR_THICKNESS, CROSSHAIR_COLOR,
    HOTBAR_SLOTS, HOTBAR_SLOT_SIZE, HOTBAR_SLOT_PADDING,
    HOTBAR_MARGIN_BOTTOM, HOTBAR_BG_COLOR, HOTBAR_SELECTED_COLOR,
    HOTBAR_BORDER_COLOR, DEBUG_FONT_SIZE, DEBUG_LINE_HEIGHT,
    DEBUG_PADDING, DEBUG_BG_COLOR, DEBUG_TEXT_COLOR,
    MENU_BG_COLOR, MENU_BUTTON_WIDTH, MENU_BUTTON_HEIGHT,
    MENU_BUTTON_SPACING, MENU_BUTTON_COLOR, MENU_BUTTON_HOVER_COLOR,
    MENU_TEXT_COLOR,
    START_MENU_BG_COLOR, START_MENU_TITLE_COLOR, START_MENU_SUBTITLE_COLOR,
    START_MENU_BUTTON_WIDTH, START_MENU_BUTTON_HEIGHT, START_MENU_BUTTON_SPACING,
    START_MENU_CREATE_COLOR, START_MENU_CREATE_HOVER,
    START_MENU_SETTINGS_COLOR, START_MENU_SETTINGS_HOVER,
    START_MENU_INPUT_BG_COLOR, START_MENU_INPUT_BORDER_COLOR
)
from .orthographic import orthographic_matrix
from .bitmap_font import BitmapFont, FONT_DATA
from .ui_renderer import UIRenderer
from .hud import Crosshair, Hotbar, DebugOverlay
from .pause_menu import PauseMenu, Button, MenuAction
from .start_menu import StartMenu, StartMenuButton

__all__ = [
    # Projection
    'orthographic_matrix',
    # Font
    'BitmapFont', 'FONT_DATA',
    # Renderer
    'UIRenderer',
    # HUD components
    'Crosshair', 'Hotbar', 'DebugOverlay',
    # Pause menu
    'PauseMenu', 'Button', 'MenuAction',
    # Start menu
    'StartMenu', 'StartMenuButton',
    # Constants
    'CROSSHAIR_SIZE', 'CROSSHAIR_THICKNESS', 'CROSSHAIR_COLOR',
    'HOTBAR_SLOTS', 'HOTBAR_SLOT_SIZE', 'HOTBAR_SLOT_PADDING',
    'HOTBAR_MARGIN_BOTTOM', 'HOTBAR_BG_COLOR', 'HOTBAR_SELECTED_COLOR',
    'HOTBAR_BORDER_COLOR', 'DEBUG_FONT_SIZE', 'DEBUG_LINE_HEIGHT',
    'DEBUG_PADDING', 'DEBUG_BG_COLOR', 'DEBUG_TEXT_COLOR',
    'MENU_BG_COLOR', 'MENU_BUTTON_WIDTH', 'MENU_BUTTON_HEIGHT',
    'MENU_BUTTON_SPACING', 'MENU_BUTTON_COLOR', 'MENU_BUTTON_HOVER_COLOR',
    'MENU_TEXT_COLOR',
    'START_MENU_BG_COLOR', 'START_MENU_TITLE_COLOR', 'START_MENU_SUBTITLE_COLOR',
    'START_MENU_BUTTON_WIDTH', 'START_MENU_BUTTON_HEIGHT', 'START_MENU_BUTTON_SPACING',
    'START_MENU_CREATE_COLOR', 'START_MENU_CREATE_HOVER',
    'START_MENU_SETTINGS_COLOR', 'START_MENU_SETTINGS_HOVER',
    'START_MENU_INPUT_BG_COLOR', 'START_MENU_INPUT_BORDER_COLOR',
]
