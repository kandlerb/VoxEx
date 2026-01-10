"""
VoxEx chunk meshing system.

Converts voxel data into renderable 3D geometry using:
- Face culling: Skip hidden faces between solid blocks
- Texture atlas UV mapping: 17-tile horizontal strip
- Ambient occlusion: Vertex-based AO using neighbor sampling
- Separate passes: Opaque geometry vs transparent (water/leaves)

Usage:
    from voxel_engine.engine.meshing import ChunkBuilder, ChunkMesh, MeshPool

    # Build mesh for a chunk
    builder = ChunkBuilder(world_state)
    mesh = builder.build(cx=0, cz=0)

    # Use mesh pool for reduced allocations
    pool = MeshPool(max_size=100)
    mesh = pool.acquire(cx=0, cz=0)
    # ... build geometry into mesh ...
    pool.release(mesh)
"""

from .constants import (
    CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z,
    NUM_TILES, TILE_SIZE, ATLAS_WIDTH, TILE_UV_WIDTH,
    FACE_DIRECTIONS, FACE_NORMALS, FACE_VERTICES, FACE_UVS,
    QUAD_INDICES, AO_CURVE, FACE_NAMES,
    AIR_BLOCK, WATER_BLOCK, LEAVES_BLOCK, LONGWOOD_LEAVES_BLOCK
)
from .chunk_mesh import ChunkMesh
from .chunk_builder import ChunkBuilder
from .mesh_pool import MeshPool
from .face_culling import should_render_face, iter_visible_faces, iter_visible_faces_fast
from .ambient_occlusion import calculate_ao, get_face_ao, get_face_ao_fast

__all__ = [
    # Constants
    'CHUNK_SIZE_X', 'CHUNK_SIZE_Y', 'CHUNK_SIZE_Z',
    'NUM_TILES', 'TILE_SIZE', 'ATLAS_WIDTH', 'TILE_UV_WIDTH',
    'FACE_DIRECTIONS', 'FACE_NORMALS', 'FACE_VERTICES', 'FACE_UVS',
    'QUAD_INDICES', 'AO_CURVE', 'FACE_NAMES',
    'AIR_BLOCK', 'WATER_BLOCK', 'LEAVES_BLOCK', 'LONGWOOD_LEAVES_BLOCK',
    # Classes
    'ChunkMesh', 'ChunkBuilder', 'MeshPool',
    # Functions
    'should_render_face', 'iter_visible_faces', 'iter_visible_faces_fast',
    'calculate_ao', 'get_face_ao', 'get_face_ao_fast'
]
