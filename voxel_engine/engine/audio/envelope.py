"""
Amplitude envelope generators.

Provides ADSR and percussive envelope generators for shaping
sound amplitude over time.

Usage:
    from voxel_engine.engine.audio.envelope import adsr_envelope, percussion_envelope

    env = adsr_envelope(1.0, attack=0.1, decay=0.2, sustain=0.7, release=0.3)
    perc = percussion_envelope(0.5, decay_time=0.1)
"""

import numpy as np
from numpy.typing import NDArray

from .constants import SAMPLE_RATE


def adsr_envelope(
    duration: float,
    attack: float = 0.01,
    decay: float = 0.1,
    sustain: float = 0.7,
    release: float = 0.1
) -> NDArray[np.float32]:
    """
    Generate ADSR envelope.

    Args:
        duration: Total duration in seconds.
        attack: Attack time in seconds.
        decay: Decay time in seconds.
        sustain: Sustain level (0-1).
        release: Release time in seconds.

    Returns:
        NDArray[np.float32]: Envelope array (0-1 values).
    """
    samples = int(SAMPLE_RATE * duration)
    envelope = np.zeros(samples, dtype=np.float32)

    attack_samples = int(attack * SAMPLE_RATE)
    decay_samples = int(decay * SAMPLE_RATE)
    release_samples = int(release * SAMPLE_RATE)
    sustain_samples = samples - attack_samples - decay_samples - release_samples

    if sustain_samples < 0:
        # Scale down phases to fit
        total_phases = attack + decay + release
        if total_phases > 0:
            scale = duration / total_phases
            attack_samples = int(attack * scale * SAMPLE_RATE)
            decay_samples = int(decay * scale * SAMPLE_RATE)
            release_samples = samples - attack_samples - decay_samples
            sustain_samples = 0

    idx = 0

    # Attack: 0 to 1
    if attack_samples > 0:
        end_idx = min(idx + attack_samples, samples)
        length = end_idx - idx
        if length > 0:
            envelope[idx:end_idx] = np.linspace(0, 1, length, dtype=np.float32)
        idx = end_idx

    # Decay: 1 to sustain
    if decay_samples > 0 and idx < samples:
        end_idx = min(idx + decay_samples, samples)
        length = end_idx - idx
        if length > 0:
            envelope[idx:end_idx] = np.linspace(1, sustain, length, dtype=np.float32)
        idx = end_idx

    # Sustain
    if sustain_samples > 0 and idx < samples:
        end_idx = min(idx + sustain_samples, samples)
        envelope[idx:end_idx] = sustain
        idx = end_idx

    # Release: sustain to 0
    if idx < samples:
        remaining = samples - idx
        envelope[idx:] = np.linspace(sustain, 0, remaining, dtype=np.float32)

    return envelope


def percussion_envelope(
    duration: float,
    decay_time: float = 0.1
) -> NDArray[np.float32]:
    """
    Quick attack, exponential decay envelope for percussive sounds.

    Args:
        duration: Total duration in seconds.
        decay_time: Time constant for exponential decay.

    Returns:
        NDArray[np.float32]: Envelope array (0-1 values).
    """
    samples = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, samples, dtype=np.float32)

    # Exponential decay
    envelope = np.exp(-t / decay_time)

    # Quick attack (first few samples)
    attack_samples = min(int(0.005 * SAMPLE_RATE), samples)
    if attack_samples > 1:
        envelope[:attack_samples] *= np.linspace(0, 1, attack_samples, dtype=np.float32)

    return envelope.astype(np.float32)


def linear_decay_envelope(
    duration: float
) -> NDArray[np.float32]:
    """
    Linear decay envelope from 1 to 0.

    Args:
        duration: Total duration in seconds.

    Returns:
        NDArray[np.float32]: Envelope array (0-1 values).
    """
    samples = int(SAMPLE_RATE * duration)
    return np.linspace(1, 0, samples, dtype=np.float32)


def fade_out(
    samples: NDArray[np.float32],
    fade_duration: float = 0.05
) -> NDArray[np.float32]:
    """
    Apply fade out to end of sample.

    Args:
        samples: Input samples.
        fade_duration: Fade duration in seconds.

    Returns:
        NDArray[np.float32]: Samples with fade applied.
    """
    fade_samples = int(fade_duration * SAMPLE_RATE)
    fade_samples = min(fade_samples, len(samples))

    if fade_samples > 1:
        result = samples.copy()
        result[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)
        return result

    return samples


def fade_in(
    samples: NDArray[np.float32],
    fade_duration: float = 0.05
) -> NDArray[np.float32]:
    """
    Apply fade in to start of sample.

    Args:
        samples: Input samples.
        fade_duration: Fade duration in seconds.

    Returns:
        NDArray[np.float32]: Samples with fade applied.
    """
    fade_samples = int(fade_duration * SAMPLE_RATE)
    fade_samples = min(fade_samples, len(samples))

    if fade_samples > 1:
        result = samples.copy()
        result[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
        return result

    return samples
