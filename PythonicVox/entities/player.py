"""
Player entity class for PythonicVox.

This module contains the Player class which represents the player character
in the voxel world. It handles player state, movement, inventory, and
interaction with the world.

Classes:
    Player: Main player entity with position, rotation, inventory, and stats.

Usage:
    from entities.player import Player

    player = Player(position=(0, 64, 0))
    player.update(delta_time)
"""

from settings import PLAYER_SPEED, SPRINT_MULTIPLIER, JUMP_FORCE


class Player:
    """
    Represents the player entity in the voxel world.

    Attributes:
        position (list): Current [x, y, z] position in world coordinates.
        velocity (list): Current [vx, vy, vz] velocity vector.
        health (int): Current health points.
        inventory (list): List of inventory slot contents.
        selected_slot (int): Currently selected hotbar slot (0-8).
        is_flying (bool): Whether the player is in flight mode.
        is_sprinting (bool): Whether the player is sprinting.
        is_grounded (bool): Whether the player is on the ground.
        speed (float): Base movement speed.
    """

    def __init__(self, position=(0, 64, 0)):
        """
        Initialize a new Player instance.

        Args:
            position (tuple): Initial spawn position (x, y, z).
        """
        # Use list for mutable position
        self.position = list(position)
        self.velocity = [0.0, 0.0, 0.0]
        self.health = 20
        self.inventory = [None] * 36
        self.selected_slot = 0
        self.is_flying = True  # Start in flight mode for easy navigation
        self.is_sprinting = False
        self.is_grounded = False
        self.speed = PLAYER_SPEED
        self.sprint_multiplier = SPRINT_MULTIPLIER
        self.jump_force = JUMP_FORCE

        # Double-tap detection for flight toggle
        self._last_jump_time = 0.0
        self._jump_tap_window = 0.3  # seconds

    def update(self, delta_time, move_dir, vertical_input):
        """
        Update player state for the current frame.

        Args:
            delta_time (float): Time elapsed since last frame in seconds.
            move_dir (tuple): Horizontal movement direction (dx, dz).
            vertical_input (float): Vertical input (-1 to 1 for flying).
        """
        # Calculate speed with sprint modifier
        current_speed = self.speed
        if self.is_sprinting:
            current_speed *= self.sprint_multiplier

        # Apply horizontal movement
        dx, dz = move_dir
        self.position[0] += dx * current_speed * delta_time
        self.position[2] += dz * current_speed * delta_time

        if self.is_flying:
            # Flying mode - direct vertical control
            fly_speed = current_speed
            self.position[1] += vertical_input * fly_speed * delta_time
            self.velocity[1] = 0.0
        else:
            # Apply gravity when not flying
            gravity = 32.0
            self.velocity[1] -= gravity * delta_time

            # Apply vertical velocity
            self.position[1] += self.velocity[1] * delta_time

            # Simple ground check (flat terrain at y=64)
            ground_level = 64.0
            if self.position[1] < ground_level:
                self.position[1] = ground_level
                self.velocity[1] = 0.0
                self.is_grounded = True
            else:
                self.is_grounded = False

    def move(self, direction, delta_time):
        """
        Move the player in the specified direction.

        Args:
            direction (tuple): Movement direction vector (x, y, z).
            delta_time (float): Time elapsed since last frame.
        """
        speed = self.speed
        if self.is_sprinting:
            speed *= self.sprint_multiplier

        self.position[0] += direction[0] * speed * delta_time
        self.position[1] += direction[1] * speed * delta_time
        self.position[2] += direction[2] * speed * delta_time

    def jump(self, current_time):
        """
        Initiate a jump if the player is grounded.

        Also handles double-tap to toggle flight.

        Args:
            current_time (float): Current game time in seconds.
        """
        # Check for double-tap flight toggle
        if current_time - self._last_jump_time < self._jump_tap_window:
            self.toggle_flight()
        else:
            if self.is_grounded and not self.is_flying:
                self.velocity[1] = self.jump_force
                self.is_grounded = False

        self._last_jump_time = current_time

    def toggle_flight(self):
        """Toggle flight mode on or off."""
        self.is_flying = not self.is_flying
        if self.is_flying:
            self.velocity[1] = 0.0

    def set_sprinting(self, sprinting):
        """
        Set whether the player is sprinting.

        Args:
            sprinting (bool): True to enable sprinting.
        """
        self.is_sprinting = sprinting

    def get_position(self):
        """
        Get player position as a tuple.

        Returns:
            tuple: (x, y, z) position.
        """
        return tuple(self.position)
