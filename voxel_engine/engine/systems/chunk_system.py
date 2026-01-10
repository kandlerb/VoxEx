"""
Chunk streaming TickSystem.

Processes chunk generation and meshing at fixed tick rate (20 TPS).
Runs after physics but before most game logic.
"""

from voxel_engine.engine.systems.base import TickSystem
from voxel_engine.engine.state import GameState
from voxel_engine.engine.streaming.chunk_streamer import ChunkStreamer
from voxel_engine.engine.streaming.constants import MAX_CHUNKS_PER_TICK


class ChunkStreamingSystem(TickSystem):
    """
    Processes chunk streaming each tick.

    Updates player position for streaming, then processes generation
    and meshing queues. GPU uploads happen in ChunkUploadSystem.

    Priority: 50 (after physics at 10, before most game logic)

    Attributes:
        streamer: The ChunkStreamer instance being managed.
    """

    __slots__ = ('_streamer', '_chunks_per_tick')

    def __init__(
        self,
        streamer: ChunkStreamer,
        chunks_per_tick: int = MAX_CHUNKS_PER_TICK
    ):
        """
        Initialize chunk streaming system.

        Args:
            streamer: ChunkStreamer to process.
            chunks_per_tick: Max chunks to process per tick.
        """
        super().__init__(priority=50)
        self._streamer = streamer
        self._chunks_per_tick = chunks_per_tick

    def tick(self, state: GameState, dt: float) -> None:
        """
        Process chunk streaming.

        Args:
            state: Current game state.
            dt: Time delta (unused, fixed timestep).
        """
        player = state.player

        # Update player position for streaming
        self._streamer.update_player_position(
            player.position[0], player.position[2]
        )

        # Process queues (generation and meshing can happen on tick)
        self._streamer.process_generation_queue(self._chunks_per_tick)
        self._streamer.process_mesh_queue(self._chunks_per_tick)
        self._streamer.process_unload_queue(4)  # Unload a few per tick

    @property
    def streamer(self) -> ChunkStreamer:
        """Get the managed ChunkStreamer."""
        return self._streamer

    @property
    def chunks_per_tick(self) -> int:
        """Get max chunks processed per tick."""
        return self._chunks_per_tick

    @chunks_per_tick.setter
    def chunks_per_tick(self, value: int) -> None:
        """Set max chunks processed per tick."""
        self._chunks_per_tick = max(1, value)
