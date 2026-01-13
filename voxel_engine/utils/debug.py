"""Debug logging utilities for VoxEx.

Provides comprehensive debug logging for tracing UI flows, game state,
and world generation. Enable/disable via module-level flags.
"""

import sys
import time
from functools import wraps
from typing import Any, Callable, Optional


# ============================================================================
# Global Debug Flags - Set to True to enable verbose logging
# ============================================================================
DEBUG_ENABLED = True       # Master switch for all debug logging
DEBUG_UI = True            # UI events (button clicks, menu states)
DEBUG_WORLD_GEN = True     # World generation flow
DEBUG_GAME_FLOW = True     # Game state transitions
DEBUG_INPUT = True         # Input events (key/mouse)

# Track timing
_timers: dict = {}


def debug_log(category: str, message: str, *args, **kwargs) -> None:
    """
    Print debug message with category and timestamp.

    @param category: Log category tag (e.g., "UI", "GAME").
    @param message: Message format string.
    @param args: Positional format arguments.
    @param kwargs: Keyword format arguments.
    """
    if not DEBUG_ENABLED:
        return

    timestamp = time.strftime("%H:%M:%S")
    ms = int((time.time() % 1) * 1000)

    if args:
        try:
            message = message.format(*args)
        except (IndexError, KeyError):
            message = f"{message} [args: {args}]"
    elif kwargs:
        try:
            message = message.format(**kwargs)
        except KeyError:
            message = f"{message} [kwargs: {kwargs}]"

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


def debug_input(message: str, *args, **kwargs) -> None:
    """
    Log input-related debug messages.

    @param message: Message format string.
    @param args: Positional format arguments.
    @param kwargs: Keyword format arguments.
    """
    if DEBUG_INPUT:
        debug_log("INPUT", message, *args, **kwargs)


def debug_trace(category: str = "TRACE") -> Callable:
    """
    Decorator to trace function entry/exit with arguments.

    @param category: Log category for trace messages.
    @returns: Decorated function.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not DEBUG_ENABLED:
                return func(*args, **kwargs)

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

    @param name: Timer name for identification.
    """
    _timers[name] = time.perf_counter()
    if DEBUG_ENABLED:
        debug_log("TIMER", f"Started timer: {name}")


def stop_timer(name: str) -> float:
    """
    Stop a named timer and return elapsed time.

    @param name: Timer name.
    @returns: Elapsed time in seconds.
    """
    if name not in _timers:
        if DEBUG_ENABLED:
            debug_log("TIMER", f"Warning: Timer '{name}' was never started")
        return 0.0
    elapsed = time.perf_counter() - _timers[name]
    if DEBUG_ENABLED:
        debug_log("TIMER", f"Timer {name}: {elapsed*1000:.2f}ms")
    del _timers[name]
    return elapsed


def set_debug_enabled(enabled: bool) -> None:
    """
    Enable or disable all debug logging.

    @param enabled: True to enable, False to disable.
    """
    global DEBUG_ENABLED
    DEBUG_ENABLED = enabled


def set_debug_flags(
    ui: Optional[bool] = None,
    world: Optional[bool] = None,
    game: Optional[bool] = None,
    input_: Optional[bool] = None
) -> None:
    """
    Set individual debug flags.

    @param ui: Enable UI debug logging.
    @param world: Enable world generation debug logging.
    @param game: Enable game flow debug logging.
    @param input_: Enable input debug logging.
    """
    global DEBUG_UI, DEBUG_WORLD_GEN, DEBUG_GAME_FLOW, DEBUG_INPUT
    if ui is not None:
        DEBUG_UI = ui
    if world is not None:
        DEBUG_WORLD_GEN = world
    if game is not None:
        DEBUG_GAME_FLOW = game
    if input_ is not None:
        DEBUG_INPUT = input_
