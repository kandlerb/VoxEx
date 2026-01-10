"""
Procedural sound effect generators.

Generates sound effects at runtime without external audio files.
Sounds are cached after first generation to avoid redundant computation.

Usage:
    from voxel_engine.engine.audio.sounds import SoundGenerator

    gen = SoundGenerator()
    footstep = gen.footstep_grass(variation=0)
    break_sound = gen.block_break("stone")
"""

import numpy as np
from numpy.typing import NDArray
from typing import Dict, Optional

from .constants import SAMPLE_RATE
from .oscillator import (
    sine_wave, noise, pink_noise, square_wave, triangle_wave
)
from .envelope import (
    adsr_envelope, percussion_envelope, fade_out
)


class SoundGenerator:
    """
    Generates procedural sound effects.

    Sounds are cached after generation to avoid redundant computation.
    """

    __slots__ = ('_cache', '_rng')

    def __init__(self, seed: int = 42):
        """
        Initialize sound generator.

        Args:
            seed: Random seed for reproducible sounds.
        """
        self._cache: Dict[str, NDArray[np.float32]] = {}
        self._rng = np.random.default_rng(seed)

    def _get_cached(self, key: str) -> Optional[NDArray[np.float32]]:
        """Get cached sound if available."""
        return self._cache.get(key)

    def _set_cached(
        self,
        key: str,
        sound: NDArray[np.float32]
    ) -> NDArray[np.float32]:
        """Cache and return sound."""
        self._cache[key] = sound
        return sound

    def _normalize(
        self,
        sound: NDArray[np.float32],
        target_amplitude: float = 0.5
    ) -> NDArray[np.float32]:
        """Normalize sound to target amplitude."""
        max_val = np.max(np.abs(sound))
        if max_val > 0.001:
            sound = sound / max_val * target_amplitude
        return sound.astype(np.float32)

    # =========================================================================
    # FOOTSTEP SOUNDS
    # =========================================================================

    def footstep_grass(self, variation: int = 0) -> NDArray[np.float32]:
        """
        Soft rustling footstep for grass/dirt.

        Args:
            variation: Sound variation (0-3).

        Returns:
            Generated sound samples.
        """
        key = f"footstep_grass_{variation}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.15

        # Mix of noise for rustling
        samples = noise(duration, 0.3)

        # Add some low frequency thump
        thump = sine_wave(80 + variation * 5, duration, 0.2)

        # Apply envelope
        env = percussion_envelope(duration, 0.05)

        sound = (samples + thump) * env
        sound = fade_out(sound)
        sound = self._normalize(sound, 0.5)

        return self._set_cached(key, sound)

    def footstep_stone(self, variation: int = 0) -> NDArray[np.float32]:
        """
        Hard clicking footstep for stone.

        Args:
            variation: Sound variation (0-3).

        Returns:
            Generated sound samples.
        """
        key = f"footstep_stone_{variation}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.1

        # Sharp click
        click_freq = 800 + variation * 50
        click = sine_wave(click_freq, duration, 0.4)

        # Some high frequency noise
        high_noise = noise(duration, 0.15)

        # Very short envelope
        env = percussion_envelope(duration, 0.03)

        sound = (click + high_noise) * env
        sound = fade_out(sound, 0.02)
        sound = self._normalize(sound, 0.6)

        return self._set_cached(key, sound)

    def footstep_sand(self, variation: int = 0) -> NDArray[np.float32]:
        """
        Crunchy footstep for sand/gravel.

        Args:
            variation: Sound variation (0-3).

        Returns:
            Generated sound samples.
        """
        key = f"footstep_sand_{variation}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.18

        # Crunchy noise
        crunch = pink_noise(duration, 0.5)

        # Add some variation
        mod = sine_wave(20 + variation * 3, duration, 0.3)

        env = percussion_envelope(duration, 0.08)

        sound = crunch * (1 + mod * 0.5) * env
        sound = fade_out(sound)
        sound = self._normalize(sound, 0.45)

        return self._set_cached(key, sound)

    def footstep_wood(self, variation: int = 0) -> NDArray[np.float32]:
        """
        Hollow thunk for wood.

        Args:
            variation: Sound variation (0-3).

        Returns:
            Generated sound samples.
        """
        key = f"footstep_wood_{variation}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.12

        # Hollow resonance
        base_freq = 200 + variation * 20
        resonance = sine_wave(base_freq, duration, 0.5)
        resonance += sine_wave(base_freq * 2.3, duration, 0.2)

        # Click transient
        click_duration = 0.02
        click = noise(click_duration, 0.3)
        target_len = int(SAMPLE_RATE * duration)
        click = np.pad(click, (0, max(0, target_len - len(click))))[:target_len]

        env = percussion_envelope(duration, 0.06)

        sound = (resonance + click) * env
        sound = fade_out(sound)
        sound = self._normalize(sound, 0.55)

        return self._set_cached(key, sound)

    def footstep_water(self, variation: int = 0) -> NDArray[np.float32]:
        """
        Splash for water.

        Args:
            variation: Sound variation (0-3).

        Returns:
            Generated sound samples.
        """
        key = f"footstep_water_{variation}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.25

        # Splash noise
        splash = pink_noise(duration, 0.6)

        # Low frequency water movement
        water = sine_wave(60 + variation * 10, duration, 0.2)

        # Longer, softer envelope
        env = adsr_envelope(duration, 0.02, 0.1, 0.3, 0.13)

        sound = (splash + water) * env
        sound = fade_out(sound, 0.1)
        sound = self._normalize(sound, 0.4)

        return self._set_cached(key, sound)

    def footstep_snow(self, variation: int = 0) -> NDArray[np.float32]:
        """
        Crunchy snow footstep.

        Args:
            variation: Sound variation (0-3).

        Returns:
            Generated sound samples.
        """
        key = f"footstep_snow_{variation}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.2

        # High frequency crunch
        crunch = noise(duration, 0.4)

        # Filter-like effect using modulated amplitude
        t = np.linspace(0, duration, int(SAMPLE_RATE * duration), dtype=np.float32)
        mod = 0.5 + 0.5 * np.sin(2 * np.pi * (300 + variation * 30) * t)
        crunch = crunch * mod

        # Soft thump
        thump = sine_wave(100, duration, 0.15)

        env = percussion_envelope(duration, 0.1)

        sound = (crunch + thump) * env
        sound = fade_out(sound)
        sound = self._normalize(sound, 0.4)

        return self._set_cached(key, sound)

    # =========================================================================
    # BLOCK SOUNDS
    # =========================================================================

    def block_break(self, block_type: str = "stone") -> NDArray[np.float32]:
        """
        Block breaking sound.

        Args:
            block_type: Material type (stone, wood, grass, etc.)

        Returns:
            Generated sound samples.
        """
        key = f"block_break_{block_type}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.2

        if block_type in ("stone", "gravel", "bedrock"):
            # Crumbling
            sound = pink_noise(duration, 0.6)
            sound += noise(duration, 0.3)
        elif block_type in ("wood", "log"):
            # Cracking
            crack = square_wave(150, duration, 0.3)
            sound = crack + noise(duration, 0.4)
        elif block_type in ("grass", "dirt"):
            # Soft thud
            sound = pink_noise(duration, 0.5)
            sound += sine_wave(100, duration, 0.2)
        elif block_type in ("sand", "snow"):
            # Soft crunch
            sound = pink_noise(duration, 0.4)
            sound += noise(duration, 0.2)
        elif block_type == "water":
            # Splash
            sound = pink_noise(duration, 0.5)
            sound += sine_wave(80, duration, 0.2)
        elif block_type == "leaves":
            # Rustling
            sound = noise(duration, 0.4)
            sound += pink_noise(duration, 0.2)
        else:
            # Default
            sound = noise(duration, 0.5)

        env = percussion_envelope(duration, 0.08)
        sound = sound * env
        sound = fade_out(sound)
        sound = self._normalize(sound, 0.6)

        return self._set_cached(key, sound)

    def block_place(self, block_type: str = "stone") -> NDArray[np.float32]:
        """
        Block placement sound.

        Args:
            block_type: Material type (stone, wood, grass, etc.)

        Returns:
            Generated sound samples.
        """
        key = f"block_place_{block_type}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.15

        # Thud with material-specific character
        if block_type in ("stone", "gravel", "bedrock"):
            sound = sine_wave(200, duration, 0.4)
            sound += noise(duration, 0.2)
        elif block_type in ("wood", "log"):
            sound = sine_wave(180, duration, 0.5)
            sound += sine_wave(360, duration, 0.2)
        elif block_type in ("grass", "dirt"):
            sound = sine_wave(120, duration, 0.4)
            sound += pink_noise(duration, 0.2)
        elif block_type in ("sand", "snow"):
            sound = pink_noise(duration, 0.35)
            sound += sine_wave(100, duration, 0.15)
        elif block_type == "water":
            sound = pink_noise(duration, 0.4)
            sound += sine_wave(70, duration, 0.2)
        elif block_type == "leaves":
            sound = noise(duration, 0.3)
            sound += sine_wave(150, duration, 0.15)
        else:
            sound = sine_wave(150, duration, 0.4)
            sound += pink_noise(duration, 0.15)

        env = percussion_envelope(duration, 0.05)
        sound = sound * env
        sound = fade_out(sound, 0.03)
        sound = self._normalize(sound, 0.5)

        return self._set_cached(key, sound)

    def mining_hit(self, block_type: str = "stone") -> NDArray[np.float32]:
        """
        Block mining hit sound (during mining).

        Args:
            block_type: Material type.

        Returns:
            Generated sound samples.
        """
        key = f"mining_hit_{block_type}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        duration = 0.08

        if block_type in ("stone", "gravel", "bedrock"):
            sound = sine_wave(600, duration, 0.3)
            sound += noise(duration, 0.2)
        elif block_type in ("wood", "log"):
            sound = sine_wave(400, duration, 0.35)
            sound += triangle_wave(200, duration, 0.15)
        else:
            sound = sine_wave(500, duration, 0.3)
            sound += noise(duration, 0.15)

        env = percussion_envelope(duration, 0.03)
        sound = sound * env
        sound = self._normalize(sound, 0.35)

        return self._set_cached(key, sound)

    # =========================================================================
    # AMBIENT SOUNDS
    # =========================================================================

    def ambient_wind(self, duration: float = 5.0) -> NDArray[np.float32]:
        """
        Wind ambient sound.

        Args:
            duration: Sound duration in seconds.

        Returns:
            Generated sound samples.
        """
        key = f"ambient_wind_{duration:.1f}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        # Filtered noise
        wind = pink_noise(duration, 0.3)

        # Slow modulation
        mod_freq = 0.2
        samples = len(wind)
        t = np.linspace(0, duration, samples, dtype=np.float32)
        modulation = 0.5 + 0.5 * np.sin(2 * np.pi * mod_freq * t)

        sound = wind * modulation

        # Fade in/out for looping
        fade_samples = int(0.5 * SAMPLE_RATE)
        fade_samples = min(fade_samples, samples // 4)
        if fade_samples > 1:
            sound[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
            sound[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)

        return self._set_cached(key, sound.astype(np.float32))

    def ambient_cave(self, duration: float = 8.0) -> NDArray[np.float32]:
        """
        Cave dripping/echo ambient.

        Args:
            duration: Sound duration in seconds.

        Returns:
            Generated sound samples.
        """
        key = f"ambient_cave_{duration:.1f}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        samples = int(SAMPLE_RATE * duration)
        sound = np.zeros(samples, dtype=np.float32)

        # Random drips
        num_drips = int(duration * 0.5)
        drip_zone = samples - int(0.5 * SAMPLE_RATE)
        if drip_zone < 1:
            drip_zone = samples

        for _ in range(num_drips):
            pos = self._rng.integers(0, drip_zone)

            # Drip sound
            drip_dur = 0.3
            drip_freq = 800 + self._rng.integers(-100, 100)
            drip = sine_wave(drip_freq, drip_dur, 0.2)
            drip *= percussion_envelope(drip_dur, 0.15)

            end_pos = min(pos + len(drip), samples)
            sound[pos:end_pos] += drip[:end_pos - pos]

        # Low rumble
        rumble = pink_noise(duration, 0.05)
        sound += rumble

        # Fade edges
        fade_samples = int(0.5 * SAMPLE_RATE)
        fade_samples = min(fade_samples, samples // 4)
        if fade_samples > 1:
            sound[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
            sound[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)

        return self._set_cached(key, sound)

    def ambient_underwater(self, duration: float = 5.0) -> NDArray[np.float32]:
        """
        Underwater ambient sound.

        Args:
            duration: Sound duration in seconds.

        Returns:
            Generated sound samples.
        """
        key = f"ambient_underwater_{duration:.1f}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        # Low rumble
        rumble = pink_noise(duration, 0.25)

        # Bubbling
        samples = int(SAMPLE_RATE * duration)
        bubbles = np.zeros(samples, dtype=np.float32)

        num_bubbles = int(duration * 2)
        bubble_zone = samples - int(0.3 * SAMPLE_RATE)
        if bubble_zone < 1:
            bubble_zone = samples

        for _ in range(num_bubbles):
            pos = self._rng.integers(0, bubble_zone)
            bubble_dur = 0.1 + self._rng.random() * 0.1
            bubble_freq = 200 + self._rng.integers(0, 300)
            bubble = sine_wave(bubble_freq, bubble_dur, 0.15)
            bubble *= percussion_envelope(bubble_dur, 0.05)

            end_pos = min(pos + len(bubble), samples)
            bubbles[pos:end_pos] += bubble[:end_pos - pos]

        sound = rumble + bubbles

        # Fade edges
        fade_samples = int(0.5 * SAMPLE_RATE)
        fade_samples = min(fade_samples, samples // 4)
        if fade_samples > 1:
            sound[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
            sound[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)

        return self._set_cached(key, sound.astype(np.float32))

    # =========================================================================
    # UI SOUNDS
    # =========================================================================

    def ui_click(self) -> NDArray[np.float32]:
        """
        UI button click.

        Returns:
            Generated sound samples.
        """
        cached = self._get_cached("ui_click")
        if cached is not None:
            return cached

        duration = 0.05

        click = sine_wave(1000, duration, 0.3)
        click += sine_wave(1500, duration, 0.15)

        env = percussion_envelope(duration, 0.02)
        sound = click * env
        sound = self._normalize(sound, 0.4)

        return self._set_cached("ui_click", sound)

    def ui_hover(self) -> NDArray[np.float32]:
        """
        UI element hover sound.

        Returns:
            Generated sound samples.
        """
        cached = self._get_cached("ui_hover")
        if cached is not None:
            return cached

        duration = 0.03

        hover = sine_wave(800, duration, 0.2)
        env = percussion_envelope(duration, 0.015)
        sound = hover * env
        sound = self._normalize(sound, 0.25)

        return self._set_cached("ui_hover", sound)

    def ui_select(self) -> NDArray[np.float32]:
        """
        UI selection/confirm sound.

        Returns:
            Generated sound samples.
        """
        cached = self._get_cached("ui_select")
        if cached is not None:
            return cached

        duration = 0.1

        # Rising pitch
        samples = int(SAMPLE_RATE * duration)
        t = np.linspace(0, duration, samples, dtype=np.float32)
        freq = 600 + 400 * t / duration
        sound = 0.3 * np.sin(2 * np.pi * freq * t)

        env = adsr_envelope(duration, 0.01, 0.02, 0.8, 0.06)
        sound = sound * env
        sound = self._normalize(sound.astype(np.float32), 0.4)

        return self._set_cached("ui_select", sound)

    # =========================================================================
    # UTILITY
    # =========================================================================

    def clear_cache(self) -> None:
        """Clear sound cache."""
        self._cache.clear()

    @property
    def cache_size(self) -> int:
        """Get number of cached sounds."""
        return len(self._cache)
