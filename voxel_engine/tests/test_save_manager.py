"""Save manager tests for VoxEx.

Tests SaveManager world management operations including:
- Save listing
- Rename, duplicate operations
- Storage info queries
- Export/import functionality
- Cache clearing

Uses test_helpers to load modules directly, bypassing engine/__init__.py
which requires numpy.
"""

import sys
import os
import time
import tempfile
import shutil
import json

# Get directory paths
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PACKAGE_DIR = os.path.dirname(TESTS_DIR)  # voxel_engine/
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)  # VoxEx/

# Add both paths to allow different import styles
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

# Import helper functions for loading modules
from tests.test_helpers import get_save_manager, is_numpy_available


def create_mock_save(save_dir, name, seed=12345):
    """
    Create a minimal mock save file for testing.

    Args:
        save_dir: Directory for saves.
        name: Save name.
        seed: World seed.

    Returns:
        Path to created save file.
    """
    from pathlib import Path

    # Create save file with minimal data
    save_data = {
        "version": 1,
        "metadata": {
            "name": name,
            "version": 1,
            "created_at": time.time(),
            "modified_at": time.time(),
            "playtime_seconds": 3600.0,
            "chunk_count": 5
        },
        "player": {
            "position": [0.0, 70.0, 0.0],
            "velocity": [0.0, 0.0, 0.0],
            "yaw": 0.0,
            "pitch": 0.0,
            "is_flying": False,
            "selected_slot": 0,
            "torch_active": False
        },
        "world": {
            "seed": seed,
            "world_time": 6000.0,
            "day_length": 24000.0,
            "tick_count": 1000
        },
        "modified_chunks": [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
    }

    # Sanitize name for filesystem
    safe_name = "".join(c for c in name if c.isalnum() or c in '-_')
    save_path = Path(save_dir) / f"{safe_name}.vxsave"

    with open(save_path, 'w') as f:
        json.dump(save_data, f)

    # Create chunks directory with mock chunk files
    chunks_dir = Path(save_dir) / f"{safe_name}_chunks"
    chunks_dir.mkdir(exist_ok=True)

    # Create mock chunk files with simple binary data
    for cx, cz in [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]:
        chunk_path = chunks_dir / f"chunk_{cx}_{cz}.vxchunk"
        # Write some dummy compressed data
        chunk_path.write_bytes(b'\x00' * 100)

    return save_path


def test_save_manager_init():
    """Test SaveManager initialization."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))
        assert sm._save_dir == Path(temp_dir)
        assert sm.current_save_name is None

    finally:
        shutil.rmtree(temp_dir)

    print("  SaveManager init tests passed")


def test_list_saves():
    """Test listing saves."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Empty directory
        saves = sm.list_saves()
        assert len(saves) == 0

        # Create some saves
        create_mock_save(temp_dir, "World1", seed=111)
        time.sleep(0.1)  # Ensure different timestamps
        create_mock_save(temp_dir, "World2", seed=222)
        time.sleep(0.1)
        create_mock_save(temp_dir, "World3", seed=333)

        saves = sm.list_saves()
        assert len(saves) == 3

        # Should be sorted by modified time (newest first)
        assert saves[0].name == "World3"
        assert saves[1].name == "World2"
        assert saves[2].name == "World1"

    finally:
        shutil.rmtree(temp_dir)

    print("  list_saves tests passed")


def test_storage_info():
    """Test getting storage info for a world."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Create a save with chunks
        create_mock_save(temp_dir, "TestWorld", seed=12345)

        info = sm.get_world_storage_info("TestWorld")

        assert 'chunk_count' in info
        assert 'cache_size_bytes' in info
        assert 'metadata_size_bytes' in info
        assert info['chunk_count'] == 5
        assert info['cache_size_bytes'] > 0
        assert info['metadata_size_bytes'] > 0

    finally:
        shutil.rmtree(temp_dir)

    print("  get_world_storage_info tests passed")


def test_rename_world():
    """Test renaming a world."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Create a save
        create_mock_save(temp_dir, "OriginalWorld", seed=12345)

        # Verify it exists
        saves = sm.list_saves()
        assert len(saves) == 1
        assert saves[0].name == "OriginalWorld"

        # Rename it
        success = sm.rename_world("OriginalWorld", "RenamedWorld")
        assert success is True

        # Verify rename worked
        saves = sm.list_saves()
        assert len(saves) == 1
        assert saves[0].name == "RenamedWorld"

        # Old name should not exist
        old_path = Path(temp_dir) / "OriginalWorld.vxsave"
        assert not old_path.exists()

        # Chunks should be renamed too
        old_chunks = Path(temp_dir) / "OriginalWorld_chunks"
        new_chunks = Path(temp_dir) / "RenamedWorld_chunks"
        assert not old_chunks.exists()
        assert new_chunks.exists()

        # Test rename to existing name fails
        create_mock_save(temp_dir, "AnotherWorld", seed=99999)
        success = sm.rename_world("AnotherWorld", "RenamedWorld")
        assert success is False

        # Test rename non-existent world fails
        success = sm.rename_world("NonExistent", "NewName")
        assert success is False

    finally:
        shutil.rmtree(temp_dir)

    print("  rename_world tests passed")


def test_duplicate_world():
    """Test duplicating a world."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Create a save
        create_mock_save(temp_dir, "OriginalWorld", seed=12345)

        # Duplicate it
        success = sm.duplicate_world("OriginalWorld", "CopiedWorld")
        assert success is True

        # Verify both exist
        saves = sm.list_saves()
        assert len(saves) == 2
        names = [s.name for s in saves]
        assert "OriginalWorld" in names
        assert "CopiedWorld" in names

        # Verify seed is preserved
        # Read both save files
        orig_path = Path(temp_dir) / "OriginalWorld.vxsave"
        copy_path = Path(temp_dir) / "CopiedWorld.vxsave"

        with open(orig_path, 'r') as f:
            orig_data = json.load(f)
        with open(copy_path, 'r') as f:
            copy_data = json.load(f)

        assert copy_data['world']['seed'] == orig_data['world']['seed']

        # Chunks should be copied
        orig_chunks = Path(temp_dir) / "OriginalWorld_chunks"
        copy_chunks = Path(temp_dir) / "CopiedWorld_chunks"
        assert copy_chunks.exists()
        assert len(list(copy_chunks.glob("*.vxchunk"))) == len(list(orig_chunks.glob("*.vxchunk")))

        # Test duplicate to existing name fails
        success = sm.duplicate_world("OriginalWorld", "CopiedWorld")
        assert success is False

        # Test duplicate non-existent world fails
        success = sm.duplicate_world("NonExistent", "NewCopy")
        assert success is False

    finally:
        shutil.rmtree(temp_dir)

    print("  duplicate_world tests passed")


def test_clear_chunk_cache():
    """Test clearing chunk cache."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Create a save
        create_mock_save(temp_dir, "TestWorld", seed=12345)

        # Verify chunks exist
        chunks_dir = Path(temp_dir) / "TestWorld_chunks"
        initial_count = len(list(chunks_dir.glob("*.vxchunk")))
        assert initial_count == 5

        # Clear cache
        success = sm.clear_chunk_cache("TestWorld")
        assert success is True

        # Verify chunks are deleted
        remaining = list(chunks_dir.glob("*.vxchunk"))
        assert len(remaining) == 0

        # Verify save file still exists
        save_path = Path(temp_dir) / "TestWorld.vxsave"
        assert save_path.exists()

        # Verify metadata is updated
        with open(save_path, 'r') as f:
            data = json.load(f)
        assert data['metadata']['chunk_count'] == 0
        assert len(data['modified_chunks']) == 0

    finally:
        shutil.rmtree(temp_dir)

    print("  clear_chunk_cache tests passed")


def test_delete_save():
    """Test deleting a save."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Create a save
        create_mock_save(temp_dir, "TestWorld", seed=12345)

        # Verify it exists
        assert len(sm.list_saves()) == 1

        # Delete it
        success = sm.delete_save("TestWorld")
        assert success is True

        # Verify it's gone
        assert len(sm.list_saves()) == 0

        # Verify chunks are also deleted
        chunks_dir = Path(temp_dir) / "TestWorld_chunks"
        assert not chunks_dir.exists() or len(list(chunks_dir.glob("*"))) == 0

    finally:
        shutil.rmtree(temp_dir)

    print("  delete_save tests passed")


def test_export_import():
    """Test export and import functionality."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()
    export_path = os.path.join(temp_dir, "test_export.voxex")

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Create a save
        create_mock_save(temp_dir, "ExportTest", seed=54321)

        # Export it
        success = sm.export_world("ExportTest", export_path)
        assert success is True
        assert os.path.exists(export_path)

        # Verify export file is gzipped
        import gzip
        with gzip.open(export_path, 'rt') as f:
            export_data = json.load(f)

        assert export_data['format'] == 'voxex_export'
        assert 'save_data' in export_data
        assert 'chunks' in export_data

        # Delete original
        sm.delete_save("ExportTest")
        assert len(sm.list_saves()) == 0

        # Import it back
        imported_name = sm.import_world(export_path)
        assert imported_name is not None
        assert imported_name == "ExportTest"

        # Verify it's restored
        saves = sm.list_saves()
        assert len(saves) == 1
        assert saves[0].name == "ExportTest"

        # Verify data is intact
        save_path = Path(temp_dir) / "ExportTest.vxsave"
        with open(save_path, 'r') as f:
            data = json.load(f)
        assert data['world']['seed'] == 54321

        # Test import with name conflict generates unique name
        sm.import_world(export_path)
        saves = sm.list_saves()
        assert len(saves) == 2
        # Second import should have a modified name
        names = [s.name for s in saves]
        assert "ExportTest" in names
        assert any(name.startswith("ExportTest (") for name in names)

    finally:
        shutil.rmtree(temp_dir)

    print("  export/import tests passed")


def test_export_path_generation():
    """Test export path and directory generation."""
    SaveManager = get_save_manager()
    from pathlib import Path

    temp_dir = tempfile.mkdtemp()

    try:
        sm = SaveManager(save_dir=Path(temp_dir))

        # Test export directory creation
        export_dir = sm.get_export_directory()
        assert export_dir.exists()

        # Test default export path
        export_path = sm.get_default_export_path("MyWorld")
        assert "MyWorld" in export_path
        assert export_path.endswith(".voxex")

        # Clean up export directory if it was created
        if export_dir.exists():
            shutil.rmtree(export_dir)

    finally:
        shutil.rmtree(temp_dir)

    print("  export path generation tests passed")


def run_all_save_manager_tests():
    """Run all save manager tests."""
    print("Running save manager tests...\n")

    # Check if numpy is available (required for SaveManager)
    if not is_numpy_available():
        print("  SKIPPED: numpy not available (required for save manager)")
        print("\nResults: 0 passed, 0 failed (9 skipped)")
        print("\nAll save manager tests skipped (numpy required)")
        return None  # None indicates skipped, not failed

    passed = 0
    failed = 0
    errors = []

    tests = [
        ("SaveManager init", test_save_manager_init),
        ("list_saves", test_list_saves),
        ("get_world_storage_info", test_storage_info),
        ("rename_world", test_rename_world),
        ("duplicate_world", test_duplicate_world),
        ("clear_chunk_cache", test_clear_chunk_cache),
        ("delete_save", test_delete_save),
        ("export/import", test_export_import),
        ("export path generation", test_export_path_generation),
    ]

    for name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((name, f"Assertion failed: {e}"))
        except Exception as e:
            failed += 1
            errors.append((name, f"Error: {e}"))
            import traceback
            traceback.print_exc()

    print(f"\nResults: {passed} passed, {failed} failed")

    if errors:
        print("\nFailures:")
        for name, error in errors:
            print(f"  {name}: {error}")
        return False

    print("\nAll save manager tests passed!")
    return True


if __name__ == "__main__":
    success = run_all_save_manager_tests()
    sys.exit(0 if success else 1)
