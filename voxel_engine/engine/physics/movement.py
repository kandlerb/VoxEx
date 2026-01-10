"""
Player movement calculations.

Handles directional movement, speed calculations, gravity, friction,
and jumping. Works with PlayerState movement flags.

Usage:
    from voxel_engine.engine.physics.movement import (
        calculate_move_direction, get_movement_speed, apply_gravity
    )

    direction = calculate_move_direction(player)
    speed = get_movement_speed(player)
"""

import numpy as np
from numpy.typing import NDArray

from voxel_engine.engine.physics.constants import (
    WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED,
    FLY_SPEED, FLY_SPRINT_SPEED,
    GRAVITY, TERMINAL_VELOCITY, JUMP_VELOCITY,
    GROUND_FRICTION, AIR_RESISTANCE, WATER_DRAG, WATER_GRAVITY_SCALE,
    GROUND_ACCEL, AIR_ACCEL, FLY_LERP
)
from voxel_engine.engine.state import PlayerState


def calculate_move_direction(player: PlayerState) -> NDArray[np.float64]:
    """
    Calculate normalized movement direction from input and look direction.

    Uses yaw rotation to determine forward/right vectors.
    Pitch is ignored for horizontal movement.

    Args:
        player: Player state with movement flags and yaw.

    Returns:
        (3,) normalized direction vector, or zero vector if no input.
    """
    # Get forward/right vectors from yaw (ignore pitch for movement)
    forward = np.array([
        -np.sin(player.yaw),
        0.0,
        -np.cos(player.yaw)
    ], dtype=np.float64)

    right = np.array([
        np.cos(player.yaw),
        0.0,
        -np.sin(player.yaw)
    ], dtype=np.float64)

    # Build direction from input flags
    direction = np.zeros(3, dtype=np.float64)

    if player.move_forward:
        direction += forward
    if player.move_backward:
        direction -= forward
    if player.move_right:
        direction += right
    if player.move_left:
        direction -= right

    # Normalize if moving
    length = np.linalg.norm(direction)
    if length > 0.001:
        direction /= length

    return direction


def get_movement_speed(player: PlayerState) -> float:
    """
    Get current movement speed based on player state.

    Speed varies based on:
    - Flying vs grounded
    - Sprinting vs walking
    - Crouching

    Args:
        player: Player state with movement mode flags.

    Returns:
        Movement speed in units/second.
    """
    if player.is_flying:
        return FLY_SPRINT_SPEED if player.sprint_pressed else FLY_SPEED
    elif player.crouch_pressed:
        return CROUCH_SPEED
    elif player.sprint_pressed:
        return SPRINT_SPEED
    else:
        return WALK_SPEED


def apply_movement(
    player: PlayerState,
    direction: NDArray[np.float64],
    speed: float,
    dt: float,
    on_ground: bool
) -> None:
    """
    Apply horizontal movement to player velocity.

    Uses acceleration-based movement for smooth starts/stops.
    Flight mode uses velocity interpolation for more direct control.

    Args:
        player: Player state (velocity will be modified).
        direction: (3,) normalized movement direction.
        speed: Target movement speed.
        dt: Time delta in seconds.
        on_ground: Whether player is on ground (affects acceleration).
    """
    if player.is_flying:
        # Direct velocity control in flight
        target_vel = direction * speed

        # Add vertical from jump/crouch
        if player.jump_pressed:
            target_vel[1] = speed
        elif player.crouch_pressed:
            target_vel[1] = -speed

        # Smooth interpolation towards target
        player.velocity[0] += (target_vel[0] - player.velocity[0]) * FLY_LERP
        player.velocity[1] += (target_vel[1] - player.velocity[1]) * FLY_LERP
        player.velocity[2] += (target_vel[2] - player.velocity[2]) * FLY_LERP
    else:
        # Ground/air movement with acceleration
        accel = GROUND_ACCEL if on_ground else AIR_ACCEL
        target_vel = direction * speed

        player.velocity[0] += (target_vel[0] - player.velocity[0]) * accel * dt
        player.velocity[2] += (target_vel[2] - player.velocity[2]) * accel * dt


def apply_gravity(
    player: PlayerState,
    dt: float,
    in_water: bool = False
) -> None:
    """
    Apply gravity to vertical velocity.

    Flying players are unaffected by gravity.
    Water reduces gravity effect.
    Terminal velocity prevents infinite acceleration.

    Args:
        player: Player state (velocity will be modified).
        dt: Time delta in seconds.
        in_water: Whether player is in water.
    """
    if player.is_flying:
        return

    gravity = GRAVITY * (WATER_GRAVITY_SCALE if in_water else 1.0)
    player.velocity[1] += gravity * dt

    # Clamp to terminal velocity
    if player.velocity[1] < TERMINAL_VELOCITY:
        player.velocity[1] = TERMINAL_VELOCITY


def apply_friction(
    player: PlayerState,
    on_ground: bool,
    in_water: bool = False
) -> None:
    """
    Apply friction/drag to horizontal velocity.

    Flying players are unaffected by friction.
    Different friction values for ground, air, and water.

    Args:
        player: Player state (velocity will be modified).
        on_ground: Whether player is on ground.
        in_water: Whether player is in water.
    """
    if player.is_flying:
        return

    if in_water:
        friction = WATER_DRAG
    elif on_ground:
        friction = GROUND_FRICTION
    else:
        friction = AIR_RESISTANCE

    player.velocity[0] *= friction
    player.velocity[2] *= friction


def try_jump(
    player: PlayerState,
    on_ground: bool,
    in_water: bool = False
) -> None:
    """
    Attempt to jump if conditions are met.

    Jump only works when:
    - Not flying (flight uses direct vertical control)
    - On ground, or in water (swimming)

    Args:
        player: Player state (velocity will be modified).
        on_ground: Whether player is on ground.
        in_water: Whether player is in water.
    """
    if player.is_flying:
        return

    if not player.jump_pressed:
        return

    if on_ground:
        player.velocity[1] = JUMP_VELOCITY
    elif in_water:
        # Swim upward (reduced jump power)
        player.velocity[1] = JUMP_VELOCITY * 0.4
