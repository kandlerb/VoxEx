"""
Central game state for VoxEx.

Aggregates PlayerState, WorldState, EntityState and holds
global game settings, mode flags, and timing info.

Usage:
    from voxel_engine.engine.state import GameState

    state = GameState(seed=12345)
    state.world.set_block(0, 64, 0, STONE)
    state.player.position[1] = 100
"""

from dataclasses import dataclass, field
from enum import Enum, auto

from .player_state import PlayerState
from .world_state import WorldState
from .entity_state import EntityState


class GameMode(Enum):
    """Game mode enumeration."""
    SURVIVAL = auto()
    CREATIVE = auto()
    SPECTATOR = auto()


class GamePhase(Enum):
    """Game phase/screen enumeration."""
    LOADING = auto()
    MAIN_MENU = auto()
    GENERATING = auto()
    PLAYING = auto()
    PAUSED = auto()


@dataclass
class GameState:
    """
    Top-level game state container.

    Aggregates all sub-states and provides global settings.
    Single source of truth for the entire game.
    """

    # Sub-states
    player: PlayerState = field(default_factory=PlayerState)
    world: WorldState = field(default_factory=lambda: WorldState(seed=0))
    entities: EntityState = field(default_factory=EntityState)

    # Game mode and phase
    mode: GameMode = GameMode.SURVIVAL
    phase: GamePhase = GamePhase.LOADING

    # Timing (managed by game loop)
    tick_count: int = 0
    total_time: float = 0.0  # Total elapsed time in seconds
    delta_time: float = 0.0  # Last frame delta

    # Performance metrics
    fps: float = 60.0
    tps: float = 20.0  # Ticks per second

    # Flags
    should_quit: bool = False
    debug_overlay: bool = False

    @classmethod
    def create(
        cls,
        seed: int = 0,
        mode: GameMode = GameMode.SURVIVAL,
        chunk_size: int = 16,
        chunk_height: int = 320,
        sea_level: int = 60
    ) -> "GameState":
        """
        Factory method to create a new game state.

        Args:
            seed: World seed.
            mode: Game mode.
            chunk_size: Chunk X/Z dimension.
            chunk_height: Chunk Y dimension.
            sea_level: Sea level Y coordinate.

        Returns:
            Configured GameState instance.
        """
        return cls(
            player=PlayerState(),
            world=WorldState(
                seed=seed,
                chunk_size=chunk_size,
                chunk_height=chunk_height,
                sea_level=sea_level
            ),
            entities=EntityState(),
            mode=mode,
            phase=GamePhase.LOADING
        )

    def update_timing(self, dt: float) -> None:
        """
        Update timing values (called each frame).

        Args:
            dt: Frame delta time in seconds.
        """
        self.delta_time = dt
        self.total_time += dt
        if dt > 0:
            self.fps = 1.0 / dt

    def advance_tick(self, dt: float = 0.05) -> None:
        """
        Advance game tick (called at fixed rate).

        Args:
            dt: Tick delta (default 0.05 = 20 TPS).
        """
        self.tick_count += 1
        self.world.advance_time(dt)

    def is_playing(self) -> bool:
        """Check if game is in active play state."""
        return self.phase == GamePhase.PLAYING

    def pause(self) -> None:
        """Pause the game."""
        if self.phase == GamePhase.PLAYING:
            self.phase = GamePhase.PAUSED

    def resume(self) -> None:
        """Resume from pause."""
        if self.phase == GamePhase.PAUSED:
            self.phase = GamePhase.PLAYING

    def toggle_pause(self) -> None:
        """Toggle pause state."""
        if self.phase == GamePhase.PLAYING:
            self.pause()
        elif self.phase == GamePhase.PAUSED:
            self.resume()

    def quit(self) -> None:
        """Signal game should quit."""
        self.should_quit = True

    # =========================================================================
    # PERSISTENCE HELPERS
    # =========================================================================

    @property
    def seed(self) -> int:
        """
        Get the world seed.

        Returns:
            int: World generation seed.
        """
        return self.world.seed

    @seed.setter
    def seed(self, value: int) -> None:
        """
        Set the world seed.

        Args:
            value: New world seed.
        """
        self.world.seed = value
