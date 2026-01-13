"""
Camera controller for PythonicVox.

This module contains the CameraController class which manages the first-person
camera, including mouse look, field of view adjustments, and camera positioning
relative to the player.

Classes:
    CameraController: Manages camera position, rotation, and rendering settings.

Usage:
    from systems.camera import CameraController

    camera = CameraController(player)
    camera.update(delta_time, mouse_delta)
"""

import math


class CameraController:
    """
    Controls the first-person camera in the voxel world.

    The camera follows the player and provides first-person perspective.
    Yaw (horizontal) and pitch (vertical) control where the camera looks.

    Coordinate system:
        - X: Right (+) / Left (-)
        - Y: Up (+) / Down (-)
        - Z: Forward (+) / Backward (-)

    Rotation:
        - Yaw: 0 = looking down +Z, 90 = looking down +X
        - Pitch: 0 = horizontal, 90 = looking up, -90 = looking down

    Attributes:
        player: Reference to the player entity.
        fov (float): Field of view in degrees.
        sensitivity (float): Mouse look sensitivity.
        pitch (float): Current vertical rotation in degrees (-89 to 89).
        yaw (float): Current horizontal rotation in degrees.
        bob_amount (float): Current view bob offset.
        bob_time (float): Accumulator for view bob animation.
        eye_height (float): Height of camera above player position.
        near_plane (float): Near clipping plane distance.
        far_plane (float): Far clipping plane distance.
    """

    def __init__(self, player, fov=75.0, sensitivity=0.15):
        """
        Initialize a new CameraController instance.

        Args:
            player: Player entity to follow.
            fov (float): Initial field of view in degrees.
            sensitivity (float): Mouse look sensitivity multiplier.
        """
        self.player = player
        self.fov = fov
        self.base_fov = fov
        self.sensitivity = sensitivity
        self.pitch = 0.0
        self.yaw = 0.0
        self.bob_amount = 0.0
        self.bob_time = 0.0
        self.eye_height = 1.6  # Player eye height
        self.near_plane = 0.1
        self.far_plane = 500.0

    def update(self, delta_time, mouse_delta):
        """
        Update camera position and rotation.

        Args:
            delta_time (float): Time elapsed since last frame in seconds.
            mouse_delta (tuple): Mouse movement (dx, dy) since last frame.
        """
        # Apply mouse look
        dx, dy = mouse_delta
        self.look(dx, dy)

    def look(self, dx, dy):
        """
        Apply mouse look rotation.

        Modifies yaw (horizontal) and pitch (vertical) based on mouse movement.
        Pitch is clamped to prevent looking straight up/down and flipping.

        Args:
            dx (float): Horizontal mouse movement (pixels).
            dy (float): Vertical mouse movement (pixels).
        """
        # Apply sensitivity
        self.yaw += dx * self.sensitivity
        self.pitch -= dy * self.sensitivity  # Invert Y for natural feel

        # Normalize yaw to 0-360
        self.yaw = self.yaw % 360.0

        # Clamp pitch to prevent gimbal lock
        self.pitch = max(-89.0, min(89.0, self.pitch))

    def set_fov(self, fov):
        """
        Set the camera field of view.

        Args:
            fov (float): New field of view in degrees (30-120).
        """
        self.fov = max(30.0, min(120.0, fov))

    def apply_sprint_fov(self, is_sprinting, delta_time):
        """
        Smoothly adjust FOV when sprinting.

        Args:
            is_sprinting (bool): Whether the player is sprinting.
            delta_time (float): Time elapsed since last frame.
        """
        target_fov = self.base_fov + 5.0 if is_sprinting else self.base_fov
        # Lerp toward target FOV
        lerp_speed = 8.0
        self.fov += (target_fov - self.fov) * min(1.0, lerp_speed * delta_time)

    def apply_view_bob(self, is_moving, is_sprinting, delta_time):
        """
        Apply view bobbing effect based on movement.

        Args:
            is_moving (bool): Whether the player is moving.
            is_sprinting (bool): Whether the player is sprinting.
            delta_time (float): Time elapsed since last frame.
        """
        if is_moving:
            # Bob faster when sprinting
            bob_speed = 14.0 if is_sprinting else 10.0
            bob_intensity = 0.04 if is_sprinting else 0.025

            self.bob_time += delta_time * bob_speed
            self.bob_amount = math.sin(self.bob_time) * bob_intensity
        else:
            # Smoothly return to center
            self.bob_time = 0.0
            self.bob_amount *= 0.8

    def get_position(self):
        """
        Get camera world position.

        Returns:
            tuple: (x, y, z) camera position.
        """
        px, py, pz = self.player.position
        return (px, py + self.eye_height + self.bob_amount, pz)

    def get_direction(self):
        """
        Get camera look direction as a unit vector.

        Returns:
            tuple: (dx, dy, dz) normalized direction vector.
        """
        # Convert pitch and yaw to direction vector
        pitch_rad = math.radians(self.pitch)
        yaw_rad = math.radians(self.yaw)

        # Calculate direction components
        dx = math.cos(pitch_rad) * math.sin(yaw_rad)
        dy = math.sin(pitch_rad)
        dz = math.cos(pitch_rad) * math.cos(yaw_rad)

        return (dx, dy, dz)

    def get_right_vector(self):
        """
        Get camera right direction as a unit vector.

        Returns:
            tuple: (rx, ry, rz) normalized right vector.
        """
        yaw_rad = math.radians(self.yaw)
        return (math.cos(yaw_rad), 0.0, -math.sin(yaw_rad))

    def get_up_vector(self):
        """
        Get camera up direction.

        For a first-person camera, this is typically world up.

        Returns:
            tuple: (ux, uy, uz) up vector.
        """
        return (0.0, 1.0, 0.0)

    def get_view_matrix(self):
        """
        Calculate the view matrix for rendering.

        Returns a 4x4 view matrix as a flat list (column-major order).

        Returns:
            list: 16-element list representing 4x4 view matrix.
        """
        pos = self.get_position()
        direction = self.get_direction()
        up = self.get_up_vector()

        # Look-at target
        target = (
            pos[0] + direction[0],
            pos[1] + direction[1],
            pos[2] + direction[2]
        )

        # Calculate view matrix using look-at
        return self._look_at(pos, target, up)

    def _look_at(self, eye, target, up):
        """
        Calculate a look-at view matrix.

        Args:
            eye (tuple): Camera position (x, y, z).
            target (tuple): Look target position (x, y, z).
            up (tuple): Up vector (x, y, z).

        Returns:
            list: 16-element list representing 4x4 view matrix (column-major).
        """
        # Forward vector (from target to eye)
        fx = eye[0] - target[0]
        fy = eye[1] - target[1]
        fz = eye[2] - target[2]
        f_len = math.sqrt(fx*fx + fy*fy + fz*fz)
        fx, fy, fz = fx/f_len, fy/f_len, fz/f_len

        # Right vector (up x forward)
        rx = up[1]*fz - up[2]*fy
        ry = up[2]*fx - up[0]*fz
        rz = up[0]*fy - up[1]*fx
        r_len = math.sqrt(rx*rx + ry*ry + rz*rz)
        rx, ry, rz = rx/r_len, ry/r_len, rz/r_len

        # True up vector (forward x right)
        ux = fy*rz - fz*ry
        uy = fz*rx - fx*rz
        uz = fx*ry - fy*rx

        # Translation
        tx = -(rx*eye[0] + ry*eye[1] + rz*eye[2])
        ty = -(ux*eye[0] + uy*eye[1] + uz*eye[2])
        tz = -(fx*eye[0] + fy*eye[1] + fz*eye[2])

        # Column-major 4x4 matrix
        return [
            rx, ux, fx, 0.0,
            ry, uy, fy, 0.0,
            rz, uz, fz, 0.0,
            tx, ty, tz, 1.0
        ]

    def get_projection_matrix(self, aspect_ratio):
        """
        Calculate the perspective projection matrix.

        Args:
            aspect_ratio (float): Screen width / height.

        Returns:
            list: 16-element list representing 4x4 projection matrix.
        """
        fov_rad = math.radians(self.fov)
        f = 1.0 / math.tan(fov_rad / 2.0)
        nf = 1.0 / (self.near_plane - self.far_plane)

        return [
            f / aspect_ratio, 0.0, 0.0, 0.0,
            0.0, f, 0.0, 0.0,
            0.0, 0.0, (self.far_plane + self.near_plane) * nf, -1.0,
            0.0, 0.0, (2.0 * self.far_plane * self.near_plane) * nf, 0.0
        ]
