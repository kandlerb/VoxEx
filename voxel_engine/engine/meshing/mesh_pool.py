"""
Pool ChunkMesh objects to reduce allocation overhead.

Reuses mesh objects during chunk loading/unloading cycles to minimize
garbage collection pressure from frequent mesh rebuilds.
"""

from typing import List
from voxel_engine.engine.meshing.chunk_mesh import ChunkMesh


class MeshPool:
    """
    Pool of reusable ChunkMesh objects.

    Maintains a list of available meshes that can be acquired and released.
    When acquiring, returns a pooled mesh if available, otherwise creates new.
    When releasing, clears the mesh and returns it to the pool.

    Attributes:
        max_size: Maximum number of meshes to keep in pool.
    """

    __slots__ = ('_available', '_max_size')

    def __init__(self, max_size: int = 100):
        """
        Initialize mesh pool.

        Args:
            max_size: Maximum number of meshes to keep pooled.
                      Meshes released beyond this limit are discarded.
        """
        self._available: List[ChunkMesh] = []
        self._max_size = max_size

    def acquire(self, cx: int, cz: int) -> ChunkMesh:
        """
        Get a mesh from pool or create a new one.

        If pool has available meshes, returns one after updating
        its coordinates and clearing geometry. Otherwise creates
        a fresh ChunkMesh.

        Args:
            cx: Chunk X coordinate for the mesh.
            cz: Chunk Z coordinate for the mesh.

        Returns:
            ChunkMesh: Ready-to-use mesh object.
        """
        if self._available:
            mesh = self._available.pop()
            mesh.cx = cx
            mesh.cz = cz
            mesh.clear()
            return mesh
        return ChunkMesh(cx=cx, cz=cz)

    def release(self, mesh: ChunkMesh) -> None:
        """
        Return mesh to pool for reuse.

        Releases GPU handles and adds mesh to pool if under max_size.
        Meshes over the limit are discarded for garbage collection.

        Args:
            mesh: ChunkMesh to return to pool.
        """
        if len(self._available) < self._max_size:
            mesh.release_gpu()
            self._available.append(mesh)

    def release_all(self, meshes: List[ChunkMesh]) -> None:
        """
        Release multiple meshes to pool.

        Args:
            meshes: List of meshes to release.
        """
        for mesh in meshes:
            self.release(mesh)

    def clear(self) -> None:
        """Clear all pooled meshes."""
        self._available.clear()

    def prewarm(self, count: int) -> None:
        """
        Pre-allocate meshes for the pool.

        Creates meshes up front to avoid allocation during gameplay.

        Args:
            count: Number of meshes to pre-allocate.
        """
        while len(self._available) < min(count, self._max_size):
            self._available.append(ChunkMesh(cx=0, cz=0))

    @property
    def available_count(self) -> int:
        """Number of meshes currently available in pool."""
        return len(self._available)

    @property
    def max_size(self) -> int:
        """Maximum pool size."""
        return self._max_size

    @max_size.setter
    def max_size(self, value: int) -> None:
        """
        Set maximum pool size.

        If new max is smaller than current pool, excess meshes are discarded.
        """
        self._max_size = value
        while len(self._available) > self._max_size:
            self._available.pop()

    def __repr__(self) -> str:
        """String representation."""
        return f"MeshPool(available={len(self._available)}, max={self._max_size})"
