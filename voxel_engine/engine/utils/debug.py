"""Debug logging utilities for VoxEx.

Provides consistent debug logging across all engine subsystems with
category-based filtering and function tracing.
"""

import sys
import time
from functools import wraps
from typing import Any, Callable, Optional

# Global debug flags - set to True to enable verbose logging
DEBUG_ENABLED = True
DEBUG_UI = True
DEBUG_WORLD_GEN = True
DEBUG_GAME_FLOW = True

# Track timing
_timers: dict = {}


def debug_log(category: str, message: str, *args, **kwargs) -> None:
    """
    Print debug message with category and timestamp.

    @param category: Category tag (e.g., "UI", "WORLD", "GAME").
    @param message: Message format string.
    @param args: Positional format arguments.
    @param kwargs: Keyword format arguments.
    """
    if not DEBUG_ENABLED:
        return

    timestamp = time.strftime("%H:%M:%S")
    ms = int((time.time() % 1) * 1000)

    if args:
        message = message.format(*args)
    elif kwargs:
        message = message.format(**kwargs)

    print(f"[{timestamp}.{ms:03d}] [{category}] {message}", file=sys.stderr)


def debug_ui(message: str, *args, **kwargs) -> None:
    """
    Log UI-related debug messages.

    @param message: Message format string.
    @param args: Positional format arguments.
    @param kwargs: Keyword format arguments.
    """
    if DEBUG_UI:
        debug_log("UI", message, *args, **kwargs)


def debug_world(message: str, *args, **kwargs) -> None:
    """
    Log world generation debug messages.

    @param message: Message format string.
    @param args: Positional format arguments.
    @param kwargs: Keyword format arguments.
    """
    if DEBUG_WORLD_GEN:
        debug_log("WORLD", message, *args, **kwargs)


def debug_game(message: str, *args, **kwargs) -> None:
    """
    Log game flow debug messages.

    @param message: Message format string.
    @param args: Positional format arguments.
    @param kwargs: Keyword format arguments.
    """
    if DEBUG_GAME_FLOW:
        debug_log("GAME", message, *args, **kwargs)


def debug_trace(category: str = "TRACE") -> Callable:
    """
    Decorator to trace function entry/exit with arguments.

    @param category: Log category for trace messages.
    @returns: Decorator function.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__qualname__

            # Format arguments (truncate long values)
            arg_strs = []
            for i, arg in enumerate(args):
                if i == 0 and hasattr(arg, '__class__'):
                    # Skip 'self' but show class name
                    arg_strs.append(f"self={arg.__class__.__name__}")
                else:
                    s = repr(arg)
                    if len(s) > 50:
                        s = s[:47] + "..."
                    arg_strs.append(s)
            for k, v in kwargs.items():
                s = repr(v)
                if len(s) > 50:
                    s = s[:47] + "..."
                arg_strs.append(f"{k}={s}")

            args_str = ", ".join(arg_strs)
            debug_log(category, f"-> {func_name}({args_str})")

            try:
                result = func(*args, **kwargs)
                result_str = repr(result)
                if len(result_str) > 100:
                    result_str = result_str[:97] + "..."
                debug_log(category, f"<- {func_name} returned: {result_str}")
                return result
            except Exception as e:
                debug_log(category, f"!! {func_name} raised: {type(e).__name__}: {e}")
                raise
        return wrapper
    return decorator


def start_timer(name: str) -> None:
    """
    Start a named timer.

    @param name: Timer identifier.
    """
    _timers[name] = time.perf_counter()
    debug_log("TIMER", f"Started timer: {name}")


def stop_timer(name: str) -> float:
    """
    Stop a named timer and return elapsed time.

    @param name: Timer identifier.
    @returns: Elapsed time in seconds.
    """
    if name not in _timers:
        debug_log("TIMER", f"Warning: Timer '{name}' was never started")
        return 0.0
    elapsed = time.perf_counter() - _timers[name]
    debug_log("TIMER", f"Timer {name}: {elapsed*1000:.2f}ms")
    del _timers[name]
    return elapsed


def format_button_info(button: Any) -> str:
    """
    Format button information for debug output.

    @param button: Button object with x, y, width, height attributes.
    @returns: Formatted string describing button bounds.
    """
    if button is None:
        return "None"
    try:
        return (f"'{getattr(button, 'text', '?')}' at "
                f"({button.x:.0f}, {button.y:.0f}) "
                f"{button.width:.0f}x{button.height:.0f}")
    except (AttributeError, TypeError):
        return str(button)


def format_point(mx: float, my: float) -> str:
    """
    Format a point for debug output.

    @param mx: X coordinate.
    @param my: Y coordinate.
    @returns: Formatted string.
    """
    return f"({mx:.0f}, {my:.0f})"
