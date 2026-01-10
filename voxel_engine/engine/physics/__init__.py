"""
VoxEx physics engine.

Provides collision detection, movement calculations, and physics constants
for player and entity simulation.

Core components:
- constants: Physics values (gravity, speeds, player dimensions)
- aabb: Axis-aligned bounding box primitives
- collision: Voxel world collision detection
- movement: Movement calculations (direction, speed, gravity, friction)

Usage:
    from voxel_engine.engine.physics import (
        GRAVITY, WALK_SPEED, PLAYER_HEIGHT,
        make_aabb, aabb_intersects, player_aabb,
        move_and_collide, check_grounded,
        calculate_move_direction, get_movement_speed
    )
"""

# Constants
from .constants import (
    GRAVITY,
    TERMINAL_VELOCITY,
    WALK_SPEED,
    SPRINT_SPEED,
    CROUCH_SPEED,
    FLY_SPEED,
    FLY_SPRINT_SPEED,
    JUMP_VELOCITY,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    PLAYER_EYE_HEIGHT,
    CROUCH_HEIGHT,
    CROUCH_EYE_HEIGHT,
    GROUND_FRICTION,
    AIR_RESISTANCE,
    WATER_DRAG,
    WATER_GRAVITY_SCALE,
    STEP_HEIGHT,
    COLLISION_EPSILON,
    GROUND_ACCEL,
    AIR_ACCEL,
    FLY_LERP,
)

# AABB primitives
from .aabb import (
    make_aabb,
    aabb_from_center,
    aabb_intersects,
    aabb_contains_point,
    player_aabb,
    swept_aabb,
    aabb_get_center,
    aabb_get_size,
)

# Collision detection
from .collision import (
    get_block_aabb,
    get_potential_collisions,
    move_and_collide,
    check_grounded,
    check_in_fluid,
)

# Movement calculations
from .movement import (
    calculate_move_direction,
    get_movement_speed,
    apply_movement,
    apply_gravity,
    apply_friction,
    try_jump,
)

__all__ = [
    # Constants
    "GRAVITY",
    "TERMINAL_VELOCITY",
    "WALK_SPEED",
    "SPRINT_SPEED",
    "CROUCH_SPEED",
    "FLY_SPEED",
    "FLY_SPRINT_SPEED",
    "JUMP_VELOCITY",
    "PLAYER_WIDTH",
    "PLAYER_HEIGHT",
    "PLAYER_EYE_HEIGHT",
    "CROUCH_HEIGHT",
    "CROUCH_EYE_HEIGHT",
    "GROUND_FRICTION",
    "AIR_RESISTANCE",
    "WATER_DRAG",
    "WATER_GRAVITY_SCALE",
    "STEP_HEIGHT",
    "COLLISION_EPSILON",
    "GROUND_ACCEL",
    "AIR_ACCEL",
    "FLY_LERP",
    # AABB
    "make_aabb",
    "aabb_from_center",
    "aabb_intersects",
    "aabb_contains_point",
    "player_aabb",
    "swept_aabb",
    "aabb_get_center",
    "aabb_get_size",
    # Collision
    "get_block_aabb",
    "get_potential_collisions",
    "move_and_collide",
    "check_grounded",
    "check_in_fluid",
    # Movement
    "calculate_move_direction",
    "get_movement_speed",
    "apply_movement",
    "apply_gravity",
    "apply_friction",
    "try_jump",
]
