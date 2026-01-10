"""
Block interaction constants.

Defines reach distance, cooldowns, and block interaction rules
for mining and placing blocks.

Usage:
    from voxel_engine.engine.interaction.constants import DEFAULT_REACH, MINE_COOLDOWN
"""

# =============================================================================
# REACH DISTANCE
# =============================================================================

DEFAULT_REACH: float = 5.0  # Standard reach in blocks
MAX_REACH: float = 10.0  # Maximum allowed reach
MIN_REACH: float = 2.0  # Minimum allowed reach

# =============================================================================
# RAYCAST PRECISION
# =============================================================================

RAY_STEP_SIZE: float = 0.01  # Small steps for accuracy (not used in DDA)
MAX_RAY_STEPS: int = 1000  # Safety limit for DDA iterations

# =============================================================================
# INTERACTION COOLDOWNS (seconds)
# =============================================================================

MINE_COOLDOWN: float = 0.25  # Time between block breaks
PLACE_COOLDOWN: float = 0.15  # Time between block placements

# =============================================================================
# BLOCK INTERACTION RULES
# =============================================================================

# Block IDs that cannot be broken
UNBREAKABLE_BLOCKS: frozenset = frozenset({7})  # Bedrock

# Block IDs that are replaceable (can place blocks on them)
REPLACEABLE_BLOCKS: frozenset = frozenset({0})  # Only air is replaceable
