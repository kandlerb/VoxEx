"""
Chunk GPU upload FrameSystem.

Uploads pending meshes to GPU each frame. Must run before WorldRenderSystem
since it needs meshes uploaded before rendering.
"""

from voxel_engine.engine.systems.base import FrameSystem
from voxel_engine.engine.state import GameState
from voxel_engine.engine.streaming.chunk_streamer import ChunkStreamer
from voxel_engine.engine.streaming.constants import MAX_MESHES_PER_FRAME


class ChunkUploadSystem(FrameSystem):
    """
    Uploads pending meshes to GPU each frame.

    Must run before WorldRenderSystem to ensure meshes are ready.
    Limits uploads per frame to avoid frame rate spikes.

    Priority: 90 (just before rendering at 100)

    Attributes:
        streamer: The ChunkStreamer instance being managed.
    """

    __slots__ = ('_streamer', '_uploads_per_frame')

    def __init__(
        self,
        streamer: ChunkStreamer,
        uploads_per_frame: int = MAX_MESHES_PER_FRAME
    ):
        """
        Initialize chunk upload system.

        Args:
            streamer: ChunkStreamer with pending meshes.
            uploads_per_frame: Max meshes to upload per frame.
        """
        super().__init__(priority=90)
        self._streamer = streamer
        self._uploads_per_frame = uploads_per_frame

    def frame(self, state: GameState, dt: float, alpha: float) -> None:
        """
        Upload pending meshes to GPU.

        Args:
            state: Current game state.
            dt: Frame time delta.
            alpha: Interpolation factor (unused).
        """
        self._streamer.process_upload_queue(self._uploads_per_frame)

    @property
    def uploads_per_frame(self) -> int:
        """Get max uploads per frame."""
        return self._uploads_per_frame

    @uploads_per_frame.setter
    def uploads_per_frame(self, value: int) -> None:
        """Set max uploads per frame."""
        self._uploads_per_frame = max(1, value)
