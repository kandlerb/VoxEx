#!/usr/bin/env python3
"""
Tests for block interaction system.

Tests raycasting, block selection, mining, and placement.
Does not require a window or OpenGL context.

Usage:
    python voxel_engine/tools/test_interaction.py
"""

import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import numpy as np


def test_raycast_hit_dataclass():
    """RaycastHit stores hit information correctly."""
    from voxel_engine.engine.interaction import RaycastHit

    hit = RaycastHit(
        block_x=10, block_y=64, block_z=10,
        block_id=1,
        normal_x=0, normal_y=1, normal_z=0,
        hit_x=10.5, hit_y=65.0, hit_z=10.5,
        distance=3.0
    )

    assert hit.block_pos == (10, 64, 10), "block_pos should return tuple"
    assert hit.normal == (0, 1, 0), "normal should return tuple"
    assert hit.adjacent_pos == (10, 65, 10), "adjacent_pos adds normal"
    assert hit.hit_point == (10.5, 65.0, 10.5), "hit_point should return tuple"
    assert hit.distance == 3.0, "distance should match"

    print("  PASS: test_raycast_hit_dataclass")


def test_raycast_hit_adjacent_pos():
    """Adjacent position calculated correctly for all faces."""
    from voxel_engine.engine.interaction import RaycastHit

    # Hit from +Y (top)
    hit_top = RaycastHit(
        block_x=0, block_y=64, block_z=0, block_id=1,
        normal_x=0, normal_y=1, normal_z=0,
        hit_x=0.5, hit_y=65.0, hit_z=0.5, distance=1.0
    )
    assert hit_top.adjacent_pos == (0, 65, 0), "Top face places above"

    # Hit from -Y (bottom)
    hit_bottom = RaycastHit(
        block_x=0, block_y=64, block_z=0, block_id=1,
        normal_x=0, normal_y=-1, normal_z=0,
        hit_x=0.5, hit_y=64.0, hit_z=0.5, distance=1.0
    )
    assert hit_bottom.adjacent_pos == (0, 63, 0), "Bottom face places below"

    # Hit from +X
    hit_px = RaycastHit(
        block_x=0, block_y=64, block_z=0, block_id=1,
        normal_x=1, normal_y=0, normal_z=0,
        hit_x=1.0, hit_y=64.5, hit_z=0.5, distance=1.0
    )
    assert hit_px.adjacent_pos == (1, 64, 0), "+X face places to right"

    print("  PASS: test_raycast_hit_adjacent_pos")


def test_look_direction_forward():
    """Look direction at yaw=0, pitch=0 is -Z."""
    from voxel_engine.engine.interaction import get_look_direction

    direction = get_look_direction(yaw=0.0, pitch=0.0)

    assert abs(direction[0]) < 0.001, "No X component at yaw=0"
    assert abs(direction[1]) < 0.001, "No Y component at pitch=0"
    assert direction[2] < 0, "Forward is negative Z"
    assert abs(direction[2] + 1.0) < 0.001, "Should be exactly -1"

    print("  PASS: test_look_direction_forward")


def test_look_direction_down():
    """Look direction at positive pitch looks down (PlayerState convention)."""
    from voxel_engine.engine.interaction import get_look_direction

    # Positive pitch = looking down in PlayerState
    direction = get_look_direction(yaw=0.0, pitch=np.pi/2 - 0.01)

    assert direction[1] < -0.9, "Positive pitch should look down"

    print("  PASS: test_look_direction_down")


def test_look_direction_right():
    """Look direction at yaw=pi/2 is -X."""
    from voxel_engine.engine.interaction import get_look_direction

    direction = get_look_direction(yaw=np.pi/2, pitch=0.0)

    assert direction[0] < -0.9, "Negative X at yaw=pi/2"
    assert abs(direction[2]) < 0.1, "No Z component at yaw=pi/2"

    print("  PASS: test_look_direction_right")


def test_can_break_block_air():
    """Cannot break air."""
    from voxel_engine.engine.interaction import can_break_block

    assert can_break_block(0) is False, "Air (0) cannot be broken"

    print("  PASS: test_can_break_block_air")


def test_can_break_block_bedrock():
    """Cannot break bedrock."""
    from voxel_engine.engine.interaction import can_break_block

    assert can_break_block(7) is False, "Bedrock (7) cannot be broken"

    print("  PASS: test_can_break_block_bedrock")


def test_can_break_block_normal():
    """Can break normal blocks."""
    from voxel_engine.engine.interaction import can_break_block

    assert can_break_block(1) is True, "Grass (1) can be broken"
    assert can_break_block(2) is True, "Dirt (2) can be broken"
    assert can_break_block(3) is True, "Stone (3) can be broken"

    print("  PASS: test_can_break_block_normal")


def test_constants_defined():
    """All interaction constants are defined."""
    from voxel_engine.engine.interaction import (
        DEFAULT_REACH, MAX_REACH, MIN_REACH,
        MINE_COOLDOWN, PLACE_COOLDOWN,
        UNBREAKABLE_BLOCKS, MAX_RAY_STEPS
    )

    assert DEFAULT_REACH == 5.0, "Default reach should be 5 blocks"
    assert MAX_REACH > DEFAULT_REACH, "Max reach should be greater"
    assert MIN_REACH < DEFAULT_REACH, "Min reach should be less"
    assert MINE_COOLDOWN > 0, "Mine cooldown should be positive"
    assert PLACE_COOLDOWN > 0, "Place cooldown should be positive"
    assert 7 in UNBREAKABLE_BLOCKS, "Bedrock should be unbreakable"
    assert MAX_RAY_STEPS > 100, "Should have enough ray steps"

    print("  PASS: test_constants_defined")


def test_block_selector_properties():
    """BlockSelector has expected properties."""
    from voxel_engine.engine.interaction import BlockSelector, DEFAULT_REACH
    from voxel_engine.engine.state import WorldState

    world = WorldState(seed=1)
    selector = BlockSelector(world)

    assert selector.reach == DEFAULT_REACH, "Default reach should match constant"
    assert not selector.has_target, "Should start with no target"
    assert selector.current_hit is None, "Should start with no hit"
    assert selector.get_target_block_pos() is None, "No target pos when no hit"
    assert selector.get_placement_pos() is None, "No placement pos when no hit"

    print("  PASS: test_block_selector_properties")


def test_block_selector_reach_clamping():
    """BlockSelector clamps reach to valid range."""
    from voxel_engine.engine.interaction import BlockSelector, MIN_REACH, MAX_REACH
    from voxel_engine.engine.state import WorldState

    world = WorldState(seed=1)
    selector = BlockSelector(world, reach=0.5)  # Below minimum

    assert selector.reach == MIN_REACH, "Should clamp to min reach"

    selector.reach = 100.0  # Above maximum
    assert selector.reach == MAX_REACH, "Should clamp to max reach"

    print("  PASS: test_block_selector_reach_clamping")


def test_interaction_system_priority():
    """InteractionSystem has correct priority."""
    from voxel_engine.engine.systems import InteractionSystem

    # Create minimal selector
    from voxel_engine.engine.interaction import BlockSelector
    from voxel_engine.engine.state import WorldState

    world = WorldState(seed=1)
    selector = BlockSelector(world)
    system = InteractionSystem(selector)

    assert system.priority == 20, "Should have priority 20"
    assert system.priority > 10, "Should run after physics (priority 10)"

    print("  PASS: test_interaction_system_priority")


def test_interaction_system_has_selector():
    """InteractionSystem exposes selector."""
    from voxel_engine.engine.systems import InteractionSystem
    from voxel_engine.engine.interaction import BlockSelector
    from voxel_engine.engine.state import WorldState

    world = WorldState(seed=1)
    selector = BlockSelector(world)
    system = InteractionSystem(selector)

    assert system.selector is selector, "Should expose same selector"

    print("  PASS: test_interaction_system_has_selector")


def test_block_outline_cube_lines():
    """Block outline cube lines data is valid."""
    from voxel_engine.engine.rendering.block_outline import CUBE_LINES

    # 12 lines * 2 vertices * 3 coords = 72 floats
    assert len(CUBE_LINES) == 72, "Should have 72 floats for cube wireframe"
    assert CUBE_LINES.dtype == np.float32, "Should be float32"

    # Check all coordinates are 0 or 1 (unit cube)
    unique_vals = np.unique(CUBE_LINES)
    assert len(unique_vals) == 2, "Should only have 0 and 1"
    assert 0.0 in unique_vals, "Should have 0"
    assert 1.0 in unique_vals, "Should have 1"

    print("  PASS: test_block_outline_cube_lines")


def test_player_state_interaction_fields():
    """PlayerState has interaction input fields."""
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()

    assert hasattr(player, 'input_primary_action'), "Should have primary action field"
    assert hasattr(player, 'input_secondary_action'), "Should have secondary action field"
    assert player.input_primary_action is False, "Should default to False"
    assert player.input_secondary_action is False, "Should default to False"

    print("  PASS: test_player_state_interaction_fields")


def test_raycast_imports():
    """All raycast module exports are accessible."""
    from voxel_engine.engine.interaction import (
        RaycastHit, raycast_voxels, get_look_direction
    )

    # Just verify imports work
    assert RaycastHit is not None
    assert raycast_voxels is not None
    assert get_look_direction is not None

    print("  PASS: test_raycast_imports")


def test_block_actions_imports():
    """All block actions module exports are accessible."""
    from voxel_engine.engine.interaction import (
        can_break_block, break_block, can_place_block, place_block
    )

    # Just verify imports work
    assert can_break_block is not None
    assert break_block is not None
    assert can_place_block is not None
    assert place_block is not None

    print("  PASS: test_block_actions_imports")


def test_rendering_block_outline_import():
    """BlockOutlineRenderer is importable."""
    from voxel_engine.engine.rendering import BlockOutlineRenderer

    assert BlockOutlineRenderer is not None

    print("  PASS: test_rendering_block_outline_import")


def test_systems_interaction_import():
    """InteractionSystem is importable from systems module."""
    from voxel_engine.engine.systems import InteractionSystem

    assert InteractionSystem is not None

    print("  PASS: test_systems_interaction_import")


def run_all_tests():
    """Run all interaction tests."""
    print("=" * 60)
    print("VoxEx Block Interaction Tests")
    print("=" * 60)
    print()

    tests = [
        ("RaycastHit Tests", [
            test_raycast_hit_dataclass,
            test_raycast_hit_adjacent_pos,
        ]),
        ("Look Direction Tests", [
            test_look_direction_forward,
            test_look_direction_down,
            test_look_direction_right,
        ]),
        ("Block Break Tests", [
            test_can_break_block_air,
            test_can_break_block_bedrock,
            test_can_break_block_normal,
        ]),
        ("Constants Tests", [
            test_constants_defined,
        ]),
        ("BlockSelector Tests", [
            test_block_selector_properties,
            test_block_selector_reach_clamping,
        ]),
        ("InteractionSystem Tests", [
            test_interaction_system_priority,
            test_interaction_system_has_selector,
        ]),
        ("Rendering Tests", [
            test_block_outline_cube_lines,
        ]),
        ("PlayerState Tests", [
            test_player_state_interaction_fields,
        ]),
        ("Import Tests", [
            test_raycast_imports,
            test_block_actions_imports,
            test_rendering_block_outline_import,
            test_systems_interaction_import,
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
                import traceback
                traceback.print_exc()
                total_failed += 1

    print()
    print("=" * 60)
    print(f"Results: {total_passed} passed, {total_failed} failed")
    print("=" * 60)

    return 0 if total_failed == 0 else 1


if __name__ == '__main__':
    sys.exit(run_all_tests())
