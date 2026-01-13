"""
Terrain generation for PythonicVox.

This module contains the TerrainGenerator class which handles procedural
terrain generation using noise functions, including height maps, cave systems,
and ore distribution.

Classes:
    TerrainGenerator: Generates terrain data for chunks.

Usage:
    from world.terrain import TerrainGenerator

    generator = TerrainGenerator(seed=12345)
    chunk_data = generator.generate_chunk(cx, cz)
"""

import random
from settings import (
    CHUNK_SIZE, CHUNK_HEIGHT,
    AIR, GRASS, DIRT, STONE, BEDROCK
)


class TerrainGenerator:
    """
    Generates procedural terrain for the voxel world.

    Uses multiple octaves of noise to create natural-looking terrain with
    varied elevation, caves, and ore deposits.

    Attributes:
        seed (int): World seed for deterministic generation.
        base_height (int): Base terrain height above bedrock.
        water_level (int): Y level of water surface.
        flat_mode (bool): Whether to generate flat terrain.
    """

    def __init__(self, seed=None, flat_mode=True):
        """
        Initialize a new TerrainGenerator instance.

        Args:
            seed (int): World seed. None for random seed.
            flat_mode (bool): If True, generates flat terrain.
        """
        self.seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        self.base_height = 64
        self.water_level = 62
        self.flat_mode = flat_mode
        # Initialize RNG with seed for reproducibility
        self.rng = random.Random(self.seed)

    def generate_chunk(self, cx, cz):
        """
        Generate terrain data for a chunk.

        Args:
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.

        Returns:
            dict: Chunk data with blocks, skyLight, and blockLight arrays.
        """
        # Total blocks in chunk: 16 * 16 * 320 = 81920
        total_blocks = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT
        blocks = [AIR] * total_blocks
        sky_light = [15] * total_blocks  # Max skylight initially
        block_light = [0] * total_blocks

        if self.flat_mode:
            self._generate_flat_terrain(blocks, cx, cz)
        else:
            self._generate_noise_terrain(blocks, cx, cz)

        # Calculate skylight propagation
        self._calculate_skylight(blocks, sky_light)

        return {
            'blocks': blocks,
            'sky_light': sky_light,
            'block_light': block_light
        }

    def _generate_flat_terrain(self, blocks, cx, cz):
        """
        Generate flat terrain for a chunk.

        Flat terrain structure (from bottom to top):
            - Y=0: Bedrock
            - Y=1-59: Stone
            - Y=60-62: Dirt
            - Y=63: Grass
            - Y=64+: Air

        Args:
            blocks (list): Block array to populate.
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.
        """
        for lx in range(CHUNK_SIZE):
            for lz in range(CHUNK_SIZE):
                for ly in range(CHUNK_HEIGHT):
                    index = self._get_block_index(lx, ly, lz)

                    if ly == 0:
                        # Bedrock at bottom
                        blocks[index] = BEDROCK
                    elif ly < 60:
                        # Stone layer
                        blocks[index] = STONE
                    elif ly < 63:
                        # Dirt layer
                        blocks[index] = DIRT
                    elif ly == 63:
                        # Grass on top
                        blocks[index] = GRASS
                    # else: AIR (already initialized)

    def _generate_noise_terrain(self, blocks, cx, cz):
        """
        Generate noise-based terrain for a chunk.

        Args:
            blocks (list): Block array to populate.
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.
        """
        for lx in range(CHUNK_SIZE):
            for lz in range(CHUNK_SIZE):
                # World coordinates
                wx = cx * CHUNK_SIZE + lx
                wz = cz * CHUNK_SIZE + lz

                # Get height at this position
                height = self.get_height_at(wx, wz)

                for ly in range(CHUNK_HEIGHT):
                    index = self._get_block_index(lx, ly, lz)

                    if ly == 0:
                        blocks[index] = BEDROCK
                    elif ly < height - 4:
                        blocks[index] = STONE
                    elif ly < height:
                        blocks[index] = DIRT
                    elif ly == height:
                        blocks[index] = GRASS
                    # else: AIR

    def _get_block_index(self, lx, ly, lz):
        """
        Convert local coordinates to array index.

        Block array is ordered as [x][z][y] for cache efficiency
        when iterating over columns.

        Args:
            lx (int): Local X (0-15).
            ly (int): Local Y (0-319).
            lz (int): Local Z (0-15).

        Returns:
            int: Array index for the block.
        """
        return (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + ly

    def _calculate_skylight(self, blocks, sky_light):
        """
        Calculate skylight propagation from top down.

        Light starts at 15 at the top and decreases by 1 for each
        solid block encountered.

        Args:
            blocks (list): Block array.
            sky_light (list): Skylight array to populate.
        """
        for lx in range(CHUNK_SIZE):
            for lz in range(CHUNK_SIZE):
                light_level = 15
                # Propagate from top to bottom
                for ly in range(CHUNK_HEIGHT - 1, -1, -1):
                    index = self._get_block_index(lx, ly, lz)

                    if blocks[index] != AIR:
                        # Solid block reduces light
                        light_level = max(0, light_level - 1)

                    sky_light[index] = light_level

    def get_height_at(self, x, z):
        """
        Get terrain height at a world position.

        Args:
            x (int): World X position.
            z (int): World Z position.

        Returns:
            int: Terrain height at the position.
        """
        if self.flat_mode:
            return 63  # Flat terrain height

        # Use noise for varied terrain
        noise_val = self.noise2d(x * 0.02, z * 0.02)
        # Map noise from [-1, 1] to height range
        height = int(self.base_height + noise_val * 20)
        return max(1, min(height, CHUNK_HEIGHT - 1))

    def generate_caves(self, chunk_data, cx, cz):
        """
        Carve caves into chunk terrain.

        Args:
            chunk_data: Chunk data to modify.
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.
        """
        # Cave generation is disabled for flat terrain
        if self.flat_mode:
            return
        # TODO: Implement 3D noise-based cave carving

    def place_ores(self, chunk_data, cx, cz):
        """
        Place ore deposits in chunk terrain.

        Args:
            chunk_data: Chunk data to modify.
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.
        """
        # Ore placement is disabled for flat terrain
        if self.flat_mode:
            return
        # TODO: Implement ore vein placement

    def noise2d(self, x, z, octaves=4, persistence=0.5):
        """
        Generate 2D noise value using simple value noise.

        Args:
            x (float): X coordinate.
            z (float): Z coordinate.
            octaves (int): Number of noise octaves.
            persistence (float): Amplitude decay per octave.

        Returns:
            float: Noise value between -1 and 1.
        """
        total = 0.0
        amplitude = 1.0
        max_value = 0.0

        for i in range(octaves):
            # Simple hash-based noise
            ix = int(x * (2 ** i))
            iz = int(z * (2 ** i))
            fx = x * (2 ** i) - ix
            fz = z * (2 ** i) - iz

            # Hash corners
            n00 = self._hash_2d(ix, iz)
            n10 = self._hash_2d(ix + 1, iz)
            n01 = self._hash_2d(ix, iz + 1)
            n11 = self._hash_2d(ix + 1, iz + 1)

            # Bilinear interpolation
            nx0 = n00 * (1 - fx) + n10 * fx
            nx1 = n01 * (1 - fx) + n11 * fx
            value = nx0 * (1 - fz) + nx1 * fz

            total += value * amplitude
            max_value += amplitude
            amplitude *= persistence

        # Normalize to [-1, 1]
        return (total / max_value) * 2 - 1

    def _hash_2d(self, x, z):
        """
        Generate a pseudo-random value for coordinates.

        Args:
            x (int): X coordinate.
            z (int): Z coordinate.

        Returns:
            float: Value between 0 and 1.
        """
        # Simple hash function
        n = x + z * 57 + self.seed
        n = (n << 13) ^ n
        return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7FFFFFFF) / 0x7FFFFFFF
