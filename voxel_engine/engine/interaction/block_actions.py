"""
Block mining and placement actions.

Provides functions to break and place blocks with validation
for game rules like unbreakable blocks and player collision.

Usage:
    from voxel_engine.engine.interaction.block_actions import break_block, place_block

    if break_block(world, hit, on_chunk_dirty):
        print("Block broken!")
"""

import numpy as np
from typing import Optional, Callable

from .raycast import RaycastHit
from .constants import UNBREAKABLE_BLOCKS
from ..state import WorldState, PlayerState
from ..registry import Registry
from ..physics.constants import PLAYER_WIDTH, PLAYER_HEIGHT
from ..physics.aabb import player_aabb, aabb_intersects, make_aabb


def can_break_block(block_id: int) -> bool:
    """
    Check if a block can be broken.

    Args:
        block_id: ID of the block to check.

    Returns:
        True if the block can be broken, False otherwise.
    """
    if block_id in UNBREAKABLE_BLOCKS:
        return False
    if block_id == 0:  # Air
        return False
    return True


def break_block(
    world: WorldState,
    hit: RaycastHit,
    on_chunk_dirty: Optional[Callable[[int, int], None]] = None
) -> bool:
    """
    Break (remove) a block at the hit position.

    Sets the block to air and marks affected chunks as dirty
    for re-meshing.

    Args:
        world: World state to modify.
        hit: Raycast hit result identifying the block.
        on_chunk_dirty: Callback when a chunk needs re-meshing.
            Called with (cx, cz) chunk coordinates.

    Returns:
        True if the block was broken, False if it couldn't be broken.
    """
    if not can_break_block(hit.block_id):
        return False

    bx, by, bz = hit.block_pos

    # Set to air
    world.set_block(bx, by, bz, 0)

    # Mark chunk dirty
    if on_chunk_dirty:
        cx = bx // 16
        cz = bz // 16
        on_chunk_dirty(cx, cz)

        # Also mark adjacent chunks if block is on boundary
        # This ensures correct face culling at chunk borders
        lx = bx % 16
        lz = bz % 16
        if lx < 0:
            lx += 16
        if lz < 0:
            lz += 16

        if lx == 0:
            on_chunk_dirty(cx - 1, cz)
        elif lx == 15:
            on_chunk_dirty(cx + 1, cz)
        if lz == 0:
            on_chunk_dirty(cx, cz - 1)
        elif lz == 15:
            on_chunk_dirty(cx, cz + 1)

    return True


def can_place_block(
    world: WorldState,
    x: int,
    y: int,
    z: int,
    player: PlayerState
) -> bool:
    """
    Check if a block can be placed at position.

    Validates:
    - Position is in world bounds
    - Position is air (replaceable)
    - New block doesn't intersect with player

    Args:
        world: World state to query.
        x: Global X coordinate.
        y: Global Y coordinate.
        z: Global Z coordinate.
        player: Player state for collision check.

    Returns:
        True if placement is valid, False otherwise.
    """
    # Bounds check
    if y < 0 or y >= 320:
        return False

    # Check current block is air (replaceable)
    current = world.get_block(x, y, z)
    if current is None:
        return False  # Chunk not loaded
    if current != 0:  # Not air
        return False

    # Check player collision
    # Create AABB for the new block
    block_min = np.array([float(x), float(y), float(z)], dtype=np.float64)
    block_max = np.array([float(x + 1), float(y + 1), float(z + 1)], dtype=np.float64)
    block_aabb = make_aabb(block_min, block_max)

    # Get player AABB
    p_aabb = player_aabb(player.position, PLAYER_WIDTH, PLAYER_HEIGHT)

    # Don't allow placement if it would intersect player
    if aabb_intersects(block_aabb, p_aabb):
        return False

    return True


def place_block(
    world: WorldState,
    hit: RaycastHit,
    block_id: int,
    player: PlayerState,
    on_chunk_dirty: Optional[Callable[[int, int], None]] = None
) -> bool:
    """
    Place a block adjacent to the hit face.

    The block is placed at the position adjacent to the hit block,
    determined by the hit face normal.

    Args:
        world: World state to modify.
        hit: Raycast hit result identifying placement position.
        block_id: Block type to place.
        player: Player state for collision check.
        on_chunk_dirty: Callback when a chunk needs re-meshing.
            Called with (cx, cz) chunk coordinates.

    Returns:
        True if the block was placed, False if placement was invalid.
    """
    # Get placement position (adjacent to hit face)
    px, py, pz = hit.adjacent_pos

    # Validate placement
    if not can_place_block(world, px, py, pz, player):
        return False

    # Place block
    world.set_block(px, py, pz, block_id)

    # Mark chunk dirty
    if on_chunk_dirty:
        cx = px // 16
        cz = pz // 16
        on_chunk_dirty(cx, cz)

        # Also mark adjacent chunks if block is on boundary
        lx = px % 16
        lz = pz % 16
        if lx < 0:
            lx += 16
        if lz < 0:
            lz += 16

        if lx == 0:
            on_chunk_dirty(cx - 1, cz)
        elif lx == 15:
            on_chunk_dirty(cx + 1, cz)
        if lz == 0:
            on_chunk_dirty(cx, cz - 1)
        elif lz == 15:
            on_chunk_dirty(cx, cz + 1)

    return True
