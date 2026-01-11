"""
Chunk mesh GPU upload and rendering.

Manages VAOs (Vertex Array Objects) for chunk meshes. Uploads
ChunkMesh data to GPU buffers and renders visible chunks.

Usage:
    from voxel_engine.engine.rendering.chunk_renderer import ChunkRenderer

    renderer = ChunkRenderer(ctx, program)
    renderer.upload_mesh(mesh)
    renderer.render_opaque(visible_chunks)
    renderer.render_transparent(visible_chunks)
"""

import numpy as np
from typing import Dict, Optional, Tuple, List, TYPE_CHECKING

from voxel_engine.engine.meshing.chunk_mesh import ChunkMesh

if TYPE_CHECKING:
    import moderngl


class ChunkVAO:
    """
    GPU resources for a single chunk.

    Holds separate VAOs for opaque and transparent geometry.
    Each pass has its own VBO (vertex buffer), IBO (index buffer).
    """

    __slots__ = (
        'opaque_vao', 'opaque_vbo', 'opaque_ibo', 'opaque_count',
        'transparent_vao', 'transparent_vbo', 'transparent_ibo', 'transparent_count'
    )

    def __init__(self):
        """Initialize with no GPU resources."""
        self.opaque_vao: Optional["moderngl.VertexArray"] = None
        self.opaque_vbo: Optional["moderngl.Buffer"] = None
        self.opaque_ibo: Optional["moderngl.Buffer"] = None
        self.opaque_count: int = 0

        self.transparent_vao: Optional["moderngl.VertexArray"] = None
        self.transparent_vbo: Optional["moderngl.Buffer"] = None
        self.transparent_ibo: Optional["moderngl.Buffer"] = None
        self.transparent_count: int = 0

    def release(self) -> None:
        """Release all GPU resources."""
        if self.opaque_vao is not None:
            self.opaque_vao.release()
            self.opaque_vao = None
        if self.opaque_vbo is not None:
            self.opaque_vbo.release()
            self.opaque_vbo = None
        if self.opaque_ibo is not None:
            self.opaque_ibo.release()
            self.opaque_ibo = None

        if self.transparent_vao is not None:
            self.transparent_vao.release()
            self.transparent_vao = None
        if self.transparent_vbo is not None:
            self.transparent_vbo.release()
            self.transparent_vbo = None
        if self.transparent_ibo is not None:
            self.transparent_ibo.release()
            self.transparent_ibo = None

    @property
    def has_opaque(self) -> bool:
        """Check if chunk has opaque geometry."""
        return self.opaque_count > 0

    @property
    def has_transparent(self) -> bool:
        """Check if chunk has transparent geometry."""
        return self.transparent_count > 0


def _interleave_vertex_data(
    positions: np.ndarray,
    normals: np.ndarray,
    uvs: np.ndarray,
    colors: np.ndarray
) -> np.ndarray:
    """
    Interleave vertex attributes into single buffer.

    Format: position(3) + normal(3) + uv(2) + color(3) = 11 floats per vertex

    Args:
        positions: Flat array of positions (N*3 floats).
        normals: Flat array of normals (N*3 floats).
        uvs: Flat array of UVs (N*2 floats).
        colors: Flat array of colors (N*3 floats).

    Returns:
        np.ndarray: Interleaved vertex data.
    """
    vertex_count = len(positions) // 3
    if vertex_count == 0:
        return np.array([], dtype=np.float32)

    # Reshape arrays for vectorized interleaving
    pos_reshaped = positions.reshape(vertex_count, 3)
    norm_reshaped = normals.reshape(vertex_count, 3)
    uv_reshaped = uvs.reshape(vertex_count, 2)
    color_reshaped = colors.reshape(vertex_count, 3)

    # Stack horizontally and flatten
    vertex_data = np.hstack([
        pos_reshaped,
        norm_reshaped,
        uv_reshaped,
        color_reshaped
    ]).astype(np.float32).ravel()

    return vertex_data


class ChunkRenderer:
    """
    Manages chunk VAOs and rendering.

    Stores GPU resources for each chunk, provides upload and render methods.
    Chunks are keyed by (cx, cz) coordinate tuple.
    """

    __slots__ = ('_ctx', '_program', '_chunks', '_vertex_format')

    def __init__(self, ctx: "moderngl.Context", program: "moderngl.Program"):
        """
        Initialize chunk renderer.

        Args:
            ctx: ModernGL context.
            program: Compiled shader program with vertex attributes.
        """
        self._ctx = ctx
        self._program = program
        self._chunks: Dict[Tuple[int, int], ChunkVAO] = {}

        # Vertex format: position(3) + normal(3) + uv(2) + color(3) = 11 floats
        self._vertex_format = '3f 3f 2f 3f'

    def upload_mesh(self, mesh: ChunkMesh) -> None:
        """
        Upload chunk mesh to GPU.

        Creates or replaces GPU resources for the chunk.
        Interleaves vertex data for optimal GPU access.

        Args:
            mesh: ChunkMesh with geometry data.
        """
        key = (mesh.cx, mesh.cz)

        # Release old VAO if exists
        if key in self._chunks:
            self._chunks[key].release()

        chunk_vao = ChunkVAO()

        # Upload opaque geometry
        if mesh.opaque_index_count > 0:
            vertex_data = _interleave_vertex_data(
                mesh.opaque_positions,
                mesh.opaque_normals,
                mesh.opaque_uvs,
                mesh.opaque_colors
            )

            chunk_vao.opaque_vbo = self._ctx.buffer(vertex_data.tobytes())
            chunk_vao.opaque_ibo = self._ctx.buffer(mesh.opaque_indices.tobytes())
            chunk_vao.opaque_vao = self._ctx.vertex_array(
                self._program,
                [(chunk_vao.opaque_vbo, self._vertex_format,
                  'in_position', 'in_normal', 'in_uv', 'in_color')],
                chunk_vao.opaque_ibo
            )
            chunk_vao.opaque_count = mesh.opaque_index_count

        # Upload transparent geometry
        if mesh.transparent_index_count > 0:
            vertex_data = _interleave_vertex_data(
                mesh.transparent_positions,
                mesh.transparent_normals,
                mesh.transparent_uvs,
                mesh.transparent_colors
            )

            chunk_vao.transparent_vbo = self._ctx.buffer(vertex_data.tobytes())
            chunk_vao.transparent_ibo = self._ctx.buffer(mesh.transparent_indices.tobytes())
            chunk_vao.transparent_vao = self._ctx.vertex_array(
                self._program,
                [(chunk_vao.transparent_vbo, self._vertex_format,
                  'in_position', 'in_normal', 'in_uv', 'in_color')],
                chunk_vao.transparent_ibo
            )
            chunk_vao.transparent_count = mesh.transparent_index_count

        self._chunks[key] = chunk_vao

    def remove_chunk(self, cx: int, cz: int) -> None:
        """
        Remove chunk from GPU.

        Releases all GPU resources for the chunk.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        key = (cx, cz)
        if key in self._chunks:
            self._chunks[key].release()
            del self._chunks[key]

    def has_chunk(self, cx: int, cz: int) -> bool:
        """
        Check if chunk is uploaded.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            bool: True if chunk has GPU resources.
        """
        return (cx, cz) in self._chunks

    def render_opaque(self, visible_chunks: List[Tuple[int, int]]) -> int:
        """
        Render opaque geometry for visible chunks.

        Should be called with depth testing enabled, depth writing enabled.

        Args:
            visible_chunks: List of (cx, cz) tuples to render.

        Returns:
            int: Number of draw calls made.
        """
        draw_calls = 0
        for cx, cz in visible_chunks:
            key = (cx, cz)
            if key in self._chunks:
                vao = self._chunks[key]
                if vao.opaque_vao is not None and vao.opaque_count > 0:
                    vao.opaque_vao.render()
                    draw_calls += 1
        return draw_calls

    def render_transparent(self, visible_chunks: List[Tuple[int, int]]) -> int:
        """
        Render transparent geometry.

        Should be called with:
        - Depth testing enabled
        - Depth writing disabled (or use sorted back-to-front)
        - Alpha blending enabled

        Args:
            visible_chunks: List of (cx, cz) tuples, sorted back-to-front.

        Returns:
            int: Number of draw calls made.
        """
        draw_calls = 0
        for cx, cz in visible_chunks:
            key = (cx, cz)
            if key in self._chunks:
                vao = self._chunks[key]
                if vao.transparent_vao is not None and vao.transparent_count > 0:
                    vao.transparent_vao.render()
                    draw_calls += 1
        return draw_calls

    def release_all(self) -> None:
        """Release all GPU resources."""
        for vao in self._chunks.values():
            vao.release()
        self._chunks.clear()

    @property
    def chunk_count(self) -> int:
        """Get number of uploaded chunks."""
        return len(self._chunks)

    def get_stats(self) -> Dict[str, int]:
        """
        Get rendering statistics.

        Returns:
            dict: Statistics including chunk count, total faces.
        """
        total_opaque_indices = 0
        total_transparent_indices = 0

        for vao in self._chunks.values():
            total_opaque_indices += vao.opaque_count
            total_transparent_indices += vao.transparent_count

        return {
            'chunk_count': len(self._chunks),
            'opaque_faces': total_opaque_indices // 6,
            'transparent_faces': total_transparent_indices // 6,
            'total_faces': (total_opaque_indices + total_transparent_indices) // 6,
        }
