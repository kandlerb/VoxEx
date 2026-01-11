"""
Audio playback backend using sounddevice.

Provides low-level audio mixing and playback through sounddevice.
Falls back gracefully if sounddevice is not available.

Usage:
    from voxel_engine.engine.audio.audio_backend import AudioBackend

    backend = AudioBackend()
    if backend.start():
        source = backend.play(samples, volume=0.5)
        source.stop()
    backend.stop()
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, List
import threading

from .constants import (
    SAMPLE_RATE, CHANNELS, BUFFER_SIZE, MASTER_VOLUME
)

# Try to import sounddevice, fall back to dummy if not available
try:
    import sounddevice as sd
    AUDIO_AVAILABLE = True
except (ImportError, OSError) as e:
    AUDIO_AVAILABLE = False
    sd = None
    print(f"[Audio] Warning: sounddevice not available ({e}), audio disabled")


class AudioSource:
    """
    A playing audio source.

    Tracks playback position and handles looping.
    """

    __slots__ = ('samples', 'position', 'volume', 'loop', 'playing', 'spatial_pos')

    def __init__(
        self,
        samples: NDArray[np.float32],
        volume: float = 1.0,
        loop: bool = False,
        spatial_pos: Optional[NDArray] = None
    ):
        """
        Initialize audio source.

        Args:
            samples: Audio samples to play.
            volume: Playback volume (0.0 - 1.0).
            loop: Whether to loop playback.
            spatial_pos: 3D position for spatial audio (optional).
        """
        self.samples = samples
        self.position = 0
        self.volume = volume
        self.loop = loop
        self.playing = True
        self.spatial_pos = spatial_pos

    def get_samples(self, count: int) -> Optional[NDArray[np.float32]]:
        """
        Get next samples from source.

        Args:
            count: Number of samples to get.

        Returns:
            Samples array or None if source finished.
        """
        if not self.playing:
            return None

        remaining = len(self.samples) - self.position

        if remaining <= 0:
            if self.loop:
                self.position = 0
                remaining = len(self.samples)
            else:
                self.playing = False
                return None

        take = min(count, remaining)
        result = self.samples[self.position:self.position + take].copy()
        self.position += take

        # Pad if needed
        if len(result) < count:
            if self.loop:
                self.position = 0
                extra_needed = count - len(result)
                extra = self.samples[:extra_needed].copy()
                result = np.concatenate([result, extra])
                self.position = extra_needed
            else:
                result = np.pad(result, (0, count - len(result)))
                self.playing = False

        return result * self.volume

    def stop(self) -> None:
        """Stop playback."""
        self.playing = False


class AudioMixer:
    """
    Mixes multiple audio sources into output buffer.

    Thread-safe for concurrent source additions.
    """

    __slots__ = ('_sources', '_lock', '_master_volume', '_listener_pos')

    def __init__(self):
        """Initialize audio mixer."""
        self._sources: List[AudioSource] = []
        self._lock = threading.Lock()
        self._master_volume = MASTER_VOLUME
        self._listener_pos: Optional[NDArray] = None

    @property
    def master_volume(self) -> float:
        """Get master volume."""
        return self._master_volume

    @master_volume.setter
    def master_volume(self, value: float) -> None:
        """Set master volume (0.0 - 1.0)."""
        self._master_volume = max(0.0, min(1.0, value))

    def set_listener_position(self, pos: NDArray) -> None:
        """
        Set listener position for spatial audio.

        Args:
            pos: 3D position array.
        """
        self._listener_pos = pos.copy() if pos is not None else None

    def add_source(self, source: AudioSource) -> None:
        """
        Add audio source to mixer.

        Args:
            source: Audio source to add.
        """
        with self._lock:
            self._sources.append(source)

    def remove_finished(self) -> None:
        """Remove finished sources."""
        with self._lock:
            self._sources = [s for s in self._sources if s.playing]

    def mix(self, frames: int) -> NDArray[np.float32]:
        """
        Mix all sources into output buffer.

        Args:
            frames: Number of frames to mix.

        Returns:
            Mixed output buffer.
        """
        output = np.zeros(frames, dtype=np.float32)

        with self._lock:
            sources_to_remove = []

            for source in self._sources:
                samples = source.get_samples(frames)

                if samples is None:
                    sources_to_remove.append(source)
                    continue

                # Apply spatial attenuation
                if source.spatial_pos is not None and self._listener_pos is not None:
                    try:
                        distance = np.linalg.norm(source.spatial_pos - self._listener_pos)
                        attenuation = 1.0 / (1.0 + distance * 0.1)
                        samples = samples * attenuation
                    except (ValueError, TypeError):
                        pass  # Skip spatial if positions incompatible

                output += samples

                # If source finished during get_samples, mark for removal
                if not source.playing:
                    sources_to_remove.append(source)

            # Remove finished sources
            for source in sources_to_remove:
                if source in self._sources:
                    self._sources.remove(source)

        # Apply master volume and clamp
        output = output * self._master_volume
        return np.clip(output, -1.0, 1.0).astype(np.float32)

    def stop_all(self) -> None:
        """Stop all playing sources."""
        with self._lock:
            for source in self._sources:
                source.stop()
            self._sources.clear()

    @property
    def active_sources(self) -> int:
        """Get number of active sources."""
        with self._lock:
            return len(self._sources)


class AudioBackend:
    """
    Audio playback backend.

    Manages audio stream and provides playback API.
    Falls back to no-op if sounddevice unavailable.
    """

    __slots__ = ('_mixer', '_stream', '_running')

    def __init__(self):
        """Initialize audio backend."""
        self._mixer = AudioMixer()
        self._stream = None
        self._running = False

    @property
    def mixer(self) -> AudioMixer:
        """Get the audio mixer."""
        return self._mixer

    @property
    def available(self) -> bool:
        """Check if audio is available."""
        return AUDIO_AVAILABLE

    @property
    def running(self) -> bool:
        """Check if audio stream is running."""
        return self._running

    def start(self) -> bool:
        """
        Start audio stream.

        Returns:
            True if started successfully.
        """
        if not AUDIO_AVAILABLE:
            return False

        if self._running:
            return True

        try:
            self._stream = sd.OutputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype=np.float32,
                blocksize=BUFFER_SIZE,
                callback=self._audio_callback
            )
            self._stream.start()
            self._running = True
            return True
        except Exception as e:
            print(f"[Audio] Failed to start audio: {e}")
            return False

    def stop(self) -> None:
        """Stop audio stream."""
        self._running = False

        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass  # Ignore errors during shutdown
            self._stream = None

        self._mixer.stop_all()

    def _audio_callback(
        self,
        outdata: NDArray,
        frames: int,
        time_info,
        status
    ) -> None:
        """
        Sounddevice callback.

        Called by sounddevice to fill output buffer.

        Args:
            outdata: Output buffer to fill.
            frames: Number of frames requested.
            time_info: Timing information.
            status: Stream status.
        """
        if status:
            # Only print non-trivial status messages
            if str(status) not in ('', 'output underflow'):
                print(f"[Audio] Stream status: {status}")

        mixed = self._mixer.mix(frames)
        outdata[:, 0] = mixed

    def play(
        self,
        samples: NDArray[np.float32],
        volume: float = 1.0,
        loop: bool = False,
        spatial_pos: Optional[NDArray] = None
    ) -> AudioSource:
        """
        Play a sound.

        Args:
            samples: Audio samples to play.
            volume: Playback volume (0.0 - 1.0).
            loop: Whether to loop playback.
            spatial_pos: 3D position for spatial audio.

        Returns:
            AudioSource handle for controlling playback.
        """
        source = AudioSource(samples, volume, loop, spatial_pos)
        self._mixer.add_source(source)
        return source

    def set_master_volume(self, volume: float) -> None:
        """
        Set master volume.

        Args:
            volume: Volume level (0.0 - 1.0).
        """
        self._mixer.master_volume = volume

    def set_listener_position(self, pos: NDArray) -> None:
        """
        Set listener position for spatial audio.

        Args:
            pos: 3D position array.
        """
        self._mixer.set_listener_position(pos)
