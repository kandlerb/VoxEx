"""
Chunk mesh data structure for GPU upload.

Holds geometry data (positions, normals, UVs, colors, indices) for both
opaque and transparent passes. GPU handles (VAOs) are set by the renderer.
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Any
from dataclasses import dataclass, field


def _empty_float32() -> NDArray[np.float32]:
    """Create empty float32 array."""
    return np.array([], dtype=np.float32)


def _empty_uint32() -> NDArray[np.uint32]:
    """Create empty uint32 array."""
    return np.array([], dtype=np.uint32)


@dataclass
class ChunkMesh:
    """
    Holds geometry data for a single chunk.

    Separates opaque and transparent geometry for proper rendering order.
    Opaque geometry is rendered first, then transparent with depth testing
    but no depth writes.

    Attributes:
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.
        opaque_*: Arrays for opaque (solid block) geometry.
        transparent_*: Arrays for transparent (water, leaves) geometry.
        opaque_vao: GPU vertex array object for opaque pass.
        transparent_vao: GPU vertex array object for transparent pass.
    """

    cx: int
    cz: int

    # Opaque geometry (solid blocks)
    opaque_positions: NDArray[np.float32] = field(default_factory=_empty_float32)
    opaque_normals: NDArray[np.float32] = field(default_factory=_empty_float32)
    opaque_uvs: NDArray[np.float32] = field(default_factory=_empty_float32)
    opaque_colors: NDArray[np.float32] = field(default_factory=_empty_float32)
    opaque_indices: NDArray[np.uint32] = field(default_factory=_empty_uint32)

    # Transparent geometry (water, leaves, etc.)
    transparent_positions: NDArray[np.float32] = field(default_factory=_empty_float32)
    transparent_normals: NDArray[np.float32] = field(default_factory=_empty_float32)
    transparent_uvs: NDArray[np.float32] = field(default_factory=_empty_float32)
    transparent_colors: NDArray[np.float32] = field(default_factory=_empty_float32)
    transparent_indices: NDArray[np.uint32] = field(default_factory=_empty_uint32)

    # GPU handles (set by renderer)
    opaque_vao: Optional[Any] = None
    transparent_vao: Optional[Any] = None

    @property
    def opaque_vertex_count(self) -> int:
        """Number of opaque vertices (positions / 3)."""
        return len(self.opaque_positions) // 3

    @property
    def opaque_index_count(self) -> int:
        """Number of opaque indices."""
        return len(self.opaque_indices)

    @property
    def opaque_face_count(self) -> int:
        """Number of opaque faces (triangles / 2)."""
        return self.opaque_index_count // 6

    @property
    def transparent_vertex_count(self) -> int:
        """Number of transparent vertices (positions / 3)."""
        return len(self.transparent_positions) // 3

    @property
    def transparent_index_count(self) -> int:
        """Number of transparent indices."""
        return len(self.transparent_indices)

    @property
    def transparent_face_count(self) -> int:
        """Number of transparent faces (triangles / 2)."""
        return self.transparent_index_count // 6

    @property
    def total_vertex_count(self) -> int:
        """Total vertices across both passes."""
        return self.opaque_vertex_count + self.transparent_vertex_count

    @property
    def total_index_count(self) -> int:
        """Total indices across both passes."""
        return self.opaque_index_count + self.transparent_index_count

    @property
    def total_face_count(self) -> int:
        """Total faces across both passes."""
        return self.opaque_face_count + self.transparent_face_count

    @property
    def is_empty(self) -> bool:
        """Check if mesh has no geometry."""
        return self.opaque_index_count == 0 and self.transparent_index_count == 0

    @property
    def has_opaque(self) -> bool:
        """Check if mesh has opaque geometry."""
        return self.opaque_index_count > 0

    @property
    def has_transparent(self) -> bool:
        """Check if mesh has transparent geometry."""
        return self.transparent_index_count > 0

    @property
    def memory_bytes(self) -> int:
        """Approximate memory usage in bytes."""
        return (
            self.opaque_positions.nbytes +
            self.opaque_normals.nbytes +
            self.opaque_uvs.nbytes +
            self.opaque_colors.nbytes +
            self.opaque_indices.nbytes +
            self.transparent_positions.nbytes +
            self.transparent_normals.nbytes +
            self.transparent_uvs.nbytes +
            self.transparent_colors.nbytes +
            self.transparent_indices.nbytes
        )

    def clear(self) -> None:
        """Clear all geometry data, keeping chunk coordinates."""
        self.opaque_positions = _empty_float32()
        self.opaque_normals = _empty_float32()
        self.opaque_uvs = _empty_float32()
        self.opaque_colors = _empty_float32()
        self.opaque_indices = _empty_uint32()
        self.transparent_positions = _empty_float32()
        self.transparent_normals = _empty_float32()
        self.transparent_uvs = _empty_float32()
        self.transparent_colors = _empty_float32()
        self.transparent_indices = _empty_uint32()

    def release_gpu(self) -> None:
        """Release GPU resources (VAOs)."""
        self.opaque_vao = None
        self.transparent_vao = None

    def __repr__(self) -> str:
        """String representation with statistics."""
        return (
            f"ChunkMesh({self.cx}, {self.cz}, "
            f"opaque={self.opaque_face_count} faces, "
            f"transparent={self.transparent_face_count} faces)"
        )
