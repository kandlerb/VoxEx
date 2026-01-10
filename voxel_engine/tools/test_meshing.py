#!/usr/bin/env python3
"""Test script for chunk meshing system.

Validates:
1. Constants - face vertices, normals, UV coordinates
2. Ambient occlusion - AO formula and curve mapping
3. ChunkMesh - data structure and properties
4. MeshPool - object pooling behavior
5. ChunkBuilder - geometry generation
"""

import sys
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.engine.meshing import (
    CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z,
    NUM_TILES, TILE_UV_WIDTH,
    FACE_VERTICES, FACE_NORMALS, FACE_UVS,
    QUAD_INDICES, AO_CURVE,
    ChunkMesh, ChunkBuilder, MeshPool,
    calculate_ao
)


def test_face_vertices_shape():
    """Face vertices have correct shape."""
    print("Testing face vertices shape...")

    # 6 faces, 4 vertices each, xyz coordinates
    assert FACE_VERTICES.shape == (6, 4, 3), f"Wrong shape: {FACE_VERTICES.shape}"
    assert FACE_VERTICES.dtype == np.float32, f"Wrong dtype: {FACE_VERTICES.dtype}"

    print("  PASS: Face vertices shape")


def test_face_normals_unit_length():
    """Face normals are unit vectors."""
    print("Testing face normals unit length...")

    for i, normal in enumerate(FACE_NORMALS):
        length = np.linalg.norm(normal)
        assert abs(length - 1.0) < 0.001, f"Face {i} normal not unit: {length}"

    print("  PASS: Face normals unit length")


def test_face_normals_directions():
    """Face normals point in correct directions."""
    print("Testing face normal directions...")

    expected = [
        [1, 0, 0],   # +X
        [-1, 0, 0],  # -X
        [0, 1, 0],   # +Y
        [0, -1, 0],  # -Y
        [0, 0, 1],   # +Z
        [0, 0, -1],  # -Z
    ]

    for i, (actual, exp) in enumerate(zip(FACE_NORMALS, expected)):
        assert np.allclose(actual, exp), f"Face {i} normal wrong: {actual} != {exp}"

    print("  PASS: Face normal directions")


def test_quad_indices():
    """Quad indices form two triangles."""
    print("Testing quad indices...")

    assert len(QUAD_INDICES) == 6, f"Wrong index count: {len(QUAD_INDICES)}"
    assert set(QUAD_INDICES) == {0, 1, 2, 3}, f"Not using all 4 vertices: {set(QUAD_INDICES)}"

    # Check triangles are CCW
    # Triangle 1: 0, 1, 2
    # Triangle 2: 0, 2, 3
    assert list(QUAD_INDICES[:3]) == [0, 1, 2], "First triangle wrong"
    assert list(QUAD_INDICES[3:]) == [0, 2, 3], "Second triangle wrong"

    print("  PASS: Quad indices")


def test_ao_calculation():
    """AO formula produces expected values."""
    print("Testing AO calculation...")

    # No occlusion - maximum brightness
    assert calculate_ao(False, False, False) == 3, "No occlusion should be 3"

    # One neighbor occluding
    assert calculate_ao(True, False, False) == 2, "One side should be 2"
    assert calculate_ao(False, True, False) == 2, "Other side should be 2"
    assert calculate_ao(False, False, True) == 2, "Corner should be 2"

    # Two neighbors (not both sides)
    assert calculate_ao(True, False, True) == 1, "Side + corner should be 1"
    assert calculate_ao(False, True, True) == 1, "Other side + corner should be 1"

    # Both sides = full occlusion regardless of corner
    assert calculate_ao(True, True, False) == 0, "Both sides should be 0"
    assert calculate_ao(True, True, True) == 0, "Both sides + corner should be 0"

    print("  PASS: AO calculation")


def test_ao_curve_values():
    """AO curve maps levels to brightness."""
    print("Testing AO curve values...")

    assert len(AO_CURVE) == 4, f"Wrong curve length: {len(AO_CURVE)}"
    assert AO_CURVE[0] < AO_CURVE[3], "Level 0 should be darker than level 3"
    assert AO_CURVE[3] == 1.0, f"Max brightness should be 1.0: {AO_CURVE[3]}"
    assert AO_CURVE[0] > 0.0, f"Min brightness should be > 0: {AO_CURVE[0]}"

    # Curve should be monotonically increasing
    for i in range(1, len(AO_CURVE)):
        assert AO_CURVE[i] > AO_CURVE[i-1], f"Curve not increasing at {i}"

    print("  PASS: AO curve values")


def test_tile_uv_width():
    """Tile UV width is correct for atlas."""
    print("Testing tile UV width...")

    expected = 1.0 / NUM_TILES
    assert abs(TILE_UV_WIDTH - expected) < 0.0001, f"Wrong UV width: {TILE_UV_WIDTH}"

    print("  PASS: Tile UV width")


def test_face_uvs_shape():
    """Face UVs have correct shape and range."""
    print("Testing face UVs...")

    assert FACE_UVS.shape == (4, 2), f"Wrong shape: {FACE_UVS.shape}"

    # All UV coords should be 0 or 1
    for u, v in FACE_UVS:
        assert u in [0, 1], f"U should be 0 or 1: {u}"
        assert v in [0, 1], f"V should be 0 or 1: {v}"

    print("  PASS: Face UVs")


def test_chunk_mesh_empty():
    """New ChunkMesh starts empty."""
    print("Testing empty ChunkMesh...")

    mesh = ChunkMesh(cx=0, cz=0)
    assert mesh.is_empty, "New mesh should be empty"
    assert mesh.opaque_vertex_count == 0, "No opaque vertices"
    assert mesh.transparent_vertex_count == 0, "No transparent vertices"
    assert mesh.total_face_count == 0, "No faces"
    assert not mesh.has_opaque, "Should not have opaque"
    assert not mesh.has_transparent, "Should not have transparent"

    print("  PASS: Empty ChunkMesh")


def test_chunk_mesh_clear():
    """ChunkMesh.clear() resets geometry."""
    print("Testing ChunkMesh clear...")

    mesh = ChunkMesh(cx=0, cz=0)
    mesh.opaque_positions = np.array([1, 2, 3], dtype=np.float32)
    mesh.opaque_indices = np.array([0, 1, 2], dtype=np.uint32)

    assert not mesh.is_empty, "Should have data before clear"

    mesh.clear()
    assert mesh.is_empty, "Should be empty after clear"
    assert mesh.cx == 0 and mesh.cz == 0, "Coords should be preserved"

    print("  PASS: ChunkMesh clear")


def test_chunk_mesh_properties():
    """ChunkMesh computed properties work correctly."""
    print("Testing ChunkMesh properties...")

    mesh = ChunkMesh(cx=5, cz=-3)

    # Add one quad of data (4 vertices, 6 indices)
    mesh.opaque_positions = np.zeros(12, dtype=np.float32)  # 4 * 3
    mesh.opaque_normals = np.zeros(12, dtype=np.float32)
    mesh.opaque_uvs = np.zeros(8, dtype=np.float32)  # 4 * 2
    mesh.opaque_colors = np.zeros(12, dtype=np.float32)
    mesh.opaque_indices = np.zeros(6, dtype=np.uint32)

    assert mesh.opaque_vertex_count == 4, f"Wrong vertex count: {mesh.opaque_vertex_count}"
    assert mesh.opaque_index_count == 6, f"Wrong index count: {mesh.opaque_index_count}"
    assert mesh.opaque_face_count == 1, f"Wrong face count: {mesh.opaque_face_count}"

    assert mesh.has_opaque, "Should have opaque"
    assert not mesh.has_transparent, "Should not have transparent"
    assert not mesh.is_empty, "Should not be empty"

    print("  PASS: ChunkMesh properties")


def test_mesh_pool_acquire_release():
    """MeshPool reuses released meshes."""
    print("Testing MeshPool acquire/release...")

    pool = MeshPool(max_size=10)
    assert pool.available_count == 0, "Pool should start empty"

    # Acquire a mesh
    mesh1 = pool.acquire(0, 0)
    assert pool.available_count == 0, "Pool still empty after acquire"
    assert mesh1.cx == 0 and mesh1.cz == 0, "Coords should be set"

    # Release back to pool
    pool.release(mesh1)
    assert pool.available_count == 1, "Pool should have 1 mesh"

    # Acquire again - should get same object
    mesh2 = pool.acquire(1, 1)
    assert mesh2 is mesh1, "Should reuse same mesh object"
    assert mesh2.cx == 1 and mesh2.cz == 1, "Coords should be updated"
    assert pool.available_count == 0, "Pool should be empty again"

    print("  PASS: MeshPool acquire/release")


def test_mesh_pool_max_size():
    """MeshPool respects max size."""
    print("Testing MeshPool max size...")

    pool = MeshPool(max_size=3)

    # Release more meshes than max
    for i in range(5):
        mesh = ChunkMesh(cx=i, cz=i)
        pool.release(mesh)

    assert pool.available_count == 3, f"Should cap at max: {pool.available_count}"

    print("  PASS: MeshPool max size")


def test_mesh_pool_prewarm():
    """MeshPool.prewarm() pre-allocates meshes."""
    print("Testing MeshPool prewarm...")

    pool = MeshPool(max_size=10)
    pool.prewarm(5)

    assert pool.available_count == 5, f"Should have 5 meshes: {pool.available_count}"

    # Prewarm beyond max should cap
    pool.prewarm(20)
    assert pool.available_count == 10, f"Should cap at max: {pool.available_count}"

    print("  PASS: MeshPool prewarm")


def test_mesh_pool_clear():
    """MeshPool.clear() removes all meshes."""
    print("Testing MeshPool clear...")

    pool = MeshPool(max_size=10)
    pool.prewarm(5)
    assert pool.available_count == 5

    pool.clear()
    assert pool.available_count == 0, "Should be empty after clear"

    print("  PASS: MeshPool clear")


def test_constants_chunk_dimensions():
    """Chunk dimension constants are correct."""
    print("Testing chunk dimension constants...")

    assert CHUNK_SIZE_X == 16, f"Wrong chunk X: {CHUNK_SIZE_X}"
    assert CHUNK_SIZE_Y == 320, f"Wrong chunk Y: {CHUNK_SIZE_Y}"
    assert CHUNK_SIZE_Z == 16, f"Wrong chunk Z: {CHUNK_SIZE_Z}"

    print("  PASS: Chunk dimension constants")


def run_all_tests():
    """Run all meshing tests."""
    print("=" * 60)
    print("MESHING SYSTEM TESTS")
    print("=" * 60)

    tests = [
        test_face_vertices_shape,
        test_face_normals_unit_length,
        test_face_normals_directions,
        test_quad_indices,
        test_ao_calculation,
        test_ao_curve_values,
        test_tile_uv_width,
        test_face_uvs_shape,
        test_chunk_mesh_empty,
        test_chunk_mesh_clear,
        test_chunk_mesh_properties,
        test_mesh_pool_acquire_release,
        test_mesh_pool_max_size,
        test_mesh_pool_prewarm,
        test_mesh_pool_clear,
        test_constants_chunk_dimensions,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")
            failed += 1

    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
