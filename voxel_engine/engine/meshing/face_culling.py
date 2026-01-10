"""
Face culling - determine which voxel faces are visible.

A face is visible (should be rendered) if the adjacent block is:
- Air or transparent
- Or current block is transparent and adjacent is a different type
"""

from typing import Generator, Tuple

from voxel_engine.engine.meshing.constants import (
    CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z, FACE_DIRECTIONS, AIR_BLOCK
)
from voxel_engine.engine.state import WorldState
from voxel_engine.engine.registry import Registry


def should_render_face(
    world: WorldState,
    bx: int, by: int, bz: int,
    face_index: int,
    block_id: int
) -> bool:
    """
    Check if a face should be rendered.

    A face is visible if:
    - The adjacent block is air/transparent
    - OR the current block is transparent and adjacent is different

    Args:
        world: WorldState containing chunk data.
        bx: Global X coordinate of block.
        by: Global Y coordinate of block (0-319).
        bz: Global Z coordinate of block.
        face_index: Which face to check (0-5).
        block_id: ID of the block being checked.

    Returns:
        bool: True if face should be rendered.
    """
    # Get neighbor position
    dx = int(FACE_DIRECTIONS[face_index, 0])
    dy = int(FACE_DIRECTIONS[face_index, 1])
    dz = int(FACE_DIRECTIONS[face_index, 2])
    nx, ny, nz = bx + dx, by + dy, bz + dz

    # Out of world bounds - render face (sky/void)
    if ny < 0 or ny >= CHUNK_SIZE_Y:
        return True

    neighbor_id = world.get_block(nx, ny, nz)

    # Unloaded chunk returns 0 (AIR), which is fine
    # Air always shows face
    if neighbor_id == AIR_BLOCK:
        return True

    # Check transparency
    block_transparent = Registry.is_transparent(block_id)
    neighbor_transparent = Registry.is_transparent(neighbor_id)

    # Solid blocks: only render if neighbor is transparent
    if not block_transparent:
        return neighbor_transparent

    # Transparent blocks: render if neighbor is different type
    # (prevents z-fighting between same transparent blocks)
    return neighbor_id != block_id


def iter_visible_faces(
    world: WorldState,
    cx: int, cz: int
) -> Generator[Tuple[int, int, int, int, int], None, None]:
    """
    Iterate over all visible faces in a chunk.

    Yields tuples of (local_x, local_y, local_z, face_index, block_id)
    for each face that should be rendered.

    Args:
        world: WorldState containing chunk data.
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.

    Yields:
        Tuple[int, int, int, int, int]: (lx, ly, lz, face_index, block_id)
    """
    chunk = world.get_chunk(cx, cz)
    if chunk is None:
        return

    base_x = cx * CHUNK_SIZE_X
    base_z = cz * CHUNK_SIZE_Z

    # Iterate through all blocks in the chunk
    for ly in range(CHUNK_SIZE_Y):
        for lz in range(CHUNK_SIZE_Z):
            for lx in range(CHUNK_SIZE_X):
                # Get block at this position
                block_id = chunk.get_block(lx, ly, lz)

                # Skip air
                if block_id == AIR_BLOCK:
                    continue

                # Global coordinates for neighbor checks
                gx = base_x + lx
                gz = base_z + lz

                # Check each face
                for face_index in range(6):
                    if should_render_face(world, gx, ly, gz,
                                          face_index, block_id):
                        yield (lx, ly, lz, face_index, block_id)


def iter_visible_faces_fast(
    world: WorldState,
    cx: int, cz: int
) -> Generator[Tuple[int, int, int, int, int], None, None]:
    """
    Optimized version of iter_visible_faces using direct array access.

    Uses numpy array indexing for faster iteration through chunk data.

    Args:
        world: WorldState containing chunk data.
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.

    Yields:
        Tuple[int, int, int, int, int]: (lx, ly, lz, face_index, block_id)
    """
    chunk = world.get_chunk(cx, cz)
    if chunk is None:
        return

    blocks = chunk.blocks
    base_x = cx * CHUNK_SIZE_X
    base_z = cz * CHUNK_SIZE_Z

    # Cache registry lookups for performance
    is_transparent = Registry.is_transparent
    get_block = world.get_block

    # Iterate through all blocks (Y outer for cache locality)
    for ly in range(CHUNK_SIZE_Y):
        for lz in range(CHUNK_SIZE_Z):
            for lx in range(CHUNK_SIZE_X):
                # Direct array access is faster than method call
                block_id = int(blocks[lx, ly, lz])

                # Skip air
                if block_id == AIR_BLOCK:
                    continue

                # Global coordinates
                gx = base_x + lx
                gz = base_z + lz

                block_transparent = is_transparent(block_id)

                # Check each of 6 faces
                # Face 0: +X (East)
                nx = gx + 1
                neighbor_id = get_block(nx, ly, gz)
                if neighbor_id == AIR_BLOCK or (
                    is_transparent(neighbor_id) if not block_transparent
                    else neighbor_id != block_id
                ):
                    yield (lx, ly, lz, 0, block_id)

                # Face 1: -X (West)
                nx = gx - 1
                neighbor_id = get_block(nx, ly, gz)
                if neighbor_id == AIR_BLOCK or (
                    is_transparent(neighbor_id) if not block_transparent
                    else neighbor_id != block_id
                ):
                    yield (lx, ly, lz, 1, block_id)

                # Face 2: +Y (Up)
                ny = ly + 1
                if ny >= CHUNK_SIZE_Y:
                    yield (lx, ly, lz, 2, block_id)
                else:
                    neighbor_id = get_block(gx, ny, gz)
                    if neighbor_id == AIR_BLOCK or (
                        is_transparent(neighbor_id) if not block_transparent
                        else neighbor_id != block_id
                    ):
                        yield (lx, ly, lz, 2, block_id)

                # Face 3: -Y (Down)
                ny = ly - 1
                if ny < 0:
                    yield (lx, ly, lz, 3, block_id)
                else:
                    neighbor_id = get_block(gx, ny, gz)
                    if neighbor_id == AIR_BLOCK or (
                        is_transparent(neighbor_id) if not block_transparent
                        else neighbor_id != block_id
                    ):
                        yield (lx, ly, lz, 3, block_id)

                # Face 4: +Z (South)
                nz = gz + 1
                neighbor_id = get_block(gx, ly, nz)
                if neighbor_id == AIR_BLOCK or (
                    is_transparent(neighbor_id) if not block_transparent
                    else neighbor_id != block_id
                ):
                    yield (lx, ly, lz, 4, block_id)

                # Face 5: -Z (North)
                nz = gz - 1
                neighbor_id = get_block(gx, ly, nz)
                if neighbor_id == AIR_BLOCK or (
                    is_transparent(neighbor_id) if not block_transparent
                    else neighbor_id != block_id
                ):
                    yield (lx, ly, lz, 5, block_id)
