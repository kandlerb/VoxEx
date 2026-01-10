"""
Meshing constants matching voxEx.html.

Defines chunk dimensions, texture atlas parameters, face geometry,
and ambient occlusion values for the voxel meshing system.
"""

import numpy as np
from numpy.typing import NDArray


# =============================================================================
# CHUNK DIMENSIONS
# =============================================================================

CHUNK_SIZE_X: int = 16
CHUNK_SIZE_Y: int = 320
CHUNK_SIZE_Z: int = 16

# =============================================================================
# TEXTURE ATLAS
# =============================================================================

NUM_TILES: int = 17
TILE_SIZE: int = 16  # pixels
ATLAS_WIDTH: int = NUM_TILES * TILE_SIZE  # 272 pixels

# UV calculation helpers
TILE_UV_WIDTH: float = 1.0 / NUM_TILES  # Width of one tile in UV space

# =============================================================================
# FACE DIRECTIONS
# =============================================================================

# Face index to direction vector mapping
# Order: +X, -X, +Y, -Y, +Z, -Z
FACE_DIRECTIONS: NDArray[np.int8] = np.array([
    [1, 0, 0],   # 0: East  (+X)
    [-1, 0, 0],  # 1: West  (-X)
    [0, 1, 0],   # 2: Up    (+Y)
    [0, -1, 0],  # 3: Down  (-Y)
    [0, 0, 1],   # 4: South (+Z)
    [0, 0, -1],  # 5: North (-Z)
], dtype=np.int8)

# Face normals (same as directions, but float for shaders)
FACE_NORMALS: NDArray[np.float32] = FACE_DIRECTIONS.astype(np.float32)

# Face name mapping for debugging
FACE_NAMES: tuple = ('East', 'West', 'Up', 'Down', 'South', 'North')

# =============================================================================
# FACE VERTICES
# =============================================================================

# Vertex offsets for each face (4 vertices per face, CCW winding)
# Each face is a unit quad at the positive side of the axis
# Winding order ensures correct backface culling
FACE_VERTICES: NDArray[np.float32] = np.array([
    # +X face (East) - looking at face from +X
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    # -X face (West) - looking at face from -X
    [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    # +Y face (Top) - looking at face from above
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    # -Y face (Bottom) - looking at face from below
    [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
    # +Z face (South) - looking at face from +Z
    [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    # -Z face (North) - looking at face from -Z
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
], dtype=np.float32)

# =============================================================================
# UV COORDINATES
# =============================================================================

# UV coordinates for each vertex (standard quad mapping)
# Maps to corners of a tile in the texture atlas
FACE_UVS: NDArray[np.float32] = np.array([
    [0, 0], [0, 1], [1, 1], [1, 0]
], dtype=np.float32)

# =============================================================================
# TRIANGLE INDICES
# =============================================================================

# Triangle indices for a quad (two triangles, CCW winding)
# Creates triangles: [0,1,2] and [0,2,3]
QUAD_INDICES: NDArray[np.uint32] = np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32)

# =============================================================================
# AMBIENT OCCLUSION
# =============================================================================

# AO levels (0=darkest, 3=brightest)
# Maps the 4 possible occlusion states to brightness multipliers
AO_CURVE: NDArray[np.float32] = np.array([0.4, 0.6, 0.8, 1.0], dtype=np.float32)

# =============================================================================
# BLOCK IDS
# =============================================================================

# Common block IDs for quick reference
AIR_BLOCK: int = 0
WATER_BLOCK: int = 9
LEAVES_BLOCK: int = 6
LONGWOOD_LEAVES_BLOCK: int = 14
