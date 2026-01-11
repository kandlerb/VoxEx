"""HUD components: crosshair, hotbar, debug overlay."""
import numpy as np
from typing import List, Optional, Dict

from .ui_renderer import UIRenderer
from .constants import (
    CROSSHAIR_SIZE, CROSSHAIR_THICKNESS, CROSSHAIR_COLOR,
    HOTBAR_SLOTS, HOTBAR_SLOT_SIZE, HOTBAR_SLOT_PADDING,
    HOTBAR_MARGIN_BOTTOM, HOTBAR_BG_COLOR, HOTBAR_SELECTED_COLOR,
    HOTBAR_BORDER_COLOR, DEBUG_LINE_HEIGHT, DEBUG_PADDING,
    DEBUG_BG_COLOR, DEBUG_TEXT_COLOR
)
from ..state import GameState, PlayerState
from ..registry import Registry


class Crosshair:
    """Simple crosshair renderer."""

    __slots__ = ('_size', '_thickness', '_color')

    def __init__(self, size: int = CROSSHAIR_SIZE,
                 thickness: int = CROSSHAIR_THICKNESS,
                 color: tuple = CROSSHAIR_COLOR):
        """
        Create crosshair.

        @param size: Total size in pixels.
        @param thickness: Line thickness in pixels.
        @param color: RGBA color tuple.
        """
        self._size = size
        self._thickness = thickness
        self._color = color

    def render(self, ui: UIRenderer) -> None:
        """
        Render crosshair.

        @param ui: UI renderer.
        """
        ui.draw_crosshair(self._size, self._thickness, self._color)


class Hotbar:
    """Hotbar display with block slots."""

    __slots__ = ('_block_ids', '_selected')

    def __init__(self):
        """Create hotbar with default block slots."""
        # Default hotbar blocks (common blocks for building)
        self._block_ids = [1, 2, 3, 4, 5, 6, 8, 9, 10]
        self._selected = 0

    def set_selected(self, slot: int) -> None:
        """
        Set selected slot (0-8).

        @param slot: Slot index to select.
        """
        self._selected = max(0, min(8, slot))

    def get_block_id(self, slot: int) -> int:
        """
        Get block ID for a slot.

        @param slot: Slot index.
        @returns: Block ID or 0 if invalid.
        """
        if 0 <= slot < len(self._block_ids):
            return self._block_ids[slot]
        return 0

    def render(self, ui: UIRenderer, selected_slot: int) -> None:
        """
        Render hotbar.

        @param ui: UI renderer.
        @param selected_slot: Currently selected slot index.
        """
        self._selected = selected_slot

        total_width = (HOTBAR_SLOTS * HOTBAR_SLOT_SIZE +
                       (HOTBAR_SLOTS - 1) * HOTBAR_SLOT_PADDING)
        start_x = (ui.width - total_width) // 2
        start_y = ui.height - HOTBAR_MARGIN_BOTTOM - HOTBAR_SLOT_SIZE

        for i in range(HOTBAR_SLOTS):
            x = start_x + i * (HOTBAR_SLOT_SIZE + HOTBAR_SLOT_PADDING)
            y = start_y

            # Background
            ui.draw_rect(x, y, HOTBAR_SLOT_SIZE, HOTBAR_SLOT_SIZE, HOTBAR_BG_COLOR)

            # Selection highlight
            if i == self._selected:
                ui.draw_rect(x, y, HOTBAR_SLOT_SIZE, HOTBAR_SLOT_SIZE,
                             HOTBAR_SELECTED_COLOR)

            # Border (top, bottom, left, right edges)
            ui.draw_rect(x, y, HOTBAR_SLOT_SIZE, 2, HOTBAR_BORDER_COLOR)
            ui.draw_rect(x, y + HOTBAR_SLOT_SIZE - 2, HOTBAR_SLOT_SIZE, 2,
                         HOTBAR_BORDER_COLOR)
            ui.draw_rect(x, y, 2, HOTBAR_SLOT_SIZE, HOTBAR_BORDER_COLOR)
            ui.draw_rect(x + HOTBAR_SLOT_SIZE - 2, y, 2, HOTBAR_SLOT_SIZE,
                         HOTBAR_BORDER_COLOR)

            # Block name/letter (simplified - no 3D icons yet)
            if i < len(self._block_ids):
                block_id = self._block_ids[i]
                block_name = Registry.get_block_name(block_id) if Registry.is_initialized() else None
                if block_name:
                    # Show first letter of block name
                    letter = block_name[0].upper()
                    ui.draw_text(letter,
                                 x + HOTBAR_SLOT_SIZE // 2 - 8,
                                 y + HOTBAR_SLOT_SIZE // 2 - 8,
                                 (255, 255, 255, 255))
                else:
                    # Show block ID if registry not initialized
                    ui.draw_text(str(block_id),
                                 x + HOTBAR_SLOT_SIZE // 2 - 8,
                                 y + HOTBAR_SLOT_SIZE // 2 - 8,
                                 (200, 200, 200, 255))

            # Slot number (small, bottom right)
            slot_num = str(i + 1) if i < 9 else "0"
            ui.draw_text(slot_num,
                         x + HOTBAR_SLOT_SIZE - 14,
                         y + HOTBAR_SLOT_SIZE - 16,
                         (180, 180, 180, 200),
                         scale=0.75)


class DebugOverlay:
    """Debug information overlay."""

    __slots__ = ('_visible', '_lines')

    def __init__(self):
        """Create debug overlay."""
        self._visible = False
        self._lines: List[str] = []

    @property
    def visible(self) -> bool:
        """Check if debug overlay is visible."""
        return self._visible

    @visible.setter
    def visible(self, value: bool) -> None:
        """Set debug overlay visibility."""
        self._visible = value

    def toggle(self) -> None:
        """Toggle debug overlay visibility."""
        self._visible = not self._visible

    def update(self, state: GameState, fps: float,
               draw_calls: int = 0, chunk_count: int = 0,
               extra_info: Optional[Dict[str, str]] = None) -> None:
        """
        Update debug information.

        @param state: Current game state.
        @param fps: Current frames per second.
        @param draw_calls: Number of draw calls this frame.
        @param chunk_count: Number of loaded chunks.
        @param extra_info: Optional extra key-value pairs to display.
        """
        if not self._visible:
            return

        player = state.player
        pos = player.position

        self._lines = [
            f"FPS: {fps:.1f}",
            f"Pos: {pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}",
            f"Chunk: {int(pos[0]) // 16}, {int(pos[2]) // 16}",
            f"Yaw: {np.degrees(player.yaw):.1f} Pitch: {np.degrees(player.pitch):.1f}",
            f"Vel: {player.velocity[0]:.2f}, {player.velocity[1]:.2f}, {player.velocity[2]:.2f}",
            f"Ground: {player.on_ground} Flying: {player.is_flying}",
            f"Draw calls: {draw_calls}",
            f"Chunks: {chunk_count}",
            f"Tick: {state.tick_count}",
        ]

        if extra_info:
            for key, value in extra_info.items():
                self._lines.append(f"{key}: {value}")

    def render(self, ui: UIRenderer) -> None:
        """
        Render debug overlay.

        @param ui: UI renderer.
        """
        if not self._visible or not self._lines:
            return

        # Calculate background size
        max_width = max(len(line) for line in self._lines) * 16 + DEBUG_PADDING * 2
        height = len(self._lines) * DEBUG_LINE_HEIGHT + DEBUG_PADDING * 2

        # Draw background
        ui.draw_rect(DEBUG_PADDING, DEBUG_PADDING, max_width, height, DEBUG_BG_COLOR)

        # Draw text
        y = DEBUG_PADDING * 2
        for line in self._lines:
            ui.draw_text(line, DEBUG_PADDING * 2, y, DEBUG_TEXT_COLOR)
            y += DEBUG_LINE_HEIGHT
