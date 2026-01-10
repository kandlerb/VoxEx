"""
Terrain generation system for VoxEx.

Generates chunk terrain using noise-based biome selection and
height functions matching the JavaScript implementation.

Usage:
    from voxel_engine.systems.world.generation_system import TerrainGenerator
    from voxel_engine.engine.registry import Registry

    Registry.initialize(content_path, config_path)
    generator = TerrainGenerator(seed=12345)
    chunk = generator.generate_chunk(0, 0)
"""

import math
from typing import Dict, Any, List, Tuple, Optional, Callable

import numpy as np

from voxel_engine.world.noise import NoiseGenerator, get_generator
from voxel_engine.world.chunk import Chunk


# Try to import Numba for JIT compilation
try:
    from numba import njit
    HAS_NUMBA = True
except ImportError:
    def njit(func=None, **kwargs):
        if func is not None:
            return func
        return lambda f: f
    HAS_NUMBA = False


# =============================================================================
# CONSTANTS
# =============================================================================

# Default biome generation parameters
BIOME_CELL_SIZE = 64
BIOME_FREQUENCY = 0.003


# =============================================================================
# HEIGHT FUNCTIONS
# =============================================================================

def default_height_func(
    gx: int,
    gz: int,
    biome: Dict[str, Any],
    noise_gen: NoiseGenerator
) -> float:
    """
    Default rolling terrain height function.

    Used by: forests, swamp, longwoods

    Args:
        gx: Global X coordinate.
        gz: Global Z coordinate.
        biome: Biome configuration dict.
        noise_gen: Noise generator instance.

    Returns:
        float: Terrain height at this position.
    """
    roughness = biome.get("roughness", 0.01)
    amplitude = biome.get("amplitude", 15)
    base_height = biome.get("base_height", 64)

    n = noise_gen.fbm2d(gx * roughness, gz * roughness, octaves=4)
    return base_height + n * amplitude


def plains_height_func(
    gx: int,
    gz: int,
    biome: Dict[str, Any],
    noise_gen: NoiseGenerator
) -> float:
    """
    Smooth, gentle rolling plains height function.

    Uses very low frequency for gentle waves plus tiny surface detail.

    Args:
        gx: Global X coordinate.
        gz: Global Z coordinate.
        biome: Biome configuration dict.
        noise_gen: Noise generator instance.

    Returns:
        float: Terrain height at this position.
    """
    amplitude = biome.get("amplitude", 8)
    base_height = biome.get("base_height", 62)

    # Layer 1: Very gentle wide waves
    base = noise_gen.noise2d(gx * 0.003, gz * 0.003)
    # Layer 2: Tiny surface detail
    detail = noise_gen.noise2d(gx * 0.05, gz * 0.05) * 0.1

    return base_height + (base + detail) * amplitude


def hills_height_func(
    gx: int,
    gz: int,
    biome: Dict[str, Any],
    noise_gen: NoiseGenerator
) -> float:
    """
    Billowy hills height function with rounded tops.

    Uses abs() to create rounded humps, squared to make valleys wider.

    Args:
        gx: Global X coordinate.
        gz: Global Z coordinate.
        biome: Biome configuration dict.
        noise_gen: Noise generator instance.

    Returns:
        float: Terrain height at this position.
    """
    roughness = biome.get("roughness", 0.01)
    amplitude = biome.get("amplitude", 40)
    base_height = biome.get("base_height", 64)

    n = abs(noise_gen.noise2d(gx * roughness, gz * roughness))
    n = n * n  # Square for wider valleys, smoother peaks

    return base_height + n * amplitude


def mountains_height_func(
    gx: int,
    gz: int,
    biome: Dict[str, Any],
    noise_gen: NoiseGenerator
) -> float:
    """
    Mountain terrain with ridges, valleys, and varied peaks.

    Implements comprehensive mountain generation:
    - Domain warping for winding ridges
    - Regional variation (foothills vs peaks)
    - Ridged noise for sharp ridgelines
    - Valley carving
    - Peak variation

    Args:
        gx: Global X coordinate.
        gz: Global Z coordinate.
        biome: Biome configuration dict.
        noise_gen: Noise generator instance.

    Returns:
        float: Terrain height at this position.
    """
    roughness = biome.get("roughness", 0.003)
    amplitude = biome.get("amplitude", 180)
    base_height = biome.get("base_height", 70)
    seed = noise_gen.seed

    # 1. MOUNTAIN RANGE STRUCTURE - Domain warping for winding ridges
    warp_scale = 0.0015
    warp_strength = 80
    warp_x = gx + noise_gen.noise2d(gx * warp_scale + seed, gz * warp_scale) * warp_strength
    warp_z = gz + noise_gen.noise2d(gx * warp_scale + 100, gz * warp_scale + seed) * warp_strength

    # 2. REGIONAL VARIATION - Foothills vs major peaks
    region_noise = noise_gen.noise2d(gx * 0.0006 + seed * 0.3, gz * 0.0006 - seed * 0.3)
    region_noise2 = noise_gen.noise2d(gx * 0.001 + seed * 0.7, gz * 0.001 + seed * 0.2)

    # Range 0.15 to 1.0
    region_scale = (
        0.15 +
        pow((region_noise + 1) * 0.5, 0.8) * 0.55 +
        pow((region_noise2 + 1) * 0.5, 1.2) * 0.30
    )

    # 3. MAIN RIDGE SYSTEM - Ridged noise with domain warping
    rx = warp_x * roughness
    rz = warp_z * roughness

    ridge_sum = 0.0
    amp = 1.0
    freq = 1.0

    for i in range(6):
        # Ridged noise creates sharp ridgelines
        n = 1.0 - abs(noise_gen.noise2d(rx * freq + seed * 10, rz * freq + seed * 10))
        # Variable sharpening - first octaves sharper
        sharpness = 1.5 if i < 2 else 1.2
        n = pow(n, sharpness)
        ridge_sum += n * amp
        freq *= 2.0
        amp *= 0.52

    ridge_sum /= 2.2  # Normalize

    # 4. VALLEY CARVING
    valley_noise = noise_gen.noise2d(gx * 0.003 + seed * 5, gz * 0.003 - seed * 5)
    valley_noise2 = noise_gen.noise2d(gx * 0.006 - seed * 2, gz * 0.006 + seed * 2)
    valley_factor = max(0, -valley_noise * 0.5 - valley_noise2 * 0.3)
    valley_carve = valley_factor * 0.35

    # 5. PEAK VARIATION
    peak_noise = noise_gen.noise2d(gx * 0.002 + seed * 3, gz * 0.002 - seed * 4)
    peak_boost = max(0, peak_noise - 0.3) * 0.3

    # Combine all factors
    raw_height = ridge_sum * region_scale - valley_carve + peak_boost
    height = base_height + raw_height * amplitude

    return height


# Height function lookup
HEIGHT_FUNCTIONS: Dict[str, Callable] = {
    "default": default_height_func,
    "plains": plains_height_func,
    "hills": hills_height_func,
    "mountains": mountains_height_func,
}


# =============================================================================
# BIOME TABLE
# =============================================================================

class BiomeTable:
    """
    Precomputed biome lookup table with cumulative weights.

    Used for fast weighted biome selection based on noise values.
    """

    def __init__(self, biomes: Dict[str, Dict[str, Any]]):
        """
        Build the biome table from biome configs.

        Args:
            biomes: Dict mapping biome name to config.
        """
        self.biomes = biomes
        self.total_weight = 0.0
        self.cumulative: List[Dict[str, Any]] = []

        # Build cumulative weight table
        running_total = 0.0
        for name, config in sorted(biomes.items()):
            weight = config.get("weight", 1.0)
            running_total += weight
            self.cumulative.append({
                "name": name,
                "biome": config,
                "threshold": running_total,
            })

        self.total_weight = running_total

    def select(self, noise_value: float) -> Dict[str, Any]:
        """
        Select a biome based on noise value.

        Args:
            noise_value: Noise value in range [-1, 1].

        Returns:
            Biome config dict.
        """
        # Map noise [-1, 1] to [0, 1]
        t = (noise_value + 1) * 0.5
        target = t * self.total_weight

        for entry in self.cumulative:
            if target <= entry["threshold"]:
                return entry["biome"]

        # Fallback to first biome
        return self.cumulative[0]["biome"]


# =============================================================================
# TERRAIN GENERATOR
# =============================================================================

class TerrainGenerator:
    """
    Generates terrain chunks using noise-based biome selection.

    Matches the VoxEx JavaScript terrain generation algorithm.
    """

    def __init__(
        self,
        biomes: Dict[str, Dict[str, Any]],
        blocks: Dict[int, Dict[str, Any]],
        seed: int = 0,
        chunk_size: int = 16,
        chunk_height: int = 320,
        sea_level: int = 60
    ):
        """
        Initialize the terrain generator.

        Args:
            biomes: Dict mapping biome name to config (from Registry).
            blocks: Dict mapping block ID to config (from Registry).
            seed: World seed for deterministic generation.
            chunk_size: Chunk X/Z size (default 16).
            chunk_height: Chunk Y height (default 320).
            sea_level: Sea level Y coordinate (default 60).
        """
        self.seed = seed
        self.chunk_size = chunk_size
        self.chunk_height = chunk_height
        self.sea_level = sea_level

        # Store biome/block configs
        self.biomes = biomes
        self.blocks = blocks

        # Build biome lookup table
        self.biome_table = BiomeTable(biomes)

        # Get noise generator
        self.noise_gen = get_generator(seed)

        # Build block ID lookups by name
        self._block_ids: Dict[str, int] = {}
        for block_id, config in blocks.items():
            name = config.get("internal_name") or config.get("name", "").lower()
            if name:
                self._block_ids[name.lower()] = block_id

        # Cache common block IDs
        self.AIR = self._block_ids.get("air", 0)
        self.GRASS = self._block_ids.get("grass", 1)
        self.DIRT = self._block_ids.get("dirt", 2)
        self.STONE = self._block_ids.get("stone", 3)
        self.BEDROCK = self._block_ids.get("bedrock", 7)
        self.SAND = self._block_ids.get("sand", 8)
        self.WATER = self._block_ids.get("water", 9)
        self.SNOW = self._block_ids.get("snow", 11)
        self.GRAVEL = self._block_ids.get("gravel", 12)

        # Biome cell cache for coherent biome regions
        self._biome_cache: Dict[Tuple[int, int], Dict[str, Any]] = {}

    def _get_block_id(self, name: str) -> int:
        """
        Get block ID by name.

        Args:
            name: Block name (case-insensitive).

        Returns:
            int: Block ID, or AIR if not found.
        """
        return self._block_ids.get(name.lower(), self.AIR)

    # =========================================================================
    # BIOME SELECTION
    # =========================================================================

    def get_raw_biome(self, gx: float, gz: float) -> Dict[str, Any]:
        """
        Get the raw biome at a position (no smoothing/voting).

        Args:
            gx: Global X coordinate.
            gz: Global Z coordinate.

        Returns:
            Biome config dict.
        """
        # Use warped noise for organic biome boundaries
        noise_val = self.noise_gen.noise2d(
            gx * BIOME_FREQUENCY + self.seed * 0.37,
            gz * BIOME_FREQUENCY - self.seed * 0.71
        )
        return self.biome_table.select(noise_val)

    def get_biome_at(self, gx: int, gz: int) -> Dict[str, Any]:
        """
        Get the biome at a position with cell-based smoothing.

        Uses biome cells to ensure coherent regions, with neighbor
        voting for smooth transitions.

        Args:
            gx: Global X coordinate.
            gz: Global Z coordinate.

        Returns:
            Biome config dict.
        """
        cell_x = int(gx // BIOME_CELL_SIZE)
        cell_z = int(gz // BIOME_CELL_SIZE)
        key = (cell_x, cell_z)

        # Check cache
        if key in self._biome_cache:
            return self._biome_cache[key]

        # Sample center of cell
        center_x = cell_x * BIOME_CELL_SIZE + BIOME_CELL_SIZE * 0.5
        center_z = cell_z * BIOME_CELL_SIZE + BIOME_CELL_SIZE * 0.5

        # Vote among neighboring cells
        counts: Dict[str, float] = {}

        for dx in range(-1, 2):
            for dz in range(-1, 2):
                sample_x = center_x + dx * BIOME_CELL_SIZE
                sample_z = center_z + dz * BIOME_CELL_SIZE
                biome = self.get_raw_biome(sample_x, sample_z)
                biome_name = biome.get("name", "unknown")

                # Weight by distance (center cell weighted more)
                dist = math.sqrt(dx * dx + dz * dz)
                weight = 1.5 if dist == 0 else 1.0 / (1.0 + dist)
                counts[biome_name] = counts.get(biome_name, 0) + weight

        # Select biome with highest vote
        best_name = max(counts, key=lambda k: counts[k])
        best_biome = self.biomes.get(best_name, self.get_raw_biome(center_x, center_z))

        # Cache result
        self._biome_cache[key] = best_biome
        return best_biome

    # =========================================================================
    # HEIGHT CALCULATION
    # =========================================================================

    def get_height_at(self, gx: int, gz: int, biome: Optional[Dict[str, Any]] = None) -> int:
        """
        Get the terrain height at a position.

        Args:
            gx: Global X coordinate.
            gz: Global Z coordinate.
            biome: Optional pre-fetched biome config.

        Returns:
            int: Terrain height (Y coordinate of surface).
        """
        if biome is None:
            biome = self.get_biome_at(gx, gz)

        # Get the height function for this biome
        height_func_name = biome.get("height_func", "default")
        height_func = HEIGHT_FUNCTIONS.get(height_func_name, default_height_func)

        height = height_func(gx, gz, biome, self.noise_gen)
        return int(math.floor(height))

    # =========================================================================
    # CHUNK GENERATION
    # =========================================================================

    def generate_chunk(self, cx: int, cz: int) -> Chunk:
        """
        Generate a complete terrain chunk.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            Chunk: Generated chunk with terrain.
        """
        chunk = Chunk(cx, cz, self.chunk_size, self.chunk_height)

        # Generate terrain for each column
        for lx in range(self.chunk_size):
            gx = cx * self.chunk_size + lx

            for lz in range(self.chunk_size):
                gz = cz * self.chunk_size + lz

                # Get biome and height for this column
                biome = self.get_biome_at(gx, gz)
                surface_height = self.get_height_at(gx, gz, biome)

                # Fill the column with appropriate blocks
                self._fill_column(chunk, lx, lz, surface_height, biome)

        return chunk

    def _fill_column(
        self,
        chunk: Chunk,
        lx: int,
        lz: int,
        surface_height: int,
        biome: Dict[str, Any]
    ) -> None:
        """
        Fill a single column of the chunk with terrain blocks.

        Args:
            chunk: Chunk to fill.
            lx: Local X coordinate.
            lz: Local Z coordinate.
            surface_height: Height of terrain surface.
            biome: Biome config for this column.
        """
        # Determine surface block based on biome
        surface_block = self._get_surface_block(biome, surface_height)
        sub_surface_block = self._get_sub_surface_block(biome, surface_height)

        # Fill from bottom to top
        for ly in range(self.chunk_height):
            if ly == 0:
                # Bedrock at y=0
                chunk.set_block(lx, ly, lz, self.BEDROCK)

            elif ly < surface_height - 3:
                # Stone below surface-3
                chunk.set_block(lx, ly, lz, self.STONE)

            elif ly < surface_height:
                # Dirt/sub-surface from surface-3 to surface-1
                chunk.set_block(lx, ly, lz, sub_surface_block)

            elif ly == surface_height:
                # Surface block (grass, sand, snow, etc)
                if surface_height < self.sea_level:
                    # Underwater surface is sand or gravel
                    chunk.set_block(lx, ly, lz, self.SAND)
                else:
                    chunk.set_block(lx, ly, lz, surface_block)

            elif ly <= self.sea_level and surface_height < self.sea_level:
                # Fill water up to sea level
                chunk.set_block(lx, ly, lz, self.WATER)

            else:
                # Air above surface
                chunk.set_block(lx, ly, lz, self.AIR)

    def _get_surface_block(self, biome: Dict[str, Any], height: int) -> int:
        """
        Get the surface block type for a biome.

        Args:
            biome: Biome config.
            height: Surface height.

        Returns:
            int: Block ID for surface.
        """
        biome_name = biome.get("name", "")
        tags = biome.get("tags", [])

        # Mountain biome: snow at high elevations
        if "mountain" in tags:
            if height > 140:
                return self.SNOW
            elif height > 120:
                return self.STONE

        # Swamp: mix of grass and dirt
        if biome_name == "swamp":
            return self.GRASS

        # Default: grass
        return self.GRASS

    def _get_sub_surface_block(self, biome: Dict[str, Any], height: int) -> int:
        """
        Get the sub-surface block type for a biome.

        Args:
            biome: Biome config.
            height: Surface height.

        Returns:
            int: Block ID for sub-surface.
        """
        tags = biome.get("tags", [])

        # Mountain biome: stone sub-surface at high elevations
        if "mountain" in tags and height > 120:
            return self.STONE

        # Default: dirt
        return self.DIRT

    # =========================================================================
    # INITIALIZATION SKY LIGHT
    # =========================================================================

    def calculate_initial_skylight(self, chunk: Chunk) -> None:
        """
        Calculate initial sky light for a chunk.

        Propagates sunlight (level 15) down from the sky until
        blocked by solid blocks.

        Args:
            chunk: Chunk to calculate lighting for.
        """
        for lx in range(chunk.size):
            for lz in range(chunk.size):
                light_level = 15

                # Propagate down from top
                for ly in range(chunk.height - 1, -1, -1):
                    block_id = chunk.get_block(lx, ly, lz)

                    # Set current light level
                    chunk.set_sky_light(lx, ly, lz, light_level)

                    # Check if block blocks light
                    if block_id != self.AIR:
                        block_config = self.blocks.get(block_id, {})
                        tags = block_config.get("tags", [])

                        if "transparent" not in tags:
                            # Solid block: reduce light
                            light_level = max(0, light_level - 1)
                        elif "transparent" in tags and block_id != self.AIR:
                            # Semi-transparent (leaves, water): reduce by 1
                            light_level = max(0, light_level - 1)

    # =========================================================================
    # CACHE MANAGEMENT
    # =========================================================================

    def clear_cache(self) -> None:
        """Clear the biome cache."""
        self._biome_cache.clear()

    def cache_size(self) -> int:
        """Get the current cache size."""
        return len(self._biome_cache)
