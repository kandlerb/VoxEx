"""World generation settings for VoxEx.

Defines configurable settings for world generation including:
- World name and seed
- World type presets
- Enabled biomes
- Structure toggles (trees, caves, rivers)
- Terrain parameters (amplitude, sea level)
- Advanced noise parameters
"""

from dataclasses import dataclass, field
from typing import Set, Optional, Dict, Any
import random


# List of all available biomes
BIOME_LIST = [
    'plains',
    'hills',
    'forests',
    'mountains',
    'swamp',
    'longwoods',
]


# World type preset configurations
WORLD_PRESETS: Dict[str, Dict[str, Any]] = {
    'default': {
        'terrain_amplitude': 1.0,
        'sea_level': 60,
        'cave_density': 1.0,
        'biome_size': 1.0,
        'enable_caves': True,
        'enable_rivers': True,
        'enable_trees': True,
        'tree_density': 1.0,
    },
    'amplified': {
        'terrain_amplitude': 2.0,
        'sea_level': 60,
        'cave_density': 1.0,
        'biome_size': 1.5,
        'enable_caves': True,
        'enable_rivers': True,
        'enable_trees': True,
        'tree_density': 1.0,
    },
    'flat': {
        'terrain_amplitude': 0.0,
        'sea_level': 60,
        'cave_density': 0.0,
        'biome_size': 1.0,
        'enable_caves': False,
        'enable_rivers': False,
        'enable_trees': True,
        'tree_density': 0.5,
    },
    'archipelago': {
        'terrain_amplitude': 0.8,
        'sea_level': 72,
        'cave_density': 0.5,
        'biome_size': 0.5,
        'enable_caves': True,
        'enable_rivers': False,
        'enable_trees': True,
        'tree_density': 0.8,
    },
    'superflat': {
        'terrain_amplitude': 0.0,
        'sea_level': 4,
        'cave_density': 0.0,
        'biome_size': 1.0,
        'enable_caves': False,
        'enable_rivers': False,
        'enable_trees': False,
        'tree_density': 0.0,
    },
    'caves': {
        'terrain_amplitude': 1.0,
        'sea_level': 60,
        'cave_density': 2.0,
        'biome_size': 1.0,
        'enable_caves': True,
        'enable_rivers': True,
        'enable_trees': True,
        'tree_density': 1.0,
    },
}


# Display names for presets
PRESET_DISPLAY_NAMES = {
    'default': 'Default',
    'amplified': 'Amplified',
    'flat': 'Flat',
    'archipelago': 'Archipelago',
    'superflat': 'Superflat',
    'caves': 'Caves+',
}


@dataclass
class WorldGenSettings:
    """
    Configuration settings for world generation.

    Contains all parameters needed to customize world generation,
    from basic seed and name to advanced noise parameters.
    """

    # Basic
    name: str = "New World"
    seed: Optional[int] = None  # None = generate random

    # Preset (stores which preset was selected, if any)
    preset: str = "default"

    # Biomes (which are enabled)
    enabled_biomes: Set[str] = field(default_factory=lambda: set(BIOME_LIST))

    # Structures
    enable_trees: bool = True
    enable_caves: bool = True
    cave_density: float = 1.0  # 0.0 - 2.0
    enable_rivers: bool = True

    # Terrain
    tree_density: float = 1.0  # 0.0 - 2.0 (multiplier)
    terrain_amplitude: float = 1.0  # 0.0 - 2.0 (multiplier)
    sea_level: int = 60  # 40 - 80

    # Advanced
    biome_size: float = 1.0  # 0.25 - 4.0 (multiplier)
    noise_persistence: float = 0.5  # 0.2 - 0.8
    noise_lacunarity: float = 2.0  # 1.5 - 3.0
    spawn_x: int = 0
    spawn_z: int = 0

    def __post_init__(self):
        """Ensure enabled_biomes is a set."""
        if not isinstance(self.enabled_biomes, set):
            self.enabled_biomes = set(self.enabled_biomes)

    def get_seed(self) -> int:
        """
        Get the seed, generating a random one if not set.

        @returns: Integer seed value.
        """
        if self.seed is None:
            self.seed = random.randint(1, 999999999)
        return self.seed

    def apply_preset(self, preset_id: str) -> None:
        """
        Apply a preset configuration.

        @param preset_id: ID of the preset to apply.
        """
        if preset_id not in WORLD_PRESETS:
            return

        preset = WORLD_PRESETS[preset_id]
        self.preset = preset_id

        # Apply preset values
        if 'terrain_amplitude' in preset:
            self.terrain_amplitude = preset['terrain_amplitude']
        if 'sea_level' in preset:
            self.sea_level = preset['sea_level']
        if 'cave_density' in preset:
            self.cave_density = preset['cave_density']
        if 'biome_size' in preset:
            self.biome_size = preset['biome_size']
        if 'enable_caves' in preset:
            self.enable_caves = preset['enable_caves']
        if 'enable_rivers' in preset:
            self.enable_rivers = preset['enable_rivers']
        if 'enable_trees' in preset:
            self.enable_trees = preset['enable_trees']
        if 'tree_density' in preset:
            self.tree_density = preset['tree_density']

    def enable_biome(self, biome: str) -> None:
        """
        Enable a biome.

        @param biome: Biome name to enable.
        """
        if biome in BIOME_LIST:
            self.enabled_biomes.add(biome)

    def disable_biome(self, biome: str) -> bool:
        """
        Disable a biome (if at least one biome would remain).

        @param biome: Biome name to disable.
        @returns: True if biome was disabled, False if not (would leave none).
        """
        if biome not in self.enabled_biomes:
            return False

        if len(self.enabled_biomes) <= 1:
            return False  # Can't disable the last biome

        self.enabled_biomes.discard(biome)
        return True

    def toggle_biome(self, biome: str) -> bool:
        """
        Toggle a biome on/off.

        @param biome: Biome name to toggle.
        @returns: New state of the biome (True = enabled).
        """
        if biome in self.enabled_biomes:
            if self.disable_biome(biome):
                return False
            return True  # Couldn't disable (last one)
        else:
            self.enable_biome(biome)
            return True

    def is_biome_enabled(self, biome: str) -> bool:
        """
        Check if a biome is enabled.

        @param biome: Biome name to check.
        @returns: True if enabled.
        """
        return biome in self.enabled_biomes

    def reset_to_defaults(self) -> None:
        """Reset all settings to default values."""
        self.name = "New World"
        self.seed = None
        self.preset = "default"
        self.enabled_biomes = set(BIOME_LIST)
        self.enable_trees = True
        self.enable_caves = True
        self.cave_density = 1.0
        self.enable_rivers = True
        self.tree_density = 1.0
        self.terrain_amplitude = 1.0
        self.sea_level = 60
        self.biome_size = 1.0
        self.noise_persistence = 0.5
        self.noise_lacunarity = 2.0
        self.spawn_x = 0
        self.spawn_z = 0

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert settings to a dictionary for serialization.

        @returns: Dictionary of settings.
        """
        return {
            'name': self.name,
            'seed': self.seed,
            'preset': self.preset,
            'enabled_biomes': list(self.enabled_biomes),
            'enable_trees': self.enable_trees,
            'enable_caves': self.enable_caves,
            'cave_density': self.cave_density,
            'enable_rivers': self.enable_rivers,
            'tree_density': self.tree_density,
            'terrain_amplitude': self.terrain_amplitude,
            'sea_level': self.sea_level,
            'biome_size': self.biome_size,
            'noise_persistence': self.noise_persistence,
            'noise_lacunarity': self.noise_lacunarity,
            'spawn_x': self.spawn_x,
            'spawn_z': self.spawn_z,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WorldGenSettings':
        """
        Create settings from a dictionary.

        @param data: Dictionary of settings.
        @returns: WorldGenSettings instance.
        """
        settings = cls()

        settings.name = data.get('name', 'New World')
        settings.seed = data.get('seed')
        settings.preset = data.get('preset', 'default')

        biomes = data.get('enabled_biomes', BIOME_LIST)
        settings.enabled_biomes = set(biomes) if biomes else set(BIOME_LIST)

        settings.enable_trees = data.get('enable_trees', True)
        settings.enable_caves = data.get('enable_caves', True)
        settings.cave_density = data.get('cave_density', 1.0)
        settings.enable_rivers = data.get('enable_rivers', True)
        settings.tree_density = data.get('tree_density', 1.0)
        settings.terrain_amplitude = data.get('terrain_amplitude', 1.0)
        settings.sea_level = data.get('sea_level', 60)
        settings.biome_size = data.get('biome_size', 1.0)
        settings.noise_persistence = data.get('noise_persistence', 0.5)
        settings.noise_lacunarity = data.get('noise_lacunarity', 2.0)
        settings.spawn_x = data.get('spawn_x', 0)
        settings.spawn_z = data.get('spawn_z', 0)

        return settings
