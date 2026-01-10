"""
Audio system - updates audio state each tick.

Runs after physics to play footsteps based on movement state.
Manages ambient sounds based on player location.

Usage:
    from voxel_engine.engine.systems import AudioSystem
    from voxel_engine.engine.audio import AudioManager

    audio_manager = AudioManager(seed=12345)
    audio_system = AudioSystem(audio_manager)

    loop.add_tick_system(audio_system)
"""

import numpy as np
from typing import Optional, TYPE_CHECKING

from .base import TickSystem

if TYPE_CHECKING:
    from ..state import GameState
    from ..audio import AudioManager


class AudioSystem(TickSystem):
    """
    Updates audio state each tick.

    Priority: 15 (after physics at 10, before interactions at 20)

    Responsibilities:
    - Update listener position for spatial audio
    - Play footstep sounds based on movement
    - Switch ambient sounds based on environment
    """

    __slots__ = ('_audio_manager', '_last_position', '_ambient_check_timer')

    def __init__(self, audio_manager: "AudioManager"):
        """
        Initialize audio system.

        Args:
            audio_manager: AudioManager instance for playback.
        """
        super().__init__(priority=15)
        self._audio_manager = audio_manager
        self._last_position: Optional[np.ndarray] = None
        self._ambient_check_timer = 0.0

    @property
    def audio_manager(self) -> "AudioManager":
        """Get the audio manager."""
        return self._audio_manager

    def initialize(self, state: "GameState") -> None:
        """
        Initialize audio system.

        Args:
            state: Game state for initialization.
        """
        self._audio_manager.initialize()
        self._audio_manager.start_ambient("wind")

    def tick(self, state: "GameState", dt: float) -> None:
        """
        Update audio state.

        Args:
            state: Game state to read from.
            dt: Fixed tick delta (typically 0.05s at 20 TPS).
        """
        player = state.player
        world = state.world

        # Update listener position for spatial audio
        self._audio_manager.set_listener_position(player.position)

        # Check if player is moving (horizontal displacement)
        if self._last_position is None:
            self._last_position = player.position.copy()
            is_moving = False
        else:
            # Only check XZ displacement (not vertical)
            dx = player.position[0] - self._last_position[0]
            dz = player.position[2] - self._last_position[2]
            displacement = np.sqrt(dx * dx + dz * dz)
            is_moving = displacement > 0.01  # Threshold for "moving"
            self._last_position[:] = player.position

        # Get block below player
        foot_y = int(player.position[1] - 0.1)
        block_below = world.get_block(
            int(player.position[0]),
            foot_y,
            int(player.position[2])
        )
        # Default to stone if no block (air or out of bounds)
        if block_below == 0:
            # Try one block lower
            block_below = world.get_block(
                int(player.position[0]),
                foot_y - 1,
                int(player.position[2])
            )
        if block_below == 0:
            block_below = 3  # Default to stone

        # Get movement state
        is_grounded = player.on_ground
        is_sprinting = player.is_sprinting
        is_crouching = player.is_crouching

        # Update footsteps
        self._audio_manager.update_footsteps(
            dt,
            is_moving,
            is_grounded,
            is_sprinting,
            is_crouching,
            block_below
        )

        # Periodically check ambient environment
        self._ambient_check_timer += dt
        if self._ambient_check_timer >= 2.0:  # Check every 2 seconds
            self._ambient_check_timer = 0.0
            self._update_ambient(player, world)

    def _update_ambient(self, player, world) -> None:
        """
        Update ambient sound based on environment.

        Args:
            player: Player state.
            world: World state.
        """
        # Check if underwater
        if player.in_water:
            self._audio_manager.switch_ambient("underwater")
            return

        # Check if in cave (low light level or below surface)
        light = world.get_light(
            int(player.position[0]),
            int(player.position[1]),
            int(player.position[2])
        )

        # Check if enclosed (blocks above)
        blocks_above = 0
        for y in range(int(player.position[1]) + 2, min(int(player.position[1]) + 10, 320)):
            if world.get_block(int(player.position[0]), y, int(player.position[2])) != 0:
                blocks_above += 1

        # Consider "cave" if low light and enclosed
        if light < 8 and blocks_above >= 3:
            self._audio_manager.switch_ambient("cave")
        else:
            self._audio_manager.switch_ambient("wind")

    def shutdown(self) -> None:
        """Shutdown audio system."""
        self._audio_manager.shutdown()
