"""Settings manager for VoxEx.

Handles loading, saving, and applying game settings with automatic
persistence and change notifications.
"""

import json
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .game_settings import GameSettings
from .profiles import SETTINGS_PROFILES, get_definition


class SettingsManager:
    """
    Manages game settings with persistence.

    Features:
    - Automatic loading on startup
    - Automatic saving on changes
    - Change notification callbacks
    - Profile management
    - Settings validation
    """

    def __init__(
        self,
        settings_path: Optional[Path] = None,
        auto_save: bool = True,
    ):
        """
        Create settings manager.

        @param settings_path: Path to settings file. If None, uses default.
        @param auto_save: If True, automatically save on changes.
        """
        self._settings_path = settings_path or self._get_default_path()
        self._auto_save = auto_save
        self._settings = GameSettings()
        self._change_callbacks: List[Callable[[str, str, Any], None]] = []
        self._loaded = False

    @staticmethod
    def _get_default_path() -> Path:
        """Get default settings file path."""
        # Use user's home directory
        home = Path.home()
        voxex_dir = home / ".voxex"
        return voxex_dir / "settings.json"

    @property
    def settings(self) -> GameSettings:
        """Get the current settings."""
        return self._settings

    @property
    def is_loaded(self) -> bool:
        """Check if settings have been loaded."""
        return self._loaded

    def load(self) -> bool:
        """
        Load settings from file.

        @returns: True if settings were loaded successfully.
        """
        loaded = GameSettings.load(self._settings_path)
        if loaded:
            self._settings = loaded
            self._loaded = True
            return True

        # Create default settings if file doesn't exist
        self._settings = GameSettings()
        self._loaded = True
        return False

    def save(self) -> bool:
        """
        Save settings to file.

        @returns: True if settings were saved successfully.
        """
        return self._settings.save(self._settings_path)

    def reset_to_defaults(self) -> None:
        """Reset all settings to defaults."""
        self._settings.reset_to_defaults()
        if self._auto_save:
            self.save()
        self._notify_all_changed()

    def apply_profile(self, profile_name: str) -> bool:
        """
        Apply a settings profile.

        @param profile_name: Name of profile to apply.
        @returns: True if profile was applied.
        """
        if self._settings.apply_profile(profile_name):
            if self._auto_save:
                self.save()
            self._notify_all_changed()
            return True
        return False

    def get_value(self, category: str, key: str) -> Any:
        """
        Get a setting value.

        @param category: Category name.
        @param key: Setting key.
        @returns: Setting value, or None if not found.
        """
        return self._settings.get_value(category, key)

    def set_value(self, category: str, key: str, value: Any) -> bool:
        """
        Set a setting value.

        @param category: Category name.
        @param key: Setting key.
        @param value: New value.
        @returns: True if value was set.
        """
        # Validate if definition exists
        definition = get_definition(category, key)
        if definition and not definition.validate(value):
            return False

        if self._settings.set_value(category, key, value):
            if self._auto_save:
                self.save()
            self._notify_change(category, key, value)
            return True
        return False

    def add_change_callback(
        self,
        callback: Callable[[str, str, Any], None]
    ) -> None:
        """
        Add a callback for setting changes.

        Callback receives (category, key, value).

        @param callback: Callback function.
        """
        if callback not in self._change_callbacks:
            self._change_callbacks.append(callback)

    def remove_change_callback(
        self,
        callback: Callable[[str, str, Any], None]
    ) -> None:
        """
        Remove a change callback.

        @param callback: Callback to remove.
        """
        if callback in self._change_callbacks:
            self._change_callbacks.remove(callback)

    def _notify_change(self, category: str, key: str, value: Any) -> None:
        """Notify callbacks of a single setting change."""
        for callback in self._change_callbacks:
            try:
                callback(category, key, value)
            except Exception:
                pass  # Don't let callback errors break settings

    def _notify_all_changed(self) -> None:
        """Notify callbacks that all settings may have changed."""
        # Send a special notification
        for callback in self._change_callbacks:
            try:
                callback("*", "*", None)
            except Exception:
                pass

    def get_profile_names(self) -> List[str]:
        """
        Get list of available profile names.

        @returns: List of profile names.
        """
        return list(SETTINGS_PROFILES.keys())

    def get_current_profile(self) -> Optional[str]:
        """
        Get name of currently active profile, if any.

        @returns: Profile name or None.
        """
        return self._settings.current_profile

    def export_settings(self, path: Path) -> bool:
        """
        Export settings to a file.

        @param path: Path to export to.
        @returns: True if export succeeded.
        """
        return self._settings.save(path)

    def import_settings(self, path: Path) -> bool:
        """
        Import settings from a file.

        @param path: Path to import from.
        @returns: True if import succeeded.
        """
        loaded = GameSettings.load(path)
        if loaded:
            self._settings = loaded
            if self._auto_save:
                self.save()
            self._notify_all_changed()
            return True
        return False

    # Convenience properties for common settings

    @property
    def render_distance(self) -> int:
        """Get render distance."""
        return self._settings.performance.render_distance

    @render_distance.setter
    def render_distance(self, value: int) -> None:
        """Set render distance."""
        self.set_value("performance", "render_distance", value)

    @property
    def enable_ao(self) -> bool:
        """Get ambient occlusion setting."""
        return self._settings.graphics.enable_ao

    @enable_ao.setter
    def enable_ao(self, value: bool) -> None:
        """Set ambient occlusion."""
        self.set_value("graphics", "enable_ao", value)

    @property
    def enable_shadows(self) -> bool:
        """Get shadows setting."""
        return self._settings.graphics.enable_shadows

    @enable_shadows.setter
    def enable_shadows(self, value: bool) -> None:
        """Set shadows."""
        self.set_value("graphics", "enable_shadows", value)

    @property
    def mouse_sensitivity(self) -> float:
        """Get mouse sensitivity."""
        return self._settings.gameplay.mouse_sensitivity

    @mouse_sensitivity.setter
    def mouse_sensitivity(self, value: float) -> None:
        """Set mouse sensitivity."""
        self.set_value("gameplay", "mouse_sensitivity", value)

    @property
    def fov(self) -> int:
        """Get field of view."""
        return self._settings.gameplay.fov

    @fov.setter
    def fov(self, value: int) -> None:
        """Set field of view."""
        self.set_value("gameplay", "fov", value)

    @property
    def master_volume(self) -> float:
        """Get master volume."""
        return self._settings.audio.master_volume

    @master_volume.setter
    def master_volume(self, value: float) -> None:
        """Set master volume."""
        self.set_value("audio", "master_volume", value)

    @property
    def time_of_day(self) -> float:
        """Get time of day."""
        return self._settings.world.time_of_day

    @time_of_day.setter
    def time_of_day(self, value: float) -> None:
        """Set time of day."""
        self.set_value("world", "time_of_day", value)
