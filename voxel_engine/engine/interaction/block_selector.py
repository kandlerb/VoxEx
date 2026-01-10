"""
Block selection and targeting.

Manages the currently targeted block based on player position
and look direction, using raycasting.

Usage:
    from voxel_engine.engine.interaction.block_selector import BlockSelector

    selector = BlockSelector(world)
    selector.update(player, tick=0)
    if selector.has_target:
        print(f"Targeting block at {selector.get_target_block_pos()}")
"""

from typing import Optional, Tuple

from .raycast import RaycastHit, raycast_voxels
from .constants import DEFAULT_REACH, MIN_REACH, MAX_REACH
from ..state import WorldState, PlayerState


class BlockSelector:
    """
    Manages block selection state based on player look direction.

    Performs raycasting each tick to find the block the player is
    looking at, and stores the result for use by interaction systems.
    """

    __slots__ = ('_world', '_reach', '_current_hit', '_last_update_tick')

    def __init__(self, world: WorldState, reach: float = DEFAULT_REACH):
        """
        Initialize block selector.

        Args:
            world: World state to query blocks.
            reach: Maximum selection distance in blocks.
        """
        self._world = world
        self._reach = max(MIN_REACH, min(MAX_REACH, reach))
        self._current_hit: Optional[RaycastHit] = None
        self._last_update_tick: int = -1

    @property
    def reach(self) -> float:
        """Get current reach distance."""
        return self._reach

    @reach.setter
    def reach(self, value: float) -> None:
        """Set reach distance, clamped to valid range."""
        self._reach = max(MIN_REACH, min(MAX_REACH, value))

    @property
    def current_hit(self) -> Optional[RaycastHit]:
        """Currently targeted block hit info, or None if not targeting anything."""
        return self._current_hit

    @property
    def has_target(self) -> bool:
        """Whether a block is currently targeted."""
        return self._current_hit is not None

    def update(self, player: PlayerState, tick: int) -> None:
        """
        Update selection based on player position and look direction.

        Should be called each tick.

        Args:
            player: Player state with position and look direction.
            tick: Current tick count (for deduplication).
        """
        # Avoid redundant updates within same tick
        if tick == self._last_update_tick:
            return
        self._last_update_tick = tick

        # Get eye position and look direction from player
        eye_pos = player.get_eye_position()
        look_dir = player.get_look_vector()

        # Raycast to find targeted block
        self._current_hit = raycast_voxels(
            self._world,
            eye_pos,
            look_dir,
            self._reach,
            hit_liquids=False
        )

    def get_target_block_pos(self) -> Optional[Tuple[int, int, int]]:
        """
        Get position of targeted block.

        Returns:
            (x, y, z) tuple, or None if no target.
        """
        if self._current_hit:
            return self._current_hit.block_pos
        return None

    def get_placement_pos(self) -> Optional[Tuple[int, int, int]]:
        """
        Get position where a block would be placed.

        This is the position adjacent to the hit block face.

        Returns:
            (x, y, z) tuple, or None if no target.
        """
        if self._current_hit:
            return self._current_hit.adjacent_pos
        return None

    def get_target_block_id(self) -> Optional[int]:
        """
        Get block ID of targeted block.

        Returns:
            Block ID, or None if no target.
        """
        if self._current_hit:
            return self._current_hit.block_id
        return None

    def get_hit_normal(self) -> Optional[Tuple[int, int, int]]:
        """
        Get face normal of hit.

        Returns:
            (nx, ny, nz) tuple, or None if no target.
        """
        if self._current_hit:
            return self._current_hit.normal
        return None

    def clear(self) -> None:
        """Clear current target."""
        self._current_hit = None
