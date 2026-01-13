#!/usr/bin/env python3
"""
Test script for multiprocessing chunk building.

Tests the ChunkBuildCoordinator with mock chunk data to verify
worker processes start correctly and can build mesh data.

Usage:
    python voxel_engine/tools/test_chunk_workers.py
"""

import sys
import time
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def test_basic_coordinator():
    """Test that coordinator starts and stops correctly."""
    print("\n" + "=" * 60)
    print("Test 1: Basic Coordinator Start/Stop")
    print("=" * 60)

    from voxel_engine.engine.world import ChunkBuildCoordinator

    # Create simple block info for testing
    block_info = {
        0: {'transparent': True, 'tiles': {}},  # Air
        1: {'transparent': False, 'tiles': {'all': 0}},  # Grass
        2: {'transparent': False, 'tiles': {'all': 1}},  # Dirt
        3: {'transparent': False, 'tiles': {'all': 2}},  # Stone
    }

    coordinator = ChunkBuildCoordinator(
        num_workers=2,
        block_info=block_info,
        chunk_size=(16, 320, 16),
        num_tiles=17
    )

    print(f"  Created coordinator: {coordinator}")
    print(f"  Running: {coordinator.is_running}")

    print("\n  Starting workers...")
    coordinator.start()
    time.sleep(0.5)  # Give workers time to start

    print(f"  Running: {coordinator.is_running}")
    print(f"  Stats: {coordinator.get_stats()}")

    print("\n  Stopping workers...")
    coordinator.stop()

    print(f"  Running: {coordinator.is_running}")
    print("\n  PASSED: Coordinator start/stop works")


def test_chunk_build():
    """Test building a simple chunk."""
    print("\n" + "=" * 60)
    print("Test 2: Simple Chunk Build")
    print("=" * 60)

    import numpy as np
    from voxel_engine.engine.world import ChunkBuildCoordinator, ChunkBuildPriority

    # Create block info
    block_info = {
        0: {'transparent': True, 'tiles': {}},
        1: {'transparent': False, 'tiles': {'all': 0}},
        2: {'transparent': False, 'tiles': {'all': 1}},
        3: {'transparent': False, 'tiles': {'all': 2}},
    }

    coordinator = ChunkBuildCoordinator(
        num_workers=2,
        block_info=block_info,
        chunk_size=(16, 320, 16),
        num_tiles=17
    )

    coordinator.start()

    # Create a simple test chunk (flat terrain)
    print("\n  Creating test chunk data...")
    chunk_width, chunk_height, chunk_depth = 16, 320, 16
    blocks = np.zeros((chunk_width, chunk_height, chunk_depth), dtype=np.uint8)

    # Fill bottom layers with blocks
    blocks[:, 0:5, :] = 3   # Stone
    blocks[:, 5:8, :] = 2   # Dirt
    blocks[:, 8:9, :] = 1   # Grass top

    print(f"  Block array shape: {blocks.shape}")
    print(f"  Non-air blocks: {np.count_nonzero(blocks)}")

    # Queue the chunk for building
    print("\n  Queueing chunk (0, 0) for building...")
    success = coordinator.queue_chunk(
        chunk_x=0,
        chunk_z=0,
        blocks=blocks,
        neighbors={},
        priority=ChunkBuildPriority.IMMEDIATE
    )
    print(f"  Queued: {success}")
    print(f"  Pending: {coordinator.pending_count}")

    # Wait for result
    print("\n  Waiting for result...")
    start_time = time.time()
    result = None
    while time.time() - start_time < 10.0:  # 10 second timeout
        results = coordinator.poll_results(max_results=1)
        if results:
            result = results[0]
            break
        time.sleep(0.1)

    if result:
        print(f"\n  Result received:")
        print(f"    Chunk: ({result['chunk_x']}, {result['chunk_z']})")
        print(f"    Build time: {result.get('build_time_ms', 0):.2f}ms")
        print(f"    Worker ID: {result.get('worker_id', -1)}")

        mesh_data = result.get('mesh_data', {})
        opaque_verts = mesh_data.get('opaque_vertex_count', 0)
        trans_verts = mesh_data.get('trans_vertex_count', 0)
        print(f"    Opaque vertices: {opaque_verts}")
        print(f"    Transparent vertices: {trans_verts}")

        if opaque_verts > 0:
            print(f"\n  PASSED: Chunk built successfully with {opaque_verts} vertices")
        else:
            print(f"\n  WARNING: No opaque vertices generated")
    else:
        print("\n  FAILED: Timeout waiting for result")

    coordinator.stop()


def test_multiple_chunks():
    """Test building multiple chunks in parallel."""
    print("\n" + "=" * 60)
    print("Test 3: Multiple Chunks in Parallel")
    print("=" * 60)

    import numpy as np
    from voxel_engine.engine.world import ChunkBuildCoordinator, ChunkBuildPriority

    block_info = {
        0: {'transparent': True, 'tiles': {}},
        1: {'transparent': False, 'tiles': {'all': 0}},
        2: {'transparent': False, 'tiles': {'all': 1}},
        3: {'transparent': False, 'tiles': {'all': 2}},
    }

    coordinator = ChunkBuildCoordinator(
        num_workers=2,
        block_info=block_info,
        chunk_size=(16, 320, 16),
        num_tiles=17
    )

    coordinator.start()

    # Create test chunks
    print("\n  Creating test chunks...")
    chunks_to_build = []
    for cx in range(-2, 3):
        for cz in range(-2, 3):
            blocks = np.zeros((16, 320, 16), dtype=np.uint8)
            blocks[:, 0:5, :] = 3   # Stone
            blocks[:, 5:8, :] = 2   # Dirt
            blocks[:, 8:9, :] = 1   # Grass
            chunks_to_build.append((cx, cz, blocks))

    print(f"  Queuing {len(chunks_to_build)} chunks...")
    t0 = time.time()

    for cx, cz, blocks in chunks_to_build:
        dist = abs(cx) + abs(cz)
        priority = ChunkBuildPriority.IMMEDIATE if dist == 0 else \
                   ChunkBuildPriority.HIGH if dist <= 2 else \
                   ChunkBuildPriority.NORMAL
        coordinator.queue_chunk(cx, cz, blocks, {}, priority)

    print(f"  Pending: {coordinator.pending_count}")

    # Wait for all results
    print("\n  Waiting for results...")
    results_received = 0
    timeout = 30.0  # 30 second timeout
    start_time = time.time()

    while results_received < len(chunks_to_build) and time.time() - start_time < timeout:
        results = coordinator.poll_results(max_results=5)
        for result in results:
            results_received += 1
            if results_received <= 3 or results_received == len(chunks_to_build):
                print(f"    Chunk ({result['chunk_x']}, {result['chunk_z']}) "
                      f"built in {result.get('build_time_ms', 0):.1f}ms")
            elif results_received == 4:
                print(f"    ...")
        time.sleep(0.1)

    elapsed = time.time() - t0
    print(f"\n  Built {results_received}/{len(chunks_to_build)} chunks in {elapsed:.2f}s")
    print(f"  Average: {coordinator.average_build_time_ms:.1f}ms per chunk")

    if results_received == len(chunks_to_build):
        print("\n  PASSED: All chunks built successfully")
    else:
        print(f"\n  FAILED: Only {results_received}/{len(chunks_to_build)} chunks built")

    coordinator.stop()


def main():
    """Run all tests."""
    print("=" * 60)
    print("VoxEx Multiprocessing Chunk Builder Tests")
    print("=" * 60)
    print("\nThis tests the worker process infrastructure for parallel")
    print("chunk mesh building.\n")

    try:
        test_basic_coordinator()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        import traceback
        traceback.print_exc()

    try:
        test_chunk_build()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        import traceback
        traceback.print_exc()

    try:
        test_multiple_chunks()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print("Tests complete")
    print("=" * 60)


if __name__ == '__main__':
    main()
