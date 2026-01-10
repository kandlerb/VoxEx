"""
Block interaction TickSystem.

Handles block selection, mining (breaking), and placement each tick.
Runs after physics system to use updated player position.

Usage:
    from voxel_engine.engine.systems import InteractionSystem
    from voxel_engine.engine.interaction import BlockSelector

    selector = BlockSelector(state.world)
    interaction_sys = InteractionSystem(selector)
    loop.add_tick_system(interaction_sys)
"""

import time
from typing import Optional, Callable, List

from .base import TickSystem
from ..state import GameState
from ..interaction.block_selector import BlockSelector
from ..interaction.block_actions import break_block, place_block
from ..interaction.constants import MINE_COOLDOWN, PLACE_COOLDOWN


class InteractionSystem(TickSystem):
    """
    Handles block selection, mining, and placement each tick.

    Priority: 20 (runs after InputSystem at 0 and PhysicsSystem at 10)

    Each tick:
    1. Update block selector (raycast to find targeted block)
    2. Handle mining if primary action pressed (left click)
    3. Handle placement if secondary action pressed (right click)
    """

    __slots__ = (
        '_selector',
        '_last_mine_time', '_last_place_time',
        '_on_chunk_dirty', '_hotbar_blocks'
    )

    def __init__(self, selector: BlockSelector):
        """
        Initialize interaction system.

        Args:
            selector: BlockSelector for targeting blocks.
        """
        super().__init__(priority=20)
        self._selector = selector
        self._last_mine_time: float = 0.0
        self._last_place_time: float = 0.0
        self._on_chunk_dirty: Optional[Callable[[int, int], None]] = None

        # Default hotbar block IDs (matches voxEx.html)
        # Grass, Dirt, Stone, Wood, Log, Leaves, Sand, Water, Torch
        self._hotbar_blocks: List[int] = [1, 2, 3, 4, 5, 6, 8, 9, 10]

    def set_chunk_dirty_callback(
        self,
        callback: Callable[[int, int], None]
    ) -> None:
        """
        Set callback for when chunks need re-meshing.

        Args:
            callback: Function called with (cx, cz) chunk coordinates.
        """
        self._on_chunk_dirty = callback

    def set_hotbar_blocks(self, block_ids: List[int]) -> None:
        """
        Set the block IDs available in the hotbar.

        Args:
            block_ids: List of up to 9 block IDs.
        """
        self._hotbar_blocks = block_ids[:9]

    def tick(self, state: GameState, dt: float) -> None:
        """
        Process block interactions.

        Args:
            state: Game state containing player and world.
            dt: Fixed tick delta time.
        """
        player = state.player
        world = state.world

        # Update block selection based on player look direction
        self._selector.update(player, state.tick_count)

        current_time = time.perf_counter()

        # Handle mining (primary action / left click)
        if player.input_primary_action:
            if current_time - self._last_mine_time >= MINE_COOLDOWN:
                hit = self._selector.current_hit
                if hit is not None:
                    if break_block(world, hit, self._on_chunk_dirty):
                        self._last_mine_time = current_time

        # Handle placement (secondary action / right click)
        if player.input_secondary_action:
            if current_time - self._last_place_time >= PLACE_COOLDOWN:
                hit = self._selector.current_hit
                if hit is not None:
                    # Get block from hotbar
                    block_id = self._get_selected_block(player)
                    if block_id > 0:
                        if place_block(
                            world, hit, block_id, player,
                            self._on_chunk_dirty
                        ):
                            self._last_place_time = current_time

    def _get_selected_block(self, player) -> int:
        """
        Get block ID for current hotbar selection.

        Args:
            player: PlayerState with selected_slot.

        Returns:
            Block ID to place, or 0 if invalid.
        """
        slot = player.selected_slot
        if 0 <= slot < len(self._hotbar_blocks):
            return self._hotbar_blocks[slot]
        return 1  # Default to grass if slot invalid

    @property
    def selector(self) -> BlockSelector:
        """Get the block selector."""
        return self._selector

    @property
    def has_target(self) -> bool:
        """Check if a block is currently targeted."""
        return self._selector.has_target

    def get_target_block_pos(self):
        """Get position of targeted block."""
        return self._selector.get_target_block_pos()

    def get_placement_pos(self):
        """Get position where a block would be placed."""
        return self._selector.get_placement_pos()
