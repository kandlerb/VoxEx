"""
High-level audio manager.

Provides high-level API for playing game sounds with
automatic sound selection based on block types.

Usage:
    from voxel_engine.engine.audio import AudioManager

    manager = AudioManager(seed=12345)
    manager.initialize()

    manager.play_footstep(block_id=1)  # Grass
    manager.play_block_break(block_id=3)  # Stone
    manager.start_ambient("wind")

    manager.shutdown()
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Dict

from .constants import (
    SFX_VOLUME, AMBIENT_VOLUME, SoundCategory,
    FOOTSTEP_INTERVAL_WALK, FOOTSTEP_INTERVAL_SPRINT, FOOTSTEP_INTERVAL_CROUCH
)
from .sounds import SoundGenerator
from .audio_backend import AudioBackend, AudioSource

# Map block IDs to material types
BLOCK_MATERIALS: Dict[int, str] = {
    0: "air",       # Air (no sound)
    1: "grass",     # Grass
    2: "grass",     # Dirt
    3: "stone",     # Stone
    4: "wood",      # Wood planks
    5: "wood",      # Log
    6: "leaves",    # Leaves
    7: "stone",     # Bedrock
    8: "sand",      # Sand
    9: "water",     # Water
    10: "wood",     # Torch
    11: "snow",     # Snow
    12: "sand",     # Gravel
    13: "wood",     # Longwood Log
    14: "leaves",   # Longwood Leaves
}


class AudioManager:
    """
    Manages game audio - sound effects and ambient.

    Provides high-level API for playing sounds based on
    game events like footsteps, block interactions, etc.
    """

    __slots__ = (
        '_backend', '_generator',
        '_sfx_volume', '_ambient_volume', '_enabled',
        '_footstep_timer', '_footstep_variation',
        '_current_ambient', '_ambient_type',
        '_last_block_below'
    )

    def __init__(self, seed: int = 42):
        """
        Initialize audio manager.

        Args:
            seed: Random seed for sound generation.
        """
        self._backend = AudioBackend()
        self._generator = SoundGenerator(seed)

        self._sfx_volume = SFX_VOLUME
        self._ambient_volume = AMBIENT_VOLUME
        self._enabled = True

        self._footstep_timer = 0.0
        self._footstep_variation = 0
        self._current_ambient: Optional[AudioSource] = None
        self._ambient_type: Optional[str] = None
        self._last_block_below = 0

    def initialize(self) -> bool:
        """
        Initialize audio system.

        Returns:
            True if initialized successfully.
        """
        result = self._backend.start()
        if result:
            print("[Audio] Audio system initialized")
        else:
            print("[Audio] Audio unavailable (sounddevice not installed)")
        return result

    def shutdown(self) -> None:
        """Shutdown audio system."""
        self._backend.stop()

    @property
    def enabled(self) -> bool:
        """Check if audio is enabled."""
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool) -> None:
        """Enable/disable audio."""
        self._enabled = value
        if not value:
            self._backend.mixer.stop_all()

    @property
    def available(self) -> bool:
        """Check if audio backend is available."""
        return self._backend.available

    @property
    def sfx_volume(self) -> float:
        """Get SFX volume."""
        return self._sfx_volume

    @sfx_volume.setter
    def sfx_volume(self, value: float) -> None:
        """Set SFX volume (0.0 - 1.0)."""
        self._sfx_volume = max(0.0, min(1.0, value))

    @property
    def ambient_volume(self) -> float:
        """Get ambient volume."""
        return self._ambient_volume

    @ambient_volume.setter
    def ambient_volume(self, value: float) -> None:
        """Set ambient volume (0.0 - 1.0)."""
        self._ambient_volume = max(0.0, min(1.0, value))
        # Update current ambient if playing
        if self._current_ambient is not None:
            self._current_ambient.volume = self._ambient_volume

    def set_master_volume(self, volume: float) -> None:
        """
        Set master volume.

        Args:
            volume: Volume level (0.0 - 1.0).
        """
        self._backend.set_master_volume(volume)

    def set_listener_position(self, pos: NDArray) -> None:
        """
        Update listener position for spatial audio.

        Args:
            pos: 3D position array.
        """
        self._backend.set_listener_position(pos)

    # =========================================================================
    # FOOTSTEPS
    # =========================================================================

    def play_footstep(self, block_id: int, variation: int = 0) -> None:
        """
        Play footstep sound for block type.

        Args:
            block_id: Block ID under player.
            variation: Sound variation (0-3).
        """
        if not self._enabled or not self._backend.running:
            return

        material = BLOCK_MATERIALS.get(block_id, "stone")

        if material == "air":
            return
        elif material == "grass":
            sound = self._generator.footstep_grass(variation % 4)
        elif material == "stone":
            sound = self._generator.footstep_stone(variation % 4)
        elif material == "sand":
            sound = self._generator.footstep_sand(variation % 4)
        elif material == "wood":
            sound = self._generator.footstep_wood(variation % 4)
        elif material == "water":
            sound = self._generator.footstep_water(variation % 4)
        elif material == "snow":
            sound = self._generator.footstep_snow(variation % 4)
        elif material == "leaves":
            sound = self._generator.footstep_grass(variation % 4)  # Use grass for leaves
        else:
            sound = self._generator.footstep_stone(variation % 4)

        self._backend.play(sound, self._sfx_volume)

    def update_footsteps(
        self,
        dt: float,
        is_moving: bool,
        is_grounded: bool,
        is_sprinting: bool,
        is_crouching: bool,
        block_below: int
    ) -> None:
        """
        Update footstep timing and play sounds.

        Call this each tick.

        Args:
            dt: Time delta in seconds.
            is_moving: Whether player is moving horizontally.
            is_grounded: Whether player is on ground.
            is_sprinting: Whether player is sprinting.
            is_crouching: Whether player is crouching.
            block_below: Block ID under player.
        """
        if not self._enabled or not is_moving or not is_grounded:
            self._footstep_timer = 0.0
            return

        # Determine interval based on movement type
        if is_sprinting:
            interval = FOOTSTEP_INTERVAL_SPRINT
        elif is_crouching:
            interval = FOOTSTEP_INTERVAL_CROUCH
        else:
            interval = FOOTSTEP_INTERVAL_WALK

        self._footstep_timer += dt

        if self._footstep_timer >= interval:
            self._footstep_timer = 0.0
            self._footstep_variation = (self._footstep_variation + 1) % 4
            self.play_footstep(block_below, self._footstep_variation)
            self._last_block_below = block_below

    # =========================================================================
    # BLOCK SOUNDS
    # =========================================================================

    def play_block_break(
        self,
        block_id: int,
        position: Optional[NDArray] = None
    ) -> None:
        """
        Play block breaking sound.

        Args:
            block_id: Block ID being broken.
            position: 3D position for spatial audio.
        """
        if not self._enabled or not self._backend.running:
            return

        material = BLOCK_MATERIALS.get(block_id, "stone")
        if material == "air":
            return

        sound = self._generator.block_break(material)
        spatial = position.astype(np.float32) if position is not None else None
        self._backend.play(sound, self._sfx_volume, spatial_pos=spatial)

    def play_block_place(
        self,
        block_id: int,
        position: Optional[NDArray] = None
    ) -> None:
        """
        Play block placement sound.

        Args:
            block_id: Block ID being placed.
            position: 3D position for spatial audio.
        """
        if not self._enabled or not self._backend.running:
            return

        material = BLOCK_MATERIALS.get(block_id, "stone")
        if material == "air":
            return

        sound = self._generator.block_place(material)
        spatial = position.astype(np.float32) if position is not None else None
        self._backend.play(sound, self._sfx_volume, spatial_pos=spatial)

    def play_mining_hit(
        self,
        block_id: int,
        position: Optional[NDArray] = None
    ) -> None:
        """
        Play mining hit sound (during mining progress).

        Args:
            block_id: Block ID being mined.
            position: 3D position for spatial audio.
        """
        if not self._enabled or not self._backend.running:
            return

        material = BLOCK_MATERIALS.get(block_id, "stone")
        if material == "air":
            return

        sound = self._generator.mining_hit(material)
        spatial = position.astype(np.float32) if position is not None else None
        self._backend.play(sound, self._sfx_volume * 0.5, spatial_pos=spatial)

    # =========================================================================
    # UI SOUNDS
    # =========================================================================

    def play_ui_click(self) -> None:
        """Play UI click sound."""
        if not self._enabled or not self._backend.running:
            return

        sound = self._generator.ui_click()
        self._backend.play(sound, self._sfx_volume * 0.5)

    def play_ui_hover(self) -> None:
        """Play UI hover sound."""
        if not self._enabled or not self._backend.running:
            return

        sound = self._generator.ui_hover()
        self._backend.play(sound, self._sfx_volume * 0.3)

    def play_ui_select(self) -> None:
        """Play UI selection sound."""
        if not self._enabled or not self._backend.running:
            return

        sound = self._generator.ui_select()
        self._backend.play(sound, self._sfx_volume * 0.5)

    # =========================================================================
    # AMBIENT SOUNDS
    # =========================================================================

    def start_ambient(self, ambient_type: str = "wind") -> None:
        """
        Start looping ambient sound.

        Args:
            ambient_type: Type of ambient ("wind", "cave", "underwater").
        """
        if not self._enabled or not self._backend.running:
            return

        # Stop current ambient if different type
        if self._current_ambient is not None:
            if self._ambient_type == ambient_type:
                return  # Already playing this type
            self._current_ambient.stop()

        if ambient_type == "wind":
            sound = self._generator.ambient_wind()
        elif ambient_type == "cave":
            sound = self._generator.ambient_cave()
        elif ambient_type == "underwater":
            sound = self._generator.ambient_underwater()
        else:
            return

        self._current_ambient = self._backend.play(
            sound, self._ambient_volume, loop=True
        )
        self._ambient_type = ambient_type

    def stop_ambient(self) -> None:
        """Stop ambient sound."""
        if self._current_ambient is not None:
            self._current_ambient.stop()
            self._current_ambient = None
            self._ambient_type = None

    def switch_ambient(self, ambient_type: str) -> None:
        """
        Switch to different ambient sound.

        Args:
            ambient_type: Type of ambient to switch to.
        """
        if self._ambient_type != ambient_type:
            self.stop_ambient()
            self.start_ambient(ambient_type)

    # =========================================================================
    # UTILITY
    # =========================================================================

    @property
    def active_sounds(self) -> int:
        """Get number of currently playing sounds."""
        return self._backend.mixer.active_sources

    def stop_all(self) -> None:
        """Stop all playing sounds."""
        self._backend.mixer.stop_all()
        self._current_ambient = None
        self._ambient_type = None

    def clear_sound_cache(self) -> None:
        """Clear generated sound cache."""
        self._generator.clear_cache()
