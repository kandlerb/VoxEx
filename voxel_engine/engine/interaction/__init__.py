"""
VoxEx block interaction module.

Provides block targeting, mining, and placement functionality:
- RaycastHit: Dataclass containing raycast result information
- raycast_voxels: DDA algorithm for voxel grid raycasting
- BlockSelector: Manages currently targeted block state
- break_block / place_block: Block modification functions

Usage:
    from voxel_engine.engine.interaction import (
        BlockSelector, raycast_voxels, RaycastHit,
        break_block, place_block
    )

    selector = BlockSelector(world)
    selector.update(player, tick=0)
    if selector.has_target:
        if break_block(world, selector.current_hit, on_chunk_dirty):
            print("Block broken!")
"""

from .constants import (
    DEFAULT_REACH,
    MAX_REACH,
    MIN_REACH,
    MINE_COOLDOWN,
    PLACE_COOLDOWN,
    UNBREAKABLE_BLOCKS,
    REPLACEABLE_BLOCKS,
    MAX_RAY_STEPS
)
from .raycast import (
    RaycastHit,
    raycast_voxels,
    get_look_direction
)
from .block_actions import (
    can_break_block,
    break_block,
    can_place_block,
    place_block
)
from .block_selector import BlockSelector

__all__ = [
    # Constants
    'DEFAULT_REACH',
    'MAX_REACH',
    'MIN_REACH',
    'MINE_COOLDOWN',
    'PLACE_COOLDOWN',
    'UNBREAKABLE_BLOCKS',
    'REPLACEABLE_BLOCKS',
    'MAX_RAY_STEPS',
    # Raycast
    'RaycastHit',
    'raycast_voxels',
    'get_look_direction',
    # Block actions
    'can_break_block',
    'break_block',
    'can_place_block',
    'place_block',
    # Block selector
    'BlockSelector',
]
