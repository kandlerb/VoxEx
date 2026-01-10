"""
Central registry for all game content and configuration.

Singleton that provides access to blocks, biomes, tiles, and settings.
Must be initialized before use via Registry.initialize().

Usage:
    from voxel_engine.engine.registry import Registry

    # Initialize at startup
    Registry.initialize(
        content_path=Path("voxel_engine/content"),
        config_path=Path("voxel_engine/config")
    )

    # Access anywhere
    grass = Registry.get_block(1)
    plains = Registry.get_biome("plains")
    is_solid = Registry.is_solid(1)
"""

from pathlib import Path
from typing import Dict, Any, Optional, Union, List

from .loader import ConfigLoader


class Registry:
    """
    Singleton registry for game content and configuration.

    Provides centralized access to:
    - Block definitions (by ID or name)
    - Biome definitions (by name)
    - Tile mappings
    - World configuration
    - Game settings
    """

    _instance: Optional["Registry"] = None
    _initialized: bool = False

    # Data storage
    _blocks: Dict[int, Dict[str, Any]] = {}
    _block_by_name: Dict[str, Dict[str, Any]] = {}
    _biomes: Dict[str, Dict[str, Any]] = {}
    _tiles: Dict[str, int] = {}
    _world_config: Dict[str, Any] = {}
    _settings: Dict[str, Any] = {}
    _physics: Dict[str, Any] = {}

    # Precomputed lookups for fast tag checks
    _solid_blocks: set = set()
    _transparent_blocks: set = set()
    _fluid_blocks: set = set()
    _light_emitting_blocks: Dict[int, int] = {}

    def __new__(cls) -> "Registry":
        """Ensure only one instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def initialize(
        cls,
        content_path: Path,
        config_path: Path
    ) -> "Registry":
        """
        Initialize the registry with content and config paths.

        Must be called before any other Registry methods.

        Args:
            content_path: Path to content directory.
            config_path: Path to config directory.

        Returns:
            Registry: The singleton instance.
        """
        instance = cls()

        loader = ConfigLoader()
        data = loader.load_all(content_path, config_path)

        # Store raw data
        cls._blocks = data["blocks"]
        cls._biomes = data["biomes"]
        cls._tiles = data["tiles"]
        cls._world_config = data["world"]
        cls._settings = data["settings"]
        cls._physics = data["physics"]

        # Build name-based block lookup
        cls._block_by_name = {}
        for block_id, block in cls._blocks.items():
            name = block.get("internal_name") or block.get("name", "").lower()
            if name:
                cls._block_by_name[name.lower()] = block
                cls._block_by_name[block.get("name", "").lower()] = block

        # Precompute tag sets for fast lookups
        cls._solid_blocks = set()
        cls._transparent_blocks = set()
        cls._fluid_blocks = set()
        cls._light_emitting_blocks = {}

        for block_id, block in cls._blocks.items():
            tags = block.get("tags", [])

            if "solid" in tags:
                cls._solid_blocks.add(block_id)

            if "transparent" in tags:
                cls._transparent_blocks.add(block_id)

            if "fluid" in tags:
                cls._fluid_blocks.add(block_id)

            # Check for light emission
            lighting = block.get("lighting", {})
            light_level = lighting.get("emit", 0)
            if light_level > 0:
                cls._light_emitting_blocks[block_id] = light_level

        cls._initialized = True
        return instance

    @classmethod
    def _check_initialized(cls) -> None:
        """Raise if registry is not initialized."""
        if not cls._initialized:
            raise RuntimeError(
                "Registry not initialized. Call Registry.initialize() first."
            )

    # =========================================================================
    # BLOCK ACCESS
    # =========================================================================

    @classmethod
    def get_block(cls, id_or_name: Union[int, str]) -> Optional[Dict[str, Any]]:
        """
        Get a block definition by ID or name.

        Args:
            id_or_name: Block ID (int) or name (str).

        Returns:
            Block config dict, or None if not found.
        """
        cls._check_initialized()

        if isinstance(id_or_name, int):
            return cls._blocks.get(id_or_name)
        else:
            return cls._block_by_name.get(id_or_name.lower())

    @classmethod
    def get_block_id(cls, name: str) -> Optional[int]:
        """
        Get a block's ID by name.

        Args:
            name: Block name (case-insensitive).

        Returns:
            Block ID, or None if not found.
        """
        cls._check_initialized()

        block = cls._block_by_name.get(name.lower())
        return block.get("id") if block else None

    @classmethod
    def get_block_name(cls, block_id: int) -> Optional[str]:
        """
        Get a block's display name by ID.

        Args:
            block_id: Block ID.

        Returns:
            Block name, or None if not found.
        """
        cls._check_initialized()

        block = cls._blocks.get(block_id)
        return block.get("name") if block else None

    @classmethod
    @property
    def blocks(cls) -> Dict[int, Dict[str, Any]]:
        """Get all block definitions."""
        cls._check_initialized()
        return cls._blocks

    @classmethod
    def block_count(cls) -> int:
        """Get the number of registered blocks."""
        cls._check_initialized()
        return len(cls._blocks)

    # =========================================================================
    # BLOCK TAG CHECKS
    # =========================================================================

    @classmethod
    def is_solid(cls, block_id: int) -> bool:
        """
        Check if a block is solid (has collision).

        Args:
            block_id: Block ID to check.

        Returns:
            True if block is solid.
        """
        cls._check_initialized()
        return block_id in cls._solid_blocks

    @classmethod
    def is_transparent(cls, block_id: int) -> bool:
        """
        Check if a block is transparent (air, water, glass, etc).

        Args:
            block_id: Block ID to check.

        Returns:
            True if block is transparent.
        """
        cls._check_initialized()
        return block_id in cls._transparent_blocks

    @classmethod
    def is_fluid(cls, block_id: int) -> bool:
        """
        Check if a block is a fluid (water, lava).

        Args:
            block_id: Block ID to check.

        Returns:
            True if block is a fluid.
        """
        cls._check_initialized()
        return block_id in cls._fluid_blocks

    @classmethod
    def is_air(cls, block_id: int) -> bool:
        """
        Check if a block is air (ID 0).

        Args:
            block_id: Block ID to check.

        Returns:
            True if block is air.
        """
        return block_id == 0

    @classmethod
    def get_light_level(cls, block_id: int) -> int:
        """
        Get the light emission level of a block.

        Args:
            block_id: Block ID to check.

        Returns:
            Light level (0-15), 0 if not light-emitting.
        """
        cls._check_initialized()
        return cls._light_emitting_blocks.get(block_id, 0)

    @classmethod
    def has_tag(cls, block_id: int, tag: str) -> bool:
        """
        Check if a block has a specific tag.

        Args:
            block_id: Block ID to check.
            tag: Tag name to look for.

        Returns:
            True if block has the tag.
        """
        cls._check_initialized()

        block = cls._blocks.get(block_id)
        if block is None:
            return False

        return tag in block.get("tags", [])

    # =========================================================================
    # BIOME ACCESS
    # =========================================================================

    @classmethod
    def get_biome(cls, name: str) -> Optional[Dict[str, Any]]:
        """
        Get a biome definition by name.

        Args:
            name: Biome name (case-sensitive).

        Returns:
            Biome config dict, or None if not found.
        """
        cls._check_initialized()
        return cls._biomes.get(name)

    @classmethod
    @property
    def biomes(cls) -> Dict[str, Dict[str, Any]]:
        """Get all biome definitions."""
        cls._check_initialized()
        return cls._biomes

    @classmethod
    def biome_names(cls) -> List[str]:
        """Get list of all biome names."""
        cls._check_initialized()
        return list(cls._biomes.keys())

    @classmethod
    def biome_count(cls) -> int:
        """Get the number of registered biomes."""
        cls._check_initialized()
        return len(cls._biomes)

    @classmethod
    def get_biome_weight(cls, name: str) -> float:
        """
        Get a biome's weight for generation.

        Args:
            name: Biome name.

        Returns:
            Biome weight, or 1.0 if not found.
        """
        cls._check_initialized()

        biome = cls._biomes.get(name)
        return biome.get("weight", 1.0) if biome else 1.0

    @classmethod
    def get_total_biome_weight(cls) -> float:
        """
        Get the sum of all biome weights.

        Returns:
            Total weight of all biomes.
        """
        cls._check_initialized()
        return sum(b.get("weight", 1.0) for b in cls._biomes.values())

    # =========================================================================
    # TILE ACCESS
    # =========================================================================

    @classmethod
    @property
    def tiles(cls) -> Dict[str, int]:
        """Get tile name to index mapping."""
        cls._check_initialized()
        return cls._tiles

    @classmethod
    def get_tile_index(cls, name: str) -> int:
        """
        Get tile index by name.

        Args:
            name: Tile name (e.g., "GRASS_TOP", "DIRT").

        Returns:
            Tile index, or -1 if not found.
        """
        cls._check_initialized()
        return cls._tiles.get(name, -1)

    @classmethod
    def get_block_tile_index(cls, block_id: int, face_index: int) -> int:
        """
        Get texture atlas tile index for a block face.

        Face indices: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z.
        Maps to texture keys: sides (0,1,4,5), top (2), bottom (3).

        Handles per-face textures, 'all' textures, and references.

        Args:
            block_id: Block ID to look up.
            face_index: Which face (0-5).

        Returns:
            int: Tile index in texture atlas, or 0 if not found.
        """
        cls._check_initialized()

        block = cls._blocks.get(block_id)
        if block is None:
            return 0  # Default to first tile

        textures = block.get("textures")
        if textures is None:
            return 0

        # Determine which texture key to use based on face
        if face_index == 2:  # +Y (top)
            tex_key = "top"
        elif face_index == 3:  # -Y (bottom)
            tex_key = "bottom"
        else:  # Sides (0, 1, 4, 5)
            tex_key = "side"

        # Try face-specific texture first
        tex_data = textures.get(tex_key)

        # Fall back to 'all' texture
        if tex_data is None:
            tex_data = textures.get("all")

        if tex_data is None:
            return 0

        # Handle references
        if tex_data.get("type") == "reference":
            ref_key = tex_data.get("ref")
            if ref_key:
                # First, check if reference is to another texture within same block
                ref_tex = textures.get(ref_key)
                if ref_tex is not None:
                    tex_data = ref_tex
                else:
                    # Reference might be to another block (e.g., "dirt")
                    ref_block = cls._block_by_name.get(ref_key.lower())
                    if ref_block is not None:
                        ref_textures = ref_block.get("textures", {})
                        # Get 'all' texture from referenced block
                        tex_data = ref_textures.get("all")
                        if tex_data is None:
                            # Try to get same face key from referenced block
                            tex_data = ref_textures.get(tex_key)
                if tex_data is None:
                    return 0

        return tex_data.get("tile_index", 0)

    @classmethod
    def is_liquid(cls, block_id: int) -> bool:
        """
        Check if a block is a liquid (water, lava).

        Args:
            block_id: Block ID to check.

        Returns:
            bool: True if block is a liquid.
        """
        cls._check_initialized()
        return block_id in cls._fluid_blocks

    # =========================================================================
    # WORLD CONFIG ACCESS
    # =========================================================================

    @classmethod
    @property
    def world_config(cls) -> Dict[str, Any]:
        """Get world configuration."""
        cls._check_initialized()
        return cls._world_config

    @classmethod
    @property
    def chunk_size(cls) -> int:
        """Get chunk size (X/Z dimension)."""
        cls._check_initialized()
        return cls._world_config.get("chunk_size", 16)

    @classmethod
    @property
    def chunk_height(cls) -> int:
        """Get chunk height (Y dimension)."""
        cls._check_initialized()
        return cls._world_config.get("chunk_height", 320)

    @classmethod
    @property
    def sea_level(cls) -> int:
        """Get sea level Y coordinate."""
        cls._check_initialized()
        return cls._world_config.get("sea_level", 60)

    # =========================================================================
    # SETTINGS ACCESS
    # =========================================================================

    @classmethod
    @property
    def settings(cls) -> Dict[str, Any]:
        """Get default game settings."""
        cls._check_initialized()
        return cls._settings

    @classmethod
    @property
    def physics(cls) -> Dict[str, Any]:
        """Get physics configuration."""
        cls._check_initialized()
        return cls._physics

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    @classmethod
    def reset(cls) -> None:
        """
        Reset the registry (for testing).

        Clears all loaded data and resets initialized state.
        """
        cls._initialized = False
        cls._blocks = {}
        cls._block_by_name = {}
        cls._biomes = {}
        cls._tiles = {}
        cls._world_config = {}
        cls._settings = {}
        cls._physics = {}
        cls._solid_blocks = set()
        cls._transparent_blocks = set()
        cls._fluid_blocks = set()
        cls._light_emitting_blocks = {}

    @classmethod
    def is_initialized(cls) -> bool:
        """Check if the registry has been initialized."""
        return cls._initialized

    @classmethod
    def summary(cls) -> str:
        """
        Get a summary of loaded content.

        Returns:
            Human-readable summary string.
        """
        cls._check_initialized()

        lines = [
            "Registry Summary:",
            f"  Blocks: {len(cls._blocks)}",
            f"  Biomes: {len(cls._biomes)}",
            f"  Tiles: {len(cls._tiles)}",
            f"  World: {cls.chunk_size}x{cls.chunk_height}x{cls.chunk_size} chunks",
            f"  Sea Level: {cls.sea_level}",
        ]

        return "\n".join(lines)
