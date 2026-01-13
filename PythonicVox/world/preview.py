"""
Terrain preview generator for PythonicVox.

Generates a top-down terrain preview image using noise-based
height generation, suitable for the world creation menu.
"""

import pygame
import math
import random

# Try to import pyfastnoiselite, fall back to simple noise if unavailable
try:
    from pyfastnoiselite import FastNoiseLite, NoiseType
    HAS_FASTNOISE = True
except ImportError:
    HAS_FASTNOISE = False


class SimpleNoise:
    """
    Simple Perlin-like noise fallback when pyfastnoiselite is unavailable.
    Uses a basic value noise approach with interpolation.
    """

    def __init__(self):
        self.seed = 0
        self._permutation = None
        self._refresh_permutation()

    def _refresh_permutation(self):
        """Generate permutation table based on seed."""
        rng = random.Random(self.seed)
        self._permutation = list(range(256))
        rng.shuffle(self._permutation)
        self._permutation = self._permutation * 2

    def set_seed(self, seed):
        """Set noise seed."""
        self.seed = seed
        self._refresh_permutation()

    def _fade(self, t):
        """Smoothstep fade function."""
        return t * t * t * (t * (t * 6 - 15) + 10)

    def _lerp(self, a, b, t):
        """Linear interpolation."""
        return a + t * (b - a)

    def _grad(self, hash_val, x, y):
        """Gradient function."""
        h = hash_val & 3
        if h == 0:
            return x + y
        elif h == 1:
            return -x + y
        elif h == 2:
            return x - y
        else:
            return -x - y

    def get_noise_2d(self, x, y):
        """
        Get 2D noise value at coordinates.

        Args:
            x (float): X coordinate.
            y (float): Y coordinate.

        Returns:
            float: Noise value in range [-1, 1].
        """
        # Integer coordinates
        xi = int(math.floor(x)) & 255
        yi = int(math.floor(y)) & 255

        # Fractional coordinates
        xf = x - math.floor(x)
        yf = y - math.floor(y)

        # Fade curves
        u = self._fade(xf)
        v = self._fade(yf)

        # Hash coordinates
        p = self._permutation
        aa = p[p[xi] + yi]
        ab = p[p[xi] + yi + 1]
        ba = p[p[xi + 1] + yi]
        bb = p[p[xi + 1] + yi + 1]

        # Blend
        x1 = self._lerp(self._grad(aa, xf, yf), self._grad(ba, xf - 1, yf), u)
        x2 = self._lerp(self._grad(ab, xf, yf - 1), self._grad(bb, xf - 1, yf - 1), u)

        return self._lerp(x1, x2, v)


class TerrainPreview:
    """
    Generates terrain preview images for world creation.

    Uses noise to generate a heightmap and colors it based on
    elevation relative to sea level.

    Attributes:
        width (int): Preview image width.
        height (int): Preview image height.
        surface (pygame.Surface): The rendered preview image.
    """

    def __init__(self, width, height):
        """
        Initialize a new TerrainPreview.

        Args:
            width (int): Preview width in pixels.
            height (int): Preview height in pixels.
        """
        self.width = width
        self.height = height
        self.surface = pygame.Surface((width, height))
        self.surface.fill((30, 30, 30))

        # Initialize noise generator
        if HAS_FASTNOISE:
            self.noise = FastNoiseLite()
            self.noise.noise_type = NoiseType.NoiseType_Perlin
        else:
            self.noise = SimpleNoise()

        self.cached_seed = None
        self.cached_settings = None

    def generate(self, seed, world_type, preview_settings):
        """
        Generate preview image based on current settings.

        Args:
            seed: World seed (int or string).
            world_type (str): World type identifier.
            preview_settings (dict): Settings dict with terrain_amplitude, sea_level.
        """
        # Check if we can use cached result
        cache_key = (seed, world_type, tuple(sorted(preview_settings.items())))
        if cache_key == self.cached_settings:
            return

        # Configure noise seed
        if isinstance(seed, str):
            seed_int = hash(seed) % (2 ** 31) if seed else 0
        else:
            seed_int = seed if seed else 0

        if HAS_FASTNOISE:
            self.noise.seed = seed_int
        else:
            self.noise.set_seed(seed_int)

        # Get settings
        amplitude = preview_settings.get('terrain_amplitude', 100) / 100.0
        sea_level = preview_settings.get('sea_level', 60)

        # World type modifiers
        type_modifiers = {
            'default': {'amp_mod': 1.0, 'freq_mod': 1.0},
            'amplified': {'amp_mod': 1.8, 'freq_mod': 0.8},
            'flat': {'amp_mod': 0.1, 'freq_mod': 2.0},
            'archipelago': {'amp_mod': 0.6, 'freq_mod': 0.5},
            'superflat': {'amp_mod': 0.0, 'freq_mod': 1.0},
            'caves_plus': {'amp_mod': 1.2, 'freq_mod': 1.0},
        }
        mods = type_modifiers.get(world_type, type_modifiers['default'])

        # Generate heightmap
        for x in range(self.width):
            for y in range(self.height):
                # Sample noise (y is world z in top-down view)
                freq = 0.02 * mods['freq_mod']

                if HAS_FASTNOISE:
                    noise_val = self.noise.get_noise_2d(x * freq * 50, y * freq * 50)
                else:
                    noise_val = self.noise.get_noise_2d(x * freq * 5, y * freq * 5)

                # Normalize to 0-1
                noise_val = (noise_val + 1) / 2

                # Apply amplitude and world type
                effective_amp = amplitude * mods['amp_mod']
                height = noise_val * effective_amp * 64 + 32

                # Get terrain color
                color = self._get_terrain_color(height, sea_level)
                self.surface.set_at((x, y), color)

        # Cache settings
        self.cached_settings = cache_key

    def _get_terrain_color(self, height, sea_level):
        """
        Get color based on height relative to sea level.

        Args:
            height (float): Terrain height.
            sea_level (float): Sea level height.

        Returns:
            tuple: RGB color tuple.
        """
        if height < sea_level - 5:
            return (30, 80, 160)     # Deep water
        elif height < sea_level:
            return (50, 120, 200)    # Shallow water
        elif height < sea_level + 2:
            return (210, 190, 140)   # Sand/beach
        elif height < sea_level + 30:
            return (80, 160, 60)     # Grass
        elif height < sea_level + 50:
            return (120, 120, 120)   # Stone
        else:
            return (240, 240, 250)   # Snow

    def draw(self, surface, pos):
        """
        Blit preview to target surface.

        Args:
            surface (pygame.Surface): Target surface.
            pos: (x, y) position tuple.
        """
        surface.blit(self.surface, pos)
