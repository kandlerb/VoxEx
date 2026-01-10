"""
Collision detection against voxel world.

Provides functions for detecting and resolving collisions between
entities (players, mobs) and the block-based terrain.

Uses axis-by-axis resolution (Y first for ground detection).

Usage:
    from voxel_engine.engine.physics.collision import move_and_collide

    new_pos, new_vel, on_ground = move_and_collide(
        world, position, velocity, width, height
    )
"""

import numpy as np
from numpy.typing import NDArray
from typing import Tuple, List

from voxel_engine.engine.physics.aabb import player_aabb, aabb_intersects, make_aabb
from voxel_engine.engine.physics.constants import COLLISION_EPSILON
from voxel_engine.engine.state import WorldState
from voxel_engine.engine.registry import Registry


def get_block_aabb(bx: int, by: int, bz: int) -> NDArray[np.float64]:
    """
    Get AABB for a block at integer coordinates.

    Blocks occupy the full unit cube from (bx, by, bz) to (bx+1, by+1, bz+1).

    Args:
        bx: Block X coordinate.
        by: Block Y coordinate.
        bz: Block Z coordinate.

    Returns:
        (6,) AABB array for the block.
    """
    return make_aabb(
        np.array([bx, by, bz], dtype=np.float64),
        np.array([bx + 1, by + 1, bz + 1], dtype=np.float64)
    )


def get_potential_collisions(
    world: WorldState,
    aabb: NDArray[np.float64]
) -> List[NDArray[np.float64]]:
    """
    Get list of solid block AABBs that could collide with given AABB.

    Scans the region of the world overlapping the AABB and returns
    AABBs for all solid blocks found.

    Args:
        world: World state containing chunk data.
        aabb: AABB to check collisions against.

    Returns:
        List of (6,) AABB arrays for solid blocks.
    """
    # Expand search area slightly to catch edge cases
    min_x = int(np.floor(aabb[0])) - 1
    min_y = int(np.floor(aabb[1])) - 1
    min_z = int(np.floor(aabb[2])) - 1
    max_x = int(np.ceil(aabb[3])) + 1
    max_y = int(np.ceil(aabb[4])) + 1
    max_z = int(np.ceil(aabb[5])) + 1

    # Clamp Y to valid world bounds
    min_y = max(0, min_y)
    max_y = min(world.chunk_height, max_y)

    colliders: List[NDArray[np.float64]] = []

    for by in range(min_y, max_y):
        for bz in range(min_z, max_z):
            for bx in range(min_x, max_x):
                block_id = world.get_block(bx, by, bz)
                if block_id != 0 and Registry.is_solid(block_id):
                    colliders.append(get_block_aabb(bx, by, bz))

    return colliders


def move_and_collide(
    world: WorldState,
    position: NDArray[np.float64],
    velocity: NDArray[np.float64],
    width: float,
    height: float
) -> Tuple[NDArray[np.float64], NDArray[np.float64], bool]:
    """
    Move entity with collision response.

    Uses axis-by-axis resolution:
    1. Y axis first (for ground detection)
    2. X axis
    3. Z axis

    Args:
        world: World state containing chunk data.
        position: Current (3,) position at feet.
        velocity: (3,) velocity to apply this tick.
        width: Entity width (X and Z).
        height: Entity height (Y).

    Returns:
        Tuple of:
        - new_position: (3,) array after movement and collision.
        - new_velocity: (3,) array with velocity zeroed on collision axes.
        - on_ground: True if entity landed on a surface this tick.
    """
    new_pos = position.copy()
    new_vel = velocity.copy()
    on_ground = False
    half_w = width / 2.0

    # =========================================================================
    # Y AXIS (Vertical - resolve first for ground detection)
    # =========================================================================
    new_pos[1] += new_vel[1]
    current_aabb = player_aabb(new_pos, width, height)
    colliders = get_potential_collisions(world, current_aabb)

    for block_aabb in colliders:
        if aabb_intersects(current_aabb, block_aabb):
            if new_vel[1] < 0:
                # Falling - land on top of block
                new_pos[1] = block_aabb[4] + COLLISION_EPSILON
                on_ground = True
            else:
                # Rising - hit ceiling
                new_pos[1] = block_aabb[1] - height - COLLISION_EPSILON
            new_vel[1] = 0.0
            current_aabb = player_aabb(new_pos, width, height)

    # =========================================================================
    # X AXIS (Horizontal)
    # =========================================================================
    new_pos[0] += new_vel[0]
    current_aabb = player_aabb(new_pos, width, height)
    colliders = get_potential_collisions(world, current_aabb)

    for block_aabb in colliders:
        if aabb_intersects(current_aabb, block_aabb):
            if new_vel[0] > 0:
                # Moving +X, hit block's -X face
                new_pos[0] = block_aabb[0] - half_w - COLLISION_EPSILON
            else:
                # Moving -X, hit block's +X face
                new_pos[0] = block_aabb[3] + half_w + COLLISION_EPSILON
            new_vel[0] = 0.0
            current_aabb = player_aabb(new_pos, width, height)

    # =========================================================================
    # Z AXIS (Horizontal)
    # =========================================================================
    new_pos[2] += new_vel[2]
    current_aabb = player_aabb(new_pos, width, height)
    colliders = get_potential_collisions(world, current_aabb)

    for block_aabb in colliders:
        if aabb_intersects(current_aabb, block_aabb):
            if new_vel[2] > 0:
                # Moving +Z, hit block's -Z face
                new_pos[2] = block_aabb[2] - half_w - COLLISION_EPSILON
            else:
                # Moving -Z, hit block's +Z face
                new_pos[2] = block_aabb[5] + half_w + COLLISION_EPSILON
            new_vel[2] = 0.0

    return new_pos, new_vel, on_ground


def check_grounded(
    world: WorldState,
    position: NDArray[np.float64],
    width: float
) -> bool:
    """
    Check if entity is standing on solid ground.

    Checks multiple points slightly below the entity's feet
    to detect contact with solid blocks.

    Args:
        world: World state containing chunk data.
        position: (3,) position at feet.
        width: Entity width.

    Returns:
        True if standing on solid ground.
    """
    # Check slightly below feet
    check_y = position[1] - 0.1
    half_w = width / 2.0 - 0.01  # Slightly inward to avoid edge cases

    # Check corners and center
    check_points = [
        (position[0], check_y, position[2]),  # Center
        (position[0] - half_w, check_y, position[2] - half_w),  # -X, -Z
        (position[0] + half_w, check_y, position[2] - half_w),  # +X, -Z
        (position[0] - half_w, check_y, position[2] + half_w),  # -X, +Z
        (position[0] + half_w, check_y, position[2] + half_w),  # +X, +Z
    ]

    for px, py, pz in check_points:
        bx = int(np.floor(px))
        by = int(np.floor(py))
        bz = int(np.floor(pz))
        block_id = world.get_block(bx, by, bz)
        if block_id != 0 and Registry.is_solid(block_id):
            return True

    return False


def check_in_fluid(
    world: WorldState,
    position: NDArray[np.float64],
    height: float
) -> bool:
    """
    Check if entity is in a fluid (water, lava).

    Checks the block at the entity's feet and mid-body.

    Args:
        world: World state containing chunk data.
        position: (3,) position at feet.
        height: Entity height.

    Returns:
        True if any part of entity is in fluid.
    """
    # Check feet level
    feet_block = world.get_block(
        int(np.floor(position[0])),
        int(np.floor(position[1])),
        int(np.floor(position[2]))
    )
    if feet_block != 0 and Registry.is_fluid(feet_block):
        return True

    # Check mid-body level
    mid_y = position[1] + height / 2.0
    mid_block = world.get_block(
        int(np.floor(position[0])),
        int(np.floor(mid_y)),
        int(np.floor(position[2]))
    )
    if mid_block != 0 and Registry.is_fluid(mid_block):
        return True

    return False
