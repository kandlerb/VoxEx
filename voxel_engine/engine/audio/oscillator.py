"""
Procedural waveform generation.

Provides basic oscillators for generating audio waveforms:
sine, square, sawtooth, and noise generators.

Usage:
    from voxel_engine.engine.audio.oscillator import sine_wave, noise

    wave = sine_wave(440.0, 1.0)  # 440 Hz for 1 second
    white = noise(0.5)  # 0.5 seconds of white noise
"""

import numpy as np
from numpy.typing import NDArray

from .constants import SAMPLE_RATE


def sine_wave(
    frequency: float,
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate sine wave.

    Args:
        frequency: Frequency in Hz.
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, samples, dtype=np.float32)
    return (amplitude * np.sin(2 * np.pi * frequency * t)).astype(np.float32)


def square_wave(
    frequency: float,
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate square wave.

    Args:
        frequency: Frequency in Hz.
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, samples, dtype=np.float32)
    wave = amplitude * np.sign(np.sin(2 * np.pi * frequency * t))
    return wave.astype(np.float32)


def sawtooth_wave(
    frequency: float,
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate sawtooth wave.

    Args:
        frequency: Frequency in Hz.
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, samples, dtype=np.float32)
    wave = amplitude * 2 * (t * frequency - np.floor(0.5 + t * frequency))
    return wave.astype(np.float32)


def triangle_wave(
    frequency: float,
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate triangle wave.

    Args:
        frequency: Frequency in Hz.
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, samples, dtype=np.float32)
    # Triangle wave from sawtooth
    saw = 2 * (t * frequency - np.floor(0.5 + t * frequency))
    wave = amplitude * 2 * np.abs(saw) - amplitude
    return wave.astype(np.float32)


def noise(
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate white noise.

    Args:
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)
    return (amplitude * np.random.uniform(-1, 1, samples)).astype(np.float32)


def pink_noise(
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate pink noise (1/f noise) using Voss-McCartney algorithm.

    Pink noise has equal energy per octave, making it sound
    more natural than white noise.

    Args:
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)

    # Simple approximation using filtered white noise
    white = np.random.uniform(-1, 1, samples)

    # Apply simple lowpass via cumulative sum + decay
    pink = np.zeros(samples, dtype=np.float32)
    b = np.array([0.99886, 0.99332, 0.96900, 0.86650, 0.55000, -0.7616])

    rows = np.zeros(len(b))
    for i in range(samples):
        white_val = white[i]
        for j in range(len(b)):
            rows[j] = b[j] * rows[j] + white_val * (1 - abs(b[j]))
        pink[i] = np.sum(rows) * 0.1

    # Normalize and scale
    max_val = np.max(np.abs(pink))
    if max_val > 0.001:
        pink = pink / max_val * amplitude

    return pink.astype(np.float32)


def brown_noise(
    duration: float,
    amplitude: float = 1.0
) -> NDArray[np.float32]:
    """
    Generate brown/red noise (1/f^2 noise).

    Brown noise has more bass than pink noise.

    Args:
        duration: Duration in seconds.
        amplitude: Peak amplitude (0.0 - 1.0).

    Returns:
        NDArray[np.float32]: Generated samples.
    """
    samples = int(SAMPLE_RATE * duration)

    # Integrate white noise
    white = np.random.uniform(-1, 1, samples)
    brown = np.cumsum(white)

    # Normalize and scale
    max_val = np.max(np.abs(brown))
    if max_val > 0.001:
        brown = brown / max_val * amplitude

    return brown.astype(np.float32)
