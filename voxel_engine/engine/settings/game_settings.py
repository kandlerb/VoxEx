"""Game settings dataclasses for VoxEx.

Provides comprehensive settings management with nested categories,
serialization, and profile support.
"""

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, Any, Optional, Tuple


@dataclass
class PerformanceSettings:
    """
    Performance-related settings.

    Controls render distance, chunk loading, and optimization options.
    """

    render_distance: int = 8
    chunk_load_speed: int = 4
    max_chunks_per_frame: int = 2
    enable_frustum_culling: bool = True
    enable_occlusion_culling: bool = True
    target_fps: int = 60
    vsync: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PerformanceSettings":
        """Create from dictionary."""
        return cls(
            render_distance=data.get("render_distance", 8),
            chunk_load_speed=data.get("chunk_load_speed", 4),
            max_chunks_per_frame=data.get("max_chunks_per_frame", 2),
            enable_frustum_culling=data.get("enable_frustum_culling", True),
            enable_occlusion_culling=data.get("enable_occlusion_culling", True),
            target_fps=data.get("target_fps", 60),
            vsync=data.get("vsync", True),
        )


@dataclass
class GraphicsSettings:
    """
    Graphics and visual quality settings.

    Controls ambient occlusion, shadows, fog, and visual effects.
    """

    enable_ao: bool = True
    ao_intensity: float = 0.5
    enable_shadows: bool = True
    shadow_quality: str = "medium"  # "low", "medium", "high", "ultra"
    enable_fog: bool = True
    fog_density: float = 0.02
    fog_color: Tuple[int, int, int] = (135, 180, 220)
    enable_volumetric_lighting: bool = False
    volumetric_intensity: float = 0.3
    enable_bloom: bool = False
    bloom_intensity: float = 0.2
    gamma: float = 1.0
    brightness: float = 1.0
    contrast: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = asdict(self)
        # Convert tuple to list for JSON serialization
        data["fog_color"] = list(self.fog_color)
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GraphicsSettings":
        """Create from dictionary."""
        fog_color = data.get("fog_color", [135, 180, 220])
        if isinstance(fog_color, list):
            fog_color = tuple(fog_color)
        return cls(
            enable_ao=data.get("enable_ao", True),
            ao_intensity=data.get("ao_intensity", 0.5),
            enable_shadows=data.get("enable_shadows", True),
            shadow_quality=data.get("shadow_quality", "medium"),
            enable_fog=data.get("enable_fog", True),
            fog_density=data.get("fog_density", 0.02),
            fog_color=fog_color,
            enable_volumetric_lighting=data.get("enable_volumetric_lighting", False),
            volumetric_intensity=data.get("volumetric_intensity", 0.3),
            enable_bloom=data.get("enable_bloom", False),
            bloom_intensity=data.get("bloom_intensity", 0.2),
            gamma=data.get("gamma", 1.0),
            brightness=data.get("brightness", 1.0),
            contrast=data.get("contrast", 1.0),
        )


@dataclass
class GameplaySettings:
    """
    Gameplay-related settings.

    Controls movement, interaction, and game mechanics.
    """

    mouse_sensitivity: float = 0.3
    invert_y_axis: bool = False
    fov: int = 75
    sprint_fov_increase: int = 5
    walk_speed: float = 4.0
    sprint_speed: float = 7.0
    fly_speed: float = 10.0
    jump_force: float = 8.0
    enable_sprint_toggle: bool = False
    enable_crouch_toggle: bool = False
    auto_jump: bool = False
    crosshair_style: str = "cross"  # "cross", "dot", "circle"
    crosshair_size: int = 10
    crosshair_color: Tuple[int, int, int, int] = (255, 255, 255, 200)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = asdict(self)
        data["crosshair_color"] = list(self.crosshair_color)
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GameplaySettings":
        """Create from dictionary."""
        crosshair_color = data.get("crosshair_color", [255, 255, 255, 200])
        if isinstance(crosshair_color, list):
            crosshair_color = tuple(crosshair_color)
        return cls(
            mouse_sensitivity=data.get("mouse_sensitivity", 0.3),
            invert_y_axis=data.get("invert_y_axis", False),
            fov=data.get("fov", 75),
            sprint_fov_increase=data.get("sprint_fov_increase", 5),
            walk_speed=data.get("walk_speed", 4.0),
            sprint_speed=data.get("sprint_speed", 7.0),
            fly_speed=data.get("fly_speed", 10.0),
            jump_force=data.get("jump_force", 8.0),
            enable_sprint_toggle=data.get("enable_sprint_toggle", False),
            enable_crouch_toggle=data.get("enable_crouch_toggle", False),
            auto_jump=data.get("auto_jump", False),
            crosshair_style=data.get("crosshair_style", "cross"),
            crosshair_size=data.get("crosshair_size", 10),
            crosshair_color=crosshair_color,
        )


@dataclass
class WorldSettings:
    """
    World generation and environment settings.

    Controls terrain generation parameters and world behavior.
    """

    default_seed: Optional[int] = None
    world_height: int = 320
    sea_level: int = 62
    enable_caves: bool = True
    cave_density: float = 0.5
    enable_structures: bool = True
    tree_density: float = 1.0
    biome_scale: float = 1.0
    time_of_day: float = 0.25  # 0.0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    day_cycle_speed: float = 1.0
    enable_day_night_cycle: bool = True
    weather_enabled: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WorldSettings":
        """Create from dictionary."""
        return cls(
            default_seed=data.get("default_seed"),
            world_height=data.get("world_height", 320),
            sea_level=data.get("sea_level", 62),
            enable_caves=data.get("enable_caves", True),
            cave_density=data.get("cave_density", 0.5),
            enable_structures=data.get("enable_structures", True),
            tree_density=data.get("tree_density", 1.0),
            biome_scale=data.get("biome_scale", 1.0),
            time_of_day=data.get("time_of_day", 0.25),
            day_cycle_speed=data.get("day_cycle_speed", 1.0),
            enable_day_night_cycle=data.get("enable_day_night_cycle", True),
            weather_enabled=data.get("weather_enabled", False),
        )


@dataclass
class AudioSettings:
    """
    Audio and sound settings.

    Controls volume levels for different audio categories.
    """

    master_volume: float = 1.0
    music_volume: float = 0.5
    sfx_volume: float = 1.0
    ambient_volume: float = 0.7
    ui_volume: float = 0.8
    enable_positional_audio: bool = True
    mute_when_unfocused: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AudioSettings":
        """Create from dictionary."""
        return cls(
            master_volume=data.get("master_volume", 1.0),
            music_volume=data.get("music_volume", 0.5),
            sfx_volume=data.get("sfx_volume", 1.0),
            ambient_volume=data.get("ambient_volume", 0.7),
            ui_volume=data.get("ui_volume", 0.8),
            enable_positional_audio=data.get("enable_positional_audio", True),
            mute_when_unfocused=data.get("mute_when_unfocused", True),
        )


@dataclass
class AccessibilitySettings:
    """
    Accessibility settings.

    Controls features to improve accessibility.
    """

    enable_subtitles: bool = False
    subtitle_size: str = "medium"  # "small", "medium", "large"
    enable_colorblind_mode: bool = False
    colorblind_type: str = "none"  # "none", "protanopia", "deuteranopia", "tritanopia"
    reduce_motion: bool = False
    high_contrast_ui: bool = False
    screen_shake: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AccessibilitySettings":
        """Create from dictionary."""
        return cls(
            enable_subtitles=data.get("enable_subtitles", False),
            subtitle_size=data.get("subtitle_size", "medium"),
            enable_colorblind_mode=data.get("enable_colorblind_mode", False),
            colorblind_type=data.get("colorblind_type", "none"),
            reduce_motion=data.get("reduce_motion", False),
            high_contrast_ui=data.get("high_contrast_ui", False),
            screen_shake=data.get("screen_shake", 1.0),
        )


@dataclass
class GameSettings:
    """
    Master settings container.

    Contains all settings categories and provides serialization,
    profile management, and file I/O operations.
    """

    performance: PerformanceSettings = field(default_factory=PerformanceSettings)
    graphics: GraphicsSettings = field(default_factory=GraphicsSettings)
    gameplay: GameplaySettings = field(default_factory=GameplaySettings)
    world: WorldSettings = field(default_factory=WorldSettings)
    audio: AudioSettings = field(default_factory=AudioSettings)
    accessibility: AccessibilitySettings = field(default_factory=AccessibilitySettings)

    # Profile name (if loaded from a profile)
    current_profile: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert all settings to a dictionary.

        @returns: Dictionary containing all settings categories.
        """
        return {
            "performance": self.performance.to_dict(),
            "graphics": self.graphics.to_dict(),
            "gameplay": self.gameplay.to_dict(),
            "world": self.world.to_dict(),
            "audio": self.audio.to_dict(),
            "accessibility": self.accessibility.to_dict(),
            "current_profile": self.current_profile,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GameSettings":
        """
        Create settings from a dictionary.

        @param data: Dictionary containing settings data.
        @returns: GameSettings instance.
        """
        return cls(
            performance=PerformanceSettings.from_dict(data.get("performance", {})),
            graphics=GraphicsSettings.from_dict(data.get("graphics", {})),
            gameplay=GameplaySettings.from_dict(data.get("gameplay", {})),
            world=WorldSettings.from_dict(data.get("world", {})),
            audio=AudioSettings.from_dict(data.get("audio", {})),
            accessibility=AccessibilitySettings.from_dict(data.get("accessibility", {})),
            current_profile=data.get("current_profile"),
        )

    def save(self, path: Path) -> bool:
        """
        Save settings to a JSON file.

        @param path: Path to save settings to.
        @returns: True if save was successful.
        """
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(self.to_dict(), f, indent=2)
            return True
        except (OSError, IOError):
            return False

    @classmethod
    def load(cls, path: Path) -> Optional["GameSettings"]:
        """
        Load settings from a JSON file.

        @param path: Path to load settings from.
        @returns: GameSettings instance, or None if load failed.
        """
        try:
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return cls.from_dict(data)
        except (OSError, IOError, json.JSONDecodeError):
            return None

    def apply_profile(self, profile_name: str) -> bool:
        """
        Apply a settings profile.

        @param profile_name: Name of the profile to apply.
        @returns: True if profile was applied successfully.
        """
        from .profiles import SETTINGS_PROFILES

        if profile_name not in SETTINGS_PROFILES:
            return False

        profile = SETTINGS_PROFILES[profile_name]

        # Apply performance settings
        if "performance" in profile:
            for key, value in profile["performance"].items():
                if hasattr(self.performance, key):
                    setattr(self.performance, key, value)

        # Apply graphics settings
        if "graphics" in profile:
            for key, value in profile["graphics"].items():
                if hasattr(self.graphics, key):
                    setattr(self.graphics, key, value)

        # Apply gameplay settings
        if "gameplay" in profile:
            for key, value in profile["gameplay"].items():
                if hasattr(self.gameplay, key):
                    setattr(self.gameplay, key, value)

        # Apply world settings
        if "world" in profile:
            for key, value in profile["world"].items():
                if hasattr(self.world, key):
                    setattr(self.world, key, value)

        # Apply audio settings
        if "audio" in profile:
            for key, value in profile["audio"].items():
                if hasattr(self.audio, key):
                    setattr(self.audio, key, value)

        self.current_profile = profile_name
        return True

    def reset_to_defaults(self) -> None:
        """Reset all settings to their default values."""
        self.performance = PerformanceSettings()
        self.graphics = GraphicsSettings()
        self.gameplay = GameplaySettings()
        self.world = WorldSettings()
        self.audio = AudioSettings()
        self.accessibility = AccessibilitySettings()
        self.current_profile = None

    def get_value(self, category: str, key: str) -> Any:
        """
        Get a setting value by category and key.

        @param category: Category name (e.g., "performance", "graphics").
        @param key: Setting key within the category.
        @returns: Setting value, or None if not found.
        """
        category_obj = getattr(self, category, None)
        if category_obj is None:
            return None
        return getattr(category_obj, key, None)

    def set_value(self, category: str, key: str, value: Any) -> bool:
        """
        Set a setting value by category and key.

        @param category: Category name.
        @param key: Setting key within the category.
        @param value: Value to set.
        @returns: True if value was set successfully.
        """
        category_obj = getattr(self, category, None)
        if category_obj is None:
            return False
        if not hasattr(category_obj, key):
            return False
        setattr(category_obj, key, value)
        # Clear profile when manually changing settings
        self.current_profile = None
        return True
