"""
Biome definitions for PythonicVox.

This module contains the BiomeManager class and biome configuration for
different terrain types like plains, forests, mountains, and swamps.

Classes:
    BiomeManager: Determines biome type at world positions.
    Biome: Configuration for a single biome type.

Usage:
    from world.biomes import BiomeManager

    biomes = BiomeManager(seed=12345)
    biome = biomes.get_biome_at(x, z)
"""


class Biome:
    """
    Configuration for a single biome type.

    Attributes:
        name (str): Biome display name.
        base_height (int): Base terrain elevation.
        amplitude (float): Height variation magnitude.
        tree_density (float): Probability of tree generation.
        surface_block (int): Block type for surface layer.
        tags (set): Set of behavior tags (e.g., 'forested', 'mountain').
    """

    def __init__(self, name, base_height=64, amplitude=20, tree_density=0.05,
                 surface_block=1, tags=None):
        """
        Initialize a new Biome instance.

        Args:
            name (str): Biome display name.
            base_height (int): Base terrain elevation.
            amplitude (float): Height variation magnitude.
            tree_density (float): Tree generation probability.
            surface_block (int): Surface layer block type.
            tags (set): Behavior tags for the biome.
        """
        self.name = name
        self.base_height = base_height
        self.amplitude = amplitude
        self.tree_density = tree_density
        self.surface_block = surface_block
        self.tags = tags or set()


# Predefined biome configurations
BIOMES = {
    'plains': Biome(
        name='Plains',
        base_height=64,
        amplitude=10,
        tree_density=0.02,
    ),
    'forest': Biome(
        name='Forest',
        base_height=64,
        amplitude=15,
        tree_density=0.15,
        tags={'forested'},
    ),
    'mountains': Biome(
        name='Mountains',
        base_height=80,
        amplitude=60,
        tree_density=0.03,
        tags={'mountain'},
    ),
    'swamp': Biome(
        name='Swamp',
        base_height=58,
        amplitude=5,
        tree_density=0.08,
    ),
    'desert': Biome(
        name='Desert',
        base_height=64,
        amplitude=8,
        tree_density=0.0,
        surface_block=8,  # SAND
    ),
}


class BiomeManager:
    """
    Determines biome types at world positions.

    Uses noise-based blending to create smooth biome transitions.

    Attributes:
        seed (int): World seed for deterministic biome placement.
        biome_scale (float): Scale factor for biome noise.
    """

    def __init__(self, seed):
        """
        Initialize a new BiomeManager instance.

        Args:
            seed (int): World seed for biome generation.
        """
        self.seed = seed
        self.biome_scale = 256.0

    def get_biome_at(self, x, z):
        """
        Get the biome at a world position.

        Args:
            x (int): World X position.
            z (int): World Z position.

        Returns:
            Biome: The biome configuration at the position.
        """
        pass

    def get_blended_height(self, x, z):
        """
        Get terrain height with biome blending.

        Args:
            x (int): World X position.
            z (int): World Z position.

        Returns:
            float: Blended terrain height.
        """
        pass

    def get_biome_blend_weights(self, x, z):
        """
        Get blend weights for nearby biomes.

        Args:
            x (int): World X position.
            z (int): World Z position.

        Returns:
            dict: Mapping of biome names to blend weights.
        """
        pass
