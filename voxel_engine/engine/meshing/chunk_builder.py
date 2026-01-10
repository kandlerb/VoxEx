"""
Build mesh geometry from chunk voxel data.

Converts block data into renderable vertex arrays by iterating visible
faces, generating positions, normals, UVs, and AO-based vertex colors.
"""

import numpy as np
from numpy.typing import NDArray
from typing import List

from voxel_engine.engine.meshing.constants import (
    CHUNK_SIZE_X, CHUNK_SIZE_Z,
    FACE_VERTICES, FACE_NORMALS, FACE_UVS, QUAD_INDICES,
    TILE_UV_WIDTH
)
from voxel_engine.engine.meshing.face_culling import iter_visible_faces
from voxel_engine.engine.meshing.ambient_occlusion import get_face_ao
from voxel_engine.engine.meshing.chunk_mesh import ChunkMesh
from voxel_engine.engine.state import WorldState
from voxel_engine.engine.registry import Registry


class ChunkBuilder:
    """
    Builds mesh geometry for chunks.

    Iterates through visible block faces and generates vertex data
    for GPU rendering. Separates opaque and transparent geometry.
    """

    __slots__ = ('_world',)

    def __init__(self, world: WorldState):
        """
        Initialize chunk builder.

        Args:
            world: WorldState containing chunk data.
        """
        self._world = world

    def build(self, cx: int, cz: int) -> ChunkMesh:
        """
        Build mesh for chunk at (cx, cz).

        Generates all geometry for visible faces, calculating:
        - Positions: World-space vertex coordinates
        - Normals: Face normal vectors for lighting
        - UVs: Texture atlas coordinates
        - Colors: AO-based vertex colors (grayscale RGB)

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            ChunkMesh: Populated mesh with geometry arrays.
        """
        mesh = ChunkMesh(cx=cx, cz=cz)

        # Accumulate geometry in lists (faster append than numpy concat)
        opaque_pos: List[float] = []
        opaque_norm: List[float] = []
        opaque_uv: List[float] = []
        opaque_color: List[float] = []
        opaque_idx: List[int] = []

        trans_pos: List[float] = []
        trans_norm: List[float] = []
        trans_uv: List[float] = []
        trans_color: List[float] = []
        trans_idx: List[int] = []

        opaque_vertex_count = 0
        trans_vertex_count = 0

        base_x = cx * CHUNK_SIZE_X
        base_z = cz * CHUNK_SIZE_Z

        # Cache registry method for performance
        get_tile = Registry.get_block_tile_index
        is_transparent = Registry.is_transparent

        # Iterate visible faces
        for lx, ly, lz, face_index, block_id in iter_visible_faces(
            self._world, cx, cz
        ):
            # Determine target arrays based on block transparency
            block_transparent = is_transparent(block_id)
            if block_transparent:
                pos_list, norm_list, uv_list, color_list, idx_list = (
                    trans_pos, trans_norm, trans_uv, trans_color, trans_idx
                )
                vertex_base = trans_vertex_count
                trans_vertex_count += 4
            else:
                pos_list, norm_list, uv_list, color_list, idx_list = (
                    opaque_pos, opaque_norm, opaque_uv, opaque_color, opaque_idx
                )
                vertex_base = opaque_vertex_count
                opaque_vertex_count += 4

            # Global position of block
            gx = base_x + lx
            gz = base_z + lz

            # Get face geometry templates
            vertices = FACE_VERTICES[face_index]  # (4, 3)
            normal = FACE_NORMALS[face_index]     # (3,)

            # Get texture tile for this face
            tile_index = get_tile(block_id, face_index)
            tile_u_start = tile_index * TILE_UV_WIDTH

            # Get AO values for this face
            ao_values = get_face_ao(self._world, gx, ly, gz, face_index)

            # Add 4 vertices
            for i in range(4):
                # Position (offset by block position)
                px = gx + vertices[i, 0]
                py = ly + vertices[i, 1]
                pz = gz + vertices[i, 2]
                pos_list.extend([px, py, pz])

                # Normal
                norm_list.extend([normal[0], normal[1], normal[2]])

                # UV (offset into atlas)
                u = tile_u_start + FACE_UVS[i, 0] * TILE_UV_WIDTH
                v = FACE_UVS[i, 1]
                uv_list.extend([u, v])

                # Vertex color (AO as grayscale RGB)
                ao = ao_values[i]
                color_list.extend([ao, ao, ao])

            # Add indices for two triangles
            for idx_offset in QUAD_INDICES:
                idx_list.append(vertex_base + idx_offset)

        # Convert to numpy arrays
        if opaque_pos:
            mesh.opaque_positions = np.array(opaque_pos, dtype=np.float32)
            mesh.opaque_normals = np.array(opaque_norm, dtype=np.float32)
            mesh.opaque_uvs = np.array(opaque_uv, dtype=np.float32)
            mesh.opaque_colors = np.array(opaque_color, dtype=np.float32)
            mesh.opaque_indices = np.array(opaque_idx, dtype=np.uint32)

        if trans_pos:
            mesh.transparent_positions = np.array(trans_pos, dtype=np.float32)
            mesh.transparent_normals = np.array(trans_norm, dtype=np.float32)
            mesh.transparent_uvs = np.array(trans_uv, dtype=np.float32)
            mesh.transparent_colors = np.array(trans_color, dtype=np.float32)
            mesh.transparent_indices = np.array(trans_idx, dtype=np.uint32)

        return mesh

    def build_optimized(self, cx: int, cz: int) -> ChunkMesh:
        """
        Optimized mesh building using pre-allocated arrays.

        Estimates vertex counts first to pre-allocate, reducing
        list append overhead. Use for performance-critical paths.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            ChunkMesh: Populated mesh with geometry arrays.
        """
        mesh = ChunkMesh(cx=cx, cz=cz)

        # First pass: count faces
        opaque_face_count = 0
        trans_face_count = 0

        is_transparent = Registry.is_transparent

        for _, _, _, _, block_id in iter_visible_faces(self._world, cx, cz):
            if is_transparent(block_id):
                trans_face_count += 1
            else:
                opaque_face_count += 1

        if opaque_face_count == 0 and trans_face_count == 0:
            return mesh

        # Pre-allocate arrays
        if opaque_face_count > 0:
            opaque_verts = opaque_face_count * 4
            opaque_idxs = opaque_face_count * 6
            mesh.opaque_positions = np.empty(opaque_verts * 3, dtype=np.float32)
            mesh.opaque_normals = np.empty(opaque_verts * 3, dtype=np.float32)
            mesh.opaque_uvs = np.empty(opaque_verts * 2, dtype=np.float32)
            mesh.opaque_colors = np.empty(opaque_verts * 3, dtype=np.float32)
            mesh.opaque_indices = np.empty(opaque_idxs, dtype=np.uint32)

        if trans_face_count > 0:
            trans_verts = trans_face_count * 4
            trans_idxs = trans_face_count * 6
            mesh.transparent_positions = np.empty(trans_verts * 3, dtype=np.float32)
            mesh.transparent_normals = np.empty(trans_verts * 3, dtype=np.float32)
            mesh.transparent_uvs = np.empty(trans_verts * 2, dtype=np.float32)
            mesh.transparent_colors = np.empty(trans_verts * 3, dtype=np.float32)
            mesh.transparent_indices = np.empty(trans_idxs, dtype=np.uint32)

        # Second pass: fill arrays
        base_x = cx * CHUNK_SIZE_X
        base_z = cz * CHUNK_SIZE_Z

        get_tile = Registry.get_block_tile_index

        opaque_v_idx = 0
        opaque_i_idx = 0
        trans_v_idx = 0
        trans_i_idx = 0

        for lx, ly, lz, face_index, block_id in iter_visible_faces(
            self._world, cx, cz
        ):
            block_transparent = is_transparent(block_id)

            if block_transparent:
                positions = mesh.transparent_positions
                normals = mesh.transparent_normals
                uvs = mesh.transparent_uvs
                colors = mesh.transparent_colors
                indices = mesh.transparent_indices
                v_idx = trans_v_idx
                i_idx = trans_i_idx
                vertex_base = trans_v_idx // 3
                trans_v_idx += 12  # 4 vertices * 3 components
                trans_i_idx += 6
            else:
                positions = mesh.opaque_positions
                normals = mesh.opaque_normals
                uvs = mesh.opaque_uvs
                colors = mesh.opaque_colors
                indices = mesh.opaque_indices
                v_idx = opaque_v_idx
                i_idx = opaque_i_idx
                vertex_base = opaque_v_idx // 3
                opaque_v_idx += 12
                opaque_i_idx += 6

            gx = base_x + lx
            gz = base_z + lz

            vertices = FACE_VERTICES[face_index]
            normal = FACE_NORMALS[face_index]
            tile_index = get_tile(block_id, face_index)
            tile_u_start = tile_index * TILE_UV_WIDTH
            ao_values = get_face_ao(self._world, gx, ly, gz, face_index)

            # Fill vertex data
            uv_idx = (v_idx // 3) * 2
            for i in range(4):
                pos_i = v_idx + i * 3
                positions[pos_i] = gx + vertices[i, 0]
                positions[pos_i + 1] = ly + vertices[i, 1]
                positions[pos_i + 2] = gz + vertices[i, 2]

                normals[pos_i] = normal[0]
                normals[pos_i + 1] = normal[1]
                normals[pos_i + 2] = normal[2]

                uv_i = uv_idx + i * 2
                uvs[uv_i] = tile_u_start + FACE_UVS[i, 0] * TILE_UV_WIDTH
                uvs[uv_i + 1] = FACE_UVS[i, 1]

                ao = ao_values[i]
                colors[pos_i] = ao
                colors[pos_i + 1] = ao
                colors[pos_i + 2] = ao

            # Fill indices
            for j, idx_offset in enumerate(QUAD_INDICES):
                indices[i_idx + j] = vertex_base + idx_offset

        return mesh
