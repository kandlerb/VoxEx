"""
Camera and projection matrix calculations.

Provides perspective projection, view matrices, and a Camera class
for FPS-style rendering. All matrices are column-major for OpenGL.

Usage:
    from voxel_engine.engine.rendering.camera import Camera, fps_view_matrix

    camera = Camera(fov=75.0, aspect=16/9)
    view = camera.update_view(position, yaw, pitch)
    projection = camera.projection
"""

import math
import numpy as np
from numpy.typing import NDArray


def perspective_matrix(
    fov_y: float,
    aspect: float,
    near: float,
    far: float
) -> NDArray[np.float32]:
    """
    Create perspective projection matrix.

    Args:
        fov_y: Vertical field of view in radians.
        aspect: Width / height ratio.
        near: Near clipping plane distance.
        far: Far clipping plane distance.

    Returns:
        NDArray[np.float32]: 4x4 column-major projection matrix.
    """
    f = 1.0 / math.tan(fov_y / 2.0)

    result = np.zeros((4, 4), dtype=np.float32)
    result[0, 0] = f / aspect
    result[1, 1] = f
    result[2, 2] = (far + near) / (near - far)
    result[2, 3] = (2.0 * far * near) / (near - far)
    result[3, 2] = -1.0

    return result


def look_at_matrix(
    eye: NDArray[np.float32],
    target: NDArray[np.float32],
    up: NDArray[np.float32]
) -> NDArray[np.float32]:
    """
    Create view matrix looking from eye to target.

    Args:
        eye: Camera position.
        target: Point to look at.
        up: World up vector (typically [0, 1, 0]).

    Returns:
        NDArray[np.float32]: 4x4 column-major view matrix.
    """
    forward = target - eye
    forward_len = np.linalg.norm(forward)
    if forward_len > 0:
        forward = forward / forward_len
    else:
        forward = np.array([0, 0, -1], dtype=np.float32)

    right = np.cross(forward, up)
    right_len = np.linalg.norm(right)
    if right_len > 0:
        right = right / right_len
    else:
        right = np.array([1, 0, 0], dtype=np.float32)

    up_actual = np.cross(right, forward)

    result = np.eye(4, dtype=np.float32)
    result[0, :3] = right
    result[1, :3] = up_actual
    result[2, :3] = -forward

    result[0, 3] = -np.dot(right, eye)
    result[1, 3] = -np.dot(up_actual, eye)
    result[2, 3] = np.dot(forward, eye)

    return result


def fps_view_matrix(
    position: NDArray[np.float32],
    yaw: float,
    pitch: float
) -> NDArray[np.float32]:
    """
    Create view matrix from FPS-style camera.

    Args:
        position: Camera position (eye height).
        yaw: Horizontal rotation in radians (0 = -Z, positive = left).
        pitch: Vertical rotation in radians (positive = up).

    Returns:
        NDArray[np.float32]: 4x4 column-major view matrix.
    """
    # Calculate forward direction
    cos_pitch = math.cos(pitch)
    forward = np.array([
        -math.sin(yaw) * cos_pitch,
        math.sin(pitch),
        -math.cos(yaw) * cos_pitch
    ], dtype=np.float32)

    target = position.astype(np.float32) + forward
    up = np.array([0.0, 1.0, 0.0], dtype=np.float32)

    return look_at_matrix(position.astype(np.float32), target, up)


def rotation_only_view(yaw: float, pitch: float) -> NDArray[np.float32]:
    """
    Create view matrix with only rotation (for skybox).

    No translation component - skybox appears infinitely far away.

    Args:
        yaw: Horizontal rotation in radians.
        pitch: Vertical rotation in radians.

    Returns:
        NDArray[np.float32]: 4x4 rotation-only view matrix.
    """
    cos_pitch = math.cos(pitch)
    forward = np.array([
        -math.sin(yaw) * cos_pitch,
        math.sin(pitch),
        -math.cos(yaw) * cos_pitch
    ], dtype=np.float32)

    world_up = np.array([0.0, 1.0, 0.0], dtype=np.float32)

    right = np.cross(forward, world_up)
    right_len = np.linalg.norm(right)
    if right_len > 0:
        right = right / right_len
    else:
        right = np.array([1, 0, 0], dtype=np.float32)

    up = np.cross(right, forward)

    result = np.eye(4, dtype=np.float32)
    result[0, :3] = right
    result[1, :3] = up
    result[2, :3] = -forward

    return result


class Camera:
    """
    FPS camera with projection and view matrices.

    Manages perspective projection and view matrix updates.
    Matrices are cached and only recomputed when dirty.

    Attributes:
        fov: Vertical field of view in radians.
        aspect: Width / height ratio.
        near: Near clipping plane.
        far: Far clipping plane.
    """

    __slots__ = (
        'fov', 'aspect', 'near', 'far',
        '_projection', '_view', '_projection_dirty'
    )

    def __init__(
        self,
        fov: float = 75.0,
        aspect: float = 16 / 9,
        near: float = 0.1,
        far: float = 1000.0
    ):
        """
        Initialize camera.

        Args:
            fov: Vertical field of view in degrees.
            aspect: Width / height ratio.
            near: Near clipping plane distance.
            far: Far clipping plane distance.
        """
        self.fov = math.radians(fov)
        self.aspect = aspect
        self.near = near
        self.far = far
        self._projection: NDArray[np.float32] = None
        self._view: NDArray[np.float32] = None
        self._projection_dirty = True

    @property
    def projection(self) -> NDArray[np.float32]:
        """
        Get projection matrix, recomputing if dirty.

        Returns:
            NDArray[np.float32]: 4x4 projection matrix.
        """
        if self._projection is None or self._projection_dirty:
            self._projection = perspective_matrix(
                self.fov, self.aspect, self.near, self.far
            )
            self._projection_dirty = False
        return self._projection

    def update_view(
        self,
        position: NDArray[np.float32],
        yaw: float,
        pitch: float
    ) -> NDArray[np.float32]:
        """
        Update and return view matrix.

        Args:
            position: Camera position.
            yaw: Horizontal rotation in radians.
            pitch: Vertical rotation in radians.

        Returns:
            NDArray[np.float32]: Updated view matrix.
        """
        self._view = fps_view_matrix(position, yaw, pitch)
        return self._view

    @property
    def view(self) -> NDArray[np.float32]:
        """
        Get current view matrix.

        Returns:
            NDArray[np.float32]: 4x4 view matrix (may be None if not updated).
        """
        return self._view

    def set_aspect(self, width: int, height: int) -> None:
        """
        Update aspect ratio from window dimensions.

        Args:
            width: Window width in pixels.
            height: Window height in pixels.
        """
        if height > 0:
            self.aspect = width / height
            self._projection_dirty = True

    def set_fov(self, fov_degrees: float) -> None:
        """
        Set field of view.

        Args:
            fov_degrees: Vertical FOV in degrees.
        """
        self.fov = math.radians(fov_degrees)
        self._projection_dirty = True

    def get_view_projection(self) -> NDArray[np.float32]:
        """
        Get combined view-projection matrix.

        Returns:
            NDArray[np.float32]: VP = projection @ view
        """
        if self._view is None:
            return self.projection.copy()
        return self.projection @ self._view

    def get_forward_direction(self, yaw: float, pitch: float) -> NDArray[np.float32]:
        """
        Get forward direction vector for given rotation.

        Args:
            yaw: Horizontal rotation in radians.
            pitch: Vertical rotation in radians.

        Returns:
            NDArray[np.float32]: Unit forward vector.
        """
        cos_pitch = math.cos(pitch)
        return np.array([
            -math.sin(yaw) * cos_pitch,
            math.sin(pitch),
            -math.cos(yaw) * cos_pitch
        ], dtype=np.float32)
