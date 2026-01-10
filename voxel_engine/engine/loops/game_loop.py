"""
Main game loop for VoxEx.

Orchestrates fixed-rate game ticks and variable-rate rendering.
Uses accumulator pattern for deterministic physics.

Usage:
    from voxel_engine.engine.loops import GameLoop
    from voxel_engine.engine.state import GameState

    state = GameState.create(seed=12345)
    loop = GameLoop(state)
    loop.add_tick_system(PhysicsSystem())
    loop.add_frame_system(RenderSystem())
    loop.run()
"""

from typing import List, Optional, Callable, TYPE_CHECKING

from .clock import Clock, Accumulator
from ..systems.base import TickSystem, FrameSystem

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState


class GameLoop:
    """
    Main game loop with fixed timestep physics.

    Architecture:
    - Clock tracks real time and FPS
    - Accumulator manages fixed timestep ticks
    - TickSystems run at 20 TPS (configurable)
    - FrameSystems run every frame with interpolation alpha
    """

    __slots__ = [
        "state", "clock", "accumulator", "tick_systems", "frame_systems",
        "running", "tick_rate", "target_fps", "_on_tick", "_on_frame"
    ]

    def __init__(
        self,
        state: "GameState",
        tick_rate: float = 20.0,
        target_fps: float = 60.0
    ):
        """
        Initialize game loop.

        Args:
            state: Game state to operate on.
            tick_rate: Fixed ticks per second for game logic.
            target_fps: Target frames per second for rendering.
        """
        self.state = state
        self.tick_rate = tick_rate
        self.target_fps = target_fps

        self.clock = Clock(target_fps=target_fps)
        self.accumulator = Accumulator(tick_rate=tick_rate)

        self.tick_systems: List[TickSystem] = []
        self.frame_systems: List[FrameSystem] = []

        self.running = False

        # Optional callbacks for external hooks
        self._on_tick: Optional[Callable[["GameState", float], None]] = None
        self._on_frame: Optional[Callable[["GameState", float, float], None]] = None

    # =========================================================================
    # SYSTEM MANAGEMENT
    # =========================================================================

    def add_tick_system(self, system: TickSystem) -> None:
        """
        Add a system to the tick loop.

        Args:
            system: TickSystem to add.
        """
        self.tick_systems.append(system)
        self.tick_systems.sort(key=lambda s: s.priority)

    def add_frame_system(self, system: FrameSystem) -> None:
        """
        Add a system to the frame loop.

        Args:
            system: FrameSystem to add.
        """
        self.frame_systems.append(system)
        self.frame_systems.sort(key=lambda s: s.priority)

    def remove_system(self, system) -> bool:
        """
        Remove a system from the loop.

        Args:
            system: System to remove.

        Returns:
            bool: True if removed.
        """
        if system in self.tick_systems:
            self.tick_systems.remove(system)
            return True
        if system in self.frame_systems:
            self.frame_systems.remove(system)
            return True
        return False

    # =========================================================================
    # LIFECYCLE
    # =========================================================================

    def initialize(self) -> None:
        """Initialize all systems."""
        for system in self.tick_systems:
            system.initialize(self.state)
        for system in self.frame_systems:
            system.initialize(self.state)

    def shutdown(self) -> None:
        """Shutdown all systems."""
        for system in self.tick_systems:
            system.shutdown()
        for system in self.frame_systems:
            system.shutdown()

    # =========================================================================
    # MAIN LOOP
    # =========================================================================

    def run(self) -> None:
        """
        Run the main game loop.

        Blocks until stop() is called or state.should_quit is True.
        """
        self.running = True
        self.initialize()
        self.clock.reset()
        self.accumulator.reset()

        try:
            while self.running and not self.state.should_quit:
                self._frame()
        finally:
            self.shutdown()
            self.running = False

    def stop(self) -> None:
        """Signal the loop to stop."""
        self.running = False

    def _frame(self) -> None:
        """Process one frame (called by run())."""
        # Measure frame time
        dt = self.clock.tick()

        # Update state timing
        self.state.update_timing(dt)
        self.state.fps = self.clock.get_fps()

        # Add time to accumulator
        self.accumulator.add(dt)

        # Process fixed-rate ticks
        while self.accumulator.should_tick():
            tick_dt = self.accumulator.consume_tick()
            self._tick(tick_dt)

        # Get interpolation alpha for rendering
        alpha = self.accumulator.get_alpha()

        # Process variable-rate frame systems
        self._render(dt, alpha)

        # Optional: sleep to maintain target FPS
        # self.clock.sleep_until_target()

    def _tick(self, dt: float) -> None:
        """
        Process one game tick.

        Args:
            dt: Fixed tick delta time.
        """
        # Store previous positions for interpolation
        self.state.player.store_previous_position()
        for entity in self.state.entities.iter_all():
            entity.store_previous_position()

        # Run tick systems
        for system in self.tick_systems:
            if system.enabled:
                system.tick(self.state, dt)

        # Advance game tick counter
        self.state.advance_tick(dt)

        # Optional callback
        if self._on_tick:
            self._on_tick(self.state, dt)

    def _render(self, dt: float, alpha: float) -> None:
        """
        Process one render frame.

        Args:
            dt: Variable frame delta time.
            alpha: Interpolation factor [0, 1).
        """
        for system in self.frame_systems:
            if system.enabled:
                system.frame(self.state, dt, alpha)

        # Optional callback
        if self._on_frame:
            self._on_frame(self.state, dt, alpha)

    # =========================================================================
    # CALLBACKS
    # =========================================================================

    def on_tick(self, callback: Callable[["GameState", float], None]) -> None:
        """Register callback for each tick."""
        self._on_tick = callback

    def on_frame(self, callback: Callable[["GameState", float, float], None]) -> None:
        """Register callback for each frame."""
        self._on_frame = callback

    # =========================================================================
    # STEP MODE (for testing/debugging)
    # =========================================================================

    def step_tick(self) -> None:
        """Manually advance one tick (for testing)."""
        tick_dt = 1.0 / self.tick_rate
        self._tick(tick_dt)

    def step_frame(self, dt: float = 0.016, alpha: float = 0.0) -> None:
        """Manually render one frame (for testing)."""
        self.state.update_timing(dt)
        self._render(dt, alpha)
