"""
Lightweight NumPy vector helpers for VoxEx.

This module provides utility functions for 3D vector operations using NumPy arrays.
NumPy arrays ARE the vectors - we don't create a custom Vec3 class.

The architecture favors:
- NumPy arrays for all vector math
- Numba JIT for hot path optimization
- Module-level scratch arrays to avoid allocations

Usage:
    from voxel_engine.utils.vec import vec3, vec3i, normalize, distance

    pos = vec3(1.0, 2.0, 3.0)
    dir = normalize(vec3(1.0, 1.0, 0.0))
    dist = distance(pos, vec3(0.0, 0.0, 0.0))
"""

import numpy as np
from typing import Union

# Try to import Numba for JIT compilation
try:
    from numba import njit
    HAS_NUMBA = True
except ImportError:
    # Fallback: decorator that does nothing
    def njit(func=None, **kwargs):
        if func is not None:
            return func
        return lambda f: f
    HAS_NUMBA = False


# =============================================================================
# MODULE-LEVEL SCRATCH ARRAYS
# =============================================================================
# Pre-allocated arrays for hot-path functions to avoid GC pressure.
# These should ONLY be used in single-threaded contexts.

_tmp1 = np.zeros(3, dtype=np.float64)
_tmp2 = np.zeros(3, dtype=np.float64)
_tmp3 = np.zeros(3, dtype=np.float64)


# =============================================================================
# VECTOR CREATION
# =============================================================================

def vec3(x: float, y: float, z: float) -> np.ndarray:
    """
    Create a 3D float64 vector.

    Args:
        x: X component.
        y: Y component.
        z: Z component.

    Returns:
        np.ndarray: Shape (3,), dtype float64.
    """
    return np.array([x, y, z], dtype=np.float64)


def vec3i(x: int, y: int, z: int) -> np.ndarray:
    """
    Create a 3D int32 vector.

    Args:
        x: X component.
        y: Y component.
        z: Z component.

    Returns:
        np.ndarray: Shape (3,), dtype int32.
    """
    return np.array([x, y, z], dtype=np.int32)


def vec3_from_array(arr: Union[list, tuple, np.ndarray]) -> np.ndarray:
    """
    Create a vec3 from any array-like input.

    Args:
        arr: Array-like with 3 elements.

    Returns:
        np.ndarray: Shape (3,), dtype float64.
    """
    return np.asarray(arr, dtype=np.float64)


# =============================================================================
# BASIC OPERATIONS
# =============================================================================

@njit(cache=True)
def length_squared(v: np.ndarray) -> float:
    """
    Compute the squared length of a vector.

    Args:
        v: Input vector.

    Returns:
        float: v · v (dot product with itself).
    """
    return v[0] * v[0] + v[1] * v[1] + v[2] * v[2]


@njit(cache=True)
def length(v: np.ndarray) -> float:
    """
    Compute the length (magnitude) of a vector.

    Args:
        v: Input vector.

    Returns:
        float: ||v||
    """
    return np.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


def normalize(v: np.ndarray) -> np.ndarray:
    """
    Return a normalized (unit length) copy of the vector.

    Args:
        v: Input vector.

    Returns:
        np.ndarray: Unit vector in the same direction.
    """
    mag = length(v)
    if mag == 0.0:
        return np.zeros(3, dtype=np.float64)
    return v / mag


def normalize_inplace(v: np.ndarray) -> np.ndarray:
    """
    Normalize a vector in place.

    Args:
        v: Vector to normalize (modified in place).

    Returns:
        np.ndarray: The same array, now normalized.
    """
    mag = length(v)
    if mag > 0.0:
        v /= mag
    return v


# =============================================================================
# DOT AND CROSS PRODUCTS
# =============================================================================

@njit(cache=True)
def dot(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute the dot product of two vectors.

    Args:
        a: First vector.
        b: Second vector.

    Returns:
        float: a · b
    """
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """
    Compute the cross product of two vectors.

    Args:
        a: First vector.
        b: Second vector.

    Returns:
        np.ndarray: a × b
    """
    return np.array([
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ], dtype=np.float64)


# =============================================================================
# DISTANCE FUNCTIONS
# =============================================================================

@njit(cache=True)
def distance_squared(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute the squared distance between two points.

    Faster than distance() when only comparing distances.

    Args:
        a: First point.
        b: Second point.

    Returns:
        float: ||a - b||²
    """
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    dz = a[2] - b[2]
    return dx * dx + dy * dy + dz * dz


@njit(cache=True)
def distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute the Euclidean distance between two points.

    Args:
        a: First point.
        b: Second point.

    Returns:
        float: ||a - b||
    """
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    dz = a[2] - b[2]
    return np.sqrt(dx * dx + dy * dy + dz * dz)


@njit(cache=True)
def manhattan_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute the Manhattan (L1) distance between two points.

    Args:
        a: First point.
        b: Second point.

    Returns:
        float: |a.x - b.x| + |a.y - b.y| + |a.z - b.z|
    """
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


@njit(cache=True)
def chebyshev_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute the Chebyshev (L∞) distance between two points.

    Args:
        a: First point.
        b: Second point.

    Returns:
        float: max(|a.x - b.x|, |a.y - b.y|, |a.z - b.z|)
    """
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    dz = abs(a[2] - b[2])
    return max(dx, max(dy, dz))


# =============================================================================
# INTERPOLATION
# =============================================================================

def lerp(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    """
    Linearly interpolate between two vectors.

    Args:
        a: Start vector (t=0).
        b: End vector (t=1).
        t: Interpolation factor [0, 1].

    Returns:
        np.ndarray: a + (b - a) * t
    """
    return a + (b - a) * t


@njit(cache=True)
def lerp_scalar(a: float, b: float, t: float) -> float:
    """
    Linearly interpolate between two scalars.

    Args:
        a: Start value (t=0).
        b: End value (t=1).
        t: Interpolation factor [0, 1].

    Returns:
        float: a + (b - a) * t
    """
    return a + (b - a) * t


@njit(cache=True)
def smoothstep(t: float) -> float:
    """
    Compute the smoothstep interpolation factor.

    Uses the standard smoothstep curve: 3t² - 2t³

    Args:
        t: Input value [0, 1].

    Returns:
        float: Smoothed value.
    """
    return t * t * (3.0 - 2.0 * t)


@njit(cache=True)
def smootherstep(t: float) -> float:
    """
    Compute the smoother step interpolation factor.

    Uses Perlin's improved curve: 6t⁵ - 15t⁴ + 10t³

    Args:
        t: Input value [0, 1].

    Returns:
        float: Smoothed value.
    """
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


# =============================================================================
# CLAMPING AND BOUNDS
# =============================================================================

@njit(cache=True)
def clamp(value: float, min_val: float, max_val: float) -> float:
    """
    Clamp a value to a range.

    Args:
        value: Value to clamp.
        min_val: Minimum allowed value.
        max_val: Maximum allowed value.

    Returns:
        float: Clamped value.
    """
    if value < min_val:
        return min_val
    if value > max_val:
        return max_val
    return value


def clamp_vec(v: np.ndarray, min_val: float, max_val: float) -> np.ndarray:
    """
    Clamp each component of a vector to a range.

    Args:
        v: Input vector.
        min_val: Minimum allowed value per component.
        max_val: Maximum allowed value per component.

    Returns:
        np.ndarray: Clamped vector.
    """
    return np.clip(v, min_val, max_val)


# =============================================================================
# COORDINATE CONVERSIONS
# =============================================================================

@njit(cache=True)
def global_to_chunk(gx: int, gz: int, chunk_size: int = 16) -> tuple:
    """
    Convert global coordinates to chunk coordinates.

    Args:
        gx: Global X coordinate.
        gz: Global Z coordinate.
        chunk_size: Size of a chunk (default 16).

    Returns:
        tuple: (cx, cz) chunk coordinates.
    """
    cx = gx // chunk_size if gx >= 0 else (gx - chunk_size + 1) // chunk_size
    cz = gz // chunk_size if gz >= 0 else (gz - chunk_size + 1) // chunk_size
    return cx, cz


@njit(cache=True)
def global_to_local(gx: int, gz: int, chunk_size: int = 16) -> tuple:
    """
    Convert global coordinates to local (within-chunk) coordinates.

    Args:
        gx: Global X coordinate.
        gz: Global Z coordinate.
        chunk_size: Size of a chunk (default 16).

    Returns:
        tuple: (lx, lz) local coordinates in range [0, chunk_size).
    """
    lx = ((gx % chunk_size) + chunk_size) % chunk_size
    lz = ((gz % chunk_size) + chunk_size) % chunk_size
    return lx, lz


@njit(cache=True)
def chunk_to_global(cx: int, cz: int, lx: int, lz: int, chunk_size: int = 16) -> tuple:
    """
    Convert chunk + local coordinates to global coordinates.

    Args:
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.
        lx: Local X coordinate.
        lz: Local Z coordinate.
        chunk_size: Size of a chunk (default 16).

    Returns:
        tuple: (gx, gz) global coordinates.
    """
    gx = cx * chunk_size + lx
    gz = cz * chunk_size + lz
    return gx, gz
