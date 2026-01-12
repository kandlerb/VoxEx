"""VoxEx Settings System.

Provides comprehensive game settings management with nested categories,
profiles, persistence, and UI generation support.

Components:
- GameSettings: Master container for all settings
- PerformanceSettings, GraphicsSettings, etc.: Category-specific settings
- SettingDefinition: Metadata for UI generation
- SETTINGS_PROFILES: Predefined quality profiles
- TIME_PRESETS: Time of day presets

Usage:
    from voxel_engine.engine.settings import GameSettings, SETTINGS_PROFILES

    # Create default settings
    settings = GameSettings()

    # Apply a profile
    settings.apply_profile("balanced")

    # Save/load settings
    settings.save(Path("settings.json"))
    settings = GameSettings.load(Path("settings.json"))

    # Get/set values
    value = settings.get_value("performance", "render_distance")
    settings.set_value("graphics", "enable_ao", True)
"""

from .game_settings import (
    GameSettings,
    PerformanceSettings,
    GraphicsSettings,
    GameplaySettings,
    WorldSettings,
    AudioSettings,
    AccessibilitySettings,
)

from .profiles import (
    SettingType,
    SettingDefinition,
    SETTING_DEFINITIONS,
    SETTINGS_PROFILES,
    TIME_PRESETS,
    CATEGORY_INFO,
    get_definition,
    get_all_definitions,
    search_settings,
)

from .settings_manager import SettingsManager

__all__ = [
    # Settings dataclasses
    "GameSettings",
    "PerformanceSettings",
    "GraphicsSettings",
    "GameplaySettings",
    "WorldSettings",
    "AudioSettings",
    "AccessibilitySettings",
    # Definition types
    "SettingType",
    "SettingDefinition",
    # Data
    "SETTING_DEFINITIONS",
    "SETTINGS_PROFILES",
    "TIME_PRESETS",
    "CATEGORY_INFO",
    # Functions
    "get_definition",
    "get_all_definitions",
    "search_settings",
    # Manager
    "SettingsManager",
]
