"""
Performance timing utilities for VoxEx.

Provides high-resolution timing for profiling and benchmarking code.
Uses time.perf_counter() for the highest available resolution.

Usage:
    from voxel_engine.utils.timer import Timer, timed

    # Manual timing
    timer = Timer()
    timer.start()
    do_work()
    timer.stop()
    print(f"Work took {timer.elapsed_ms():.2f}ms")

    # Decorator timing
    @timed("generate_chunk")
    def generate_chunk(cx, cz):
        ...
"""

import time
from functools import wraps
from typing import Callable, Optional


class Timer:
    """
    High-resolution timer for performance measurement.

    Attributes:
        _start: Start time (or None if not started).
        _end: End time (or None if not stopped).
    """

    def __init__(self):
        """Initialize a new Timer (not yet started)."""
        self._start: Optional[float] = None
        self._end: Optional[float] = None

    def start(self) -> "Timer":
        """
        Start the timer.

        Returns:
            Timer: Self for method chaining.
        """
        self._start = time.perf_counter()
        self._end = None
        return self

    def stop(self) -> "Timer":
        """
        Stop the timer.

        Returns:
            Timer: Self for method chaining.
        """
        self._end = time.perf_counter()
        return self

    def reset(self) -> "Timer":
        """
        Reset the timer to initial state.

        Returns:
            Timer: Self for method chaining.
        """
        self._start = None
        self._end = None
        return self

    def elapsed_seconds(self) -> float:
        """
        Get elapsed time in seconds.

        If timer is still running, returns time since start.
        If timer was stopped, returns time between start and stop.

        Returns:
            float: Elapsed time in seconds.

        Raises:
            ValueError: If timer was never started.
        """
        if self._start is None:
            raise ValueError("Timer was never started")

        end = self._end if self._end is not None else time.perf_counter()
        return end - self._start

    def elapsed_ms(self) -> float:
        """
        Get elapsed time in milliseconds.

        Returns:
            float: Elapsed time in milliseconds.

        Raises:
            ValueError: If timer was never started.
        """
        return self.elapsed_seconds() * 1000.0

    def elapsed_us(self) -> float:
        """
        Get elapsed time in microseconds.

        Returns:
            float: Elapsed time in microseconds.

        Raises:
            ValueError: If timer was never started.
        """
        return self.elapsed_seconds() * 1_000_000.0

    @property
    def is_running(self) -> bool:
        """Check if the timer is currently running."""
        return self._start is not None and self._end is None

    def __enter__(self) -> "Timer":
        """Context manager entry - starts the timer."""
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit - stops the timer."""
        self.stop()


def timed(name: Optional[str] = None, threshold_ms: float = 0.0) -> Callable:
    """
    Decorator to time function execution.

    Prints timing information after each call if it exceeds threshold.

    Args:
        name: Optional name for the timer (defaults to function name).
        threshold_ms: Only print if elapsed time exceeds this threshold.

    Returns:
        Callable: Decorated function.

    Usage:
        @timed("chunk_gen")
        def generate_chunk(cx, cz):
            ...

        @timed(threshold_ms=10.0)  # Only log slow calls
        def expensive_operation():
            ...
    """
    def decorator(func: Callable) -> Callable:
        timer_name = name if name is not None else func.__name__

        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = func(*args, **kwargs)
            elapsed = (time.perf_counter() - start) * 1000.0

            if elapsed >= threshold_ms:
                print(f"[Timer] {timer_name}: {elapsed:.2f}ms")

            return result
        return wrapper
    return decorator


def timed_silent(func: Callable) -> Callable:
    """
    Decorator to time function execution without printing.

    Attaches timing info to the function for later retrieval.

    Args:
        func: Function to time.

    Returns:
        Callable: Decorated function with `last_elapsed_ms` attribute.

    Usage:
        @timed_silent
        def generate_chunk(cx, cz):
            ...

        generate_chunk(0, 0)
        print(f"Took {generate_chunk.last_elapsed_ms:.2f}ms")
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        wrapper.last_elapsed_ms = (time.perf_counter() - start) * 1000.0
        return result

    wrapper.last_elapsed_ms = 0.0
    return wrapper


class TimerStats:
    """
    Accumulates timing statistics over multiple measurements.

    Useful for tracking average/min/max times over many calls.

    Usage:
        stats = TimerStats("chunk_gen")

        for cx, cz in chunks:
            with stats.measure():
                generate_chunk(cx, cz)

        print(stats)  # Prints avg/min/max/total
    """

    def __init__(self, name: str = "Timer"):
        """
        Initialize timer statistics.

        Args:
            name: Name for this timer (used in output).
        """
        self.name = name
        self._count = 0
        self._total = 0.0
        self._min = float('inf')
        self._max = 0.0
        self._timer = Timer()

    def measure(self) -> Timer:
        """
        Return a context manager that records the duration.

        Usage:
            with stats.measure():
                do_work()

        Returns:
            Timer: A timer that records to this stats object.
        """
        class MeasureContext:
            def __init__(ctx_self, stats: TimerStats):
                ctx_self.stats = stats

            def __enter__(ctx_self):
                ctx_self.stats._timer.start()
                return ctx_self

            def __exit__(ctx_self, exc_type, exc_val, exc_tb):
                ctx_self.stats._timer.stop()
                ctx_self.stats._record(ctx_self.stats._timer.elapsed_ms())

        return MeasureContext(self)

    def record(self, elapsed_ms: float) -> None:
        """
        Record a timing measurement.

        Args:
            elapsed_ms: Elapsed time in milliseconds.
        """
        self._record(elapsed_ms)

    def _record(self, elapsed_ms: float) -> None:
        """Internal method to record a measurement."""
        self._count += 1
        self._total += elapsed_ms
        self._min = min(self._min, elapsed_ms)
        self._max = max(self._max, elapsed_ms)

    def reset(self) -> None:
        """Reset all statistics."""
        self._count = 0
        self._total = 0.0
        self._min = float('inf')
        self._max = 0.0

    @property
    def count(self) -> int:
        """Number of measurements recorded."""
        return self._count

    @property
    def total_ms(self) -> float:
        """Total accumulated time in milliseconds."""
        return self._total

    @property
    def avg_ms(self) -> float:
        """Average time per measurement in milliseconds."""
        return self._total / self._count if self._count > 0 else 0.0

    @property
    def min_ms(self) -> float:
        """Minimum recorded time in milliseconds."""
        return self._min if self._count > 0 else 0.0

    @property
    def max_ms(self) -> float:
        """Maximum recorded time in milliseconds."""
        return self._max

    def __str__(self) -> str:
        """Return a formatted summary of statistics."""
        if self._count == 0:
            return f"[{self.name}] No measurements"
        return (
            f"[{self.name}] "
            f"n={self._count}, "
            f"avg={self.avg_ms:.2f}ms, "
            f"min={self.min_ms:.2f}ms, "
            f"max={self.max_ms:.2f}ms, "
            f"total={self.total_ms:.2f}ms"
        )


# =============================================================================
# SIMPLE PROFILING CONTEXT
# =============================================================================

def profile_block(name: str, threshold_ms: float = 0.0):
    """
    Context manager for profiling a block of code.

    Args:
        name: Name for the profiled block.
        threshold_ms: Only print if elapsed time exceeds this threshold.

    Usage:
        with profile_block("mesh_generation"):
            build_mesh(chunk)
    """
    class ProfileContext:
        def __enter__(self):
            self.start = time.perf_counter()
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            elapsed = (time.perf_counter() - self.start) * 1000.0
            if elapsed >= threshold_ms:
                print(f"[Profile] {name}: {elapsed:.2f}ms")

    return ProfileContext()
