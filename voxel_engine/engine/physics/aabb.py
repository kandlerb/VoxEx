"""
AABB collision primitives using NumPy arrays.

Axis-Aligned Bounding Boxes are represented as (6,) float64 arrays:
[min_x, min_y, min_z, max_x, max_y, max_z]

This representation allows efficient NumPy operations and Numba JIT.

Usage:
    from voxel_engine.engine.physics.aabb import make_aabb, aabb_intersects

    box_a = make_aabb(np.array([0, 0, 0]), np.array([1, 1, 1]))
    box_b = make_aabb(np.array([0.5, 0, 0]), np.array([1.5, 1, 1]))
    if aabb_intersects(box_a, box_b):
        print("Collision!")
"""

import numpy as np
from numpy.typing import NDArray


def make_aabb(
    min_corner: NDArray[np.float64],
    max_corner: NDArray[np.float64]
) -> NDArray[np.float64]:
    """
    Create AABB as (6,) array from min/max corners.

    Args:
        min_corner: (3,) array of minimum X, Y, Z.
        max_corner: (3,) array of maximum X, Y, Z.

    Returns:
        (6,) array: [min_x, min_y, min_z, max_x, max_y, max_z].
    """
    return np.array([
        min_corner[0], min_corner[1], min_corner[2],
        max_corner[0], max_corner[1], max_corner[2]
    ], dtype=np.float64)


def aabb_from_center(
    center: NDArray[np.float64],
    half_extents: NDArray[np.float64]
) -> NDArray[np.float64]:
    """
    Create AABB from center point and half-widths.

    Args:
        center: (3,) array of center X, Y, Z.
        half_extents: (3,) array of half-widths in X, Y, Z.

    Returns:
        (6,) AABB array.
    """
    return make_aabb(center - half_extents, center + half_extents)


def aabb_intersects(
    a: NDArray[np.float64],
    b: NDArray[np.float64]
) -> bool:
    """
    Check if two AABBs overlap.

    Uses separating axis theorem for axis-aligned boxes.

    Args:
        a: First AABB (6,) array.
        b: Second AABB (6,) array.

    Returns:
        True if boxes overlap, False otherwise.
    """
    # Check all three axes for separation
    # Overlap requires: a.min <= b.max AND a.max >= b.min on all axes
    return (
        a[0] <= b[3] and a[3] >= b[0] and  # X overlap
        a[1] <= b[4] and a[4] >= b[1] and  # Y overlap
        a[2] <= b[5] and a[5] >= b[2]      # Z overlap
    )


def aabb_contains_point(
    aabb: NDArray[np.float64],
    point: NDArray[np.float64]
) -> bool:
    """
    Check if point is inside AABB (inclusive).

    Args:
        aabb: AABB (6,) array.
        point: (3,) array of point coordinates.

    Returns:
        True if point is inside or on boundary.
    """
    return (
        aabb[0] <= point[0] <= aabb[3] and
        aabb[1] <= point[1] <= aabb[4] and
        aabb[2] <= point[2] <= aabb[5]
    )


def player_aabb(
    position: NDArray[np.float64],
    width: float,
    height: float
) -> NDArray[np.float64]:
    """
    Create player AABB from feet position.

    Player position is at the feet (bottom center).
    The AABB extends from feet up to head height.

    Args:
        position: (3,) array of player feet position.
        width: Player width (X and Z extent).
        height: Player height (Y extent from feet).

    Returns:
        (6,) AABB array.
    """
    half_width = width / 2.0
    return make_aabb(
        np.array([
            position[0] - half_width,
            position[1],
            position[2] - half_width
        ], dtype=np.float64),
        np.array([
            position[0] + half_width,
            position[1] + height,
            position[2] + half_width
        ], dtype=np.float64)
    )


def swept_aabb(
    aabb: NDArray[np.float64],
    velocity: NDArray[np.float64]
) -> NDArray[np.float64]:
    """
    Expand AABB to encompass entire movement path.

    Creates a bounding box that contains the original AABB
    at both its start and end positions after velocity is applied.
    Useful for broad-phase collision detection.

    Args:
        aabb: Original AABB (6,) array.
        velocity: (3,) movement velocity for this frame/tick.

    Returns:
        Expanded AABB (6,) array.
    """
    expanded = aabb.copy()
    for i in range(3):
        if velocity[i] < 0:
            expanded[i] += velocity[i]  # Expand min
        else:
            expanded[i + 3] += velocity[i]  # Expand max
    return expanded


def aabb_get_center(aabb: NDArray[np.float64]) -> NDArray[np.float64]:
    """
    Get center point of AABB.

    Args:
        aabb: AABB (6,) array.

    Returns:
        (3,) array of center coordinates.
    """
    return np.array([
        (aabb[0] + aabb[3]) / 2.0,
        (aabb[1] + aabb[4]) / 2.0,
        (aabb[2] + aabb[5]) / 2.0
    ], dtype=np.float64)


def aabb_get_size(aabb: NDArray[np.float64]) -> NDArray[np.float64]:
    """
    Get size (dimensions) of AABB.

    Args:
        aabb: AABB (6,) array.

    Returns:
        (3,) array of width, height, depth.
    """
    return np.array([
        aabb[3] - aabb[0],
        aabb[4] - aabb[1],
        aabb[5] - aabb[2]
    ], dtype=np.float64)
