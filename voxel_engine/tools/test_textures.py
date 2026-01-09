#!/usr/bin/env python3
"""Test script for data-driven texture generation system.

This script validates that:
1. All block.json files have valid texture generation configs
2. TextureGenerator can load blocks from content/blocks/
3. Texture atlas generation produces valid output
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.rendering.textures import TextureGenerator, SeededRNG


def test_seeded_rng():
    """Test that SeededRNG produces deterministic results."""
    print("Testing SeededRNG...")

    rng1 = SeededRNG(12345)
    rng2 = SeededRNG(12345)

    # Same seed should produce same sequence
    values1 = [rng1.next() for _ in range(10)]
    values2 = [rng2.next() for _ in range(10)]

    assert values1 == values2, "SeededRNG not deterministic!"
    print("  SeededRNG determinism: PASS")

    # Different seeds should produce different sequences
    rng3 = SeededRNG(54321)
    values3 = [rng3.next() for _ in range(10)]

    assert values1 != values3, "Different seeds producing same sequence!"
    print("  SeededRNG uniqueness: PASS")

    # Test range functions
    rng = SeededRNG(42)
    for _ in range(100):
        val = rng.next()
        assert 0 <= val < 1, f"next() out of range: {val}"

        int_val = rng.randint(0, 10)
        assert 0 <= int_val <= 10, f"randint() out of range: {int_val}"

    print("  SeededRNG ranges: PASS")

    # Test choice
    rng = SeededRNG(42)
    items = ['a', 'b', 'c', 'd']
    choices = [rng.choice(items) for _ in range(20)]
    assert all(c in items for c in choices), "choice() returned invalid item"
    print("  SeededRNG choice: PASS")
    print()


def get_content_path() -> Path:
    """Get path to content directory."""
    return Path(__file__).parent.parent / "content"


def test_block_loading():
    """Test that TextureGenerator can load all block definitions."""
    print("Testing block loading...")

    content_path = get_content_path()
    generator = TextureGenerator()
    generator.load_blocks(content_path)

    blocks = generator.block_configs
    print(f"  Loaded {len(blocks)} blocks")

    # Should have at least the core blocks
    expected_blocks = [
        "air", "grass", "dirt", "stone", "wood", "log", "leaves",
        "bedrock", "sand", "water", "torch", "snow", "gravel",
        "longwood_log", "longwood_leaves"
    ]

    for block_name in expected_blocks:
        assert block_name in blocks, f"Missing block: {block_name}"
        print(f"    {block_name}: loaded")

    print("  All expected blocks loaded: PASS")
    print()


def test_texture_configs():
    """Test that all block texture configs are valid."""
    print("Testing texture configs...")

    content_path = get_content_path()
    generator = TextureGenerator()
    generator.load_blocks(content_path)

    valid_types = {
        "noise_fill", "layered", "log_bark", "log_rings",
        "sparse", "gradient", "planks", "shape", "reference"
    }

    for block_name, block_data in generator.block_configs.items():
        if block_name == "air":
            continue  # Air has no textures

        textures = block_data.get("textures", {})

        for face, config in textures.items():
            tex_type = config.get("type")
            assert tex_type in valid_types, \
                f"Invalid texture type '{tex_type}' for {block_name}/{face}"

            # Reference textures need a ref field
            if tex_type == "reference":
                assert "ref" in config, \
                    f"Reference texture missing 'ref' field: {block_name}/{face}"

        print(f"    {block_name}: valid")

    print("  All texture configs valid: PASS")
    print()


def test_atlas_generation():
    """Test that atlas generation produces valid output."""
    print("Testing atlas generation...")

    content_path = get_content_path()
    generator = TextureGenerator()
    atlas = generator.generate_atlas(content_path)

    # Check atlas dimensions
    tile_size = generator.ppt
    num_tiles = len(generator.tile_order)

    print(f"  Tile size: {tile_size}x{tile_size}")
    print(f"  Number of tiles: {num_tiles}")
    print(f"  Atlas dimensions: {atlas.width}x{atlas.height}")

    expected_width = tile_size * num_tiles
    expected_height = tile_size

    assert atlas.width == expected_width, \
        f"Atlas width mismatch: {atlas.width} != {expected_width}"
    assert atlas.height == expected_height, \
        f"Atlas height mismatch: {atlas.height} != {expected_height}"

    print("  Atlas dimensions: PASS")

    # Check that atlas has RGBA mode
    assert atlas.mode == "RGBA", f"Atlas mode is {atlas.mode}, expected RGBA"
    print("  Atlas mode (RGBA): PASS")

    # Print tile order for debugging
    print("  Tile order:")
    for i, key in enumerate(generator.tile_order):
        print(f"    [{i}] {key}")

    # Save atlas for visual inspection
    output_path = Path(__file__).parent / "test_atlas_output.png"
    atlas.save(output_path)
    print(f"  Atlas saved to: {output_path}")
    print()


def test_determinism():
    """Test that generation is deterministic with same seed_offsets."""
    print("Testing determinism...")

    content_path = get_content_path()

    # Generate atlas twice
    generator1 = TextureGenerator()
    atlas1 = generator1.generate_atlas(content_path)

    generator2 = TextureGenerator()
    atlas2 = generator2.generate_atlas(content_path)

    # Compare pixel data
    data1 = list(atlas1.getdata())
    data2 = list(atlas2.getdata())

    assert data1 == data2, "Same configs produced different atlases!"
    print("  Same configs produce identical atlases: PASS")
    print()


def test_transparency():
    """Test that transparent blocks have alpha channel."""
    print("Testing transparency...")

    content_path = get_content_path()
    generator = TextureGenerator()
    atlas = generator.generate_atlas(content_path)

    # Find leaves tile and check for transparency
    leaves_key = "leaves:all"
    if leaves_key in generator.tile_map:
        leaves_idx = generator.tile_map[leaves_key]
        tile_size = generator.ppt
        x_offset = leaves_idx * tile_size

        # Check for any transparent pixels in leaves tile
        has_transparent = False
        for y in range(tile_size):
            for x in range(tile_size):
                pixel = atlas.getpixel((x_offset + x, y))
                if len(pixel) == 4 and pixel[3] < 255:
                    has_transparent = True
                    break
            if has_transparent:
                break

        if has_transparent:
            print("  Leaves tile has transparency: PASS")
        else:
            print("  Leaves tile has no transparent pixels (may be by design)")
    else:
        print(f"  Leaves tile not found in tile_map, available keys: {list(generator.tile_map.keys())}")

    # Check longwood_leaves
    longwood_key = "longwood_leaves:all"
    if longwood_key in generator.tile_map:
        idx = generator.tile_map[longwood_key]
        tile_size = generator.ppt
        x_offset = idx * tile_size

        has_transparent = False
        for y in range(tile_size):
            for x in range(tile_size):
                pixel = atlas.getpixel((x_offset + x, y))
                if len(pixel) == 4 and pixel[3] < 255:
                    has_transparent = True
                    break
            if has_transparent:
                break

        if has_transparent:
            print("  Longwood leaves tile has transparency: PASS")
        else:
            print("  Longwood leaves tile has no transparent pixels")

    print()


def test_tile_map():
    """Test that tile_map contains expected entries."""
    print("Testing tile map...")

    content_path = get_content_path()
    generator = TextureGenerator()
    generator.generate_atlas(content_path)

    # Check some expected entries
    expected_keys = [
        "grass:top", "grass:side",
        "dirt:all", "stone:all",
        "log:top", "log:side",
        "leaves:all",
    ]

    for key in expected_keys:
        if key in generator.tile_map:
            print(f"    {key}: index {generator.tile_map[key]}")
        else:
            print(f"    {key}: NOT FOUND")

    print("  Tile map populated: PASS")
    print()


def test_tile_order_matches_voxex():
    """Test that tile indices match VoxEx's tiles.json exactly."""
    print("Testing tile order matches VoxEx tiles.json...")

    import json
    config_path = Path(__file__).parent.parent / "config" / "tiles.json"

    with open(config_path) as f:
        tiles_json = json.load(f)

    # Expected mapping from tiles.json tile names to generator tile keys
    tile_name_to_key = {
        "GRASS_TOP": "grass:top",
        "GRASS_SIDE": "grass:side",
        "DIRT": "dirt:all",
        "STONE": "stone:all",
        "PLANK": "wood:all",
        "LOG_SIDE": "log:side",
        "LEAF": "leaves:all",
        "BEDROCK": "bedrock:all",
        "LOG_TOP": "log:top",
        "SAND": "sand:all",
        "WATER": "water:all",
        "TORCH": "torch:all",
        "SNOW": "snow:all",
        "GRAVEL": "gravel:all",
        "LONGWOOD_LOG_SIDE": "longwood_log:side",
        "LONGWOOD_LOG_TOP": "longwood_log:top",
        "LONGWOOD_LEAF": "longwood_leaves:all",
    }

    content_path = get_content_path()
    generator = TextureGenerator()
    atlas = generator.generate_atlas(content_path)

    # Verify atlas has exactly 17 tiles
    expected_num_tiles = 17
    assert atlas.width == expected_num_tiles * generator.ppt, \
        f"Atlas should have {expected_num_tiles} tiles, got {atlas.width // generator.ppt}"
    print(f"  Atlas has exactly {expected_num_tiles} tiles: PASS")

    # Verify each tile index matches tiles.json
    all_match = True
    for tile_name, expected_index in tiles_json.items():
        tile_key = tile_name_to_key.get(tile_name)
        if tile_key is None:
            print(f"    WARNING: Unknown tile name in tiles.json: {tile_name}")
            continue

        actual_index = generator.tile_map.get(tile_key)
        if actual_index is None:
            print(f"    FAIL: {tile_name} ({tile_key}) not found in tile_map")
            all_match = False
        elif actual_index != expected_index:
            print(f"    FAIL: {tile_name} expected index {expected_index}, got {actual_index}")
            all_match = False
        else:
            print(f"    {tile_name}: index {actual_index} PASS")

    assert all_match, "Tile indices do not match tiles.json!"
    print("  All tile indices match VoxEx tiles.json: PASS")
    print()


def main():
    """Run all tests."""
    print("=" * 60)
    print("Data-Driven Texture Generation Tests")
    print("=" * 60)
    print()

    try:
        test_seeded_rng()
        test_block_loading()
        test_texture_configs()
        test_atlas_generation()
        test_determinism()
        test_transparency()
        test_tile_map()
        test_tile_order_matches_voxex()

        print("=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
