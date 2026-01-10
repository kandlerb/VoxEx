"""
Player state for VoxEx.

Holds player position, velocity, rotation, and movement flags.
All vectors are NumPy arrays. State is read/written by systems.

Usage:
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.position[:] = [0, 64, 0]
    player.velocity[1] -= gravity * dt
"""

from dataclasses import dataclass, field
import numpy as np


@dataclass
class PlayerState:
    """
    Mutable player state container.

    Position/velocity use NumPy arrays for Numba compatibility.
    Movement flags are simple booleans read by physics system.
    """

    # Position and physics (NumPy arrays, not tuples)
    position: np.ndarray = field(default_factory=lambda: np.array([0.0, 64.0, 0.0], dtype=np.float64))
    velocity: np.ndarray = field(default_factory=lambda: np.array([0.0, 0.0, 0.0], dtype=np.float64))

    # Previous position for render interpolation
    prev_position: np.ndarray = field(default_factory=lambda: np.array([0.0, 64.0, 0.0], dtype=np.float64))

    # Camera rotation (yaw/pitch in radians)
    yaw: float = 0.0
    pitch: float = 0.0

    # Movement intent flags (set by InputSystem, read by PhysicsSystem)
    move_forward: bool = False
    move_backward: bool = False
    move_left: bool = False
    move_right: bool = False
    jump_pressed: bool = False
    crouch_pressed: bool = False
    sprint_pressed: bool = False

    # Movement state (set by PhysicsSystem)
    on_ground: bool = False
    in_water: bool = False
    is_flying: bool = False
    is_sprinting: bool = False
    is_crouching: bool = False

    # Player dimensions (from physics.json)
    height: float = 1.8
    width: float = 0.8
    eye_height: float = 1.62
    crouch_eye_height: float = 1.4

    # Gameplay
    selected_slot: int = 0
    torch_active: bool = False

    def store_previous_position(self) -> None:
        """Copy current position to prev_position for interpolation."""
        np.copyto(self.prev_position, self.position)

    def get_eye_position(self) -> np.ndarray:
        """Get camera/eye position based on crouch state."""
        eye_y = self.crouch_eye_height if self.is_crouching else self.eye_height
        return self.position + np.array([0.0, eye_y, 0.0], dtype=np.float64)

    def get_forward_vector(self) -> np.ndarray:
        """Get unit vector in direction player is facing (XZ plane)."""
        return np.array([
            -np.sin(self.yaw),
            0.0,
            -np.cos(self.yaw)
        ], dtype=np.float64)

    def get_right_vector(self) -> np.ndarray:
        """Get unit vector to player's right (XZ plane)."""
        return np.array([
            np.cos(self.yaw),
            0.0,
            -np.sin(self.yaw)
        ], dtype=np.float64)

    def get_look_vector(self) -> np.ndarray:
        """Get unit vector in direction player is looking (3D)."""
        cos_pitch = np.cos(self.pitch)
        return np.array([
            -np.sin(self.yaw) * cos_pitch,
            -np.sin(self.pitch),
            -np.cos(self.yaw) * cos_pitch
        ], dtype=np.float64)

    def reset_movement_intent(self) -> None:
        """Clear all movement intent flags (called each tick before input)."""
        self.move_forward = False
        self.move_backward = False
        self.move_left = False
        self.move_right = False
        self.jump_pressed = False
        # Note: crouch and sprint are often held, handled differently

    def get_chunk_coords(self, chunk_size: int = 16) -> tuple:
        """
        Get the chunk coordinates the player is currently in.

        Args:
            chunk_size: Size of chunks in X/Z dimension.

        Returns:
            tuple: (cx, cz) chunk coordinates.
        """
        # Python's floor division handles negative coords correctly
        cx = int(self.position[0] // chunk_size)
        cz = int(self.position[2] // chunk_size)
        return (cx, cz)
