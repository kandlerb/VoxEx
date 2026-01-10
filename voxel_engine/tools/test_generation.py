#!/usr/bin/env python3
"""Test script for terrain generation system.

This script validates that:
1. Registry loads all blocks and biomes correctly
2. Biome selection returns valid biomes from registry
3. Height calculations return reasonable values (0-320)
4. Chunk generation produces terrain with expected structure
5. Generation is deterministic (same seed + coords = same output)

Run with:
    python -m voxel_engine.tools.test_generation
"""

import sys
import random
from pathlib import Path
from collections import Counter

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.engine.registry import Registry
from voxel_engine.systems.world.generation_system import TerrainGenerator
from voxel_engine.world.chunk import Chunk


# =============================================================================
# PATH SETUP
# =============================================================================

# Get paths to content and config directories
VOXEL_ENGINE_DIR = Path(__file__).parent.parent
CONTENT_PATH = VOXEL_ENGINE_DIR / "content"
CONFIG_PATH = VOXEL_ENGINE_DIR / "config"


# =============================================================================
# REGISTRY TESTS
# =============================================================================

def test_registry_initialization():
    """Test that Registry loads all blocks and biomes."""
    print("Testing Registry initialization...")

    # Reset registry if already initialized
    Registry.reset()

    # Initialize registry
    Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    # Check blocks loaded
    block_count = Registry.block_count()
    print(f"  Loaded {block_count} blocks")
    assert block_count == 15, f"Expected 15 blocks, got {block_count}"

    # Check specific blocks exist
    grass = Registry.get_block(1)
    assert grass is not None, "Grass block (ID 1) not found"
    assert grass.get("name") == "Grass", f"Block 1 name mismatch: {grass.get('name')}"

    air = Registry.get_block(0)
    assert air is not None, "Air block (ID 0) not found"
    assert "transparent" in air.get("tags", []), "Air should be transparent"

    water = Registry.get_block(9)
    assert water is not None, "Water block (ID 9) not found"
    assert "fluid" in water.get("tags", []), "Water should have fluid tag"

    # Check biomes loaded
    biome_count = Registry.biome_count()
    print(f"  Loaded {biome_count} biomes")
    assert biome_count == 6, f"Expected 6 biomes, got {biome_count}"

    # Check specific biomes exist
    plains = Registry.get_biome("plains")
    assert plains is not None, "Plains biome not found"
    assert plains.get("weight", 0) == 2, f"Plains weight mismatch: {plains.get('weight')}"

    mountains = Registry.get_biome("mountains")
    assert mountains is not None, "Mountains biome not found"
    assert "mountain" in mountains.get("tags", []), "Mountains should have mountain tag"

    # Check world config
    assert Registry.chunk_size == 16, f"Chunk size mismatch: {Registry.chunk_size}"
    assert Registry.chunk_height == 320, f"Chunk height mismatch: {Registry.chunk_height}"
    assert Registry.sea_level == 60, f"Sea level mismatch: {Registry.sea_level}"

    print("  PASS: Registry initialization")


def test_registry_tag_lookups():
    """Test block tag lookup methods."""
    print("Testing Registry tag lookups...")

    # Solid blocks
    assert Registry.is_solid(1), "Grass should be solid"
    assert Registry.is_solid(2), "Dirt should be solid"
    assert Registry.is_solid(3), "Stone should be solid"
    assert not Registry.is_solid(0), "Air should not be solid"
    assert not Registry.is_solid(9), "Water should not be solid"

    # Transparent blocks
    assert Registry.is_transparent(0), "Air should be transparent"
    assert Registry.is_transparent(9), "Water should be transparent"
    assert Registry.is_transparent(6), "Leaves should be transparent"
    assert not Registry.is_transparent(1), "Grass should not be transparent"

    # Fluid blocks
    assert Registry.is_fluid(9), "Water should be fluid"
    assert not Registry.is_fluid(1), "Grass should not be fluid"
    assert not Registry.is_fluid(0), "Air should not be fluid"

    print("  PASS: Registry tag lookups")


# =============================================================================
# BIOME SELECTION TESTS
# =============================================================================

def test_biome_selection():
    """Test that biome selection returns valid biomes."""
    print("Testing biome selection...")

    # Ensure registry is initialized
    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=12345,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    valid_biomes = set(Registry.biome_names())
    print(f"  Valid biomes: {valid_biomes}")

    # Test many positions
    for _ in range(200):
        gx = random.randint(-10000, 10000)
        gz = random.randint(-10000, 10000)

        biome = generator.get_biome_at(gx, gz)
        biome_name = biome.get("name", "unknown")

        assert biome_name in valid_biomes, \
            f"Invalid biome '{biome_name}' at ({gx}, {gz})"

    print("  PASS: Biome selection returns valid biomes")


def test_biome_distribution():
    """Test biome distribution over a large area."""
    print("Testing biome distribution...")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=42,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    # Sample a 100x100 grid (every 10 blocks)
    biome_counts = Counter()
    sample_size = 100

    for x in range(-sample_size * 5, sample_size * 5, 10):
        for z in range(-sample_size * 5, sample_size * 5, 10):
            biome = generator.get_biome_at(x, z)
            biome_name = biome.get("name", "unknown")
            biome_counts[biome_name] += 1

    print("  Biome distribution:")
    total = sum(biome_counts.values())
    for biome_name, count in sorted(biome_counts.items()):
        pct = count / total * 100
        print(f"    {biome_name}: {count} ({pct:.1f}%)")

    # Verify all biomes appear at least once
    expected_biomes = {"plains", "hills", "forests", "mountains", "swamp", "longwoods"}
    found_biomes = set(biome_counts.keys())

    missing = expected_biomes - found_biomes
    if missing:
        print(f"  WARNING: Missing biomes in sample: {missing}")
    else:
        print("  PASS: All 6 biomes appear in distribution")


# =============================================================================
# HEIGHT CALCULATION TESTS
# =============================================================================

def test_height_calculation():
    """Test that height calculations return reasonable values."""
    print("Testing height calculations...")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=12345,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    min_height = float('inf')
    max_height = float('-inf')
    heights_by_biome = {}

    for _ in range(500):
        gx = random.randint(-5000, 5000)
        gz = random.randint(-5000, 5000)

        biome = generator.get_biome_at(gx, gz)
        biome_name = biome.get("name", "unknown")
        height = generator.get_height_at(gx, gz, biome)

        min_height = min(min_height, height)
        max_height = max(max_height, height)

        if biome_name not in heights_by_biome:
            heights_by_biome[biome_name] = []
        heights_by_biome[biome_name].append(height)

    print(f"  Global height range: [{min_height}, {max_height}]")

    # Heights should be within world bounds
    assert min_height >= 0, f"Height below 0: {min_height}"
    assert max_height < 320, f"Height exceeds world height: {max_height}"

    # Print per-biome stats
    print("  Heights by biome:")
    for biome_name, heights in sorted(heights_by_biome.items()):
        if heights:
            avg = sum(heights) / len(heights)
            h_min, h_max = min(heights), max(heights)
            print(f"    {biome_name}: avg={avg:.1f}, range=[{h_min}, {h_max}]")

    print("  PASS: Height calculations in valid range")


# =============================================================================
# CHUNK GENERATION TESTS
# =============================================================================

def test_chunk_generation():
    """Test that chunk generation produces valid terrain."""
    print("Testing chunk generation...")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=12345,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    # Generate a chunk
    chunk = generator.generate_chunk(0, 0)

    # Verify chunk properties
    assert chunk.cx == 0, "Chunk X coordinate mismatch"
    assert chunk.cz == 0, "Chunk Z coordinate mismatch"
    assert chunk.size == 16, "Chunk size mismatch"
    assert chunk.height == 320, "Chunk height mismatch"

    # Check that bedrock exists at y=0
    for lx in range(16):
        for lz in range(16):
            block = chunk.get_block(lx, 0, lz)
            assert block == generator.BEDROCK, \
                f"Expected bedrock at y=0, got {block} at ({lx}, 0, {lz})"

    # Check that there's air at the top
    air_at_top = True
    for lx in range(16):
        for lz in range(16):
            block = chunk.get_block(lx, 319, lz)
            if block != generator.AIR:
                air_at_top = False
                break

    assert air_at_top, "Expected air at y=319"

    # Count block types
    block_counts = Counter()
    for lx in range(16):
        for ly in range(320):
            for lz in range(16):
                block = chunk.get_block(lx, ly, lz)
                block_name = Registry.get_block_name(block) or f"ID_{block}"
                block_counts[block_name] += 1

    print("  Block distribution in chunk (0, 0):")
    for name, count in sorted(block_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"    {name}: {count}")

    # Verify common terrain blocks exist
    assert block_counts.get("Air", 0) > 0, "No air blocks found"
    assert block_counts.get("Stone", 0) > 0, "No stone blocks found"
    assert block_counts.get("Dirt", 0) > 0, "No dirt blocks found"
    assert block_counts.get("Grass", 0) > 0 or block_counts.get("Sand", 0) > 0, \
        "No surface blocks (grass/sand) found"

    print("  PASS: Chunk generation produces valid terrain")


def test_chunk_memory():
    """Test chunk memory usage."""
    print("Testing chunk memory usage...")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=12345,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    chunk = generator.generate_chunk(0, 0)

    # Expected: 16 * 320 * 16 * 3 bytes = 245,760 bytes per chunk
    # (blocks + sky_light + block_light)
    expected_bytes = 16 * 320 * 16 * 3
    actual_bytes = chunk.memory_bytes

    print(f"  Expected memory: {expected_bytes:,} bytes ({expected_bytes / 1024:.1f} KB)")
    print(f"  Actual memory: {actual_bytes:,} bytes ({actual_bytes / 1024:.1f} KB)")

    assert actual_bytes == expected_bytes, \
        f"Memory mismatch: expected {expected_bytes}, got {actual_bytes}"

    print("  PASS: Chunk memory usage correct")


# =============================================================================
# DETERMINISM TESTS
# =============================================================================

def test_generation_determinism():
    """Test that generation is deterministic."""
    print("Testing generation determinism...")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    # Create two generators with same seed
    gen1 = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=54321,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    gen2 = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=54321,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    # Test biome selection determinism
    for _ in range(100):
        gx = random.randint(-10000, 10000)
        gz = random.randint(-10000, 10000)

        biome1 = gen1.get_biome_at(gx, gz)
        biome2 = gen2.get_biome_at(gx, gz)

        assert biome1.get("name") == biome2.get("name"), \
            f"Biome mismatch at ({gx}, {gz})"

    # Test height determinism
    for _ in range(100):
        gx = random.randint(-10000, 10000)
        gz = random.randint(-10000, 10000)

        h1 = gen1.get_height_at(gx, gz)
        h2 = gen2.get_height_at(gx, gz)

        assert h1 == h2, \
            f"Height mismatch at ({gx}, {gz}): {h1} != {h2}"

    # Test chunk generation determinism
    for _ in range(5):
        cx = random.randint(-100, 100)
        cz = random.randint(-100, 100)

        # Clear caches
        gen1.clear_cache()
        gen2.clear_cache()

        chunk1 = gen1.generate_chunk(cx, cz)
        chunk2 = gen2.generate_chunk(cx, cz)

        # Compare all blocks
        assert (chunk1.blocks == chunk2.blocks).all(), \
            f"Chunk blocks mismatch at ({cx}, {cz})"

    print("  PASS: Generation is deterministic")


# =============================================================================
# VISUALIZATION
# =============================================================================

def visualize_terrain():
    """Print ASCII visualization of chunk surface heights."""
    print("\nASCII terrain visualization (chunk at 0,0):")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=12345,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    # Get heights for the chunk
    heights = []
    min_h, max_h = float('inf'), float('-inf')

    for lz in range(16):
        row = []
        gz = lz
        for lx in range(16):
            gx = lx
            biome = generator.get_biome_at(gx, gz)
            h = generator.get_height_at(gx, gz, biome)
            row.append(h)
            min_h = min(min_h, h)
            max_h = max(max_h, h)
        heights.append(row)

    # Map heights to ASCII characters
    chars = " .:-=+*#%@"
    print(f"  Height range: [{min_h}, {max_h}]")
    print(f"  Sea level: {generator.sea_level}")
    print()

    for row in heights:
        line = "  "
        for h in row:
            if max_h == min_h:
                idx = 0
            else:
                idx = int((h - min_h) / (max_h - min_h) * (len(chars) - 1))
            line += chars[idx] * 2
        print(line)
    print()


def visualize_biome_map():
    """Print ASCII biome map over a large area."""
    print("\nASCII biome map (64x64 area, each char = 8 blocks):")

    if not Registry.is_initialized():
        Registry.initialize(CONTENT_PATH, CONFIG_PATH)

    generator = TerrainGenerator(
        biomes=Registry._biomes,
        blocks=Registry._blocks,
        seed=12345,
        chunk_size=Registry.chunk_size,
        chunk_height=Registry.chunk_height,
        sea_level=Registry.sea_level
    )

    # Biome character mapping
    biome_chars = {
        "plains": ".",
        "hills": "^",
        "forests": "T",
        "mountains": "M",
        "swamp": "~",
        "longwoods": "#",
    }

    print("  Legend: . plains, ^ hills, T forests, M mountains, ~ swamp, # longwoods")
    print()

    for z in range(-32, 32, 1):
        line = "  "
        gz = z * 8
        for x in range(-32, 32, 1):
            gx = x * 8
            biome = generator.get_biome_at(gx, gz)
            biome_name = biome.get("name", "unknown")
            char = biome_chars.get(biome_name, "?")
            line += char
        print(line)
    print()


# =============================================================================
# MAIN
# =============================================================================

def main():
    """Run all tests."""
    print("=" * 60)
    print("VoxEx Terrain Generation Tests")
    print("=" * 60)
    print()

    try:
        # Registry tests
        test_registry_initialization()
        test_registry_tag_lookups()
        print()

        # Biome tests
        test_biome_selection()
        test_biome_distribution()
        print()

        # Height tests
        test_height_calculation()
        print()

        # Chunk tests
        test_chunk_generation()
        test_chunk_memory()
        print()

        # Determinism tests
        test_generation_determinism()
        print()

        # Visualizations
        visualize_terrain()
        visualize_biome_map()

        print("=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
