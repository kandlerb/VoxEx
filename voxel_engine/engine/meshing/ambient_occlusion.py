"""
Ambient occlusion calculation for voxel vertices.

Uses the classic voxel AO algorithm that samples 3 neighbors per vertex
(two sides and a corner) to determine occlusion level.

The AO level (0-3) is then mapped to a brightness multiplier via AO_CURVE.
"""

import numpy as np
from numpy.typing import NDArray

from voxel_engine.engine.state import WorldState
from voxel_engine.engine.registry import Registry
from voxel_engine.engine.meshing.constants import AO_CURVE, CHUNK_SIZE_Y


def calculate_ao(side1: bool, side2: bool, corner: bool) -> int:
    """
    Calculate AO level for a vertex based on 3 neighbors.

    The classic voxel AO formula:
    - If both sides are solid, vertex is fully occluded (0)
    - Otherwise, count solid neighbors and subtract from 3

    Args:
        side1: True if first adjacent side block is solid.
        side2: True if second adjacent side block is solid.
        corner: True if diagonal corner block is solid.

    Returns:
        int: AO level 0 (darkest) to 3 (brightest).
    """
    if side1 and side2:
        return 0
    return 3 - (int(side1) + int(side2) + int(corner))


def _is_occluder(world: WorldState, x: int, y: int, z: int) -> bool:
    """
    Check if block at position occludes light.

    A block occludes if it is solid and not transparent.

    Args:
        world: WorldState to query.
        x: Global X coordinate.
        y: Global Y coordinate.
        z: Global Z coordinate.

    Returns:
        bool: True if block occludes light.
    """
    if y < 0 or y >= CHUNK_SIZE_Y:
        return False

    block_id = world.get_block(x, y, z)
    if block_id == 0:  # AIR
        return False

    return Registry.is_solid(block_id) and not Registry.is_transparent(block_id)


def get_face_ao(
    world: WorldState,
    gx: int, gy: int, gz: int,
    face_index: int
) -> NDArray[np.float32]:
    """
    Calculate AO values for all 4 vertices of a face.

    Each vertex samples 3 neighbors: two along the face edges and
    one at the diagonal corner. The samples are specific to each
    face orientation.

    Args:
        world: WorldState containing block data.
        gx: Global X coordinate of block.
        gy: Global Y coordinate of block.
        gz: Global Z coordinate of block.
        face_index: Face direction (0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z).

    Returns:
        NDArray[np.float32]: (4,) array of AO multipliers from AO_CURVE.
    """
    ao_values = np.ones(4, dtype=np.float32)

    # Define neighbor positions for each vertex based on face orientation
    # For each vertex: (side1_pos, side2_pos, corner_pos)
    if face_index == 2:  # +Y (top)
        # Check neighbors at y+1 plane
        check_y = gy + 1
        neighbors = [
            # Vertex 0: (-X, -Z corner) at (0, 1, 0) -> world (gx, gy+1, gz)
            ((gx - 1, check_y, gz), (gx, check_y, gz - 1), (gx - 1, check_y, gz - 1)),
            # Vertex 1: (-X, +Z corner) at (0, 1, 1)
            ((gx - 1, check_y, gz), (gx, check_y, gz + 1), (gx - 1, check_y, gz + 1)),
            # Vertex 2: (+X, +Z corner) at (1, 1, 1)
            ((gx + 1, check_y, gz), (gx, check_y, gz + 1), (gx + 1, check_y, gz + 1)),
            # Vertex 3: (+X, -Z corner) at (1, 1, 0)
            ((gx + 1, check_y, gz), (gx, check_y, gz - 1), (gx + 1, check_y, gz - 1)),
        ]
    elif face_index == 3:  # -Y (bottom)
        # Check neighbors at y-1 plane
        check_y = gy - 1
        neighbors = [
            # Vertex 0: (-X, +Z corner) at (0, 0, 1)
            ((gx, check_y, gz + 1), (gx - 1, check_y, gz), (gx - 1, check_y, gz + 1)),
            # Vertex 1: (-X, -Z corner) at (0, 0, 0)
            ((gx, check_y, gz - 1), (gx - 1, check_y, gz), (gx - 1, check_y, gz - 1)),
            # Vertex 2: (+X, -Z corner) at (1, 0, 0)
            ((gx, check_y, gz - 1), (gx + 1, check_y, gz), (gx + 1, check_y, gz - 1)),
            # Vertex 3: (+X, +Z corner) at (1, 0, 1)
            ((gx, check_y, gz + 1), (gx + 1, check_y, gz), (gx + 1, check_y, gz + 1)),
        ]
    elif face_index == 0:  # +X (east)
        # Check neighbors at x+1 plane
        check_x = gx + 1
        neighbors = [
            # Vertex 0: (-Y, -Z corner) at (1, 0, 0)
            ((check_x, gy - 1, gz), (check_x, gy, gz - 1), (check_x, gy - 1, gz - 1)),
            # Vertex 1: (+Y, -Z corner) at (1, 1, 0)
            ((check_x, gy + 1, gz), (check_x, gy, gz - 1), (check_x, gy + 1, gz - 1)),
            # Vertex 2: (+Y, +Z corner) at (1, 1, 1)
            ((check_x, gy + 1, gz), (check_x, gy, gz + 1), (check_x, gy + 1, gz + 1)),
            # Vertex 3: (-Y, +Z corner) at (1, 0, 1)
            ((check_x, gy - 1, gz), (check_x, gy, gz + 1), (check_x, gy - 1, gz + 1)),
        ]
    elif face_index == 1:  # -X (west)
        # Check neighbors at x-1 plane
        check_x = gx - 1
        neighbors = [
            # Vertex 0: (-Y, +Z corner) at (0, 0, 1)
            ((check_x, gy - 1, gz), (check_x, gy, gz + 1), (check_x, gy - 1, gz + 1)),
            # Vertex 1: (+Y, +Z corner) at (0, 1, 1)
            ((check_x, gy + 1, gz), (check_x, gy, gz + 1), (check_x, gy + 1, gz + 1)),
            # Vertex 2: (+Y, -Z corner) at (0, 1, 0)
            ((check_x, gy + 1, gz), (check_x, gy, gz - 1), (check_x, gy + 1, gz - 1)),
            # Vertex 3: (-Y, -Z corner) at (0, 0, 0)
            ((check_x, gy - 1, gz), (check_x, gy, gz - 1), (check_x, gy - 1, gz - 1)),
        ]
    elif face_index == 4:  # +Z (south)
        # Check neighbors at z+1 plane
        check_z = gz + 1
        neighbors = [
            # Vertex 0: (-Y, +X corner) at (1, 0, 1)
            ((gx, gy - 1, check_z), (gx + 1, gy, check_z), (gx + 1, gy - 1, check_z)),
            # Vertex 1: (+Y, +X corner) at (1, 1, 1)
            ((gx, gy + 1, check_z), (gx + 1, gy, check_z), (gx + 1, gy + 1, check_z)),
            # Vertex 2: (+Y, -X corner) at (0, 1, 1)
            ((gx, gy + 1, check_z), (gx - 1, gy, check_z), (gx - 1, gy + 1, check_z)),
            # Vertex 3: (-Y, -X corner) at (0, 0, 1)
            ((gx, gy - 1, check_z), (gx - 1, gy, check_z), (gx - 1, gy - 1, check_z)),
        ]
    else:  # face_index == 5: -Z (north)
        # Check neighbors at z-1 plane
        check_z = gz - 1
        neighbors = [
            # Vertex 0: (-Y, -X corner) at (0, 0, 0)
            ((gx, gy - 1, check_z), (gx - 1, gy, check_z), (gx - 1, gy - 1, check_z)),
            # Vertex 1: (+Y, -X corner) at (0, 1, 0)
            ((gx, gy + 1, check_z), (gx - 1, gy, check_z), (gx - 1, gy + 1, check_z)),
            # Vertex 2: (+Y, +X corner) at (1, 1, 0)
            ((gx, gy + 1, check_z), (gx + 1, gy, check_z), (gx + 1, gy + 1, check_z)),
            # Vertex 3: (-Y, +X corner) at (1, 0, 0)
            ((gx, gy - 1, check_z), (gx + 1, gy, check_z), (gx + 1, gy - 1, check_z)),
        ]

    # Calculate AO for each vertex
    for i, (side1_pos, side2_pos, corner_pos) in enumerate(neighbors):
        side1 = _is_occluder(world, *side1_pos)
        side2 = _is_occluder(world, *side2_pos)
        corner = _is_occluder(world, *corner_pos)
        ao_level = calculate_ao(side1, side2, corner)
        ao_values[i] = AO_CURVE[ao_level]

    return ao_values


def get_face_ao_fast(
    world: WorldState,
    gx: int, gy: int, gz: int,
    face_index: int
) -> NDArray[np.float32]:
    """
    Optimized AO calculation with cached lookups.

    Same as get_face_ao but caches the is_occluder function
    and avoids repeated tuple unpacking.

    Args:
        world: WorldState containing block data.
        gx: Global X coordinate of block.
        gy: Global Y coordinate of block.
        gz: Global Z coordinate of block.
        face_index: Face direction (0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z).

    Returns:
        NDArray[np.float32]: (4,) array of AO multipliers from AO_CURVE.
    """
    # Cache function references
    get_block = world.get_block
    is_solid = Registry.is_solid
    is_transparent = Registry.is_transparent

    def is_occ(x: int, y: int, z: int) -> bool:
        """Inline occluder check."""
        if y < 0 or y >= CHUNK_SIZE_Y:
            return False
        bid = get_block(x, y, z)
        if bid == 0:
            return False
        return is_solid(bid) and not is_transparent(bid)

    ao_values = np.ones(4, dtype=np.float32)

    # Inline the neighbor lookups for each face
    if face_index == 2:  # +Y (top)
        cy = gy + 1
        for i, (dx1, dz1, dx2, dz2, dxc, dzc) in enumerate([
            (-1, 0, 0, -1, -1, -1),
            (-1, 0, 0, 1, -1, 1),
            (1, 0, 0, 1, 1, 1),
            (1, 0, 0, -1, 1, -1),
        ]):
            s1 = is_occ(gx + dx1, cy, gz + dz1)
            s2 = is_occ(gx + dx2, cy, gz + dz2)
            c = is_occ(gx + dxc, cy, gz + dzc)
            ao_values[i] = AO_CURVE[calculate_ao(s1, s2, c)]
    elif face_index == 3:  # -Y (bottom)
        cy = gy - 1
        for i, (dx1, dz1, dx2, dz2, dxc, dzc) in enumerate([
            (0, 1, -1, 0, -1, 1),
            (0, -1, -1, 0, -1, -1),
            (0, -1, 1, 0, 1, -1),
            (0, 1, 1, 0, 1, 1),
        ]):
            s1 = is_occ(gx + dx1, cy, gz + dz1)
            s2 = is_occ(gx + dx2, cy, gz + dz2)
            c = is_occ(gx + dxc, cy, gz + dzc)
            ao_values[i] = AO_CURVE[calculate_ao(s1, s2, c)]
    elif face_index == 0:  # +X (east)
        cx = gx + 1
        for i, (dy1, dz1, dy2, dz2, dyc, dzc) in enumerate([
            (-1, 0, 0, -1, -1, -1),
            (1, 0, 0, -1, 1, -1),
            (1, 0, 0, 1, 1, 1),
            (-1, 0, 0, 1, -1, 1),
        ]):
            s1 = is_occ(cx, gy + dy1, gz + dz1)
            s2 = is_occ(cx, gy + dy2, gz + dz2)
            c = is_occ(cx, gy + dyc, gz + dzc)
            ao_values[i] = AO_CURVE[calculate_ao(s1, s2, c)]
    elif face_index == 1:  # -X (west)
        cx = gx - 1
        for i, (dy1, dz1, dy2, dz2, dyc, dzc) in enumerate([
            (-1, 0, 0, 1, -1, 1),
            (1, 0, 0, 1, 1, 1),
            (1, 0, 0, -1, 1, -1),
            (-1, 0, 0, -1, -1, -1),
        ]):
            s1 = is_occ(cx, gy + dy1, gz + dz1)
            s2 = is_occ(cx, gy + dy2, gz + dz2)
            c = is_occ(cx, gy + dyc, gz + dzc)
            ao_values[i] = AO_CURVE[calculate_ao(s1, s2, c)]
    elif face_index == 4:  # +Z (south)
        cz = gz + 1
        for i, (dx1, dy1, dx2, dy2, dxc, dyc) in enumerate([
            (0, -1, 1, 0, 1, -1),
            (0, 1, 1, 0, 1, 1),
            (0, 1, -1, 0, -1, 1),
            (0, -1, -1, 0, -1, -1),
        ]):
            s1 = is_occ(gx + dx1, gy + dy1, cz)
            s2 = is_occ(gx + dx2, gy + dy2, cz)
            c = is_occ(gx + dxc, gy + dyc, cz)
            ao_values[i] = AO_CURVE[calculate_ao(s1, s2, c)]
    else:  # face_index == 5: -Z (north)
        cz = gz - 1
        for i, (dx1, dy1, dx2, dy2, dxc, dyc) in enumerate([
            (0, -1, -1, 0, -1, -1),
            (0, 1, -1, 0, -1, 1),
            (0, 1, 1, 0, 1, 1),
            (0, -1, 1, 0, 1, -1),
        ]):
            s1 = is_occ(gx + dx1, gy + dy1, cz)
            s2 = is_occ(gx + dx2, gy + dy2, cz)
            c = is_occ(gx + dxc, gy + dyc, cz)
            ao_values[i] = AO_CURVE[calculate_ao(s1, s2, c)]

    return ao_values
