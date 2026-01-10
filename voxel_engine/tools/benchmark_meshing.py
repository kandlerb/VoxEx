#!/usr/bin/env python3
"""Benchmark chunk meshing performance.

Measures time to mesh generated terrain chunks and reports statistics
on vertex/index counts, memory usage, and per-chunk timing.

Run with:
    python -m voxel_engine.tools.benchmark_meshing
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.engine.registry import Registry
from voxel_engine.engine.state import WorldState
from voxel_engine.engine.meshing import ChunkBuilder, MeshPool
from voxel_engine.systems.world.generation_system import TerrainGenerator


# =============================================================================
# PATH SETUP
# =============================================================================

VOXEL_ENGINE_DIR = Path(__file__).parent.parent
CONTENT_PATH = VOXEL_ENGINE_DIR / "content"
CONFIG_PATH = VOXEL_ENGINE_DIR / "config"


def init_registry():
    """Initialize registry with content and config."""
    Registry.reset()
    Registry.initialize(CONTENT_PATH, CONFIG_PATH)
    print(f"Registry initialized: {Registry.block_count()} blocks, "
          f"{Registry.biome_count()} biomes")


def benchmark_chunk_meshing(num_chunks: int = 25, seed: int = 42):
    """
    Measure time to mesh generated terrain.

    Args:
        num_chunks: Number of chunks to test (square grid).
        seed: World generation seed.
    """
    print(f"\n{'='*60}")
    print(f"MESHING BENCHMARK - {num_chunks} chunks, seed={seed}")
    print(f"{'='*60}")

    # Initialize
    init_registry()

    world = WorldState(seed=seed)

    # Get biomes and blocks from Registry for TerrainGenerator
    biomes = {name: Registry.get_biome(name) for name in Registry.biome_names()}
    blocks = {i: Registry.get_block(i) for i in range(Registry.block_count())}
    blocks = {k: v for k, v in blocks.items() if v is not None}

    generator = TerrainGenerator(biomes=biomes, blocks=blocks, seed=seed)
    builder = ChunkBuilder(world)

    # Generate grid of chunks
    side = int(num_chunks ** 0.5)
    chunks_to_test = [(x, z) for x in range(-side//2, side//2 + 1)
                      for z in range(-side//2, side//2 + 1)]
    chunks_to_test = chunks_to_test[:num_chunks]

    # Phase 1: Generate terrain
    print(f"\nGenerating {len(chunks_to_test)} chunks...")
    gen_start = time.perf_counter()
    for cx, cz in chunks_to_test:
        chunk = generator.generate_chunk(cx, cz)
        world.set_chunk(cx, cz, chunk)
    gen_elapsed = time.perf_counter() - gen_start
    print(f"  Generation time: {gen_elapsed*1000:.1f}ms "
          f"({gen_elapsed/len(chunks_to_test)*1000:.1f}ms per chunk)")

    # Phase 2: Mesh all chunks
    print(f"\nMeshing {len(chunks_to_test)} chunks...")

    total_opaque_verts = 0
    total_opaque_indices = 0
    total_trans_verts = 0
    total_trans_indices = 0
    total_memory = 0
    mesh_times = []

    mesh_start = time.perf_counter()
    for cx, cz in chunks_to_test:
        t0 = time.perf_counter()
        mesh = builder.build(cx, cz)
        t1 = time.perf_counter()
        mesh_times.append((t1 - t0) * 1000)

        total_opaque_verts += mesh.opaque_vertex_count
        total_opaque_indices += mesh.opaque_index_count
        total_trans_verts += mesh.transparent_vertex_count
        total_trans_indices += mesh.transparent_index_count
        total_memory += mesh.memory_bytes
    mesh_elapsed = time.perf_counter() - mesh_start

    # Statistics
    avg_time = sum(mesh_times) / len(mesh_times)
    min_time = min(mesh_times)
    max_time = max(mesh_times)

    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}")
    print(f"Total meshing time:     {mesh_elapsed*1000:.1f}ms")
    print(f"Per-chunk average:      {avg_time:.2f}ms")
    print(f"Per-chunk min/max:      {min_time:.2f}ms / {max_time:.2f}ms")
    print(f"\nOpaque geometry:")
    print(f"  Vertices:             {total_opaque_verts:,}")
    print(f"  Indices:              {total_opaque_indices:,}")
    print(f"  Faces:                {total_opaque_indices // 6:,}")
    print(f"\nTransparent geometry:")
    print(f"  Vertices:             {total_trans_verts:,}")
    print(f"  Indices:              {total_trans_indices:,}")
    print(f"  Faces:                {total_trans_indices // 6:,}")
    print(f"\nTotal memory:           {total_memory / 1024 / 1024:.2f} MB")
    print(f"Memory per chunk:       {total_memory / len(chunks_to_test) / 1024:.1f} KB")
    print(f"{'='*60}")

    # Performance target check
    target_ms = 50.0
    if avg_time < target_ms:
        print(f"\n[PASS] Average {avg_time:.2f}ms < {target_ms}ms target")
    else:
        print(f"\n[WARN] Average {avg_time:.2f}ms >= {target_ms}ms target")


def benchmark_mesh_pool():
    """Benchmark mesh pool allocation vs. direct creation."""
    print(f"\n{'='*60}")
    print("MESH POOL BENCHMARK")
    print(f"{'='*60}")

    iterations = 1000

    # Direct allocation
    from voxel_engine.engine.meshing import ChunkMesh
    start = time.perf_counter()
    for i in range(iterations):
        mesh = ChunkMesh(cx=i % 100, cz=i // 100)
    direct_time = time.perf_counter() - start

    # Pooled allocation
    pool = MeshPool(max_size=50)
    pool.prewarm(50)

    start = time.perf_counter()
    for i in range(iterations):
        mesh = pool.acquire(i % 100, i // 100)
        pool.release(mesh)
    pool_time = time.perf_counter() - start

    print(f"Direct allocation ({iterations}x): {direct_time*1000:.2f}ms")
    print(f"Pooled allocation ({iterations}x): {pool_time*1000:.2f}ms")
    print(f"Speedup: {direct_time/pool_time:.1f}x")


def benchmark_single_block():
    """Benchmark meshing a chunk with just one block."""
    print(f"\n{'='*60}")
    print("SINGLE BLOCK BENCHMARK")
    print(f"{'='*60}")

    init_registry()

    world = WorldState(seed=12345)
    builder = ChunkBuilder(world)

    # Create chunk with one block
    from voxel_engine.world.chunk import Chunk
    chunk = Chunk(0, 0)
    chunk.set_block(8, 64, 8, 1)  # Grass at center
    world.set_chunk(0, 0, chunk)

    # Mesh it
    mesh = builder.build(0, 0)

    print(f"Block: Grass (ID 1) at (8, 64, 8)")
    print(f"Expected: 6 faces exposed (surrounded by air)")
    print(f"Result:")
    print(f"  Opaque vertices:  {mesh.opaque_vertex_count} (expected 24 = 6 faces * 4 verts)")
    print(f"  Opaque indices:   {mesh.opaque_index_count} (expected 36 = 6 faces * 6 indices)")
    print(f"  Opaque faces:     {mesh.opaque_face_count} (expected 6)")
    print(f"  Transparent:      {mesh.transparent_face_count} (expected 0)")

    # Verify
    assert mesh.opaque_vertex_count == 24, f"Expected 24 vertices, got {mesh.opaque_vertex_count}"
    assert mesh.opaque_index_count == 36, f"Expected 36 indices, got {mesh.opaque_index_count}"
    assert mesh.transparent_face_count == 0, f"Expected 0 transparent faces"

    print("\n[PASS] Single block mesh verified")


def run_all_benchmarks():
    """Run all benchmarks."""
    try:
        benchmark_single_block()
        benchmark_mesh_pool()
        benchmark_chunk_meshing(num_chunks=25, seed=42)
    except Exception as e:
        print(f"\n[ERROR] Benchmark failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    return True


if __name__ == "__main__":
    success = run_all_benchmarks()
    sys.exit(0 if success else 1)
