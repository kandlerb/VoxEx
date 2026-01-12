"""
Worker process for building chunk meshes.

Runs in a separate process to avoid blocking the main thread.
Computes mesh geometry data which is then sent back to main thread for GPU upload.

This module is designed to be run in a multiprocessing worker, so it
avoids importing any OpenGL or GPU-related code.
"""

import multiprocessing as mp
from multiprocessing import Queue
from typing import Dict, Any, Optional, Tuple, List
import time
import traceback

# These are safe to import in workers (no OpenGL)
import numpy as np
from numpy.typing import NDArray


# Message types for worker communication
MSG_BUILD_CHUNK = 'build'
MSG_SHUTDOWN = 'shutdown'
MSG_RESULT = 'result'
MSG_ERROR = 'error'


# Face directions matching the engine meshing constants
# Order: +X, -X, +Y, -Y, +Z, -Z (East, West, Up, Down, South, North)
FACE_DIRECTIONS = [
    (1, 0, 0),   # 0: East  (+X)
    (-1, 0, 0),  # 1: West  (-X)
    (0, 1, 0),   # 2: Up    (+Y)
    (0, -1, 0),  # 3: Down  (-Y)
    (0, 0, 1),   # 4: South (+Z)
    (0, 0, -1),  # 5: North (-Z)
]

# Face normals (float version for mesh data)
FACE_NORMALS = [
    [1.0, 0.0, 0.0],   # East
    [-1.0, 0.0, 0.0],  # West
    [0.0, 1.0, 0.0],   # Up
    [0.0, -1.0, 0.0],  # Down
    [0.0, 0.0, 1.0],   # South
    [0.0, 0.0, -1.0],  # North
]

# Vertex offsets for each face (4 vertices per face, CCW winding)
FACE_VERTICES = [
    # +X face (East)
    [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)],
    # -X face (West)
    [(0, 0, 1), (0, 1, 1), (0, 1, 0), (0, 0, 0)],
    # +Y face (Top)
    [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    # -Y face (Bottom)
    [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)],
    # +Z face (South)
    [(1, 0, 1), (1, 1, 1), (0, 1, 1), (0, 0, 1)],
    # -Z face (North)
    [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)],
]

# UV coordinates for each vertex (standard quad mapping)
FACE_UVS = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)]

# Triangle indices for a quad (two triangles, CCW winding)
QUAD_INDICES = [0, 1, 2, 0, 2, 3]

# AO curve (brightness levels based on occlusion)
AO_CURVE = [0.4, 0.6, 0.8, 1.0]


def build_chunk_mesh_data(
    chunk_x: int,
    chunk_z: int,
    blocks: np.ndarray,
    neighbors: Dict[str, Optional[np.ndarray]],
    block_info: Dict[int, Dict],
    chunk_size: Tuple[int, int, int],
    num_tiles: int = 17
) -> Dict[str, Any]:
    """
    Build mesh data for a chunk.

    This is the CPU-intensive work that runs in worker processes.

    @param chunk_x: Chunk X coordinate.
    @param chunk_z: Chunk Z coordinate.
    @param blocks: 3D numpy array of block IDs (X, Y, Z layout).
    @param neighbors: Dict of neighboring chunk block arrays.
    @param block_info: Block type information (tiles, transparency, etc).
    @param chunk_size: (width, height, depth) of chunks.
    @param num_tiles: Number of tiles in texture atlas.
    @returns: Dict containing numpy arrays for mesh data.
    """
    CHUNK_WIDTH, CHUNK_HEIGHT, CHUNK_DEPTH = chunk_size
    TILE_UV_WIDTH = 1.0 / num_tiles

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

    base_x = chunk_x * CHUNK_WIDTH
    base_z = chunk_z * CHUNK_DEPTH

    def get_block(lx: int, ly: int, lz: int) -> int:
        """Get block at local coords, checking neighbors if out of bounds."""
        if 0 <= ly < CHUNK_HEIGHT:
            if 0 <= lx < CHUNK_WIDTH and 0 <= lz < CHUNK_DEPTH:
                return int(blocks[lx, ly, lz])

            # Check neighbor chunks
            if lx < 0:
                neighbor = neighbors.get('west')
                if neighbor is not None:
                    return int(neighbor[CHUNK_WIDTH + lx, ly, lz])
            elif lx >= CHUNK_WIDTH:
                neighbor = neighbors.get('east')
                if neighbor is not None:
                    return int(neighbor[lx - CHUNK_WIDTH, ly, lz])

            if lz < 0:
                neighbor = neighbors.get('north')
                if neighbor is not None:
                    return int(neighbor[lx, ly, CHUNK_DEPTH + lz])
            elif lz >= CHUNK_DEPTH:
                neighbor = neighbors.get('south')
                if neighbor is not None:
                    return int(neighbor[lx, ly, lz - CHUNK_DEPTH])

        # Out of bounds or no neighbor - treat as air
        return 0

    def is_transparent(block_id: int) -> bool:
        """Check if block is transparent (air, water, leaves, etc.)."""
        if block_id == 0:  # Air
            return True
        info = block_info.get(block_id, {})
        return info.get('transparent', False)

    def should_render_face(block_id: int, neighbor_id: int) -> bool:
        """Check if face should be rendered based on neighbor."""
        if neighbor_id == 0:  # Air neighbor
            return True

        neighbor_transparent = is_transparent(neighbor_id)
        block_transparent = is_transparent(block_id)

        if not neighbor_transparent:
            return False  # Solid neighbor blocks face

        # Transparent block rules
        if block_transparent:
            # Transparent blocks only render against different block types
            return block_id != neighbor_id

        return True  # Opaque block against transparent neighbor

    def get_tile_index(block_id: int, face_index: int) -> int:
        """Get texture tile index for a block face."""
        info = block_info.get(block_id, {})
        tiles = info.get('tiles', {})

        # Try face-specific tile first
        face_names = ['east', 'west', 'up', 'down', 'south', 'north']
        face_name = face_names[face_index]

        if face_name in tiles:
            return tiles[face_name]
        elif 'all' in tiles:
            return tiles['all']
        elif 'side' in tiles and face_name in ('east', 'west', 'north', 'south'):
            return tiles['side']
        elif 'top' in tiles and face_name == 'up':
            return tiles['top']
        elif 'bottom' in tiles and face_name == 'down':
            return tiles['bottom']

        return 0  # Default tile

    def calculate_ao(lx: int, ly: int, lz: int, face_index: int, corner: int) -> float:
        """
        Calculate ambient occlusion for a vertex.

        Simplified AO - counts solid neighbors around vertex.
        """
        # Get the direction we're facing
        dx, dy, dz = FACE_DIRECTIONS[face_index]

        # Get corner position relative to block
        vx, vy, vz = FACE_VERTICES[face_index][corner]

        # Calculate the 3 neighbor positions to check for AO
        # These are the blocks that could occlude this corner
        neighbors_to_check = []

        if face_index == 2:  # Up (+Y)
            if corner == 0:
                neighbors_to_check = [(lx-1, ly+1, lz), (lx-1, ly+1, lz-1), (lx, ly+1, lz-1)]
            elif corner == 1:
                neighbors_to_check = [(lx-1, ly+1, lz), (lx-1, ly+1, lz+1), (lx, ly+1, lz+1)]
            elif corner == 2:
                neighbors_to_check = [(lx+1, ly+1, lz), (lx+1, ly+1, lz+1), (lx, ly+1, lz+1)]
            elif corner == 3:
                neighbors_to_check = [(lx+1, ly+1, lz), (lx+1, ly+1, lz-1), (lx, ly+1, lz-1)]
        elif face_index == 3:  # Down (-Y)
            if corner == 0:
                neighbors_to_check = [(lx-1, ly-1, lz), (lx-1, ly-1, lz+1), (lx, ly-1, lz+1)]
            elif corner == 1:
                neighbors_to_check = [(lx-1, ly-1, lz), (lx-1, ly-1, lz-1), (lx, ly-1, lz-1)]
            elif corner == 2:
                neighbors_to_check = [(lx+1, ly-1, lz), (lx+1, ly-1, lz-1), (lx, ly-1, lz-1)]
            elif corner == 3:
                neighbors_to_check = [(lx+1, ly-1, lz), (lx+1, ly-1, lz+1), (lx, ly-1, lz+1)]
        else:
            # Simplified: for side faces, return default AO
            return 1.0

        # Count solid neighbors
        solid_count = 0
        for nx, ny, nz in neighbors_to_check:
            neighbor_block = get_block(nx, ny, nz)
            if neighbor_block != 0 and not is_transparent(neighbor_block):
                solid_count += 1

        # Map to AO curve
        ao_level = 3 - min(solid_count, 3)
        return AO_CURVE[ao_level]

    def add_face(lx: int, ly: int, lz: int, block_id: int, face_index: int) -> None:
        """Add a face to the mesh."""
        nonlocal opaque_vertex_count, trans_vertex_count

        block_transparent = is_transparent(block_id)

        # Select target arrays
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

        # Get face data
        normal = FACE_NORMALS[face_index]
        vertices = FACE_VERTICES[face_index]
        tile_index = get_tile_index(block_id, face_index)
        tile_u_start = tile_index * TILE_UV_WIDTH

        # World position offset
        gx = base_x + lx
        gz = base_z + lz

        # Add 4 vertices
        for i in range(4):
            vx, vy, vz = vertices[i]

            # Position
            pos_list.extend([gx + vx, ly + vy, gz + vz])

            # Normal
            norm_list.extend(normal)

            # UV
            u = tile_u_start + FACE_UVS[i][0] * TILE_UV_WIDTH
            v = FACE_UVS[i][1]
            uv_list.extend([u, v])

            # AO-based vertex color
            ao = calculate_ao(lx, ly, lz, face_index, i)
            color_list.extend([ao, ao, ao])

        # Add 2 triangles (6 indices)
        for idx_offset in QUAD_INDICES:
            idx_list.append(vertex_base + idx_offset)

    # Main meshing loop
    for ly in range(CHUNK_HEIGHT):
        for lz in range(CHUNK_DEPTH):
            for lx in range(CHUNK_WIDTH):
                block_id = int(blocks[lx, ly, lz])

                if block_id == 0:  # Skip air
                    continue

                # Check each face
                for face_index in range(6):
                    dx, dy, dz = FACE_DIRECTIONS[face_index]
                    neighbor_id = get_block(lx + dx, ly + dy, lz + dz)

                    if should_render_face(block_id, neighbor_id):
                        add_face(lx, ly, lz, block_id, face_index)

    # Convert to numpy arrays
    result = {
        'chunk_x': chunk_x,
        'chunk_z': chunk_z,
        'opaque_vertex_count': opaque_vertex_count,
        'trans_vertex_count': trans_vertex_count,
    }

    if opaque_pos:
        result['opaque_positions'] = np.array(opaque_pos, dtype=np.float32)
        result['opaque_normals'] = np.array(opaque_norm, dtype=np.float32)
        result['opaque_uvs'] = np.array(opaque_uv, dtype=np.float32)
        result['opaque_colors'] = np.array(opaque_color, dtype=np.float32)
        result['opaque_indices'] = np.array(opaque_idx, dtype=np.uint32)
    else:
        result['opaque_positions'] = np.array([], dtype=np.float32)
        result['opaque_normals'] = np.array([], dtype=np.float32)
        result['opaque_uvs'] = np.array([], dtype=np.float32)
        result['opaque_colors'] = np.array([], dtype=np.float32)
        result['opaque_indices'] = np.array([], dtype=np.uint32)

    if trans_pos:
        result['trans_positions'] = np.array(trans_pos, dtype=np.float32)
        result['trans_normals'] = np.array(trans_norm, dtype=np.float32)
        result['trans_uvs'] = np.array(trans_uv, dtype=np.float32)
        result['trans_colors'] = np.array(trans_color, dtype=np.float32)
        result['trans_indices'] = np.array(trans_idx, dtype=np.uint32)
    else:
        result['trans_positions'] = np.array([], dtype=np.float32)
        result['trans_normals'] = np.array([], dtype=np.float32)
        result['trans_uvs'] = np.array([], dtype=np.float32)
        result['trans_colors'] = np.array([], dtype=np.float32)
        result['trans_indices'] = np.array([], dtype=np.uint32)

    return result


def chunk_builder_worker(
    worker_id: int,
    task_queue: Queue,
    result_queue: Queue,
    block_info: Dict[int, Dict],
    chunk_size: Tuple[int, int, int],
    num_tiles: int = 17
) -> None:
    """
    Worker process main function.

    Continuously processes chunk build requests from task_queue,
    sends results to result_queue.

    @param worker_id: Unique ID for this worker.
    @param task_queue: Queue to receive build tasks.
    @param result_queue: Queue to send completed meshes.
    @param block_info: Block type information dict.
    @param chunk_size: (width, height, depth) of chunks.
    @param num_tiles: Number of tiles in texture atlas.
    """
    print(f"[ChunkWorker {worker_id}] Started")

    while True:
        try:
            # Get next task (blocks until available)
            task = task_queue.get()

            if task is None or task.get('type') == MSG_SHUTDOWN:
                print(f"[ChunkWorker {worker_id}] Shutting down")
                break

            if task.get('type') != MSG_BUILD_CHUNK:
                continue

            chunk_x = task['chunk_x']
            chunk_z = task['chunk_z']
            blocks = task['blocks']
            neighbors = task.get('neighbors', {})

            start_time = time.perf_counter()

            # Build the mesh
            mesh_data = build_chunk_mesh_data(
                chunk_x, chunk_z, blocks, neighbors,
                block_info, chunk_size, num_tiles
            )

            elapsed_ms = (time.perf_counter() - start_time) * 1000

            # Send result back
            result_queue.put({
                'type': MSG_RESULT,
                'chunk_x': chunk_x,
                'chunk_z': chunk_z,
                'mesh_data': mesh_data,
                'build_time_ms': elapsed_ms,
                'worker_id': worker_id,
            })

        except Exception as e:
            # Send error back
            result_queue.put({
                'type': MSG_ERROR,
                'chunk_x': task.get('chunk_x', 0) if task else 0,
                'chunk_z': task.get('chunk_z', 0) if task else 0,
                'error': str(e),
                'traceback': traceback.format_exc(),
                'worker_id': worker_id,
            })

    print(f"[ChunkWorker {worker_id}] Exited")
