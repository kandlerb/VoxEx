"""
Noise generation for terrain and biome systems.

Uses FastNoiseLite when available for performance,
falls back to pure-Python Perlin implementation.

For best performance, install FastNoiseLite:
    pip install pyfastnoiselite

Without it, a pure-Python fallback is used (slower but functional).
"""

from typing import Optional
import math

# Try to import FastNoiseLite, fall back to pure Python
try:
    from pyfastnoiselite.pyfastnoiselite import (
        FastNoiseLite,
        NoiseType,
        FractalType,
        DomainWarpType,
    )
    HAS_FASTNOISE = True
except ImportError:
    HAS_FASTNOISE = False


class NoiseGenerator:
    """
    Unified noise API matching VoxEx usage patterns.

    Wraps FastNoiseLite when available, otherwise uses
    pure-Python Perlin implementation.

    Usage:
        gen = NoiseGenerator(seed=12345)
        height = gen.fbm2d(x * 0.01, z * 0.01, octaves=4)
        biome_val = gen.fbm_warped(x * 0.002, z * 0.002, warp_strength=20.0)
    """

    def __init__(self, seed: int = 0):
        """
        Initialize a noise generator with the given seed.

        Args:
            seed: Integer seed for deterministic noise generation.
        """
        self.seed = seed

        if HAS_FASTNOISE:
            self._init_fastnoise()
        else:
            self._init_fallback()

    def _init_fastnoise(self) -> None:
        """Initialize FastNoiseLite backends."""
        # Basic noise generator
        self._noise = FastNoiseLite(self.seed)
        self._noise.noise_type = NoiseType.NoiseType_Perlin

        # FBM generator (fractal)
        self._fbm = FastNoiseLite(self.seed)
        self._fbm.noise_type = NoiseType.NoiseType_Perlin
        self._fbm.fractal_type = FractalType.FractalType_FBm

        # Domain warp generator
        self._warp = FastNoiseLite(self.seed)
        self._warp.domain_warp_type = DomainWarpType.DomainWarpType_OpenSimplex2

    def _init_fallback(self) -> None:
        """Initialize pure-Python fallback matching VoxEx."""
        # Precompute FADE_LUT matching VoxEx:
        # fade(t) = t³(t(t×6 - 15) + 10)
        self._fade_lut = [
            t * t * t * (t * (t * 6 - 15) + 10)
            for t in [i / 255.0 for i in range(256)]
        ]

        # Generate seeded permutation table
        self._perm = self._generate_permutation(self.seed)

    def _generate_permutation(self, seed: int) -> list:
        """
        Generate a seeded permutation table matching VoxEx.

        Uses the same LCG (Linear Congruential Generator) as VoxEx:
        s = (s * 1103515245 + 12345) & 0x7fffffff

        Args:
            seed: Integer seed value.

        Returns:
            512-element permutation table (doubled for wraparound).
        """
        # Initialize p[0..255] = 0..255
        p = list(range(256))

        # Shuffle using seeded LCG (matching VoxEx exactly)
        s = seed
        for i in range(255, 0, -1):
            s = (s * 1103515245 + 12345) & 0x7fffffff
            j = s % (i + 1)
            p[i], p[j] = p[j], p[i]

        # Double the permutation table for wraparound indexing
        return p + p

    def _fade(self, t: float) -> float:
        """
        Fade function using lookup table.

        Args:
            t: Value in [0, 1].

        Returns:
            Smoothed value using quintic interpolation.
        """
        idx = int(t * 255)
        idx = max(0, min(255, idx))
        return self._fade_lut[idx]

    @staticmethod
    def _lerp(a: float, b: float, t: float) -> float:
        """
        Linear interpolation between a and b.

        Args:
            a: Start value.
            b: End value.
            t: Interpolation factor in [0, 1].

        Returns:
            Interpolated value.
        """
        return a + t * (b - a)

    @staticmethod
    def _grad2d(h: int, x: float, y: float) -> float:
        """
        2D gradient function matching VoxEx.

        Args:
            h: Hash value from permutation table.
            x: X offset from grid point.
            y: Y offset from grid point.

        Returns:
            Dot product of gradient and offset vector.
        """
        h = h & 15
        u = x if h < 8 else y
        v = y if h < 4 else (x if h == 12 or h == 14 else 0)
        return (u if (h & 1) == 0 else -u) + (v if (h & 2) == 0 else -v)

    @staticmethod
    def _grad3d(h: int, x: float, y: float, z: float) -> float:
        """
        3D gradient function matching VoxEx.

        Args:
            h: Hash value from permutation table.
            x: X offset from grid point.
            y: Y offset from grid point.
            z: Z offset from grid point.

        Returns:
            Dot product of gradient and offset vector.
        """
        h = h & 15
        u = x if h < 8 else y
        v = y if h < 4 else (x if h == 12 or h == 14 else z)
        return (u if (h & 1) == 0 else -u) + (v if (h & 2) == 0 else -v)

    def _perlin2d_fallback(self, x: float, y: float) -> float:
        """
        Pure-Python 2D Perlin noise matching VoxEx.

        Args:
            x: X coordinate.
            y: Y coordinate.

        Returns:
            Noise value in approximately [-1, 1].
        """
        # Get integer grid coordinates (wrapped to 0-255)
        floor_x = math.floor(x)
        floor_y = math.floor(y)
        X = floor_x & 255
        Y = floor_y & 255

        # Get fractional part
        x = x - floor_x
        y = y - floor_y

        # Compute fade curves
        u = self._fade(x)
        v = self._fade(y)

        # Hash coordinates of the 4 square corners
        A = self._perm[X] + Y
        B = self._perm[X + 1] + Y

        # Blend the 4 corners
        return self._lerp(
            self._lerp(
                self._grad2d(self._perm[A], x, y),
                self._grad2d(self._perm[B], x - 1, y),
                u
            ),
            self._lerp(
                self._grad2d(self._perm[A + 1], x, y - 1),
                self._grad2d(self._perm[B + 1], x - 1, y - 1),
                u
            ),
            v
        )

    def _perlin3d_fallback(self, x: float, y: float, z: float) -> float:
        """
        Pure-Python 3D Perlin noise matching VoxEx.

        Args:
            x: X coordinate.
            y: Y coordinate.
            z: Z coordinate.

        Returns:
            Noise value in approximately [-1, 1].
        """
        # Get integer grid coordinates (wrapped to 0-255)
        floor_x = math.floor(x)
        floor_y = math.floor(y)
        floor_z = math.floor(z)
        X = floor_x & 255
        Y = floor_y & 255
        Z = floor_z & 255

        # Get fractional part
        x = x - floor_x
        y = y - floor_y
        z = z - floor_z

        # Compute fade curves
        u = self._fade(x)
        v = self._fade(y)
        w = self._fade(z)

        # Hash coordinates of the 8 cube corners
        A = self._perm[X] + Y
        AA = self._perm[A] + Z
        AB = self._perm[A + 1] + Z
        B = self._perm[X + 1] + Y
        BA = self._perm[B] + Z
        BB = self._perm[B + 1] + Z

        # Blend the 8 corners
        return self._lerp(
            self._lerp(
                self._lerp(
                    self._grad3d(self._perm[AA], x, y, z),
                    self._grad3d(self._perm[BA], x - 1, y, z),
                    u
                ),
                self._lerp(
                    self._grad3d(self._perm[AB], x, y - 1, z),
                    self._grad3d(self._perm[BB], x - 1, y - 1, z),
                    u
                ),
                v
            ),
            self._lerp(
                self._lerp(
                    self._grad3d(self._perm[AA + 1], x, y, z - 1),
                    self._grad3d(self._perm[BA + 1], x - 1, y, z - 1),
                    u
                ),
                self._lerp(
                    self._grad3d(self._perm[AB + 1], x, y - 1, z - 1),
                    self._grad3d(self._perm[BB + 1], x - 1, y - 1, z - 1),
                    u
                ),
                v
            ),
            w
        )

    def _fbm2d_fallback(self, x: float, y: float, octaves: int = 4,
                        persistence: float = 0.5, lacunarity: float = 2.0) -> float:
        """
        Pure-Python FBM matching VoxEx.

        Args:
            x: X coordinate.
            y: Y coordinate.
            octaves: Number of noise layers.
            persistence: Amplitude multiplier per octave.
            lacunarity: Frequency multiplier per octave.

        Returns:
            Accumulated noise value normalized to [-1, 1].
        """
        total = 0.0
        frequency = 1.0
        amplitude = 1.0
        max_value = 0.0

        for _ in range(octaves):
            total += self._perlin2d_fallback(x * frequency, y * frequency) * amplitude
            max_value += amplitude
            amplitude *= persistence
            frequency *= lacunarity

        return total / max_value

    def _fbm_warped_fallback(self, x: float, z: float,
                              warp_strength: float = 50.0,
                              octaves: int = 4) -> float:
        """
        Pure-Python domain-warped FBM matching VoxEx.

        Args:
            x: X coordinate.
            z: Z coordinate.
            warp_strength: Amplitude of coordinate offset.
            octaves: FBM octaves.

        Returns:
            Warped noise value in [-1, 1].
        """
        # Match VoxEx fbmWithDomainWarp exactly:
        # warpScale = 0.03, warpStrength = 20 (scaled to warp_strength param)
        warp_scale = 0.03
        scale_factor = warp_strength / 20.0  # Normalize to VoxEx default

        offset_x = self._fbm2d_fallback(x * warp_scale, z * warp_scale, 3, 0.5, 2.0) * 20 * scale_factor
        offset_z = self._fbm2d_fallback((x + 100) * warp_scale, (z + 100) * warp_scale, 3, 0.5, 2.0) * 20 * scale_factor

        return self._fbm2d_fallback(x + offset_x, z + offset_z, octaves, 0.5, 2.0)

    def noise2d(self, x: float, y: float) -> float:
        """
        2D Perlin noise.

        Args:
            x: X coordinate.
            y: Y coordinate.

        Returns:
            Noise value in approximately [-1, 1].
        """
        if HAS_FASTNOISE:
            return self._noise.get_noise(x, y)
        return self._perlin2d_fallback(x, y)

    def noise3d(self, x: float, y: float, z: float) -> float:
        """
        3D Perlin noise.

        Args:
            x: X coordinate.
            y: Y coordinate.
            z: Z coordinate.

        Returns:
            Noise value in approximately [-1, 1].
        """
        if HAS_FASTNOISE:
            return self._noise.get_noise(x, y, z)
        return self._perlin3d_fallback(x, y, z)

    def fbm2d(self, x: float, y: float,
              octaves: int = 4,
              persistence: float = 0.5,
              lacunarity: float = 2.0) -> float:
        """
        Fractal Brownian Motion - layered noise.

        Args:
            x: X world coordinate.
            y: Y world coordinate.
            octaves: Number of noise layers (default 4).
            persistence: Amplitude multiplier per octave (default 0.5).
            lacunarity: Frequency multiplier per octave (default 2.0).

        Returns:
            Accumulated noise value normalized to approximately [-1, 1].
        """
        if HAS_FASTNOISE:
            self._fbm.fractal_octaves = octaves
            self._fbm.fractal_gain = persistence
            self._fbm.fractal_lacunarity = lacunarity
            return self._fbm.get_noise(x, y)
        return self._fbm2d_fallback(x, y, octaves, persistence, lacunarity)

    def fbm3d(self, x: float, y: float, z: float,
              octaves: int = 4,
              persistence: float = 0.5,
              lacunarity: float = 2.0) -> float:
        """
        3D Fractal Brownian Motion.

        Args:
            x: X world coordinate.
            y: Y world coordinate.
            z: Z world coordinate.
            octaves: Number of noise layers (default 4).
            persistence: Amplitude multiplier per octave (default 0.5).
            lacunarity: Frequency multiplier per octave (default 2.0).

        Returns:
            Accumulated noise value normalized to approximately [-1, 1].
        """
        if HAS_FASTNOISE:
            self._fbm.fractal_octaves = octaves
            self._fbm.fractal_gain = persistence
            self._fbm.fractal_lacunarity = lacunarity
            return self._fbm.get_noise(x, y, z)

        # Fallback 3D FBM
        total = 0.0
        frequency = 1.0
        amplitude = 1.0
        max_value = 0.0

        for _ in range(octaves):
            total += self._perlin3d_fallback(
                x * frequency, y * frequency, z * frequency
            ) * amplitude
            max_value += amplitude
            amplitude *= persistence
            frequency *= lacunarity

        return total / max_value

    def fbm_warped(self, x: float, z: float,
                   warp_strength: float = 50.0,
                   octaves: int = 4) -> float:
        """
        Domain-warped FBM for organic biome boundaries.

        Matches VoxEx's fbmWithDomainWarp - offsets input
        coordinates by noise before sampling.

        Args:
            x: X world coordinate.
            z: Z world coordinate.
            warp_strength: How much to offset coords (default 50).
            octaves: FBM octaves (default 4).

        Returns:
            Warped noise value in approximately [-1, 1].
        """
        if HAS_FASTNOISE:
            self._warp.domain_warp_amp = warp_strength
            # Create mutable values for in-place modification
            coords = [x, z]
            self._warp.domain_warp(coords)
            return self.fbm2d(coords[0], coords[1], octaves)
        return self._fbm_warped_fallback(x, z, warp_strength, octaves)


# Module-level default generator (lazy initialized)
_default_generator: Optional[NoiseGenerator] = None


def get_generator(seed: int = 0) -> NoiseGenerator:
    """
    Get or create a noise generator with given seed.

    Args:
        seed: Integer seed for deterministic generation.

    Returns:
        NoiseGenerator instance.
    """
    global _default_generator
    if _default_generator is None or _default_generator.seed != seed:
        _default_generator = NoiseGenerator(seed)
    return _default_generator


def noise2d(x: float, y: float, seed: int = 0) -> float:
    """
    Quick 2D noise matching VoxEx signature.

    Args:
        x: X coordinate.
        y: Y coordinate.
        seed: World seed.

    Returns:
        Noise value in approximately [-1, 1].
    """
    return get_generator(seed).noise2d(x, y)


def noise3d(x: float, y: float, z: float, seed: int = 0) -> float:
    """
    Quick 3D noise.

    Args:
        x: X coordinate.
        y: Y coordinate.
        z: Z coordinate.
        seed: World seed.

    Returns:
        Noise value in approximately [-1, 1].
    """
    return get_generator(seed).noise3d(x, y, z)


def fbm2d(x: float, y: float,
          octaves: int = 4,
          persistence: float = 0.5,
          lacunarity: float = 2.0,
          seed: int = 0) -> float:
    """
    Quick FBM matching VoxEx signature.

    Args:
        x: X coordinate.
        y: Y coordinate.
        octaves: Number of noise layers.
        persistence: Amplitude multiplier per octave.
        lacunarity: Frequency multiplier per octave.
        seed: World seed.

    Returns:
        Accumulated noise value.
    """
    return get_generator(seed).fbm2d(x, y, octaves, persistence, lacunarity)


def fbm_warped(x: float, z: float,
               warp_strength: float = 50.0,
               octaves: int = 4,
               seed: int = 0) -> float:
    """
    Quick domain-warped FBM.

    Args:
        x: X coordinate.
        z: Z coordinate.
        warp_strength: Coordinate offset amplitude.
        octaves: FBM octaves.
        seed: World seed.

    Returns:
        Warped noise value.
    """
    return get_generator(seed).fbm_warped(x, z, warp_strength, octaves)
