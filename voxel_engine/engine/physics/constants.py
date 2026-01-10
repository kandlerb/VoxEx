"""
Physics constants matching voxEx.html behavior.

These constants define player movement, gravity, collision, and friction.
Values are tuned to match the original JavaScript implementation.

Usage:
    from voxel_engine.engine.physics.constants import GRAVITY, WALK_SPEED
"""

# =============================================================================
# GRAVITY
# =============================================================================

GRAVITY: float = -32.0  # units/s² (downward)
TERMINAL_VELOCITY: float = -78.4  # units/s (approx 2.45 * |gravity|)

# =============================================================================
# MOVEMENT SPEEDS (units/s)
# =============================================================================

WALK_SPEED: float = 4.317
SPRINT_SPEED: float = 5.612
CROUCH_SPEED: float = 1.31
FLY_SPEED: float = 10.0
FLY_SPRINT_SPEED: float = 20.0

# =============================================================================
# JUMP
# =============================================================================

JUMP_VELOCITY: float = 9.0  # units/s upward

# =============================================================================
# PLAYER HITBOX
# Position is at feet; hitbox extends upward
# =============================================================================

PLAYER_WIDTH: float = 0.6  # X and Z extent (centered on position)
PLAYER_HEIGHT: float = 1.8  # Standing height
PLAYER_EYE_HEIGHT: float = 1.62  # Eye height when standing
CROUCH_HEIGHT: float = 1.5  # Height when crouching
CROUCH_EYE_HEIGHT: float = 1.27  # Eye height when crouching

# =============================================================================
# FRICTION / DRAG
# Velocity multipliers applied per tick
# =============================================================================

GROUND_FRICTION: float = 0.6  # Horizontal velocity multiplier when grounded
AIR_RESISTANCE: float = 0.91  # Horizontal velocity multiplier in air
WATER_DRAG: float = 0.8  # Velocity multiplier in water
WATER_GRAVITY_SCALE: float = 0.25  # Gravity reduction in water

# =============================================================================
# COLLISION
# =============================================================================

STEP_HEIGHT: float = 0.6  # Max height player can auto-step up
COLLISION_EPSILON: float = 0.001  # Small gap to prevent floating point issues

# =============================================================================
# MOVEMENT ACCELERATION
# =============================================================================

GROUND_ACCEL: float = 20.0  # Acceleration rate on ground (units/s²)
AIR_ACCEL: float = 5.0  # Acceleration rate in air (units/s²)
FLY_LERP: float = 0.2  # Flight velocity interpolation factor
