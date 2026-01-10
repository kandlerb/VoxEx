#!/usr/bin/env python3
"""Test script for game loop system.

Validates:
1. Clock timing accuracy
2. Accumulator fixed timestep behavior
3. GameLoop tick/frame separation
4. System registration and execution order
5. Interpolation alpha calculation
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.engine.loops import Clock, Accumulator, GameLoop
from voxel_engine.engine.state import GameState, GamePhase
from voxel_engine.engine.systems import TickSystem, FrameSystem


class CountingTickSystem(TickSystem):
    """Counts ticks for testing."""
    def __init__(self):
        super().__init__(priority=0)
        self.tick_count = 0

    def tick(self, state, dt):
        self.tick_count += 1


class CountingFrameSystem(FrameSystem):
    """Counts frames for testing."""
    def __init__(self):
        super().__init__(priority=0)
        self.frame_count = 0
        self.last_alpha = 0.0

    def frame(self, state, dt, alpha):
        self.frame_count += 1
        self.last_alpha = alpha


def test_clock():
    """Test Clock timing."""
    print("Testing Clock...")

    clock = Clock(target_fps=60)

    # Test tick returns delta
    dt = clock.tick()
    assert dt >= 0, "Delta should be non-negative"

    # Test FPS calculation
    for _ in range(100):
        clock.tick()
        time.sleep(0.001)  # ~1000 FPS max

    fps = clock.get_fps()
    assert fps > 0, f"FPS should be positive: {fps}"

    # Test reset
    clock.reset()
    dt = clock.tick()
    assert dt < 0.1, "Delta after reset should be small"

    print(f"  PASS: Clock (measured ~{fps:.0f} FPS)")


def test_accumulator():
    """Test Accumulator fixed timestep."""
    print("Testing Accumulator...")

    acc = Accumulator(tick_rate=20)  # 50ms ticks

    assert acc.tick_dt == 0.05, "Wrong tick delta"
    assert not acc.should_tick(), "Shouldn't tick when empty"

    # Add less than one tick
    acc.add(0.03)
    assert not acc.should_tick(), "Shouldn't tick at 30ms"
    assert 0.59 < acc.get_alpha() < 0.61, f"Wrong alpha: {acc.get_alpha()}"

    # Add enough for one tick
    acc.add(0.03)  # Total: 60ms
    assert acc.should_tick(), "Should tick at 60ms"

    # Consume tick
    dt = acc.consume_tick()
    assert dt == 0.05, "Wrong consumed delta"
    assert not acc.should_tick(), "Shouldn't tick after consume"

    # Test spiral of death prevention
    acc.reset()
    acc.add(1.0)  # Way more than max
    tick_count = 0
    while acc.should_tick():
        acc.consume_tick()
        tick_count += 1
    assert tick_count == 5, f"Max ticks should be 5: {tick_count}"

    print("  PASS: Accumulator")


def test_game_loop_systems():
    """Test GameLoop system management."""
    print("Testing GameLoop systems...")

    state = GameState.create(seed=42)
    loop = GameLoop(state, tick_rate=20, target_fps=60)

    # Add systems
    tick_sys = CountingTickSystem()
    frame_sys = CountingFrameSystem()

    loop.add_tick_system(tick_sys)
    loop.add_frame_system(frame_sys)

    assert len(loop.tick_systems) == 1, "Wrong tick system count"
    assert len(loop.frame_systems) == 1, "Wrong frame system count"

    # Test manual stepping
    loop.step_tick()
    assert tick_sys.tick_count == 1, "Tick system not called"
    assert state.tick_count == 1, "State tick not advanced"

    loop.step_frame(dt=0.016, alpha=0.5)
    assert frame_sys.frame_count == 1, "Frame system not called"
    assert 0.49 < frame_sys.last_alpha < 0.51, "Wrong alpha passed"

    # Test removal
    removed = loop.remove_system(tick_sys)
    assert removed, "System not removed"
    assert len(loop.tick_systems) == 0, "System still in list"

    print("  PASS: GameLoop systems")


def test_game_loop_timing():
    """Test GameLoop tick/frame separation."""
    print("Testing GameLoop timing...")

    state = GameState.create(seed=42)
    state.phase = GamePhase.PLAYING

    loop = GameLoop(state, tick_rate=20, target_fps=60)

    tick_sys = CountingTickSystem()
    frame_sys = CountingFrameSystem()

    loop.add_tick_system(tick_sys)
    loop.add_frame_system(frame_sys)

    # Run for a short duration
    loop.initialize()

    start = time.perf_counter()
    duration = 0.25  # 250ms = ~5 ticks at 20 TPS

    while time.perf_counter() - start < duration:
        loop._frame()
        time.sleep(0.001)  # Prevent busy loop

    loop.shutdown()

    # Verify tick rate (~5 ticks in 250ms at 20 TPS)
    expected_ticks = int(duration * 20)
    assert expected_ticks - 2 <= tick_sys.tick_count <= expected_ticks + 2, \
        f"Wrong tick count: {tick_sys.tick_count} (expected ~{expected_ticks})"

    # Verify frames > ticks (rendering faster than ticks)
    assert frame_sys.frame_count > tick_sys.tick_count, \
        f"Frames ({frame_sys.frame_count}) should exceed ticks ({tick_sys.tick_count})"

    print(f"  PASS: GameLoop timing ({tick_sys.tick_count} ticks, "
          f"{frame_sys.frame_count} frames in {duration}s)")


def test_system_priority():
    """Test system execution order by priority."""
    print("Testing system priority...")

    execution_order = []

    class OrderTracker(TickSystem):
        def __init__(self, name, priority):
            super().__init__(priority=priority)
            self.name = name

        def tick(self, state, dt):
            execution_order.append(self.name)

    state = GameState.create(seed=42)
    loop = GameLoop(state)

    # Add in non-priority order
    loop.add_tick_system(OrderTracker("C", priority=30))
    loop.add_tick_system(OrderTracker("A", priority=10))
    loop.add_tick_system(OrderTracker("B", priority=20))

    loop.step_tick()

    assert execution_order == ["A", "B", "C"], \
        f"Wrong execution order: {execution_order}"

    print("  PASS: System priority")


def test_interpolation_alpha():
    """Test interpolation alpha calculation."""
    print("Testing interpolation alpha...")

    acc = Accumulator(tick_rate=20)  # 50ms ticks

    # At 0ms: alpha = 0
    assert abs(acc.get_alpha()) < 0.01, "Alpha should be ~0 at start"

    # At 25ms: alpha = 0.5
    acc.add(0.025)
    assert 0.49 < acc.get_alpha() < 0.51, f"Alpha should be ~0.5: {acc.get_alpha()}"

    # At 50ms: tick happens, alpha resets
    acc.add(0.025)
    acc.consume_tick()
    assert abs(acc.get_alpha()) < 0.01, "Alpha should be ~0 after tick"

    print("  PASS: Interpolation alpha")


def main():
    """Run all game loop tests."""
    print("=" * 60)
    print("Game Loop Tests")
    print("=" * 60)
    print()

    try:
        test_clock()
        print()
        test_accumulator()
        print()
        test_game_loop_systems()
        print()
        test_game_loop_timing()
        print()
        test_system_priority()
        print()
        test_interpolation_alpha()
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
