"""
High-precision timing utilities for VoxEx game loops.

Provides frame timing, accumulator management, and FPS tracking.
Uses time.perf_counter() for sub-millisecond precision.

Usage:
    from voxel_engine.engine.loops.clock import Clock

    clock = Clock(target_fps=60)
    while running:
        dt = clock.tick()
        # ... game logic
"""

import time
from collections import deque


class Clock:
    """
    High-precision game clock with FPS tracking.

    Tracks frame times, calculates delta, and provides
    smoothed FPS measurements.
    """

    __slots__ = [
        "target_fps", "target_dt", "last_time", "current_time",
        "delta", "frame_times", "fps", "_frame_count"
    ]

    def __init__(self, target_fps: float = 60.0, smoothing_frames: int = 60):
        """
        Initialize clock.

        Args:
            target_fps: Target frames per second.
            smoothing_frames: Number of frames to average for FPS.
        """
        self.target_fps = target_fps
        self.target_dt = 1.0 / target_fps

        self.last_time = time.perf_counter()
        self.current_time = self.last_time
        self.delta = 0.0

        # FPS smoothing
        self.frame_times: deque = deque(maxlen=smoothing_frames)
        self.fps = target_fps
        self._frame_count = 0

    def tick(self) -> float:
        """
        Advance clock and return delta time.

        Returns:
            float: Time elapsed since last tick in seconds.
        """
        self.current_time = time.perf_counter()
        self.delta = self.current_time - self.last_time
        self.last_time = self.current_time

        # Track for FPS calculation
        self.frame_times.append(self.delta)
        self._frame_count += 1

        # Update FPS every 10 frames
        if self._frame_count % 10 == 0:
            self._update_fps()

        return self.delta

    def _update_fps(self) -> None:
        """Calculate smoothed FPS from recent frame times."""
        if self.frame_times:
            avg_dt = sum(self.frame_times) / len(self.frame_times)
            if avg_dt > 0:
                self.fps = 1.0 / avg_dt

    def get_fps(self) -> float:
        """Get current smoothed FPS."""
        return self.fps

    def get_delta(self) -> float:
        """Get last frame's delta time."""
        return self.delta

    def sleep_until_target(self) -> float:
        """
        Sleep to maintain target framerate.

        Returns:
            float: Actual sleep duration.
        """
        elapsed = time.perf_counter() - self.last_time
        sleep_time = self.target_dt - elapsed

        if sleep_time > 0.001:  # Only sleep if > 1ms
            time.sleep(sleep_time - 0.001)  # Wake slightly early
            # Spin-wait for precision
            while time.perf_counter() - self.last_time < self.target_dt:
                pass

        return max(0, sleep_time)

    def reset(self) -> None:
        """Reset clock (call after pause/resume)."""
        self.last_time = time.perf_counter()
        self.delta = 0.0


class Accumulator:
    """
    Fixed timestep accumulator for game logic.

    Accumulates frame time and releases fixed-size ticks.
    Prevents spiral of death with max accumulated time.

    Usage:
        acc = Accumulator(tick_rate=20)
        while True:
            dt = clock.tick()
            acc.add(dt)
            while acc.should_tick():
                update_physics(acc.tick_dt)
            alpha = acc.get_alpha()
            render_interpolated(alpha)
    """

    __slots__ = ["tick_rate", "tick_dt", "accumulated", "max_accumulated"]

    def __init__(self, tick_rate: float = 20.0, max_ticks_per_frame: int = 5):
        """
        Initialize accumulator.

        Args:
            tick_rate: Fixed ticks per second.
            max_ticks_per_frame: Maximum ticks to process per frame.
        """
        self.tick_rate = tick_rate
        self.tick_dt = 1.0 / tick_rate
        self.accumulated = 0.0
        self.max_accumulated = self.tick_dt * max_ticks_per_frame

    def add(self, dt: float) -> None:
        """
        Add frame time to accumulator.

        Args:
            dt: Frame delta time.
        """
        self.accumulated += dt
        # Cap to prevent spiral of death
        if self.accumulated > self.max_accumulated:
            self.accumulated = self.max_accumulated

    def should_tick(self) -> bool:
        """Check if a tick should be processed."""
        return self.accumulated >= self.tick_dt

    def consume_tick(self) -> float:
        """
        Consume one tick from accumulator.

        Returns:
            float: Tick delta time.
        """
        self.accumulated -= self.tick_dt
        return self.tick_dt

    def get_alpha(self) -> float:
        """
        Get interpolation alpha for rendering.

        Returns:
            float: Value in [0, 1) representing progress to next tick.
        """
        return self.accumulated / self.tick_dt

    def reset(self) -> None:
        """Reset accumulator."""
        self.accumulated = 0.0
