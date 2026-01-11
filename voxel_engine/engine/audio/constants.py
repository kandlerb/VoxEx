"""
Audio system constants.

Defines sample rates, volume levels, distance attenuation,
pool sizes, and timing parameters for the audio system.

Usage:
    from voxel_engine.engine.audio.constants import (
        SAMPLE_RATE, MASTER_VOLUME, SoundCategory
    )
"""

from enum import Enum

# Sample rate and format
SAMPLE_RATE: int = 44100
CHANNELS: int = 1  # Mono for spatial audio
BUFFER_SIZE: int = 2048

# Volume levels (0.0 - 1.0)
MASTER_VOLUME: float = 0.7
SFX_VOLUME: float = 0.8
AMBIENT_VOLUME: float = 0.3

# Distance attenuation
MAX_SOUND_DISTANCE: float = 32.0  # blocks
ROLLOFF_FACTOR: float = 1.0

# Sound pool sizes
SFX_POOL_SIZE: int = 16
AMBIENT_POOL_SIZE: int = 4

# Footstep timing (seconds)
FOOTSTEP_INTERVAL_WALK: float = 0.5
FOOTSTEP_INTERVAL_SPRINT: float = 0.35
FOOTSTEP_INTERVAL_CROUCH: float = 0.7


class SoundCategory(str, Enum):
    """Sound effect categories."""
    FOOTSTEP = "footstep"
    BLOCK_BREAK = "block_break"
    BLOCK_PLACE = "block_place"
    AMBIENT = "ambient"
    UI = "ui"
