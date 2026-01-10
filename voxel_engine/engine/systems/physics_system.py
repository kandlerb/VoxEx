"""
Physics system - processes movement and collision each tick.

Runs at 20 TPS after InputSystem to process player movement.
Reads input flags from PlayerState and updates position/velocity
through movement calculations and voxel collision detection.

Usage:
    from voxel_engine.engine.systems import PhysicsSystem

    loop.add_tick_system(PhysicsSystem())
"""

import numpy as np

from voxel_engine.engine.systems.base import TickSystem
from voxel_engine.engine.state import GameState
from voxel_engine.engine.physics.constants import (
    PLAYER_WIDTH, PLAYER_HEIGHT, CROUCH_HEIGHT
)
from voxel_engine.engine.physics.movement import (
    calculate_move_direction, get_movement_speed,
    apply_movement, apply_gravity, apply_friction, try_jump
)
from voxel_engine.engine.physics.collision import (
    move_and_collide, check_grounded, check_in_fluid
)


class PhysicsSystem(TickSystem):
    """
    Processes player physics each tick.

    Priority: 10 (runs after InputSystem at 0)

    Each tick:
    1. Store previous position for render interpolation
    2. Check grounded and fluid state
    3. Calculate movement direction from input
    4. Apply gravity (if not flying)
    5. Apply movement acceleration
    6. Attempt jump (if conditions met)
    7. Apply friction/drag
    8. Move with collision response
    9. Update grounded state
    """

    __slots__ = ()

    def __init__(self):
        """Initialize physics system with priority 10."""
        super().__init__(priority=10)

    def tick(self, state: GameState, dt: float) -> None:
        """
        Process physics for player.

        Args:
            state: Game state containing player and world.
            dt: Fixed tick delta (typically 0.05s at 20 TPS).
        """
        player = state.player
        world = state.world

        # Store previous position for render interpolation
        player.store_previous_position()

        # Check current state
        on_ground = check_grounded(world, player.position, PLAYER_WIDTH)
        in_water = check_in_fluid(world, player.position, PLAYER_HEIGHT)

        # Update player state flags
        player.in_water = in_water
        player.is_sprinting = player.sprint_pressed and not player.crouch_pressed
        player.is_crouching = player.crouch_pressed and not player.is_flying

        # Get player height based on crouch state
        height = CROUCH_HEIGHT if player.is_crouching else PLAYER_HEIGHT

        # Calculate movement
        direction = calculate_move_direction(player)
        speed = get_movement_speed(player)

        # Apply physics in order
        apply_gravity(player, dt, in_water)
        apply_movement(player, direction, speed, dt, on_ground)
        try_jump(player, on_ground, in_water)
        apply_friction(player, on_ground, in_water)

        # Move with collision
        # Scale velocity by dt to get displacement for this tick
        displacement = player.velocity * dt

        new_pos, new_vel, now_grounded = move_and_collide(
            world,
            player.position,
            displacement,
            PLAYER_WIDTH,
            height
        )

        # Update position
        player.position[:] = new_pos

        # Convert displacement-based velocity back to velocity units
        # Only update if collision occurred (velocity was zeroed)
        if new_vel[0] == 0.0 and displacement[0] != 0.0:
            player.velocity[0] = 0.0
        if new_vel[1] == 0.0 and displacement[1] != 0.0:
            player.velocity[1] = 0.0
        if new_vel[2] == 0.0 and displacement[2] != 0.0:
            player.velocity[2] = 0.0

        # Update grounded state
        player.on_ground = now_grounded or check_grounded(
            world, player.position, PLAYER_WIDTH
        )
