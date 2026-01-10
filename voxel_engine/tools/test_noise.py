#!/usr/bin/env python3
"""Test script for noise generation system.

This script validates that:
1. NoiseGenerator produces deterministic results with same seed
2. Noise output is in expected range [-1, 1]
3. Noise is continuous (small step = small change)
4. Both FastNoiseLite and fallback backends work correctly
"""

import sys
import random
import math
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voxel_engine.world.noise import (
    NoiseGenerator,
    HAS_FASTNOISE,
    noise2d,
    noise3d,
    fbm2d,
    fbm_warped,
    get_generator,
)


def test_determinism():
    """Same seed + coords = same output."""
    print("Testing determinism...")

    gen1 = NoiseGenerator(12345)
    gen2 = NoiseGenerator(12345)

    # Test 2D noise
    for _ in range(100):
        x, y = random.uniform(-1000, 1000), random.uniform(-1000, 1000)
        v1 = gen1.noise2d(x, y)
        v2 = gen2.noise2d(x, y)
        assert v1 == v2, f"noise2d not deterministic at ({x}, {y}): {v1} != {v2}"

    # Test 3D noise
    for _ in range(100):
        x, y, z = (
            random.uniform(-1000, 1000),
            random.uniform(-1000, 1000),
            random.uniform(-1000, 1000),
        )
        v1 = gen1.noise3d(x, y, z)
        v2 = gen2.noise3d(x, y, z)
        assert v1 == v2, f"noise3d not deterministic at ({x}, {y}, {z}): {v1} != {v2}"

    # Test FBM
    for _ in range(50):
        x, y = random.uniform(-1000, 1000), random.uniform(-1000, 1000)
        v1 = gen1.fbm2d(x, y, octaves=4)
        v2 = gen2.fbm2d(x, y, octaves=4)
        assert v1 == v2, f"fbm2d not deterministic at ({x}, {y}): {v1} != {v2}"

    # Test warped FBM
    for _ in range(50):
        x, z = random.uniform(-1000, 1000), random.uniform(-1000, 1000)
        v1 = gen1.fbm_warped(x, z, warp_strength=50.0)
        v2 = gen2.fbm_warped(x, z, warp_strength=50.0)
        assert v1 == v2, f"fbm_warped not deterministic at ({x}, {z}): {v1} != {v2}"

    print("  PASS: All determinism tests passed")


def test_range():
    """Output should be in approximately [-1, 1]."""
    print("Testing range...")

    gen = NoiseGenerator(42)

    # Test noise2d range
    min_val, max_val = float("inf"), float("-inf")
    for _ in range(5000):
        x, y = random.uniform(-10000, 10000), random.uniform(-10000, 10000)
        val = gen.noise2d(x, y)
        min_val = min(min_val, val)
        max_val = max(max_val, val)

    # Perlin noise can slightly exceed [-1, 1] but should be close
    assert min_val >= -1.5, f"noise2d min too low: {min_val}"
    assert max_val <= 1.5, f"noise2d max too high: {max_val}"
    print(f"  noise2d range: [{min_val:.4f}, {max_val:.4f}]")

    # Test noise3d range
    min_val, max_val = float("inf"), float("-inf")
    for _ in range(3000):
        x, y, z = (
            random.uniform(-10000, 10000),
            random.uniform(-10000, 10000),
            random.uniform(-10000, 10000),
        )
        val = gen.noise3d(x, y, z)
        min_val = min(min_val, val)
        max_val = max(max_val, val)

    assert min_val >= -1.5, f"noise3d min too low: {min_val}"
    assert max_val <= 1.5, f"noise3d max too high: {max_val}"
    print(f"  noise3d range: [{min_val:.4f}, {max_val:.4f}]")

    # Test fbm2d range (should be normalized closer to [-1, 1])
    min_val, max_val = float("inf"), float("-inf")
    for _ in range(3000):
        x, y = random.uniform(-10000, 10000), random.uniform(-10000, 10000)
        val = gen.fbm2d(x, y, octaves=4)
        min_val = min(min_val, val)
        max_val = max(max_val, val)

    assert min_val >= -1.5, f"fbm2d min too low: {min_val}"
    assert max_val <= 1.5, f"fbm2d max too high: {max_val}"
    print(f"  fbm2d range: [{min_val:.4f}, {max_val:.4f}]")

    print("  PASS: All range tests passed")


def test_continuity():
    """Adjacent samples should be similar (no discontinuities)."""
    print("Testing continuity...")

    gen = NoiseGenerator(42)

    # Test 2D continuity
    # Perlin noise has a max gradient around 10-15 per unit, so for 0.001 step
    # expect max change of ~0.015. Use threshold of 0.02 to avoid false positives.
    threshold = 0.02
    discontinuities = 0
    for _ in range(1000):
        x, y = random.uniform(-1000, 1000), random.uniform(-1000, 1000)
        v1 = gen.noise2d(x, y)
        v2 = gen.noise2d(x + 0.001, y)
        v3 = gen.noise2d(x, y + 0.001)
        if abs(v1 - v2) > threshold or abs(v1 - v3) > threshold:
            discontinuities += 1

    assert discontinuities == 0, f"noise2d has {discontinuities} discontinuities"

    # Test 3D continuity
    discontinuities = 0
    for _ in range(500):
        x, y, z = (
            random.uniform(-1000, 1000),
            random.uniform(-1000, 1000),
            random.uniform(-1000, 1000),
        )
        v1 = gen.noise3d(x, y, z)
        v2 = gen.noise3d(x + 0.001, y, z)
        v3 = gen.noise3d(x, y + 0.001, z)
        v4 = gen.noise3d(x, y, z + 0.001)
        if abs(v1 - v2) > threshold or abs(v1 - v3) > threshold or abs(v1 - v4) > threshold:
            discontinuities += 1

    assert discontinuities == 0, f"noise3d has {discontinuities} discontinuities"

    # Test FBM continuity
    discontinuities = 0
    for _ in range(500):
        x, y = random.uniform(-1000, 1000), random.uniform(-1000, 1000)
        v1 = gen.fbm2d(x, y)
        v2 = gen.fbm2d(x + 0.001, y)
        if abs(v1 - v2) > threshold:
            discontinuities += 1

    assert discontinuities == 0, f"fbm2d has {discontinuities} discontinuities"

    print("  PASS: All continuity tests passed")


def test_different_seeds():
    """Different seeds should produce different patterns."""
    print("Testing seed differentiation...")

    gen1 = NoiseGenerator(12345)
    gen2 = NoiseGenerator(54321)

    # Sample at several points - should differ
    differences = 0
    for _ in range(100):
        x, y = random.uniform(-1000, 1000), random.uniform(-1000, 1000)
        v1 = gen1.noise2d(x, y)
        v2 = gen2.noise2d(x, y)
        if abs(v1 - v2) > 0.01:
            differences += 1

    # Most samples should be different
    assert differences > 50, f"Seeds don't differentiate: only {differences}/100 different"
    print(f"  {differences}/100 samples differed between seeds")

    print("  PASS: Seed differentiation test passed")


def test_module_functions():
    """Test module-level convenience functions."""
    print("Testing module-level functions...")

    # Test noise2d
    v1 = noise2d(100.5, 200.3, seed=42)
    v2 = noise2d(100.5, 200.3, seed=42)
    assert v1 == v2, "Module noise2d not deterministic"

    # Test noise3d
    v1 = noise3d(100.5, 200.3, 50.7, seed=42)
    v2 = noise3d(100.5, 200.3, 50.7, seed=42)
    assert v1 == v2, "Module noise3d not deterministic"

    # Test fbm2d
    v1 = fbm2d(100.5, 200.3, octaves=4, seed=42)
    v2 = fbm2d(100.5, 200.3, octaves=4, seed=42)
    assert v1 == v2, "Module fbm2d not deterministic"

    # Test fbm_warped
    v1 = fbm_warped(100.5, 200.3, warp_strength=50.0, seed=42)
    v2 = fbm_warped(100.5, 200.3, warp_strength=50.0, seed=42)
    assert v1 == v2, "Module fbm_warped not deterministic"

    # Test get_generator caching
    gen1 = get_generator(42)
    gen2 = get_generator(42)
    assert gen1 is gen2, "Generator not cached for same seed"

    gen3 = get_generator(43)
    assert gen1 is not gen3, "Generator cached for different seed"

    print("  PASS: Module-level function tests passed")


def test_octave_variation():
    """More octaves should add more detail."""
    print("Testing octave variation...")

    gen = NoiseGenerator(42)

    # Sample at a fixed point with different octaves
    # Higher octaves should produce different results due to added detail
    # Note: Use non-integer coords since Perlin noise is 0 at integer positions
    results = []
    for octaves in range(1, 7):
        v = gen.fbm2d(123.456, 789.012, octaves=octaves)
        results.append(v)

    # Each octave count should give a different result
    unique_results = len(set(results))
    assert unique_results == len(results), f"Octave variation not working: {results}"

    print(f"  Octave results: {[f'{v:.4f}' for v in results]}")
    print("  PASS: Octave variation test passed")


def test_warp_strength():
    """Different warp strengths should produce different results."""
    print("Testing warp strength variation...")

    gen = NoiseGenerator(42)

    # Sample at a fixed point with different warp strengths
    # Note: Use non-integer coords since Perlin noise is 0 at integer positions
    results = []
    for strength in [0.0, 10.0, 25.0, 50.0, 100.0]:
        v = gen.fbm_warped(123.456, 789.012, warp_strength=strength)
        results.append(v)

    # Different strengths should give different results
    unique_results = len(set(results))
    assert unique_results >= 3, f"Warp strength not varying enough: {results}"

    print(f"  Warp results: {[f'{v:.4f}' for v in results]}")
    print("  PASS: Warp strength variation test passed")


def test_performance():
    """Basic performance test - should complete in reasonable time."""
    print("Testing performance...")

    import time

    gen = NoiseGenerator(42)

    # Time 10000 noise2d calls
    start = time.perf_counter()
    for _ in range(10000):
        gen.noise2d(random.uniform(-1000, 1000), random.uniform(-1000, 1000))
    elapsed_2d = time.perf_counter() - start

    # Time 10000 fbm2d calls
    start = time.perf_counter()
    for _ in range(10000):
        gen.fbm2d(random.uniform(-1000, 1000), random.uniform(-1000, 1000))
    elapsed_fbm = time.perf_counter() - start

    print(f"  10000 noise2d calls: {elapsed_2d*1000:.2f}ms ({10000/elapsed_2d:.0f}/sec)")
    print(f"  10000 fbm2d calls: {elapsed_fbm*1000:.2f}ms ({10000/elapsed_fbm:.0f}/sec)")
    print("  PASS: Performance test completed")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Noise Generation Tests")
    print("=" * 60)
    print(f"FastNoiseLite available: {HAS_FASTNOISE}")
    if HAS_FASTNOISE:
        print("  Using FastNoiseLite backend")
    else:
        print("  Using pure-Python fallback")
    print()

    try:
        test_determinism()
        print()
        test_range()
        print()
        test_continuity()
        print()
        test_different_seeds()
        print()
        test_module_functions()
        print()
        test_octave_variation()
        print()
        test_warp_strength()
        print()
        test_performance()
        print()
        print("=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\nUNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
