#!/usr/bin/env python3
"""Test script for state management system.

Validates:
1. PlayerState movement vectors and coordinate calculations
2. WorldState chunk storage with numeric keys
3. WorldState cross-chunk block access
4. EntityState pooling and spatial queries
5. GameState aggregation and timing
"""

import sys
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.engine.state import (
    PlayerState, WorldState, EntityState, Entity,
    GameState, GameMode, GamePhase,
    chunk_key, key_to_coords
)
from voxel_engine.world.chunk import Chunk


def test_chunk_key():
    """Test numeric chunk key encoding/decoding."""
    print("Testing chunk key encoding...")

    test_cases = [
        (0, 0),
        (1, 0), (0, 1), (-1, 0), (0, -1),
        (100, 200), (-100, -200),
        (500, -500), (-500, 500),
    ]

    for cx, cz in test_cases:
        key = chunk_key(cx, cz)
        decoded = key_to_coords(key)
        assert decoded == (cx, cz), f"Key mismatch: {(cx, cz)} -> {key} -> {decoded}"

    print("  PASS: Chunk key encoding/decoding")


def test_player_state():
    """Test PlayerState vectors and methods."""
    print("Testing PlayerState...")

    player = PlayerState()

    # Test initial position
    assert player.position.shape == (3,), "Position wrong shape"
    assert player.position.dtype == np.float64, "Position wrong dtype"

    # Test position modification
    player.position[:] = [10.0, 64.0, 20.0]
    assert np.allclose(player.position, [10, 64, 20])

    # Test previous position storage
    player.store_previous_position()
    player.position[0] = 15.0
    assert player.prev_position[0] == 10.0, "prev_position not stored"

    # Test chunk coordinates
    player.position[:] = [32.0, 64.0, 48.0]
    cx, cz = player.get_chunk_coords(chunk_size=16)
    assert cx == 2 and cz == 3, f"Wrong chunk coords: {(cx, cz)}"

    # Test negative coords
    player.position[:] = [-10.0, 64.0, -20.0]
    cx, cz = player.get_chunk_coords(chunk_size=16)
    assert cx == -1 and cz == -2, f"Wrong negative chunk coords: {(cx, cz)}"

    # Test forward/right vectors
    player.yaw = 0.0
    fwd = player.get_forward_vector()
    assert np.allclose(fwd, [0, 0, -1], atol=1e-10), f"Wrong forward: {fwd}"

    player.yaw = np.pi / 2  # 90 degrees
    fwd = player.get_forward_vector()
    assert np.allclose(fwd, [-1, 0, 0], atol=1e-10), f"Wrong forward at 90deg: {fwd}"

    print("  PASS: PlayerState")


def test_world_state():
    """Test WorldState chunk and block access."""
    print("Testing WorldState...")

    world = WorldState(seed=12345)

    # Create and add chunks
    chunk = Chunk(0, 0)
    chunk.set_block(8, 64, 8, 3)  # Stone at center
    world.set_chunk(0, 0, chunk)

    assert world.has_chunk(0, 0), "Chunk not found"
    assert world.chunk_count() == 1, "Wrong chunk count"

    # Test block access via global coords
    block = world.get_block(8, 64, 8)
    assert block == 3, f"Wrong block: {block}"

    # Test unloaded chunk returns AIR
    block = world.get_block(100, 64, 100)
    assert block == 0, "Unloaded chunk should return AIR"

    # Test set_block marks dirty
    world.dirty_chunks.clear()
    world.set_block(8, 65, 8, 1)
    assert len(world.dirty_chunks) > 0, "set_block didn't mark dirty"

    # Test cross-chunk boundary
    chunk2 = Chunk(1, 0)
    world.set_chunk(1, 0, chunk2)
    world.set_block(16, 64, 0, 5)  # Should go in chunk (1, 0)

    assert world.get_block(16, 64, 0) == 5, "Cross-chunk set failed"

    # Test time
    world.advance_time(600.0)  # Half day
    progress = world.get_day_progress()
    assert 0.49 < progress < 0.51, f"Wrong day progress: {progress}"

    print("  PASS: WorldState")


def test_entity_state():
    """Test EntityState pooling and queries."""
    print("Testing EntityState...")

    entities = EntityState(max_entities=10)

    # Create and add entities
    e1 = Entity("zombie")
    e1.position[:] = [10.0, 64.0, 10.0]
    entities.add(e1)

    e2 = Entity("zombie")
    e2.position[:] = [15.0, 64.0, 10.0]
    entities.add(e2)

    e3 = Entity("item")
    e3.position[:] = [11.0, 64.0, 11.0]
    entities.add(e3)

    assert entities.count() == 3, "Wrong total count"
    assert entities.count("zombie") == 2, "Wrong zombie count"
    assert entities.count("item") == 1, "Wrong item count"

    # Test get_near
    pos = np.array([10.0, 64.0, 10.0])
    near = entities.get_near(pos, radius=3.0)
    assert len(near) == 2, f"Wrong near count: {len(near)}"

    # Test get_closest
    closest = entities.get_closest(pos, entity_type="zombie")
    assert closest is e1, "Wrong closest zombie"

    # Test removal and pooling
    entities.remove(e1)
    assert entities.count("zombie") == 1, "Zombie not removed"

    # Test pool reuse
    recycled = entities.acquire_from_pool("zombie")
    assert recycled is e1, "Didn't get recycled entity"
    assert recycled.active, "Recycled entity not reset"

    print("  PASS: EntityState")


def test_game_state():
    """Test GameState aggregation."""
    print("Testing GameState...")

    state = GameState.create(seed=42, mode=GameMode.CREATIVE)

    assert state.world.seed == 42, "Wrong seed"
    assert state.mode == GameMode.CREATIVE, "Wrong mode"
    assert state.phase == GamePhase.LOADING, "Wrong initial phase"

    # Test timing
    state.update_timing(0.016)  # ~60fps
    assert 60 < state.fps < 65, f"Wrong FPS: {state.fps}"

    state.advance_tick()
    assert state.tick_count == 1, "Tick not advanced"

    # Test pause/resume
    state.phase = GamePhase.PLAYING
    assert state.is_playing()

    state.pause()
    assert state.phase == GamePhase.PAUSED
    assert not state.is_playing()

    state.resume()
    assert state.is_playing()

    print("  PASS: GameState")


def main():
    """Run all state tests."""
    print("=" * 60)
    print("State Management Tests")
    print("=" * 60)
    print()

    try:
        test_chunk_key()
        print()
        test_player_state()
        print()
        test_world_state()
        print()
        test_entity_state()
        print()
        test_game_state()
        print()

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
