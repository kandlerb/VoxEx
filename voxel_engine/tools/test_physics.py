#!/usr/bin/env python3
"""
Tests for physics system.

Tests AABB collision primitives, movement calculations, and physics constants.
Does not require a window or OpenGL context.

Usage:
    python voxel_engine/tools/test_physics.py
"""

import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import numpy as np


def test_aabb_intersection():
    """AABB intersection detection works."""
    from voxel_engine.engine.physics import make_aabb, aabb_intersects

    a = make_aabb(np.array([0, 0, 0]), np.array([1, 1, 1]))
    b = make_aabb(np.array([0.5, 0.5, 0.5]), np.array([1.5, 1.5, 1.5]))
    c = make_aabb(np.array([2, 2, 2]), np.array([3, 3, 3]))

    assert aabb_intersects(a, b), "Overlapping boxes should intersect"
    assert not aabb_intersects(a, c), "Separate boxes should not intersect"
    print("  PASS: test_aabb_intersection")


def test_aabb_edge_cases():
    """AABB intersection edge cases."""
    from voxel_engine.engine.physics import make_aabb, aabb_intersects

    a = make_aabb(np.array([0, 0, 0]), np.array([1, 1, 1]))

    # Touching faces (should be considered intersecting)
    touching = make_aabb(np.array([1, 0, 0]), np.array([2, 1, 1]))
    assert aabb_intersects(a, touching), "Touching boxes should intersect"

    # Same box
    assert aabb_intersects(a, a), "Box should intersect itself"

    # Negative coordinates
    neg = make_aabb(np.array([-1, -1, -1]), np.array([0.5, 0.5, 0.5]))
    assert aabb_intersects(a, neg), "Negative coord boxes should work"

    print("  PASS: test_aabb_edge_cases")


def test_aabb_contains_point():
    """Point containment check works."""
    from voxel_engine.engine.physics import make_aabb, aabb_contains_point

    aabb = make_aabb(np.array([0, 0, 0]), np.array([1, 1, 1]))

    assert aabb_contains_point(aabb, np.array([0.5, 0.5, 0.5])), "Center point should be inside"
    assert not aabb_contains_point(aabb, np.array([1.5, 0.5, 0.5])), "Outside point should not be inside"
    assert aabb_contains_point(aabb, np.array([0.0, 0.0, 0.0])), "On boundary should be inside"
    assert aabb_contains_point(aabb, np.array([1.0, 1.0, 1.0])), "On boundary should be inside"

    print("  PASS: test_aabb_contains_point")


def test_player_aabb():
    """Player AABB created from feet position."""
    from voxel_engine.engine.physics import player_aabb, PLAYER_WIDTH, PLAYER_HEIGHT

    pos = np.array([0.0, 64.0, 0.0])
    aabb = player_aabb(pos, PLAYER_WIDTH, PLAYER_HEIGHT)

    assert aabb[1] == 64.0, "Min Y should be at feet"
    assert aabb[4] == 64.0 + PLAYER_HEIGHT, "Max Y should be at head"

    half_w = PLAYER_WIDTH / 2.0
    assert aabb[0] == -half_w, "Min X should be offset by half width"
    assert aabb[3] == half_w, "Max X should be offset by half width"
    assert aabb[2] == -half_w, "Min Z should be offset by half width"
    assert aabb[5] == half_w, "Max Z should be offset by half width"

    print("  PASS: test_player_aabb")


def test_swept_aabb():
    """Swept AABB expands correctly for movement."""
    from voxel_engine.engine.physics import make_aabb, swept_aabb

    aabb = make_aabb(np.array([0, 0, 0]), np.array([1, 1, 1]))

    # Positive velocity
    swept = swept_aabb(aabb, np.array([2.0, 0.0, 0.0]))
    assert swept[3] == 3.0, "Max X should expand by velocity"
    assert swept[0] == 0.0, "Min X should stay same for positive vel"

    # Negative velocity
    swept = swept_aabb(aabb, np.array([-2.0, 0.0, 0.0]))
    assert swept[0] == -2.0, "Min X should expand by velocity"
    assert swept[3] == 1.0, "Max X should stay same for negative vel"

    print("  PASS: test_swept_aabb")


def test_movement_direction():
    """Movement direction calculated from input and yaw."""
    from voxel_engine.engine.physics import calculate_move_direction
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.yaw = 0.0
    player.move_forward = True

    direction = calculate_move_direction(player)

    # At yaw=0, forward should be -Z
    assert direction[2] < 0, "Forward at yaw=0 should be -Z"
    assert abs(direction[0]) < 0.001, "Forward at yaw=0 should have no X component"
    assert abs(direction[1]) < 0.001, "Movement direction Y should be 0"

    # Normalize check
    length = np.linalg.norm(direction)
    assert abs(length - 1.0) < 0.001, "Direction should be normalized"

    print("  PASS: test_movement_direction")


def test_movement_direction_combined():
    """Diagonal movement is normalized."""
    from voxel_engine.engine.physics import calculate_move_direction
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.yaw = 0.0
    player.move_forward = True
    player.move_right = True

    direction = calculate_move_direction(player)

    # Should be normalized
    length = np.linalg.norm(direction)
    assert abs(length - 1.0) < 0.001, "Diagonal movement should be normalized"

    # Should have both components
    assert direction[0] > 0, "Right component should be positive"
    assert direction[2] < 0, "Forward component should be negative"

    print("  PASS: test_movement_direction_combined")


def test_movement_direction_no_input():
    """No input gives zero direction."""
    from voxel_engine.engine.physics import calculate_move_direction
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()

    direction = calculate_move_direction(player)

    assert np.allclose(direction, [0, 0, 0]), "No input should give zero direction"

    print("  PASS: test_movement_direction_no_input")


def test_movement_speed():
    """Movement speed varies by state."""
    from voxel_engine.engine.physics import (
        get_movement_speed, WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED,
        FLY_SPEED, FLY_SPRINT_SPEED
    )
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()

    # Normal walk
    assert get_movement_speed(player) == WALK_SPEED

    # Sprint
    player.sprint_pressed = True
    assert get_movement_speed(player) == SPRINT_SPEED

    # Crouch (overrides sprint)
    player.sprint_pressed = False
    player.crouch_pressed = True
    assert get_movement_speed(player) == CROUCH_SPEED

    # Flying
    player.crouch_pressed = False
    player.is_flying = True
    assert get_movement_speed(player) == FLY_SPEED

    # Flying + sprint
    player.sprint_pressed = True
    assert get_movement_speed(player) == FLY_SPRINT_SPEED

    print("  PASS: test_movement_speed")


def test_gravity_application():
    """Gravity affects vertical velocity."""
    from voxel_engine.engine.physics import apply_gravity, GRAVITY
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.velocity[1] = 0.0

    apply_gravity(player, dt=0.05, in_water=False)

    assert player.velocity[1] < 0, "Should be falling"
    assert abs(player.velocity[1] - GRAVITY * 0.05) < 0.001, "Gravity should scale with dt"

    print("  PASS: test_gravity_application")


def test_gravity_flying_immune():
    """Flying players unaffected by gravity."""
    from voxel_engine.engine.physics import apply_gravity
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.velocity[1] = 0.0
    player.is_flying = True

    apply_gravity(player, dt=0.05, in_water=False)

    assert player.velocity[1] == 0.0, "Flying player should not be affected by gravity"

    print("  PASS: test_gravity_flying_immune")


def test_gravity_water_reduction():
    """Water reduces gravity effect."""
    from voxel_engine.engine.physics import apply_gravity, GRAVITY, WATER_GRAVITY_SCALE
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.velocity[1] = 0.0

    apply_gravity(player, dt=0.05, in_water=True)

    expected = GRAVITY * WATER_GRAVITY_SCALE * 0.05
    assert abs(player.velocity[1] - expected) < 0.001, "Water should reduce gravity"

    print("  PASS: test_gravity_water_reduction")


def test_jump_on_ground():
    """Jump only works when grounded."""
    from voxel_engine.engine.physics import try_jump, JUMP_VELOCITY
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.jump_pressed = True
    player.velocity[1] = 0.0

    # Not grounded - no jump
    try_jump(player, on_ground=False)
    assert player.velocity[1] == 0.0, "Should not jump in air"

    # Grounded - jump
    try_jump(player, on_ground=True)
    assert player.velocity[1] == JUMP_VELOCITY, "Should jump when grounded"

    print("  PASS: test_jump_on_ground")


def test_jump_in_water():
    """Can swim in water."""
    from voxel_engine.engine.physics import try_jump, JUMP_VELOCITY
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.jump_pressed = True
    player.velocity[1] = 0.0

    try_jump(player, on_ground=False, in_water=True)

    expected = JUMP_VELOCITY * 0.4
    assert abs(player.velocity[1] - expected) < 0.001, "Should swim up in water"

    print("  PASS: test_jump_in_water")


def test_jump_flying_disabled():
    """Jump disabled when flying."""
    from voxel_engine.engine.physics import try_jump
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.jump_pressed = True
    player.velocity[1] = 0.0
    player.is_flying = True

    try_jump(player, on_ground=True)
    assert player.velocity[1] == 0.0, "Flying players use direct vertical control"

    print("  PASS: test_jump_flying_disabled")


def test_friction_reduces_velocity():
    """Friction reduces horizontal velocity."""
    from voxel_engine.engine.physics import apply_friction, GROUND_FRICTION
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.velocity[0] = 10.0
    player.velocity[2] = 10.0
    player.velocity[1] = 5.0  # Vertical should not be affected

    apply_friction(player, on_ground=True)

    assert abs(player.velocity[0] - 10.0 * GROUND_FRICTION) < 0.001
    assert abs(player.velocity[2] - 10.0 * GROUND_FRICTION) < 0.001
    assert player.velocity[1] == 5.0, "Vertical velocity should not be affected"

    print("  PASS: test_friction_reduces_velocity")


def test_friction_flying_immune():
    """Flying players unaffected by friction."""
    from voxel_engine.engine.physics import apply_friction
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.velocity[0] = 10.0
    player.velocity[2] = 10.0
    player.is_flying = True

    apply_friction(player, on_ground=True)

    assert player.velocity[0] == 10.0, "Flying player X vel should not change"
    assert player.velocity[2] == 10.0, "Flying player Z vel should not change"

    print("  PASS: test_friction_flying_immune")


def test_physics_system_priority():
    """PhysicsSystem runs after InputSystem."""
    from voxel_engine.engine.systems import PhysicsSystem, InputSystem

    physics = PhysicsSystem()
    # InputSystem requires a window, just check priority value
    assert physics.priority == 10, "PhysicsSystem should have priority 10"
    assert physics.priority > 0, "PhysicsSystem should run after InputSystem (priority 0)"

    print("  PASS: test_physics_system_priority")


def test_terminal_velocity():
    """Falling velocity is capped."""
    from voxel_engine.engine.physics import apply_gravity, TERMINAL_VELOCITY
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()
    player.velocity[1] = -1000.0  # Impossibly fast

    apply_gravity(player, dt=0.05)

    assert player.velocity[1] >= TERMINAL_VELOCITY, "Should not exceed terminal velocity"

    print("  PASS: test_terminal_velocity")


def test_constants_exist():
    """All expected constants are defined."""
    from voxel_engine.engine.physics import (
        GRAVITY, TERMINAL_VELOCITY,
        WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED,
        FLY_SPEED, FLY_SPRINT_SPEED,
        JUMP_VELOCITY,
        PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE_HEIGHT,
        CROUCH_HEIGHT, CROUCH_EYE_HEIGHT,
        GROUND_FRICTION, AIR_RESISTANCE, WATER_DRAG, WATER_GRAVITY_SCALE,
        STEP_HEIGHT, COLLISION_EPSILON
    )

    # Sanity checks
    assert GRAVITY < 0, "Gravity should be negative (downward)"
    assert TERMINAL_VELOCITY < 0, "Terminal velocity should be negative"
    assert WALK_SPEED > 0, "Walk speed should be positive"
    assert SPRINT_SPEED > WALK_SPEED, "Sprint should be faster than walk"
    assert CROUCH_SPEED < WALK_SPEED, "Crouch should be slower than walk"
    assert PLAYER_HEIGHT > 0, "Player height should be positive"
    assert PLAYER_WIDTH > 0, "Player width should be positive"
    assert CROUCH_HEIGHT < PLAYER_HEIGHT, "Crouch height should be less than standing"
    assert 0 < GROUND_FRICTION < 1, "Ground friction should be between 0 and 1"
    assert COLLISION_EPSILON > 0, "Epsilon should be small positive"

    print("  PASS: test_constants_exist")


def test_aabb_get_center():
    """AABB center calculation."""
    from voxel_engine.engine.physics import make_aabb, aabb_get_center

    aabb = make_aabb(np.array([0, 0, 0]), np.array([2, 4, 6]))
    center = aabb_get_center(aabb)

    assert np.allclose(center, [1, 2, 3]), "Center should be midpoint"

    print("  PASS: test_aabb_get_center")


def test_aabb_get_size():
    """AABB size calculation."""
    from voxel_engine.engine.physics import make_aabb, aabb_get_size

    aabb = make_aabb(np.array([0, 0, 0]), np.array([2, 4, 6]))
    size = aabb_get_size(aabb)

    assert np.allclose(size, [2, 4, 6]), "Size should be max - min"

    print("  PASS: test_aabb_get_size")


def run_all_tests():
    """Run all physics tests."""
    print("=" * 60)
    print("VoxEx Physics Tests")
    print("=" * 60)
    print()

    tests = [
        ("AABB Tests", [
            test_aabb_intersection,
            test_aabb_edge_cases,
            test_aabb_contains_point,
            test_player_aabb,
            test_swept_aabb,
            test_aabb_get_center,
            test_aabb_get_size,
        ]),
        ("Movement Tests", [
            test_movement_direction,
            test_movement_direction_combined,
            test_movement_direction_no_input,
            test_movement_speed,
        ]),
        ("Physics Tests", [
            test_gravity_application,
            test_gravity_flying_immune,
            test_gravity_water_reduction,
            test_jump_on_ground,
            test_jump_in_water,
            test_jump_flying_disabled,
            test_friction_reduces_velocity,
            test_friction_flying_immune,
            test_terminal_velocity,
        ]),
        ("System Tests", [
            test_physics_system_priority,
            test_constants_exist,
        ]),
    ]

    total_passed = 0
    total_failed = 0

    for group_name, group_tests in tests:
        print(f"\n{group_name}:")
        for test_func in group_tests:
            try:
                test_func()
                total_passed += 1
            except AssertionError as e:
                print(f"  FAIL: {test_func.__name__}: {e}")
                total_failed += 1
            except Exception as e:
                print(f"  ERROR: {test_func.__name__}: {e}")
                total_failed += 1

    print()
    print("=" * 60)
    print(f"Results: {total_passed} passed, {total_failed} failed")
    print("=" * 60)

    return 0 if total_failed == 0 else 1


if __name__ == '__main__':
    sys.exit(run_all_tests())
