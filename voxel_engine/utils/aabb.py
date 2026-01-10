"""
AABB (Axis-Aligned Bounding Box) module placeholder.

NOTE: This module intentionally does NOT contain an AABB class.

VoxEx uses vectorized NumPy operations for collision detection rather than
OOP-style AABB objects. This decision was made for performance reasons:

1. NumPy arrays allow batch collision checks on many entities at once
2. Avoids object allocation overhead in hot paths
3. Better cache coherency with contiguous arrays
4. Enables easy SIMD optimization via NumPy/Numba

AABB collision detection is implemented in:
    voxel_engine/systems/physics/collision.py

The collision system works with arrays of:
    - positions: np.ndarray of shape (N, 3)
    - sizes: np.ndarray of shape (N, 3) or (3,) for uniform size
    - velocities: np.ndarray of shape (N, 3)

Example vectorized AABB check (implemented in collision.py):

    def check_aabb_overlap(pos_a, size_a, pos_b, size_b):
        '''Check if two AABBs overlap (vectorized).'''
        min_a = pos_a - size_a * 0.5
        max_a = pos_a + size_a * 0.5
        min_b = pos_b - size_b * 0.5
        max_b = pos_b + size_b * 0.5

        # All axes must overlap for collision
        return np.all((max_a >= min_b) & (min_a <= max_b), axis=-1)

For individual entity bounds, use simple tuples or dataclass:

    @dataclass
    class EntityBounds:
        position: np.ndarray  # center position
        size: np.ndarray      # width, height, depth

See systems/physics/collision.py for the full implementation.
"""

# This file intentionally contains no AABB class.
# Collision is handled via vectorized NumPy in systems/physics/collision.py
