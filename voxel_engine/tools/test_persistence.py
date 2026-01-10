#!/usr/bin/env python3
"""
Tests for save/load system.

Tests RLE compression, save data structures, chunk tracking,
and complete save/load operations.

Usage:
    python voxel_engine/tools/test_persistence.py
"""

import sys
import tempfile
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import numpy as np

# Use importlib to import modules without triggering the engine __init__.py
import importlib.util


def _import_module(module_path, name):
    """Import a module by file path."""
    spec = importlib.util.spec_from_file_location(name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Import persistence modules directly
engine_dir = project_root / "voxel_engine" / "engine"
world_dir = project_root / "voxel_engine" / "world"

_constants = _import_module(engine_dir / "persistence" / "constants.py", "constants")
_compression = _import_module(engine_dir / "persistence" / "compression.py", "compression")
_save_data = _import_module(engine_dir / "persistence" / "save_data.py", "save_data")
_chunk_tracker = _import_module(engine_dir / "persistence" / "chunk_tracker.py", "chunk_tracker")
_save_manager = _import_module(engine_dir / "persistence" / "save_manager.py", "save_manager")

# Extract needed classes/functions
rle_encode = _compression.rle_encode
rle_decode = _compression.rle_decode
compress_chunk = _compression.compress_chunk
decompress_chunk = _compression.decompress_chunk
RLE_MARKER = _constants.RLE_MARKER
SaveFile = _save_data.SaveFile
SaveMetadata = _save_data.SaveMetadata
PlayerSaveData = _save_data.PlayerSaveData
WorldSaveData = _save_data.WorldSaveData
ModifiedChunkTracker = _chunk_tracker.ModifiedChunkTracker
SaveManager = _save_manager.SaveManager


def test_rle_encode_decode_simple():
    """RLE round-trips simple data."""
    data = np.array([1, 1, 1, 1, 1, 2, 2, 3], dtype=np.uint8)
    compressed = rle_encode(data)
    decompressed = rle_decode(compressed, len(data))

    assert np.array_equal(data, decompressed), "Simple RLE round-trip failed"
    print("  [PASS] Simple RLE round-trip")


def test_rle_encode_decode_runs():
    """RLE compresses long runs efficiently."""
    # Long run of zeros (like air in chunk)
    data = np.zeros(1000, dtype=np.uint8)
    compressed = rle_encode(data)

    # Should be much smaller
    compression_ratio = len(data) / len(compressed)
    assert compression_ratio > 10, f"Compression ratio too low: {compression_ratio}"

    decompressed = rle_decode(compressed, len(data))
    assert np.array_equal(data, decompressed), "Run RLE round-trip failed"
    print(f"  [PASS] Long run compression (ratio: {compression_ratio:.1f}x)")


def test_rle_marker_escape():
    """RLE correctly escapes marker byte."""
    # Data containing the marker byte
    data = np.array([1, RLE_MARKER, 2, RLE_MARKER, RLE_MARKER, 3], dtype=np.uint8)
    compressed = rle_encode(data)
    decompressed = rle_decode(compressed, len(data))

    assert np.array_equal(data, decompressed), "Marker escape round-trip failed"
    print("  [PASS] Marker byte escaping")


def test_rle_mixed_data():
    """RLE handles mixed runs and literals."""
    # Mix of runs and single values
    data = np.array([
        1, 2, 3,  # Literals
        5, 5, 5, 5, 5, 5, 5, 5,  # Run of 8
        1, 2, 3,  # More literals
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  # Run of 10
        7,  # Single
    ], dtype=np.uint8)

    compressed = rle_encode(data)
    decompressed = rle_decode(compressed, len(data))

    assert np.array_equal(data, decompressed), "Mixed data round-trip failed"
    print("  [PASS] Mixed data handling")


def test_compress_decompress_chunk():
    """Chunk compression round-trips."""
    # Simulated chunk data (16x320x16 = 81920)
    size = 16 * 320 * 16

    # Random-ish chunk data with some runs (like real terrain)
    rng = np.random.default_rng(42)
    blocks = np.zeros(size, dtype=np.uint8)
    # Add some terrain-like patterns
    blocks[:size // 3] = 3  # Stone at bottom
    blocks[size // 3:size // 2] = 2  # Dirt
    blocks[size // 2:size // 2 + 1000] = 1  # Grass
    # Add some random variations
    blocks[rng.integers(0, size, 1000)] = rng.integers(0, 10, 1000).astype(np.uint8)

    skylight = np.full(size, 15, dtype=np.uint8)
    blocklight = np.zeros(size, dtype=np.uint8)

    compressed = compress_chunk(blocks, skylight, blocklight)
    dec_blocks, dec_sky, dec_block = decompress_chunk(compressed, size)

    assert np.array_equal(blocks, dec_blocks), "Block data mismatch"
    assert np.array_equal(skylight, dec_sky), "Skylight data mismatch"
    assert np.array_equal(blocklight, dec_block), "Blocklight data mismatch"

    compression_ratio = (size * 3) / len(compressed)
    print(f"  [PASS] Chunk compression (ratio: {compression_ratio:.1f}x)")


def test_save_file_json_roundtrip():
    """SaveFile serializes to/from JSON."""
    save = SaveFile(
        metadata=SaveMetadata(name="Test World", chunk_count=5),
        player=PlayerSaveData(position=[10.0, 64.0, -5.0], yaw=1.5),
        world=WorldSaveData(seed=12345, world_time=600.0),
        modified_chunks=[(0, 0), (1, -1), (2, 2)],
    )

    json_str = save.to_json()
    loaded = SaveFile.from_json(json_str)

    assert loaded.metadata.name == "Test World", "Name mismatch"
    assert loaded.player.position == [10.0, 64.0, -5.0], "Position mismatch"
    assert loaded.world.seed == 12345, "Seed mismatch"
    assert len(loaded.modified_chunks) == 3, "Chunk count mismatch"
    print("  [PASS] SaveFile JSON round-trip")


def test_save_metadata_playtime():
    """SaveMetadata formats playtime correctly."""
    meta = SaveMetadata(playtime_seconds=7500.0)  # 2h 5m
    formatted = meta.get_formatted_playtime()
    assert formatted == "2h 5m", f"Playtime format wrong: {formatted}"

    meta2 = SaveMetadata(playtime_seconds=300.0)  # 5m
    formatted2 = meta2.get_formatted_playtime()
    assert formatted2 == "5m", f"Short playtime format wrong: {formatted2}"
    print("  [PASS] Playtime formatting")


def test_modified_chunk_tracker():
    """Chunk tracker tracks modifications."""
    tracker = ModifiedChunkTracker()

    # Initially not modified
    assert tracker.is_modified(0, 0) is False, "Should not be modified initially"

    # Mark modified
    tracker.mark_modified(0, 0)
    assert tracker.is_modified(0, 0) is True, "Should be modified after mark"
    assert tracker.modified_count == 1, "Count should be 1"

    # Multiple marks
    tracker.mark_modified(1, 0)
    tracker.mark_modified(0, 1)
    assert tracker.modified_count == 3, "Count should be 3"

    # Get all modified
    modified = tracker.get_modified_chunks()
    assert len(modified) == 3, "Should have 3 modified chunks"
    assert (0, 0) in modified, "Should contain (0,0)"

    # Clear single
    tracker.clear_modification(0, 0)
    assert tracker.is_modified(0, 0) is False, "Should not be modified after clear"
    assert tracker.modified_count == 2, "Count should be 2"

    # Clear all
    tracker.clear_all()
    assert tracker.modified_count == 0, "Should be empty after clear_all"
    print("  [PASS] Chunk modification tracking")


def test_chunk_tracker_hash_comparison():
    """Chunk tracker compares data hashes."""
    tracker = ModifiedChunkTracker()

    # Create original data
    original = np.array([1, 2, 3, 4, 5], dtype=np.uint8)
    tracker.register_generated(0, 0, original)

    # Same data should not be marked as modified
    assert tracker.check_modification(0, 0, original) is False, \
        "Same data should not be modified"

    # Different data should be marked as modified
    modified = np.array([1, 2, 3, 4, 6], dtype=np.uint8)
    assert tracker.check_modification(0, 0, modified) is True, \
        "Different data should be modified"

    print("  [PASS] Hash-based modification detection")


def test_save_manager_save_load():
    """SaveManager saves and loads state."""
    from state.game_state import GameState

    with tempfile.TemporaryDirectory() as tmpdir:
        save_manager = SaveManager(Path(tmpdir))

        # Create state
        state = GameState.create(seed=42)
        state.player.position[:] = [100.0, 70.0, -50.0]
        state.player.yaw = 2.5
        state.player.selected_slot = 3

        # Save
        result = save_manager.save(state, "test_save")
        assert result is True, "Save should succeed"

        # Modify state
        state.player.position[:] = [0.0, 0.0, 0.0]
        state.player.yaw = 0.0
        state.player.selected_slot = 0

        # Load
        result = save_manager.load("test_save", state)
        assert result is True, "Load should succeed"

        # Verify restored
        assert abs(state.player.position[0] - 100.0) < 0.01, "X position mismatch"
        assert abs(state.player.position[1] - 70.0) < 0.01, "Y position mismatch"
        assert abs(state.player.yaw - 2.5) < 0.01, "Yaw mismatch"
        assert state.player.selected_slot == 3, "Selected slot mismatch"

        print("  [PASS] Save/load round-trip")


def test_save_manager_list_saves():
    """SaveManager lists available saves."""
    from state.game_state import GameState

    with tempfile.TemporaryDirectory() as tmpdir:
        save_manager = SaveManager(Path(tmpdir))
        state = GameState.create(seed=42)

        # Create multiple saves
        save_manager.save(state, "save_a")
        save_manager.save(state, "save_b")

        saves = save_manager.list_saves()
        assert len(saves) == 2, f"Should have 2 saves, got {len(saves)}"

        # Names should be present
        names = [s.name for s in saves]
        assert "save_a" in names, "save_a should be listed"
        assert "save_b" in names, "save_b should be listed"

        print("  [PASS] List saves")


def test_save_manager_delete():
    """SaveManager deletes saves."""
    from state.game_state import GameState

    with tempfile.TemporaryDirectory() as tmpdir:
        save_manager = SaveManager(Path(tmpdir))
        state = GameState.create(seed=42)

        save_manager.save(state, "to_delete")
        assert len(save_manager.list_saves()) == 1, "Should have 1 save"

        save_manager.delete_save("to_delete")
        assert len(save_manager.list_saves()) == 0, "Should have 0 saves"

        print("  [PASS] Delete save")


def test_quick_save_load():
    """Quick save/load works."""
    from state.game_state import GameState

    with tempfile.TemporaryDirectory() as tmpdir:
        save_manager = SaveManager(Path(tmpdir))
        state = GameState.create(seed=42)

        state.player.position[:] = [50.0, 80.0, 50.0]

        result = save_manager.quick_save(state)
        assert result is True, "Quick save should succeed"
        assert save_manager.has_quick_save() is True, "Quick save should exist"

        state.player.position[:] = [0.0, 0.0, 0.0]

        result = save_manager.quick_load(state)
        assert result is True, "Quick load should succeed"
        assert abs(state.player.position[0] - 50.0) < 0.01, "Position not restored"

        print("  [PASS] Quick save/load")


def test_save_with_modified_chunks():
    """SaveManager correctly saves modified chunks."""
    from state.game_state import GameState
    from chunk import Chunk

    with tempfile.TemporaryDirectory() as tmpdir:
        save_manager = SaveManager(Path(tmpdir))
        state = GameState.create(seed=42)

        # Create a chunk with some data
        chunk = Chunk(0, 0, 16, 320)
        chunk.blocks[8, 64, 8] = 5  # Set a log block
        chunk.blocks[8, 65, 8] = 6  # Set a leaves block
        state.world.set_chunk(0, 0, chunk)

        # Mark as modified
        save_manager.chunk_tracker.mark_modified(0, 0)

        # Save
        result = save_manager.save(state, "chunk_test")
        assert result is True, "Save should succeed"

        # Clear and reload
        state.world.clear()
        assert state.world.get_chunk(0, 0) is None, "Chunk should be cleared"

        result = save_manager.load("chunk_test", state)
        assert result is True, "Load should succeed"

        # Verify chunk data
        loaded_chunk = state.world.get_chunk(0, 0)
        assert loaded_chunk is not None, "Chunk should be loaded"
        assert loaded_chunk.get_block(8, 64, 8) == 5, "Log block should be preserved"
        assert loaded_chunk.get_block(8, 65, 8) == 6, "Leaves block should be preserved"

        print("  [PASS] Modified chunk persistence")


def run_all_tests():
    """Run all persistence tests."""
    print("\n" + "=" * 60)
    print("VoxEx Persistence System Tests")
    print("=" * 60)

    print("\n[RLE Compression]")
    test_rle_encode_decode_simple()
    test_rle_encode_decode_runs()
    test_rle_marker_escape()
    test_rle_mixed_data()

    print("\n[Chunk Compression]")
    test_compress_decompress_chunk()

    print("\n[Save Data Structures]")
    test_save_file_json_roundtrip()
    test_save_metadata_playtime()

    print("\n[Chunk Tracking]")
    test_modified_chunk_tracker()
    test_chunk_tracker_hash_comparison()

    print("\n[Save Manager]")
    test_save_manager_save_load()
    test_save_manager_list_saves()
    test_save_manager_delete()
    test_quick_save_load()
    test_save_with_modified_chunks()

    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60 + "\n")


if __name__ == '__main__':
    try:
        run_all_tests()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n[FAIL] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
