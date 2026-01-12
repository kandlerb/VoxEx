"""Settings profiles and definitions for VoxEx.

Provides predefined settings profiles and setting definitions
for UI generation and validation.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union


class SettingType(Enum):
    """Types of settings for UI generation."""
    BOOL = "bool"
    INT = "int"
    FLOAT = "float"
    STRING = "string"
    DROPDOWN = "dropdown"
    COLOR = "color"
    SLIDER = "slider"


@dataclass
class SettingDefinition:
    """
    Definition of a single setting for UI generation.

    Contains metadata about the setting including type, range,
    display name, and description.
    """

    key: str
    display_name: str
    description: str
    setting_type: SettingType
    category: str
    default: Any
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    options: Optional[List[Tuple[str, Any]]] = None  # For dropdowns: (display, value)
    unit: Optional[str] = None  # e.g., "%", "chunks", "ms"
    requires_restart: bool = False
    advanced: bool = False

    def validate(self, value: Any) -> bool:
        """
        Validate a value against this setting's constraints.

        @param value: Value to validate.
        @returns: True if value is valid.
        """
        if self.setting_type == SettingType.BOOL:
            return isinstance(value, bool)
        elif self.setting_type in (SettingType.INT, SettingType.SLIDER):
            if not isinstance(value, (int, float)):
                return False
            if self.min_value is not None and value < self.min_value:
                return False
            if self.max_value is not None and value > self.max_value:
                return False
            return True
        elif self.setting_type == SettingType.FLOAT:
            if not isinstance(value, (int, float)):
                return False
            if self.min_value is not None and value < self.min_value:
                return False
            if self.max_value is not None and value > self.max_value:
                return False
            return True
        elif self.setting_type == SettingType.STRING:
            return isinstance(value, str)
        elif self.setting_type == SettingType.DROPDOWN:
            if self.options is None:
                return True
            valid_values = [opt[1] for opt in self.options]
            return value in valid_values
        elif self.setting_type == SettingType.COLOR:
            if isinstance(value, (list, tuple)):
                return len(value) in (3, 4) and all(isinstance(c, int) and 0 <= c <= 255 for c in value)
            return False
        return True


# Settings definitions for UI generation
SETTING_DEFINITIONS: Dict[str, List[SettingDefinition]] = {
    "performance": [
        SettingDefinition(
            key="render_distance",
            display_name="Render Distance",
            description="How far chunks are rendered from the player",
            setting_type=SettingType.SLIDER,
            category="performance",
            default=8,
            min_value=2,
            max_value=32,
            step=1,
            unit="chunks",
        ),
        SettingDefinition(
            key="chunk_load_speed",
            display_name="Chunk Load Speed",
            description="Number of chunks loaded per second",
            setting_type=SettingType.SLIDER,
            category="performance",
            default=4,
            min_value=1,
            max_value=16,
            step=1,
        ),
        SettingDefinition(
            key="max_chunks_per_frame",
            display_name="Max Chunks Per Frame",
            description="Maximum chunk mesh updates per frame",
            setting_type=SettingType.SLIDER,
            category="performance",
            default=2,
            min_value=1,
            max_value=8,
            step=1,
            advanced=True,
        ),
        SettingDefinition(
            key="enable_frustum_culling",
            display_name="Frustum Culling",
            description="Only render chunks visible to the camera",
            setting_type=SettingType.BOOL,
            category="performance",
            default=True,
        ),
        SettingDefinition(
            key="enable_occlusion_culling",
            display_name="Occlusion Culling",
            description="Skip rendering of hidden chunks",
            setting_type=SettingType.BOOL,
            category="performance",
            default=True,
            advanced=True,
        ),
        SettingDefinition(
            key="target_fps",
            display_name="Target FPS",
            description="Target frame rate for the game",
            setting_type=SettingType.DROPDOWN,
            category="performance",
            default=60,
            options=[
                ("30 FPS", 30),
                ("60 FPS", 60),
                ("120 FPS", 120),
                ("Unlimited", 0),
            ],
        ),
        SettingDefinition(
            key="vsync",
            display_name="VSync",
            description="Synchronize frame rate with monitor refresh rate",
            setting_type=SettingType.BOOL,
            category="performance",
            default=True,
        ),
    ],
    "graphics": [
        SettingDefinition(
            key="enable_ao",
            display_name="Ambient Occlusion",
            description="Soft shadows in corners and edges",
            setting_type=SettingType.BOOL,
            category="graphics",
            default=True,
        ),
        SettingDefinition(
            key="ao_intensity",
            display_name="AO Intensity",
            description="Strength of ambient occlusion effect",
            setting_type=SettingType.SLIDER,
            category="graphics",
            default=0.5,
            min_value=0.0,
            max_value=1.0,
            step=0.1,
        ),
        SettingDefinition(
            key="enable_shadows",
            display_name="Shadows",
            description="Enable dynamic shadow casting",
            setting_type=SettingType.BOOL,
            category="graphics",
            default=True,
        ),
        SettingDefinition(
            key="shadow_quality",
            display_name="Shadow Quality",
            description="Quality of shadow rendering",
            setting_type=SettingType.DROPDOWN,
            category="graphics",
            default="medium",
            options=[
                ("Low", "low"),
                ("Medium", "medium"),
                ("High", "high"),
                ("Ultra", "ultra"),
            ],
        ),
        SettingDefinition(
            key="enable_fog",
            display_name="Fog",
            description="Enable distance fog effect",
            setting_type=SettingType.BOOL,
            category="graphics",
            default=True,
        ),
        SettingDefinition(
            key="fog_density",
            display_name="Fog Density",
            description="Thickness of the fog effect",
            setting_type=SettingType.SLIDER,
            category="graphics",
            default=0.02,
            min_value=0.0,
            max_value=0.1,
            step=0.005,
        ),
        SettingDefinition(
            key="fog_color",
            display_name="Fog Color",
            description="Color of the distance fog",
            setting_type=SettingType.COLOR,
            category="graphics",
            default=(135, 180, 220),
            advanced=True,
        ),
        SettingDefinition(
            key="enable_volumetric_lighting",
            display_name="Volumetric Lighting",
            description="God rays and light shafts",
            setting_type=SettingType.BOOL,
            category="graphics",
            default=False,
        ),
        SettingDefinition(
            key="volumetric_intensity",
            display_name="Volumetric Intensity",
            description="Strength of volumetric lighting",
            setting_type=SettingType.SLIDER,
            category="graphics",
            default=0.3,
            min_value=0.0,
            max_value=1.0,
            step=0.1,
        ),
        SettingDefinition(
            key="enable_bloom",
            display_name="Bloom",
            description="Glow effect around bright areas",
            setting_type=SettingType.BOOL,
            category="graphics",
            default=False,
        ),
        SettingDefinition(
            key="gamma",
            display_name="Gamma",
            description="Display gamma correction",
            setting_type=SettingType.SLIDER,
            category="graphics",
            default=1.0,
            min_value=0.5,
            max_value=2.0,
            step=0.1,
        ),
        SettingDefinition(
            key="brightness",
            display_name="Brightness",
            description="Overall scene brightness",
            setting_type=SettingType.SLIDER,
            category="graphics",
            default=1.0,
            min_value=0.5,
            max_value=1.5,
            step=0.1,
        ),
    ],
    "gameplay": [
        SettingDefinition(
            key="mouse_sensitivity",
            display_name="Mouse Sensitivity",
            description="Camera rotation speed",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=0.3,
            min_value=0.05,
            max_value=1.0,
            step=0.05,
        ),
        SettingDefinition(
            key="invert_y_axis",
            display_name="Invert Y Axis",
            description="Invert vertical camera movement",
            setting_type=SettingType.BOOL,
            category="gameplay",
            default=False,
        ),
        SettingDefinition(
            key="fov",
            display_name="Field of View",
            description="Camera field of view",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=75,
            min_value=60,
            max_value=120,
            step=5,
            unit="degrees",
        ),
        SettingDefinition(
            key="walk_speed",
            display_name="Walk Speed",
            description="Normal movement speed",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=4.0,
            min_value=2.0,
            max_value=8.0,
            step=0.5,
        ),
        SettingDefinition(
            key="sprint_speed",
            display_name="Sprint Speed",
            description="Movement speed when sprinting",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=7.0,
            min_value=4.0,
            max_value=15.0,
            step=0.5,
        ),
        SettingDefinition(
            key="fly_speed",
            display_name="Fly Speed",
            description="Movement speed when flying",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=10.0,
            min_value=5.0,
            max_value=30.0,
            step=1.0,
        ),
        SettingDefinition(
            key="jump_force",
            display_name="Jump Force",
            description="Jump height multiplier",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=8.0,
            min_value=4.0,
            max_value=15.0,
            step=0.5,
        ),
        SettingDefinition(
            key="enable_sprint_toggle",
            display_name="Sprint Toggle",
            description="Toggle sprint instead of holding",
            setting_type=SettingType.BOOL,
            category="gameplay",
            default=False,
        ),
        SettingDefinition(
            key="auto_jump",
            display_name="Auto Jump",
            description="Automatically jump over single blocks",
            setting_type=SettingType.BOOL,
            category="gameplay",
            default=False,
        ),
        SettingDefinition(
            key="crosshair_style",
            display_name="Crosshair Style",
            description="Style of the crosshair",
            setting_type=SettingType.DROPDOWN,
            category="gameplay",
            default="cross",
            options=[
                ("Cross", "cross"),
                ("Dot", "dot"),
                ("Circle", "circle"),
            ],
        ),
        SettingDefinition(
            key="crosshair_size",
            display_name="Crosshair Size",
            description="Size of the crosshair",
            setting_type=SettingType.SLIDER,
            category="gameplay",
            default=10,
            min_value=4,
            max_value=24,
            step=2,
        ),
    ],
    "world": [
        SettingDefinition(
            key="time_of_day",
            display_name="Time of Day",
            description="Current time (0 = midnight, 0.5 = noon)",
            setting_type=SettingType.SLIDER,
            category="world",
            default=0.25,
            min_value=0.0,
            max_value=1.0,
            step=0.01,
        ),
        SettingDefinition(
            key="day_cycle_speed",
            display_name="Day Cycle Speed",
            description="Speed of day/night cycle",
            setting_type=SettingType.SLIDER,
            category="world",
            default=1.0,
            min_value=0.0,
            max_value=10.0,
            step=0.5,
        ),
        SettingDefinition(
            key="enable_day_night_cycle",
            display_name="Day/Night Cycle",
            description="Enable automatic day/night progression",
            setting_type=SettingType.BOOL,
            category="world",
            default=True,
        ),
        SettingDefinition(
            key="enable_caves",
            display_name="Generate Caves",
            description="Enable cave generation in new chunks",
            setting_type=SettingType.BOOL,
            category="world",
            default=True,
        ),
        SettingDefinition(
            key="cave_density",
            display_name="Cave Density",
            description="Density of cave networks",
            setting_type=SettingType.SLIDER,
            category="world",
            default=0.5,
            min_value=0.0,
            max_value=1.0,
            step=0.1,
        ),
        SettingDefinition(
            key="enable_structures",
            display_name="Generate Structures",
            description="Generate trees and other structures",
            setting_type=SettingType.BOOL,
            category="world",
            default=True,
        ),
        SettingDefinition(
            key="tree_density",
            display_name="Tree Density",
            description="Density of trees in forests",
            setting_type=SettingType.SLIDER,
            category="world",
            default=1.0,
            min_value=0.0,
            max_value=2.0,
            step=0.1,
        ),
    ],
    "audio": [
        SettingDefinition(
            key="master_volume",
            display_name="Master Volume",
            description="Overall volume level",
            setting_type=SettingType.SLIDER,
            category="audio",
            default=1.0,
            min_value=0.0,
            max_value=1.0,
            step=0.05,
            unit="%",
        ),
        SettingDefinition(
            key="music_volume",
            display_name="Music Volume",
            description="Background music volume",
            setting_type=SettingType.SLIDER,
            category="audio",
            default=0.5,
            min_value=0.0,
            max_value=1.0,
            step=0.05,
            unit="%",
        ),
        SettingDefinition(
            key="sfx_volume",
            display_name="Sound Effects",
            description="Sound effects volume",
            setting_type=SettingType.SLIDER,
            category="audio",
            default=1.0,
            min_value=0.0,
            max_value=1.0,
            step=0.05,
            unit="%",
        ),
        SettingDefinition(
            key="ambient_volume",
            display_name="Ambient Sounds",
            description="Environmental sound volume",
            setting_type=SettingType.SLIDER,
            category="audio",
            default=0.7,
            min_value=0.0,
            max_value=1.0,
            step=0.05,
            unit="%",
        ),
        SettingDefinition(
            key="mute_when_unfocused",
            display_name="Mute When Unfocused",
            description="Mute audio when window loses focus",
            setting_type=SettingType.BOOL,
            category="audio",
            default=True,
        ),
    ],
    "accessibility": [
        SettingDefinition(
            key="enable_subtitles",
            display_name="Subtitles",
            description="Show subtitles for sounds",
            setting_type=SettingType.BOOL,
            category="accessibility",
            default=False,
        ),
        SettingDefinition(
            key="subtitle_size",
            display_name="Subtitle Size",
            description="Size of subtitle text",
            setting_type=SettingType.DROPDOWN,
            category="accessibility",
            default="medium",
            options=[
                ("Small", "small"),
                ("Medium", "medium"),
                ("Large", "large"),
            ],
        ),
        SettingDefinition(
            key="enable_colorblind_mode",
            display_name="Colorblind Mode",
            description="Enable colorblind assistance",
            setting_type=SettingType.BOOL,
            category="accessibility",
            default=False,
        ),
        SettingDefinition(
            key="colorblind_type",
            display_name="Colorblind Type",
            description="Type of color vision deficiency",
            setting_type=SettingType.DROPDOWN,
            category="accessibility",
            default="none",
            options=[
                ("None", "none"),
                ("Protanopia (Red)", "protanopia"),
                ("Deuteranopia (Green)", "deuteranopia"),
                ("Tritanopia (Blue)", "tritanopia"),
            ],
        ),
        SettingDefinition(
            key="reduce_motion",
            display_name="Reduce Motion",
            description="Reduce camera shake and animations",
            setting_type=SettingType.BOOL,
            category="accessibility",
            default=False,
        ),
        SettingDefinition(
            key="high_contrast_ui",
            display_name="High Contrast UI",
            description="Increase UI contrast for visibility",
            setting_type=SettingType.BOOL,
            category="accessibility",
            default=False,
        ),
        SettingDefinition(
            key="screen_shake",
            display_name="Screen Shake",
            description="Intensity of screen shake effects",
            setting_type=SettingType.SLIDER,
            category="accessibility",
            default=1.0,
            min_value=0.0,
            max_value=1.0,
            step=0.1,
        ),
    ],
}


# Time of day presets
TIME_PRESETS: Dict[str, Dict[str, Any]] = {
    "dawn": {
        "display_name": "Dawn",
        "time": 0.2,
        "description": "Early morning light",
        "fog_color": (180, 140, 120),
    },
    "sunrise": {
        "display_name": "Sunrise",
        "time": 0.25,
        "description": "Golden morning sun",
        "fog_color": (220, 180, 140),
    },
    "morning": {
        "display_name": "Morning",
        "time": 0.3,
        "description": "Bright morning light",
        "fog_color": (180, 200, 220),
    },
    "noon": {
        "display_name": "Noon",
        "time": 0.5,
        "description": "Midday sun overhead",
        "fog_color": (135, 180, 220),
    },
    "afternoon": {
        "display_name": "Afternoon",
        "time": 0.6,
        "description": "Warm afternoon light",
        "fog_color": (160, 180, 200),
    },
    "sunset": {
        "display_name": "Sunset",
        "time": 0.75,
        "description": "Orange sunset glow",
        "fog_color": (255, 140, 80),
    },
    "dusk": {
        "display_name": "Dusk",
        "time": 0.8,
        "description": "Twilight fading to night",
        "fog_color": (120, 100, 140),
    },
    "night": {
        "display_name": "Night",
        "time": 0.0,
        "description": "Dark starlit night",
        "fog_color": (20, 30, 50),
    },
    "midnight": {
        "display_name": "Midnight",
        "time": 0.0,
        "description": "Deepest night",
        "fog_color": (10, 15, 30),
    },
}


# Settings profiles
SETTINGS_PROFILES: Dict[str, Dict[str, Any]] = {
    "performance": {
        "display_name": "Performance",
        "description": "Optimized for lower-end hardware",
        "performance": {
            "render_distance": 4,
            "chunk_load_speed": 2,
            "max_chunks_per_frame": 1,
            "enable_frustum_culling": True,
            "enable_occlusion_culling": True,
            "target_fps": 60,
            "vsync": True,
        },
        "graphics": {
            "enable_ao": False,
            "enable_shadows": False,
            "enable_fog": True,
            "fog_density": 0.03,
            "enable_volumetric_lighting": False,
            "enable_bloom": False,
        },
    },
    "balanced": {
        "display_name": "Balanced",
        "description": "Balance of visuals and performance",
        "performance": {
            "render_distance": 8,
            "chunk_load_speed": 4,
            "max_chunks_per_frame": 2,
            "enable_frustum_culling": True,
            "enable_occlusion_culling": True,
            "target_fps": 60,
            "vsync": True,
        },
        "graphics": {
            "enable_ao": True,
            "ao_intensity": 0.4,
            "enable_shadows": True,
            "shadow_quality": "medium",
            "enable_fog": True,
            "fog_density": 0.02,
            "enable_volumetric_lighting": False,
            "enable_bloom": False,
        },
    },
    "quality": {
        "display_name": "Quality",
        "description": "High visual quality",
        "performance": {
            "render_distance": 12,
            "chunk_load_speed": 6,
            "max_chunks_per_frame": 3,
            "enable_frustum_culling": True,
            "enable_occlusion_culling": True,
            "target_fps": 60,
            "vsync": True,
        },
        "graphics": {
            "enable_ao": True,
            "ao_intensity": 0.5,
            "enable_shadows": True,
            "shadow_quality": "high",
            "enable_fog": True,
            "fog_density": 0.015,
            "enable_volumetric_lighting": True,
            "volumetric_intensity": 0.3,
            "enable_bloom": True,
            "bloom_intensity": 0.15,
        },
    },
    "ultra": {
        "display_name": "Ultra",
        "description": "Maximum visual quality",
        "performance": {
            "render_distance": 16,
            "chunk_load_speed": 8,
            "max_chunks_per_frame": 4,
            "enable_frustum_culling": True,
            "enable_occlusion_culling": True,
            "target_fps": 0,  # Unlimited
            "vsync": False,
        },
        "graphics": {
            "enable_ao": True,
            "ao_intensity": 0.6,
            "enable_shadows": True,
            "shadow_quality": "ultra",
            "enable_fog": True,
            "fog_density": 0.01,
            "enable_volumetric_lighting": True,
            "volumetric_intensity": 0.5,
            "enable_bloom": True,
            "bloom_intensity": 0.2,
        },
    },
}


# Category display information
CATEGORY_INFO: Dict[str, Dict[str, str]] = {
    "performance": {
        "display_name": "Performance",
        "icon": "P",
        "description": "Render distance, chunk loading, and optimization settings",
    },
    "graphics": {
        "display_name": "Graphics",
        "icon": "G",
        "description": "Visual quality and effects settings",
    },
    "gameplay": {
        "display_name": "Gameplay",
        "icon": "C",
        "description": "Controls, movement, and interaction settings",
    },
    "world": {
        "display_name": "World",
        "icon": "W",
        "description": "World generation and environment settings",
    },
    "audio": {
        "display_name": "Audio",
        "icon": "A",
        "description": "Volume and sound settings",
    },
    "accessibility": {
        "display_name": "Accessibility",
        "icon": "X",
        "description": "Accessibility and comfort settings",
    },
}


def get_definition(category: str, key: str) -> Optional[SettingDefinition]:
    """
    Get the definition for a specific setting.

    @param category: Category name.
    @param key: Setting key.
    @returns: SettingDefinition or None if not found.
    """
    definitions = SETTING_DEFINITIONS.get(category, [])
    for definition in definitions:
        if definition.key == key:
            return definition
    return None


def get_all_definitions() -> List[SettingDefinition]:
    """
    Get all setting definitions as a flat list.

    @returns: List of all SettingDefinition objects.
    """
    result = []
    for definitions in SETTING_DEFINITIONS.values():
        result.extend(definitions)
    return result


def search_settings(query: str) -> List[SettingDefinition]:
    """
    Search settings by display name or description.

    @param query: Search query string.
    @returns: List of matching SettingDefinition objects.
    """
    query = query.lower().strip()
    if not query:
        return []

    results = []
    for definition in get_all_definitions():
        if (query in definition.display_name.lower() or
                query in definition.description.lower() or
                query in definition.key.lower()):
            results.append(definition)
    return results
