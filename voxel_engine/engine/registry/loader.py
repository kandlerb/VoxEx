"""
Configuration loader for VoxEx content and config files.

Loads JSON configurations from the content/ and config/ directories.
Handles merging with defaults and building lookup structures.

Usage:
    loader = ConfigLoader()
    blocks = loader.load_blocks(Path("content"))
    biomes = loader.load_biomes(Path("content"), Path("config"))
    world_config = loader.load_world_config(Path("config"))
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional, List


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep merge two dictionaries.

    Values from override replace values from base.
    Nested dicts are merged recursively.

    Args:
        base: Base dictionary.
        override: Dictionary with values to override.

    Returns:
        Dict: New merged dictionary.
    """
    result = base.copy()

    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value

    return result


class ConfigLoader:
    """
    Loads game content and configuration from JSON files.

    Handles:
    - Block definitions from content/blocks/*/block.json
    - Biome definitions from content/biomes/*/biome.json + terrain.json
    - World configuration from config/world.json
    - Tile mappings from config/tiles.json
    """

    def __init__(self):
        """Initialize the config loader."""
        self._cache: Dict[str, Any] = {}

    def _load_json(self, path: Path) -> Optional[Dict[str, Any]]:
        """
        Load a JSON file.

        Args:
            path: Path to JSON file.

        Returns:
            Dict or None if file doesn't exist.
        """
        if not path.exists():
            return None

        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def load_blocks(self, content_path: Path) -> Dict[int, Dict[str, Any]]:
        """
        Load all block definitions from content/blocks/.

        Walks content/blocks/*/block.json and returns a dict
        mapping block_id to full config.

        Args:
            content_path: Path to content directory.

        Returns:
            Dict mapping block_id (int) to block config dict.
        """
        blocks: Dict[int, Dict[str, Any]] = {}
        blocks_dir = content_path / "blocks"

        if not blocks_dir.exists():
            return blocks

        for block_dir in sorted(blocks_dir.iterdir()):
            if not block_dir.is_dir():
                continue

            block_file = block_dir / "block.json"
            if not block_file.exists():
                continue

            config = self._load_json(block_file)
            if config is None:
                continue

            block_id = config.get("id")
            if block_id is None:
                print(f"[Loader] Warning: Block missing 'id' in {block_file}")
                continue

            # Add internal name from directory
            config["internal_name"] = block_dir.name
            blocks[block_id] = config

        return blocks

    def load_biomes(
        self,
        content_path: Path,
        config_path: Path
    ) -> Dict[str, Dict[str, Any]]:
        """
        Load all biome definitions with defaults merged.

        Walks content/biomes/*/biome.json and merges with terrain.json.
        Each biome inherits from config/biome_defaults.json.
        Tree configs inherit from config/tree_defaults.json.

        Args:
            content_path: Path to content directory.
            config_path: Path to config directory.

        Returns:
            Dict mapping biome name (str) to merged biome config.
        """
        biomes: Dict[str, Dict[str, Any]] = {}
        biomes_dir = content_path / "biomes"

        if not biomes_dir.exists():
            return biomes

        # Load defaults
        biome_defaults = self._load_json(config_path / "biome_defaults.json") or {}
        tree_defaults = self._load_json(config_path / "tree_defaults.json") or {}

        for biome_dir in sorted(biomes_dir.iterdir()):
            if not biome_dir.is_dir():
                continue

            biome_name = biome_dir.name

            # Load biome.json (required)
            biome_file = biome_dir / "biome.json"
            if not biome_file.exists():
                continue

            biome_config = self._load_json(biome_file)
            if biome_config is None:
                continue

            # Load terrain.json (optional, contains terrain-specific params)
            terrain_file = biome_dir / "terrain.json"
            terrain_config = self._load_json(terrain_file) or {}

            # Start with biome defaults
            merged = deep_merge(biome_defaults, biome_config)

            # Merge terrain config
            merged = deep_merge(merged, terrain_config)

            # If biome has trees, merge with tree defaults
            if "trees" in merged and merged["trees"]:
                tree_config = merged["trees"]
                # Merge tree defaults first, then override with biome's tree config
                merged_trees = deep_merge(tree_defaults, tree_config)
                merged["trees"] = merged_trees

            # Add internal name
            merged["name"] = biome_name
            biomes[biome_name] = merged

        return biomes

    def load_world_config(self, config_path: Path) -> Dict[str, Any]:
        """
        Load world configuration from config/world.json.

        Args:
            config_path: Path to config directory.

        Returns:
            Dict with world config (CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL, etc.)
        """
        config = self._load_json(config_path / "world.json") or {}

        # Provide sensible defaults
        defaults = {
            "chunk_size": 16,
            "chunk_height": 320,
            "sea_level": 60,
            "world_height": 320,
            "y_offset": 0,
        }

        return deep_merge(defaults, config)

    def load_tiles(self, config_path: Path) -> Dict[str, int]:
        """
        Load tile index mapping from config/tiles.json.

        Args:
            config_path: Path to config directory.

        Returns:
            Dict mapping tile name (str) to tile index (int).
        """
        return self._load_json(config_path / "tiles.json") or {}

    def load_settings_defaults(self, config_path: Path) -> Dict[str, Any]:
        """
        Load default settings from config/settings_defaults.json.

        Args:
            config_path: Path to config directory.

        Returns:
            Dict with default settings.
        """
        return self._load_json(config_path / "settings_defaults.json") or {}

    def load_physics_config(self, config_path: Path) -> Dict[str, Any]:
        """
        Load physics configuration from config/physics.json.

        Args:
            config_path: Path to config directory.

        Returns:
            Dict with physics config.
        """
        config = self._load_json(config_path / "physics.json") or {}

        # Provide sensible defaults
        defaults = {
            "gravity": -32.0,
            "terminal_velocity": -78.4,
            "player_height": 1.8,
            "player_width": 0.6,
            "jump_velocity": 9.0,
            "walk_speed": 4.3,
            "sprint_speed": 5.6,
            "fly_speed": 10.0,
        }

        return deep_merge(defaults, config)

    def load_all(
        self,
        content_path: Path,
        config_path: Path
    ) -> Dict[str, Any]:
        """
        Load all configurations at once.

        Args:
            content_path: Path to content directory.
            config_path: Path to config directory.

        Returns:
            Dict containing all loaded configs:
            - blocks: Dict[int, dict]
            - biomes: Dict[str, dict]
            - tiles: Dict[str, int]
            - world: dict
            - settings: dict
            - physics: dict
        """
        return {
            "blocks": self.load_blocks(content_path),
            "biomes": self.load_biomes(content_path, config_path),
            "tiles": self.load_tiles(config_path),
            "world": self.load_world_config(config_path),
            "settings": self.load_settings_defaults(config_path),
            "physics": self.load_physics_config(config_path),
        }
