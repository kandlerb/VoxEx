"""
VoxEx Audio System.

Provides procedural audio generation and playback for game sounds.
All sounds are generated at runtime without external audio files.

Features:
- Procedural sound synthesis (sine, square, noise, etc.)
- ADSR and percussive envelopes
- Material-based footstep sounds
- Block break/place sounds
- Ambient loops (wind, cave, underwater)
- Spatial audio with distance attenuation
- Sound caching for performance

Usage:
    from voxel_engine.engine.audio import AudioManager

    # Initialize
    manager = AudioManager(seed=12345)
    manager.initialize()

    # Play sounds
    manager.play_footstep(block_id=1)
    manager.play_block_break(block_id=3)
    manager.start_ambient("wind")

    # Cleanup
    manager.shutdown()

Low-level usage:
    from voxel_engine.engine.audio import (
        sine_wave, noise, adsr_envelope, SoundGenerator
    )

    # Generate waveform
    wave = sine_wave(440.0, 1.0)

    # Generate sound effect
    gen = SoundGenerator()
    footstep = gen.footstep_stone()
"""

from .constants import (
    SAMPLE_RATE,
    CHANNELS,
    BUFFER_SIZE,
    MASTER_VOLUME,
    SFX_VOLUME,
    AMBIENT_VOLUME,
    MAX_SOUND_DISTANCE,
    ROLLOFF_FACTOR,
    SFX_POOL_SIZE,
    AMBIENT_POOL_SIZE,
    FOOTSTEP_INTERVAL_WALK,
    FOOTSTEP_INTERVAL_SPRINT,
    FOOTSTEP_INTERVAL_CROUCH,
    SoundCategory,
)

from .oscillator import (
    sine_wave,
    square_wave,
    sawtooth_wave,
    triangle_wave,
    noise,
    pink_noise,
    brown_noise,
)

from .envelope import (
    adsr_envelope,
    percussion_envelope,
    linear_decay_envelope,
    fade_out,
    fade_in,
)

from .sounds import SoundGenerator

from .audio_backend import (
    AudioBackend,
    AudioSource,
    AudioMixer,
    AUDIO_AVAILABLE,
)

from .audio_manager import (
    AudioManager,
    BLOCK_MATERIALS,
)

__all__ = [
    # Constants
    "SAMPLE_RATE",
    "CHANNELS",
    "BUFFER_SIZE",
    "MASTER_VOLUME",
    "SFX_VOLUME",
    "AMBIENT_VOLUME",
    "MAX_SOUND_DISTANCE",
    "ROLLOFF_FACTOR",
    "SFX_POOL_SIZE",
    "AMBIENT_POOL_SIZE",
    "FOOTSTEP_INTERVAL_WALK",
    "FOOTSTEP_INTERVAL_SPRINT",
    "FOOTSTEP_INTERVAL_CROUCH",
    "SoundCategory",
    # Oscillators
    "sine_wave",
    "square_wave",
    "sawtooth_wave",
    "triangle_wave",
    "noise",
    "pink_noise",
    "brown_noise",
    # Envelopes
    "adsr_envelope",
    "percussion_envelope",
    "linear_decay_envelope",
    "fade_out",
    "fade_in",
    # Sound generation
    "SoundGenerator",
    # Backend
    "AudioBackend",
    "AudioSource",
    "AudioMixer",
    "AUDIO_AVAILABLE",
    # Manager
    "AudioManager",
    "BLOCK_MATERIALS",
]
