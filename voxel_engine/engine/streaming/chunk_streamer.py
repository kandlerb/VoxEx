"""
Chunk streaming coordinator.

Manages dynamic chunk loading/unloading around the player as they move
through the world. Coordinates terrain generation, mesh building, and
GPU upload through priority queues.

Usage:
    from voxel_engine.engine.streaming import ChunkStreamer

    streamer = ChunkStreamer(world, generator, builder, render_distance=8)
    streamer.set_callbacks(on_ready=renderer.upload, on_unload=renderer.remove)

    # Each tick:
    streamer.update_player_position(player.x, player.z)
    streamer.process_generation_queue()
    streamer.process_mesh_queue()

    # Each frame (needs GL context):
    streamer.process_upload_queue()
"""

from typing import Dict, Tuple, Optional, Callable

from voxel_engine.engine.streaming.constants import (
    DEFAULT_RENDER_DISTANCE, PRE_GEN_PADDING,
    MAX_CHUNKS_PER_TICK, MAX_MESHES_PER_FRAME,
    MAX_CACHED_CHUNKS, EVICTION_BATCH_SIZE, MAX_BUILD_QUEUE_SIZE,
    PRIORITY_PLAYER_CHUNK, PRIORITY_ADJACENT, PRIORITY_NEAR, PRIORITY_FAR
)
from voxel_engine.engine.streaming.chunk_queue import (
    ChunkQueue, ChunkTask, ChunkTaskType
)
from voxel_engine.engine.streaming.chunk_tracker import ChunkTracker, ChunkState
from voxel_engine.engine.meshing import ChunkMesh, ChunkBuilder, MeshPool
from voxel_engine.engine.state import WorldState


class ChunkStreamer:
    """
    Manages dynamic chunk loading/unloading around the player.

    Coordinates terrain generation, mesh building, and GPU upload.
    Uses priority queues to ensure chunks closest to player load first.

    Attributes:
        render_distance: How far (in chunks) to load around player.
    """

    __slots__ = (
        '_world', '_generator', '_builder', '_mesh_pool',
        '_tracker', '_gen_queue', '_mesh_queue', '_unload_queue',
        '_render_distance', '_pending_meshes',
        '_on_chunk_ready', '_on_chunk_unload'
    )

    def __init__(
        self,
        world: WorldState,
        generator: 'TerrainGenerator',
        builder: ChunkBuilder,
        render_distance: int = DEFAULT_RENDER_DISTANCE
    ):
        """
        Initialize chunk streamer.

        Args:
            world: WorldState for chunk storage.
            generator: TerrainGenerator for terrain data.
            builder: ChunkBuilder for mesh generation.
            render_distance: Chunks to load in each direction.
        """
        self._world = world
        self._generator = generator
        self._builder = builder
        self._mesh_pool = MeshPool(max_size=100)

        self._tracker = ChunkTracker()
        self._gen_queue = ChunkQueue(max_size=MAX_BUILD_QUEUE_SIZE)
        self._mesh_queue = ChunkQueue(max_size=MAX_BUILD_QUEUE_SIZE)
        self._unload_queue = ChunkQueue(max_size=MAX_BUILD_QUEUE_SIZE)

        self._render_distance = render_distance
        self._pending_meshes: Dict[Tuple[int, int], ChunkMesh] = {}

        # Callbacks for renderer integration
        self._on_chunk_ready: Optional[Callable[[ChunkMesh], None]] = None
        self._on_chunk_unload: Optional[Callable[[int, int], None]] = None

    def set_callbacks(
        self,
        on_ready: Optional[Callable[[ChunkMesh], None]] = None,
        on_unload: Optional[Callable[[int, int], None]] = None
    ) -> None:
        """
        Set callbacks for chunk lifecycle events.

        Args:
            on_ready: Called when chunk mesh is ready for rendering.
            on_unload: Called when chunk is being unloaded (cx, cz).
        """
        self._on_chunk_ready = on_ready
        self._on_chunk_unload = on_unload

    @property
    def render_distance(self) -> int:
        """Get render distance in chunks."""
        return self._render_distance

    @render_distance.setter
    def render_distance(self, value: int) -> None:
        """Set render distance (clamped to valid range)."""
        self._render_distance = max(2, min(32, value))

    def update_player_position(self, x: float, z: float) -> None:
        """
        Update streaming based on player position.

        Call this each tick to queue new chunks and schedule unloads.

        Args:
            x: Player X position in world coordinates.
            z: Player Z position in world coordinates.
        """
        # Convert to chunk coordinates
        player_cx = int(x) // 16 if x >= 0 else (int(x) - 15) // 16
        player_cz = int(z) // 16 if z >= 0 else (int(z) - 15) // 16

        chunk_changed = self._tracker.update_player_chunk(player_cx, player_cz)

        # Always check for new chunks to load
        self._queue_chunks_around_player(player_cx, player_cz)

        # Queue unloads for distant chunks
        if chunk_changed:
            self._queue_distant_unloads(player_cx, player_cz)

        # Evict if over cache limit
        self._check_cache_limit(player_cx, player_cz)

    def _calculate_priority(self, cx: int, cz: int,
                           player_cx: int, player_cz: int) -> int:
        """
        Calculate loading priority for a chunk.

        Lower values = higher priority.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            player_cx: Player's chunk X coordinate.
            player_cz: Player's chunk Z coordinate.

        Returns:
            int: Priority value.
        """
        dx = abs(cx - player_cx)
        dz = abs(cz - player_cz)
        dist = max(dx, dz)  # Chebyshev distance

        if dist == 0:
            return PRIORITY_PLAYER_CHUNK
        elif dist == 1:
            return PRIORITY_ADJACENT + dx + dz
        elif dist <= 3:
            return PRIORITY_NEAR + dist * 10
        else:
            return PRIORITY_FAR + dist * 5

    def _queue_chunks_around_player(self, player_cx: int, player_cz: int) -> None:
        """
        Queue chunks within render distance + pre-gen padding.

        Args:
            player_cx: Player's chunk X coordinate.
            player_cz: Player's chunk Z coordinate.
        """
        load_distance = self._render_distance + PRE_GEN_PADDING

        for dx in range(-load_distance, load_distance + 1):
            for dz in range(-load_distance, load_distance + 1):
                cx = player_cx + dx
                cz = player_cz + dz

                state = self._tracker.get_state(cx, cz)

                if state == ChunkState.UNLOADED:
                    priority = self._calculate_priority(cx, cz, player_cx, player_cz)
                    self._gen_queue.push(cx, cz, ChunkTaskType.GENERATE, priority)

                elif state == ChunkState.DIRTY:
                    priority = self._calculate_priority(cx, cz, player_cx, player_cz)
                    self._mesh_queue.push(cx, cz, ChunkTaskType.MESH, priority)

    def _queue_distant_unloads(self, player_cx: int, player_cz: int) -> None:
        """
        Queue unloads for chunks beyond render distance + buffer.

        Args:
            player_cx: Player's chunk X coordinate.
            player_cz: Player's chunk Z coordinate.
        """
        unload_distance = self._render_distance + PRE_GEN_PADDING + 2
        far_chunks = self._tracker.get_chunks_beyond_distance(
            player_cx, player_cz, unload_distance
        )

        for cx, cz in far_chunks:
            # Low priority - unload when we have time
            self._unload_queue.push(cx, cz, ChunkTaskType.UNLOAD, 1000)

    def _check_cache_limit(self, player_cx: int, player_cz: int) -> None:
        """
        Evict chunks if over cache limit.

        Args:
            player_cx: Player's chunk X coordinate.
            player_cz: Player's chunk Z coordinate.
        """
        if self._tracker.loaded_count > MAX_CACHED_CHUNKS:
            # Get furthest chunks
            sorted_chunks = self._tracker.get_chunks_sorted_by_distance(
                player_cx, player_cz, reverse=True
            )

            to_evict = sorted_chunks[:EVICTION_BATCH_SIZE]
            for cx, cz in to_evict:
                self._unload_queue.push(cx, cz, ChunkTaskType.UNLOAD, 500)

    def process_generation_queue(
        self,
        max_chunks: int = MAX_CHUNKS_PER_TICK
    ) -> int:
        """
        Process terrain generation queue.

        Generates terrain data for queued chunks.

        Args:
            max_chunks: Maximum chunks to generate this call.

        Returns:
            int: Number of chunks generated.
        """
        generated = 0
        tasks = self._gen_queue.pop_batch(max_chunks)

        for task in tasks:
            cx, cz = task.cx, task.cz

            # Skip if already being processed
            state = self._tracker.get_state(cx, cz)
            if state != ChunkState.UNLOADED:
                continue

            self._tracker.set_state(cx, cz, ChunkState.GENERATING)

            # Generate terrain
            chunk_data = self._generator.generate_chunk(cx, cz)
            self._generator.calculate_initial_skylight(chunk_data)
            self._world.set_chunk(cx, cz, chunk_data)

            self._tracker.set_state(cx, cz, ChunkState.GENERATED)

            # Queue for meshing
            priority = task.priority
            self._mesh_queue.push(cx, cz, ChunkTaskType.MESH, priority)

            generated += 1

        return generated

    def process_mesh_queue(
        self,
        max_meshes: int = MAX_CHUNKS_PER_TICK
    ) -> int:
        """
        Process mesh building queue.

        Builds mesh geometry from chunk terrain data.

        Args:
            max_meshes: Maximum meshes to build this call.

        Returns:
            int: Number of meshes built.
        """
        built = 0
        tasks = self._mesh_queue.pop_batch(max_meshes)

        for task in tasks:
            cx, cz = task.cx, task.cz

            state = self._tracker.get_state(cx, cz)
            if state not in (ChunkState.GENERATED, ChunkState.DIRTY):
                continue

            self._tracker.set_state(cx, cz, ChunkState.MESHING)

            # Build mesh
            mesh = self._builder.build(cx, cz)

            self._tracker.set_state(cx, cz, ChunkState.MESHED)

            # Queue for upload
            self._pending_meshes[(cx, cz)] = mesh

            built += 1

        return built

    def process_upload_queue(
        self,
        max_uploads: int = MAX_MESHES_PER_FRAME
    ) -> int:
        """
        Process GPU upload queue.

        Call this from frame system (needs GL context).

        Args:
            max_uploads: Maximum meshes to upload this call.

        Returns:
            int: Number of meshes uploaded.
        """
        uploaded = 0
        keys_to_remove = []

        for key, mesh in self._pending_meshes.items():
            if uploaded >= max_uploads:
                break

            cx, cz = key

            if self._on_chunk_ready is not None:
                self._on_chunk_ready(mesh)

            self._tracker.set_state(cx, cz, ChunkState.UPLOADED)
            keys_to_remove.append(key)
            uploaded += 1

        for key in keys_to_remove:
            del self._pending_meshes[key]

        return uploaded

    def process_unload_queue(
        self,
        max_unloads: int = EVICTION_BATCH_SIZE
    ) -> int:
        """
        Process chunk unload queue.

        Removes chunks from memory and notifies renderer.

        Args:
            max_unloads: Maximum chunks to unload this call.

        Returns:
            int: Number of chunks unloaded.
        """
        unloaded = 0
        tasks = self._unload_queue.pop_batch(max_unloads)

        for task in tasks:
            cx, cz = task.cx, task.cz

            # Notify renderer
            if self._on_chunk_unload is not None:
                self._on_chunk_unload(cx, cz)

            # Remove from world
            self._world.remove_chunk(cx, cz)

            # Remove from pending meshes if present
            self._pending_meshes.pop((cx, cz), None)

            # Remove from tracking
            self._tracker.remove(cx, cz)

            unloaded += 1

        return unloaded

    def mark_chunk_dirty(self, cx: int, cz: int) -> None:
        """
        Mark chunk as needing re-mesh (after block change).

        Also marks adjacent chunks for AO/face culling updates.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        self._tracker.mark_dirty(cx, cz)

        # Also mark adjacent chunks (for AO/face culling updates)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                if dx != 0 or dz != 0:
                    ncx, ncz = cx + dx, cz + dz
                    if self._tracker.get_state(ncx, ncz) == ChunkState.UPLOADED:
                        self._tracker.mark_dirty(ncx, ncz)

    def get_stats(self) -> dict:
        """
        Get streaming statistics.

        Returns:
            dict: Current streaming state statistics.
        """
        return {
            'loaded_chunks': self._tracker.loaded_count,
            'total_tracked': self._tracker.total_tracked,
            'gen_queue': len(self._gen_queue),
            'mesh_queue': len(self._mesh_queue),
            'upload_pending': len(self._pending_meshes),
            'unload_queue': len(self._unload_queue),
            'render_distance': self._render_distance,
            'player_chunk': self._tracker.player_chunk,
        }

    def clear(self) -> None:
        """Clear all streaming state."""
        self._gen_queue.clear()
        self._mesh_queue.clear()
        self._pending_meshes.clear()
        self._unload_queue.clear()
        self._tracker.clear()
        self._mesh_pool.clear()

    def __repr__(self) -> str:
        """String representation."""
        stats = self.get_stats()
        return (f"ChunkStreamer(loaded={stats['loaded_chunks']}, "
                f"gen_q={stats['gen_queue']}, "
                f"mesh_q={stats['mesh_queue']}, "
                f"upload_q={stats['upload_pending']})")
