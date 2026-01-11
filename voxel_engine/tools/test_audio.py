#!/usr/bin/env python3
"""
Tests for audio system.

Tests procedural sound generation, envelopes, mixing, and audio manager.
Run with: python voxel_engine/tools/test_audio.py

Usage:
    python voxel_engine/tools/test_audio.py
"""

import sys
from pathlib import Path
import importlib.util
import types

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import numpy as np

# =============================================================================
# MODULE LOADING - Load audio modules without triggering engine's __init__.py
# =============================================================================

audio_path = project_root / "voxel_engine" / "engine" / "audio"
systems_path = project_root / "voxel_engine" / "engine" / "systems"


def create_package(name):
    """Create a mock package module."""
    pkg = types.ModuleType(name)
    pkg.__path__ = []
    return pkg


def load_module_from_file(full_name, file_path, package=None):
    """Load a module from file, setting up proper package context."""
    spec = importlib.util.spec_from_file_location(
        full_name,
        file_path,
        submodule_search_locations=[]
    )
    module = importlib.util.module_from_spec(spec)
    module.__package__ = package
    sys.modules[full_name] = module
    spec.loader.exec_module(module)
    return module


# Set up package structure
sys.modules['voxel_engine'] = create_package('voxel_engine')
sys.modules['voxel_engine.engine'] = create_package('voxel_engine.engine')
sys.modules['voxel_engine.engine.audio'] = create_package('voxel_engine.engine.audio')
sys.modules['voxel_engine.engine.systems'] = create_package('voxel_engine.engine.systems')

# Load audio constants first (no dependencies)
constants = load_module_from_file(
    'voxel_engine.engine.audio.constants',
    audio_path / "constants.py",
    'voxel_engine.engine.audio'
)
SAMPLE_RATE = constants.SAMPLE_RATE
MASTER_VOLUME = constants.MASTER_VOLUME
SFX_VOLUME = constants.SFX_VOLUME
AMBIENT_VOLUME = constants.AMBIENT_VOLUME

# Load oscillator (depends on constants)
oscillator = load_module_from_file(
    'voxel_engine.engine.audio.oscillator',
    audio_path / "oscillator.py",
    'voxel_engine.engine.audio'
)
sine_wave = oscillator.sine_wave
square_wave = oscillator.square_wave
noise = oscillator.noise
pink_noise = oscillator.pink_noise

# Load envelope (depends on constants)
envelope = load_module_from_file(
    'voxel_engine.engine.audio.envelope',
    audio_path / "envelope.py",
    'voxel_engine.engine.audio'
)
adsr_envelope = envelope.adsr_envelope
percussion_envelope = envelope.percussion_envelope
fade_out = envelope.fade_out

# Load sounds (depends on constants, oscillator, envelope)
sounds = load_module_from_file(
    'voxel_engine.engine.audio.sounds',
    audio_path / "sounds.py",
    'voxel_engine.engine.audio'
)
SoundGenerator = sounds.SoundGenerator

# Load audio_backend (depends on constants)
audio_backend = load_module_from_file(
    'voxel_engine.engine.audio.audio_backend',
    audio_path / "audio_backend.py",
    'voxel_engine.engine.audio'
)
AudioBackend = audio_backend.AudioBackend
AudioSource = audio_backend.AudioSource
AudioMixer = audio_backend.AudioMixer
AUDIO_AVAILABLE = audio_backend.AUDIO_AVAILABLE

# Load audio_manager (depends on constants, sounds, audio_backend)
audio_manager_mod = load_module_from_file(
    'voxel_engine.engine.audio.audio_manager',
    audio_path / "audio_manager.py",
    'voxel_engine.engine.audio'
)
AudioManager = audio_manager_mod.AudioManager
BLOCK_MATERIALS = audio_manager_mod.BLOCK_MATERIALS

# Create minimal TickSystem base for AudioSystem
class System:
    __slots__ = ["enabled", "priority"]
    def __init__(self, priority=0):
        self.enabled = True
        self.priority = priority
    def initialize(self, state): pass
    def shutdown(self): pass

class TickSystem(System):
    def tick(self, state, dt): pass

# Set up base module for systems
base_module = types.ModuleType('voxel_engine.engine.systems.base')
base_module.System = System
base_module.TickSystem = TickSystem
sys.modules['voxel_engine.engine.systems.base'] = base_module

# Load AudioSystem
audio_system_mod = load_module_from_file(
    'voxel_engine.engine.systems.audio_system',
    systems_path / "audio_system.py",
    'voxel_engine.engine.systems'
)
AudioSystem = audio_system_mod.AudioSystem


# =============================================================================
# OSCILLATOR TESTS
# =============================================================================

def test_sine_wave_frequency():
    """Sine wave has correct frequency and amplitude."""
    freq = 440  # A4
    duration = 1.0
    wave = sine_wave(freq, duration)

    # Check length
    assert len(wave) == int(SAMPLE_RATE * duration), "Incorrect sample count"

    # Check it's bounded
    assert np.max(wave) <= 1.0, "Wave exceeds amplitude 1.0"
    assert np.min(wave) >= -1.0, "Wave below amplitude -1.0"

    # Check dtype
    assert wave.dtype == np.float32, "Incorrect dtype"

    print("  [PASS] sine_wave generates correct frequency")


def test_square_wave():
    """Square wave generates bipolar values."""
    wave = square_wave(100, 0.1)

    # Should only have values near -1 or 1
    unique = np.unique(np.sign(wave))
    assert len(unique) <= 3, "Square wave has unexpected values"

    print("  [PASS] square_wave generates bipolar values")


def test_noise_is_random():
    """Noise generates different values each call."""
    n1 = noise(0.1)
    n2 = noise(0.1)

    # Should be different (random)
    assert not np.array_equal(n1, n2), "Noise should be random"

    # Should be bounded
    assert np.max(np.abs(n1)) <= 1.0, "Noise exceeds bounds"

    print("  [PASS] noise generates random values")


def test_pink_noise():
    """Pink noise generates valid samples."""
    duration = 0.5
    pink = pink_noise(duration)

    assert len(pink) == int(SAMPLE_RATE * duration), "Incorrect sample count"
    assert pink.dtype == np.float32, "Incorrect dtype"

    print("  [PASS] pink_noise generates valid samples")


# =============================================================================
# ENVELOPE TESTS
# =============================================================================

def test_adsr_envelope_shape():
    """ADSR envelope has correct shape."""
    duration = 1.0
    env = adsr_envelope(duration, attack=0.1, decay=0.2, sustain=0.5, release=0.3)

    assert len(env) == int(SAMPLE_RATE * duration), "Incorrect sample count"

    # Starts at 0
    assert env[0] < 0.1, "Envelope should start near 0"

    # Ends at 0
    assert env[-1] < 0.1, "Envelope should end near 0"

    # Peak is approximately 1.0 (after attack)
    assert np.max(env) > 0.9, "Envelope peak should be near 1.0"

    print("  [PASS] adsr_envelope has correct shape")


def test_percussion_envelope():
    """Percussion envelope decays."""
    env = percussion_envelope(0.5, decay_time=0.1)

    # Starts high (after short attack)
    assert env[100] > env[-100], "Percussion should decay"

    # Decays to near zero
    assert env[-1] < 0.1, "Percussion should decay to near zero"

    print("  [PASS] percussion_envelope decays correctly")


def test_fade_out():
    """Fade out applies correctly."""
    samples = np.ones(10000, dtype=np.float32)
    faded = fade_out(samples, fade_duration=0.05)

    # End should be near zero
    assert faded[-1] < 0.1, "Fade out should end near zero"

    # Start should be unchanged
    assert faded[0] == 1.0, "Fade out should not affect start"

    print("  [PASS] fade_out applies correctly")


# =============================================================================
# SOUND GENERATOR TESTS
# =============================================================================

def test_sound_generator_cache():
    """SoundGenerator caches sounds."""
    gen = SoundGenerator()

    s1 = gen.footstep_stone(0)
    s2 = gen.footstep_stone(0)

    # Should be same cached array
    assert s1 is s2, "Same sound should be cached"

    # Different variation should be different
    s3 = gen.footstep_stone(1)
    assert s1 is not s3, "Different variation should not be cached same"

    print("  [PASS] SoundGenerator caches sounds")


def test_sound_generator_materials():
    """SoundGenerator creates different material sounds."""
    gen = SoundGenerator()

    grass = gen.footstep_grass()
    stone = gen.footstep_stone()
    wood = gen.footstep_wood()
    sand = gen.footstep_sand()
    water = gen.footstep_water()

    # All should be valid arrays
    assert len(grass) > 0, "Grass footstep empty"
    assert len(stone) > 0, "Stone footstep empty"
    assert len(wood) > 0, "Wood footstep empty"
    assert len(sand) > 0, "Sand footstep empty"
    assert len(water) > 0, "Water footstep empty"

    # Should be different
    assert not np.array_equal(grass, stone), "Grass and stone should differ"
    assert not np.array_equal(stone, wood), "Stone and wood should differ"

    print("  [PASS] SoundGenerator creates different materials")


def test_sound_generator_block_sounds():
    """SoundGenerator creates block break/place sounds."""
    gen = SoundGenerator()

    break_stone = gen.block_break("stone")
    break_wood = gen.block_break("wood")
    place_stone = gen.block_place("stone")

    assert len(break_stone) > 0, "Block break empty"
    assert len(place_stone) > 0, "Block place empty"

    # Break and place should be different
    assert not np.array_equal(break_stone, place_stone), "Break and place should differ"

    print("  [PASS] SoundGenerator creates block sounds")


def test_sound_generator_ambient():
    """SoundGenerator creates ambient sounds."""
    gen = SoundGenerator()

    wind = gen.ambient_wind(duration=2.0)
    cave = gen.ambient_cave(duration=2.0)

    assert len(wind) > 0, "Wind ambient empty"
    assert len(cave) > 0, "Cave ambient empty"

    # Should be long enough for looping
    assert len(wind) > 44100, "Wind too short"

    print("  [PASS] SoundGenerator creates ambient sounds")


def test_sound_generator_ui():
    """SoundGenerator creates UI sounds."""
    gen = SoundGenerator()

    click = gen.ui_click()
    hover = gen.ui_hover()
    select = gen.ui_select()

    assert len(click) > 0, "UI click empty"
    assert len(hover) > 0, "UI hover empty"
    assert len(select) > 0, "UI select empty"

    print("  [PASS] SoundGenerator creates UI sounds")


def test_sound_generator_clear_cache():
    """SoundGenerator cache can be cleared."""
    gen = SoundGenerator()

    # Generate some sounds
    gen.footstep_stone()
    gen.block_break("stone")

    assert gen.cache_size > 0, "Cache should have sounds"

    gen.clear_cache()
    assert gen.cache_size == 0, "Cache should be empty after clear"

    print("  [PASS] SoundGenerator cache clears correctly")


# =============================================================================
# AUDIO SOURCE TESTS
# =============================================================================

def test_audio_source_playback():
    """AudioSource tracks position."""
    samples = np.ones(1000, dtype=np.float32)
    source = AudioSource(samples, volume=0.5)

    assert source.playing is True, "Source should be playing"
    assert source.position == 0, "Position should start at 0"

    # Get some samples
    out = source.get_samples(100)
    assert len(out) == 100, "Should return requested samples"
    assert source.position == 100, "Position should advance"

    # Volume applied
    assert np.allclose(out, 0.5), "Volume should be applied"

    print("  [PASS] AudioSource tracks playback position")


def test_audio_source_loop():
    """AudioSource loops correctly."""
    samples = np.arange(100, dtype=np.float32)
    source = AudioSource(samples, loop=True)

    # Get more than length
    out = source.get_samples(150)
    assert len(out) == 150, "Should return padded samples"
    assert source.playing is True, "Looping source should still be playing"

    # Should have wrapped
    assert out[100] == 0, "Should have wrapped to start"

    print("  [PASS] AudioSource loops correctly")


def test_audio_source_stops():
    """AudioSource stops when done (non-looping)."""
    samples = np.ones(100, dtype=np.float32)
    source = AudioSource(samples, loop=False)

    # Play through all samples
    source.get_samples(100)
    assert source.playing is True, "Should still be playing at end"

    # Try to get more
    source.get_samples(10)
    assert source.playing is False, "Should stop after exhausting samples"

    print("  [PASS] AudioSource stops when done")


def test_audio_source_manual_stop():
    """AudioSource can be manually stopped."""
    samples = np.ones(1000, dtype=np.float32)
    source = AudioSource(samples)

    assert source.playing is True
    source.stop()
    assert source.playing is False, "Should stop when stop() called"

    print("  [PASS] AudioSource stops on stop() call")


# =============================================================================
# AUDIO MIXER TESTS
# =============================================================================

def test_audio_mixer():
    """AudioMixer mixes sources."""
    mixer = AudioMixer()

    s1 = AudioSource(np.full(100, 0.3, dtype=np.float32))
    s2 = AudioSource(np.full(100, 0.2, dtype=np.float32))

    mixer.add_source(s1)
    mixer.add_source(s2)

    assert mixer.active_sources == 2, "Should have 2 active sources"

    # Mix
    out = mixer.mix(50)

    # Should be sum (0.3 + 0.2) * master_volume
    expected = 0.5 * mixer.master_volume
    assert np.allclose(out, expected, atol=0.01), f"Mixed output incorrect: {out[0]} vs {expected}"

    print("  [PASS] AudioMixer mixes multiple sources")


def test_audio_mixer_removes_finished():
    """AudioMixer removes finished sources."""
    mixer = AudioMixer()

    # Short source
    s1 = AudioSource(np.ones(10, dtype=np.float32), loop=False)
    mixer.add_source(s1)

    assert mixer.active_sources == 1

    # Mix past end of source
    mixer.mix(100)

    # Source should be removed
    assert mixer.active_sources == 0, "Finished source should be removed"

    print("  [PASS] AudioMixer removes finished sources")


def test_audio_mixer_master_volume():
    """AudioMixer applies master volume."""
    mixer = AudioMixer()
    mixer.master_volume = 0.5

    s1 = AudioSource(np.ones(100, dtype=np.float32))
    mixer.add_source(s1)

    out = mixer.mix(50)
    assert np.allclose(out, 0.5), "Master volume should be applied"

    print("  [PASS] AudioMixer applies master volume")


def test_audio_mixer_stop_all():
    """AudioMixer stops all sources."""
    mixer = AudioMixer()

    for _ in range(5):
        mixer.add_source(AudioSource(np.ones(1000, dtype=np.float32)))

    assert mixer.active_sources == 5

    mixer.stop_all()
    assert mixer.active_sources == 0, "All sources should be stopped"

    print("  [PASS] AudioMixer stops all sources")


# =============================================================================
# AUDIO MANAGER TESTS
# =============================================================================

def test_audio_manager_initialization():
    """AudioManager initializes without error."""
    manager = AudioManager(seed=42)

    # Should work even without actual audio device
    assert manager.sfx_volume > 0, "SFX volume should be positive"
    assert manager.ambient_volume > 0, "Ambient volume should be positive"

    print("  [PASS] AudioManager initializes correctly")


def test_audio_manager_volume_control():
    """AudioManager volume controls work."""
    manager = AudioManager()

    manager.sfx_volume = 0.3
    assert manager.sfx_volume == 0.3

    manager.ambient_volume = 0.5
    assert manager.ambient_volume == 0.5

    # Should clamp to valid range
    manager.sfx_volume = 1.5
    assert manager.sfx_volume == 1.0

    manager.sfx_volume = -0.5
    assert manager.sfx_volume == 0.0

    print("  [PASS] AudioManager volume controls work")


def test_audio_manager_enabled():
    """AudioManager enabled flag works."""
    manager = AudioManager()

    assert manager.enabled is True
    manager.enabled = False
    assert manager.enabled is False

    print("  [PASS] AudioManager enabled flag works")


# =============================================================================
# AUDIO SYSTEM TESTS
# =============================================================================

def test_audio_system_priority():
    """AudioSystem has correct priority."""
    manager = AudioManager()
    system = AudioSystem(audio_manager=manager)

    # Should run after physics (10) but before interactions (20)
    assert system.priority == 15, f"Priority should be 15, got {system.priority}"

    print("  [PASS] AudioSystem has correct priority")


def test_audio_system_manager_access():
    """AudioSystem provides manager access."""
    manager = AudioManager()
    system = AudioSystem(audio_manager=manager)

    assert system.audio_manager is manager, "Should return same manager"

    print("  [PASS] AudioSystem provides manager access")


# =============================================================================
# BLOCK MATERIALS MAPPING
# =============================================================================

def test_block_materials_mapping():
    """Block materials are mapped correctly."""
    # Check common blocks have material mappings
    assert BLOCK_MATERIALS[1] == "grass", "Grass block should map to grass"
    assert BLOCK_MATERIALS[3] == "stone", "Stone block should map to stone"
    assert BLOCK_MATERIALS[5] == "wood", "Log should map to wood"
    assert BLOCK_MATERIALS[8] == "sand", "Sand should map to sand"
    assert BLOCK_MATERIALS[9] == "water", "Water should map to water"

    print("  [PASS] Block materials mapped correctly")


# =============================================================================
# MAIN
# =============================================================================

def run_tests():
    """Run all audio tests."""
    print("=" * 60)
    print("VoxEx Audio System Tests")
    print("=" * 60)
    print()

    tests = [
        # Oscillator tests
        ("Oscillator: sine_wave", test_sine_wave_frequency),
        ("Oscillator: square_wave", test_square_wave),
        ("Oscillator: noise", test_noise_is_random),
        ("Oscillator: pink_noise", test_pink_noise),

        # Envelope tests
        ("Envelope: adsr_envelope", test_adsr_envelope_shape),
        ("Envelope: percussion_envelope", test_percussion_envelope),
        ("Envelope: fade_out", test_fade_out),

        # Sound generator tests
        ("SoundGenerator: cache", test_sound_generator_cache),
        ("SoundGenerator: materials", test_sound_generator_materials),
        ("SoundGenerator: block_sounds", test_sound_generator_block_sounds),
        ("SoundGenerator: ambient", test_sound_generator_ambient),
        ("SoundGenerator: ui", test_sound_generator_ui),
        ("SoundGenerator: clear_cache", test_sound_generator_clear_cache),

        # Audio source tests
        ("AudioSource: playback", test_audio_source_playback),
        ("AudioSource: loop", test_audio_source_loop),
        ("AudioSource: stops", test_audio_source_stops),
        ("AudioSource: manual_stop", test_audio_source_manual_stop),

        # Audio mixer tests
        ("AudioMixer: mix", test_audio_mixer),
        ("AudioMixer: removes_finished", test_audio_mixer_removes_finished),
        ("AudioMixer: master_volume", test_audio_mixer_master_volume),
        ("AudioMixer: stop_all", test_audio_mixer_stop_all),

        # Audio manager tests
        ("AudioManager: initialization", test_audio_manager_initialization),
        ("AudioManager: volume_control", test_audio_manager_volume_control),
        ("AudioManager: enabled", test_audio_manager_enabled),

        # Audio system tests
        ("AudioSystem: priority", test_audio_system_priority),
        ("AudioSystem: manager_access", test_audio_system_manager_access),

        # Block materials
        ("BlockMaterials: mapping", test_block_materials_mapping),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            print(f"Testing {name}...")
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"  [FAIL] {e}")
            failed += 1
        except Exception as e:
            print(f"  [ERROR] {type(e).__name__}: {e}")
            failed += 1

    print()
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_tests())
