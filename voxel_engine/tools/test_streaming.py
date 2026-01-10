#!/usr/bin/env python3
"""
Tests for chunk streaming system.

Run with: python voxel_engine/tools/test_streaming.py
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def test_chunk_queue_priority():
    """Queue returns highest priority (lowest value) first."""
    from voxel_engine.engine.streaming import ChunkQueue, ChunkTaskType

    queue = ChunkQueue()
    queue.push(0, 0, ChunkTaskType.GENERATE, priority=100)
    queue.push(1, 1, ChunkTaskType.GENERATE, priority=10)
    queue.push(2, 2, ChunkTaskType.GENERATE, priority=50)

    task = queue.pop()
    assert task is not None
    assert task.cx == 1 and task.cz == 1, f"Expected (1,1) first, got ({task.cx},{task.cz})"

    task = queue.pop()
    assert task is not None
    assert task.cx == 2 and task.cz == 2, f"Expected (2,2) second, got ({task.cx},{task.cz})"

    task = queue.pop()
    assert task is not None
    assert task.cx == 0 and task.cz == 0, f"Expected (0,0) third, got ({task.cx},{task.cz})"

    print("  PASS: test_chunk_queue_priority")


def test_chunk_queue_no_duplicates():
    """Queue prevents duplicate entries."""
    from voxel_engine.engine.streaming import ChunkQueue, ChunkTaskType

    queue = ChunkQueue()
    result1 = queue.push(0, 0, ChunkTaskType.GENERATE, 10)
    result2 = queue.push(0, 0, ChunkTaskType.GENERATE, 5)  # Duplicate

    assert result1 is True, "First push should succeed"
    assert result2 is False, "Duplicate push should fail"
    assert len(queue) == 1, f"Expected 1 task, got {len(queue)}"

    print("  PASS: test_chunk_queue_no_duplicates")


def test_chunk_queue_different_tasks():
    """Same chunk can have different task types."""
    from voxel_engine.engine.streaming import ChunkQueue, ChunkTaskType

    queue = ChunkQueue()
    queue.push(0, 0, ChunkTaskType.GENERATE, 10)
    queue.push(0, 0, ChunkTaskType.MESH, 20)

    assert len(queue) == 2, f"Expected 2 tasks, got {len(queue)}"

    print("  PASS: test_chunk_queue_different_tasks")


def test_chunk_queue_max_size():
    """Queue respects max size limit."""
    from voxel_engine.engine.streaming import ChunkQueue, ChunkTaskType

    queue = ChunkQueue(max_size=5)

    for i in range(10):
        queue.push(i, 0, ChunkTaskType.GENERATE, i)

    assert len(queue) == 5, f"Expected 5 tasks (max), got {len(queue)}"

    print("  PASS: test_chunk_queue_max_size")


def test_chunk_queue_pop_batch():
    """Queue pop_batch returns correct number of tasks."""
    from voxel_engine.engine.streaming import ChunkQueue, ChunkTaskType

    queue = ChunkQueue()
    for i in range(10):
        queue.push(i, 0, ChunkTaskType.GENERATE, i)

    batch = queue.pop_batch(3)
    assert len(batch) == 3, f"Expected 3 tasks, got {len(batch)}"
    assert len(queue) == 7, f"Expected 7 remaining, got {len(queue)}"

    # Verify priority order
    assert batch[0].cx == 0, "First should be lowest priority value"
    assert batch[1].cx == 1
    assert batch[2].cx == 2

    print("  PASS: test_chunk_queue_pop_batch")


def test_chunk_queue_lazy_removal():
    """Queue handles lazy removal correctly."""
    from voxel_engine.engine.streaming import ChunkQueue, ChunkTaskType

    queue = ChunkQueue()
    queue.push(0, 0, ChunkTaskType.GENERATE, 10)
    queue.push(1, 1, ChunkTaskType.GENERATE, 20)

    # Remove first task (lazy)
    removed = queue.remove(0, 0, ChunkTaskType.GENERATE)
    assert removed is True, "Remove should succeed"
    assert len(queue) == 1, "Should have 1 task after removal"

    # Pop should skip removed task
    task = queue.pop()
    assert task is not None
    assert task.cx == 1, f"Expected (1,1), got ({task.cx},{task.cz})"

    print("  PASS: test_chunk_queue_lazy_removal")


def test_chunk_tracker_state_transitions():
    """Tracker handles state transitions."""
    from voxel_engine.engine.streaming import ChunkTracker, ChunkState

    tracker = ChunkTracker()

    assert tracker.get_state(0, 0) == ChunkState.UNLOADED

    tracker.set_state(0, 0, ChunkState.GENERATING)
    assert tracker.get_state(0, 0) == ChunkState.GENERATING

    tracker.set_state(0, 0, ChunkState.UPLOADED)
    assert tracker.loaded_count == 1

    print("  PASS: test_chunk_tracker_state_transitions")


def test_chunk_tracker_dirty():
    """Tracker marks chunks dirty correctly."""
    from voxel_engine.engine.streaming import ChunkTracker, ChunkState

    tracker = ChunkTracker()
    tracker.set_state(0, 0, ChunkState.UPLOADED)

    tracker.mark_dirty(0, 0)
    assert tracker.get_state(0, 0) == ChunkState.DIRTY

    dirty = tracker.get_dirty_chunks()
    assert (0, 0) in dirty, "Dirty chunks should include (0,0)"

    # Non-uploaded chunks should not become dirty
    tracker.set_state(1, 1, ChunkState.GENERATING)
    tracker.mark_dirty(1, 1)
    assert tracker.get_state(1, 1) == ChunkState.GENERATING, "Non-uploaded should stay same"

    print("  PASS: test_chunk_tracker_dirty")


def test_chunk_tracker_distance_sorting():
    """Tracker sorts chunks by distance."""
    from voxel_engine.engine.streaming import ChunkTracker, ChunkState

    tracker = ChunkTracker()
    tracker.set_state(0, 0, ChunkState.UPLOADED)
    tracker.set_state(5, 5, ChunkState.UPLOADED)
    tracker.set_state(2, 2, ChunkState.UPLOADED)

    sorted_chunks = tracker.get_chunks_sorted_by_distance(0, 0)
    assert sorted_chunks[0] == (0, 0), f"Expected (0,0) first, got {sorted_chunks[0]}"
    assert sorted_chunks[-1] == (5, 5), f"Expected (5,5) last, got {sorted_chunks[-1]}"

    print("  PASS: test_chunk_tracker_distance_sorting")


def test_chunk_tracker_beyond_distance():
    """Tracker finds chunks beyond distance."""
    from voxel_engine.engine.streaming import ChunkTracker, ChunkState

    tracker = ChunkTracker()
    tracker.set_state(0, 0, ChunkState.UPLOADED)
    tracker.set_state(10, 10, ChunkState.UPLOADED)
    tracker.set_state(3, 3, ChunkState.UPLOADED)

    far = tracker.get_chunks_beyond_distance(0, 0, 5)
    assert (10, 10) in far, "(10,10) should be far"
    assert (0, 0) not in far, "(0,0) should not be far"
    assert (3, 3) not in far, "(3,3) should not be far"

    print("  PASS: test_chunk_tracker_beyond_distance")


def test_chunk_tracker_player_chunk():
    """Tracker tracks player chunk changes."""
    from voxel_engine.engine.streaming import ChunkTracker

    tracker = ChunkTracker()

    changed = tracker.update_player_chunk(0, 0)
    assert changed is False, "Initial (0,0) should not count as change"

    changed = tracker.update_player_chunk(1, 1)
    assert changed is True, "Moving to (1,1) should be a change"
    assert tracker.player_chunk == (1, 1)

    changed = tracker.update_player_chunk(1, 1)
    assert changed is False, "Same chunk should not be a change"

    print("  PASS: test_chunk_tracker_player_chunk")


def test_chunk_tracker_remove():
    """Tracker removes chunks correctly."""
    from voxel_engine.engine.streaming import ChunkTracker, ChunkState

    tracker = ChunkTracker()
    tracker.set_state(0, 0, ChunkState.UPLOADED)
    tracker.set_state(1, 1, ChunkState.UPLOADED)

    assert tracker.total_tracked == 2

    tracker.remove(0, 0)
    assert tracker.total_tracked == 1
    assert tracker.get_state(0, 0) == ChunkState.UNLOADED

    print("  PASS: test_chunk_tracker_remove")


def test_streaming_system_priority():
    """ChunkStreamingSystem has correct priority."""
    from voxel_engine.engine.systems import ChunkStreamingSystem

    # Create with None streamer just to test priority
    system = ChunkStreamingSystem(streamer=None)
    assert system.priority == 50, f"Expected priority 50, got {system.priority}"

    print("  PASS: test_streaming_system_priority")


def test_upload_system_priority():
    """ChunkUploadSystem runs before render."""
    from voxel_engine.engine.systems import ChunkUploadSystem

    system = ChunkUploadSystem(streamer=None)
    assert system.priority == 90, f"Expected priority 90, got {system.priority}"

    print("  PASS: test_upload_system_priority")


def test_constants():
    """Streaming constants have valid values."""
    from voxel_engine.engine.streaming import (
        DEFAULT_RENDER_DISTANCE, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE,
        PRE_GEN_PADDING, MAX_CHUNKS_PER_TICK, MAX_MESHES_PER_FRAME,
        MAX_CACHED_CHUNKS, PRIORITY_PLAYER_CHUNK, PRIORITY_ADJACENT,
        PRIORITY_NEAR, PRIORITY_FAR
    )

    assert MIN_RENDER_DISTANCE < DEFAULT_RENDER_DISTANCE < MAX_RENDER_DISTANCE
    assert PRE_GEN_PADDING >= 0
    assert MAX_CHUNKS_PER_TICK > 0
    assert MAX_MESHES_PER_FRAME > 0
    assert MAX_CACHED_CHUNKS > 0
    assert PRIORITY_PLAYER_CHUNK < PRIORITY_ADJACENT < PRIORITY_NEAR < PRIORITY_FAR

    print("  PASS: test_constants")


def test_chunk_task_key():
    """ChunkTask key property works correctly."""
    from voxel_engine.engine.streaming import ChunkTask, ChunkTaskType

    task = ChunkTask(priority=10, cx=5, cz=7, task_type=ChunkTaskType.GENERATE)
    assert task.key == (5, 7), f"Expected (5, 7), got {task.key}"

    print("  PASS: test_chunk_task_key")


def test_imports():
    """All streaming imports work correctly."""
    try:
        from voxel_engine.engine.streaming import (
            ChunkStreamer, ChunkQueue, ChunkTracker,
            ChunkTask, ChunkTaskType, ChunkState,
            DEFAULT_RENDER_DISTANCE
        )
        from voxel_engine.engine.systems import (
            ChunkStreamingSystem, ChunkUploadSystem
        )
        print("  PASS: test_imports")
    except ImportError as e:
        print(f"  FAIL: test_imports - {e}")
        raise


def run_all_tests():
    """Run all streaming tests."""
    print("\n" + "=" * 60)
    print("Running Chunk Streaming System Tests")
    print("=" * 60 + "\n")

    tests = [
        test_imports,
        test_constants,
        test_chunk_task_key,
        test_chunk_queue_priority,
        test_chunk_queue_no_duplicates,
        test_chunk_queue_different_tasks,
        test_chunk_queue_max_size,
        test_chunk_queue_pop_batch,
        test_chunk_queue_lazy_removal,
        test_chunk_tracker_state_transitions,
        test_chunk_tracker_dirty,
        test_chunk_tracker_distance_sorting,
        test_chunk_tracker_beyond_distance,
        test_chunk_tracker_player_chunk,
        test_chunk_tracker_remove,
        test_streaming_system_priority,
        test_upload_system_priority,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {test.__name__} - {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {test.__name__} - {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60 + "\n")

    return failed == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
