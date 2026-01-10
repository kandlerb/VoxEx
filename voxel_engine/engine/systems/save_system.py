"""
Save system with autosave support.

Handles periodic autosaving and coordinates with SaveManager
for persistence operations.
"""

import time
from typing import Optional, Callable, TYPE_CHECKING

from .base import TickSystem

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState
    from voxel_engine.engine.persistence import SaveManager


# Default autosave interval (5 minutes)
DEFAULT_AUTOSAVE_INTERVAL: float = 300.0


class SaveSystem(TickSystem):
    """
    Handles autosave and save coordination.

    Priority: 100 (runs late, after gameplay systems)
    """

    __slots__ = (
        '_save_manager', '_autosave_enabled', '_autosave_interval',
        '_last_autosave', '_on_autosave', '_autosave_pending'
    )

    def __init__(
        self,
        save_manager: "SaveManager",
        autosave_enabled: bool = True,
        autosave_interval: float = DEFAULT_AUTOSAVE_INTERVAL
    ):
        """
        Initialize save system.

        Args:
            save_manager: SaveManager instance.
            autosave_enabled: Whether autosave is enabled.
            autosave_interval: Interval between autosaves (seconds).
        """
        super().__init__(priority=100)
        self._save_manager = save_manager
        self._autosave_enabled = autosave_enabled
        self._autosave_interval = autosave_interval
        self._last_autosave = time.time()
        self._on_autosave: Optional[Callable[[], None]] = None
        self._autosave_pending = False

    @property
    def save_manager(self) -> "SaveManager":
        """Get the save manager."""
        return self._save_manager

    @property
    def autosave_enabled(self) -> bool:
        """Check if autosave is enabled."""
        return self._autosave_enabled

    @autosave_enabled.setter
    def autosave_enabled(self, value: bool) -> None:
        """Enable or disable autosave."""
        self._autosave_enabled = value

    @property
    def autosave_interval(self) -> float:
        """Get autosave interval in seconds."""
        return self._autosave_interval

    @autosave_interval.setter
    def autosave_interval(self, value: float) -> None:
        """Set autosave interval in seconds."""
        self._autosave_interval = max(60.0, value)  # Minimum 1 minute

    def set_autosave_callback(self, callback: Callable[[], None]) -> None:
        """
        Set callback to notify when autosave occurs.

        Args:
            callback: Function to call after autosave.
        """
        self._on_autosave = callback

    def tick(self, state: "GameState", dt: float) -> None:
        """
        Check for autosave.

        Args:
            state: Current game state.
            dt: Time delta (unused).
        """
        if not self._autosave_enabled:
            return

        current_time = time.time()

        if current_time - self._last_autosave >= self._autosave_interval:
            # Perform autosave
            if self._save_manager.quick_save(state):
                self._last_autosave = current_time
                if self._on_autosave:
                    self._on_autosave()

    def force_autosave(self, state: "GameState") -> bool:
        """
        Force an immediate autosave.

        Args:
            state: Current game state.

        Returns:
            bool: True if autosave successful.
        """
        result = self._save_manager.quick_save(state)
        if result:
            self._last_autosave = time.time()
        return result

    def time_until_autosave(self) -> float:
        """
        Get time until next autosave.

        Returns:
            float: Seconds until next autosave.
        """
        if not self._autosave_enabled:
            return float('inf')

        elapsed = time.time() - self._last_autosave
        return max(0.0, self._autosave_interval - elapsed)

    def reset_autosave_timer(self) -> None:
        """Reset the autosave timer (e.g., after manual save)."""
        self._last_autosave = time.time()

    def shutdown(self) -> None:
        """Clean up resources."""
        pass
