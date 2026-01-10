"""
Frustum culling for chunk visibility.

Extracts frustum planes from view-projection matrix and tests
chunk AABBs against them. Culls chunks outside the view frustum
to reduce draw calls.

Usage:
    from voxel_engine.engine.rendering.frustum import Frustum

    frustum = Frustum()
    frustum.update(view_projection_matrix)

    if frustum.is_chunk_visible(cx, cz):
        render_chunk(cx, cz)
"""

import numpy as np
from numpy.typing import NDArray

from voxel_engine.engine.meshing.constants import (
    CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z
)


class Frustum:
    """
    View frustum for culling.

    Stores 6 frustum planes extracted from the view-projection matrix.
    Each plane is (nx, ny, nz, d) where nx*x + ny*y + nz*z + d >= 0 is inside.
    """

    __slots__ = ('_planes',)

    def __init__(self):
        """Initialize frustum with empty planes."""
        # 6 planes: left, right, bottom, top, near, far
        self._planes = np.zeros((6, 4), dtype=np.float32)

    def update(self, view_projection: NDArray[np.float32]) -> None:
        """
        Extract frustum planes from combined view-projection matrix.

        Uses Gribb/Hartmann method for plane extraction.
        Planes are normalized for distance calculations.

        Args:
            view_projection: 4x4 combined VP matrix.
        """
        m = view_projection

        # Transpose for row-major access if needed
        # OpenGL matrices are column-major, numpy is row-major
        # We access rows, so this works correctly

        # Left: row3 + row0
        self._planes[0] = m[3] + m[0]
        # Right: row3 - row0
        self._planes[1] = m[3] - m[0]
        # Bottom: row3 + row1
        self._planes[2] = m[3] + m[1]
        # Top: row3 - row1
        self._planes[3] = m[3] - m[1]
        # Near: row3 + row2
        self._planes[4] = m[3] + m[2]
        # Far: row3 - row2
        self._planes[5] = m[3] - m[2]

        # Normalize planes
        for i in range(6):
            length = np.linalg.norm(self._planes[i, :3])
            if length > 1e-6:
                self._planes[i] /= length

    def contains_point(self, point: NDArray[np.float32]) -> bool:
        """
        Check if point is inside frustum.

        Args:
            point: 3D point to test.

        Returns:
            bool: True if point is inside all planes.
        """
        for plane in self._planes:
            if np.dot(plane[:3], point) + plane[3] < 0:
                return False
        return True

    def intersects_aabb(
        self,
        min_corner: NDArray[np.float32],
        max_corner: NDArray[np.float32]
    ) -> bool:
        """
        Check if AABB intersects frustum.

        Uses the "positive vertex" test: find the vertex most likely
        to be inside each plane. If that vertex is outside, the
        entire AABB is outside.

        Args:
            min_corner: AABB minimum corner (x, y, z).
            max_corner: AABB maximum corner (x, y, z).

        Returns:
            bool: True if AABB intersects or is inside frustum.
        """
        for plane in self._planes:
            # Find the positive vertex (furthest along plane normal)
            px = max_corner[0] if plane[0] >= 0 else min_corner[0]
            py = max_corner[1] if plane[1] >= 0 else min_corner[1]
            pz = max_corner[2] if plane[2] >= 0 else min_corner[2]

            # If positive vertex is outside, AABB is outside
            if plane[0] * px + plane[1] * py + plane[2] * pz + plane[3] < 0:
                return False

        return True

    def is_chunk_visible(self, cx: int, cz: int) -> bool:
        """
        Check if chunk is visible in frustum.

        Tests the chunk's bounding box (from y=0 to y=CHUNK_SIZE_Y).

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            bool: True if chunk should be rendered.
        """
        min_corner = np.array([
            cx * CHUNK_SIZE_X,
            0,
            cz * CHUNK_SIZE_Z
        ], dtype=np.float32)

        max_corner = np.array([
            (cx + 1) * CHUNK_SIZE_X,
            CHUNK_SIZE_Y,
            (cz + 1) * CHUNK_SIZE_Z
        ], dtype=np.float32)

        return self.intersects_aabb(min_corner, max_corner)

    def get_visible_chunks(
        self,
        center_cx: int,
        center_cz: int,
        radius: int
    ) -> list:
        """
        Get list of visible chunks within radius.

        Args:
            center_cx: Center chunk X coordinate.
            center_cz: Center chunk Z coordinate.
            radius: Radius in chunks.

        Returns:
            list: List of (cx, cz) tuples for visible chunks.
        """
        visible = []
        for dx in range(-radius, radius + 1):
            for dz in range(-radius, radius + 1):
                cx = center_cx + dx
                cz = center_cz + dz
                if self.is_chunk_visible(cx, cz):
                    visible.append((cx, cz))
        return visible

    def is_sphere_visible(
        self,
        center: NDArray[np.float32],
        radius: float
    ) -> bool:
        """
        Check if sphere is visible in frustum.

        Args:
            center: Sphere center point.
            radius: Sphere radius.

        Returns:
            bool: True if sphere intersects or is inside frustum.
        """
        for plane in self._planes:
            distance = np.dot(plane[:3], center) + plane[3]
            if distance < -radius:
                return False
        return True
