"""
VoxEx game state management.

Provides state containers for player, world, entities, and game.
State is read/written by systems but owned by the Game class.

Usage:
    from voxel_engine.engine.state import GameState, PlayerState, WorldState

    state = GameState.create(seed=12345)
    state.player.position[0] = 100
    block = state.world.get_block(0, 64, 0)
"""

from .player_state import PlayerState
from .world_state import WorldState, chunk_key, key_to_coords
from .entity_state import EntityState, Entity
from .game_state import GameState, GameMode, GamePhase

__all__ = [
    "PlayerState",
    "WorldState",
    "chunk_key",
    "key_to_coords",
    "EntityState",
    "Entity",
    "GameState",
    "GameMode",
    "GamePhase",
]
