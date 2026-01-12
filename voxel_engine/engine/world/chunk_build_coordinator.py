"""
Coordinates chunk mesh building across multiple worker processes.

Manages worker lifecycle, task distribution, and result collection.
GPU upload must happen on the main thread - workers only compute mesh data.
"""

import multiprocessing as mp
from multiprocessing import Process, Queue
from typing import Dict, List, Optional, Callable, Any, Tuple
import numpy as np
import time
import queue as stdlib_queue

from .chunk_build_queue import ChunkBuildQueue, ChunkBuildPriority
from .chunk_mesh_worker import (
    chunk_builder_worker, MSG_BUILD_CHUNK, MSG_SHUTDOWN, MSG_RESULT, MSG_ERROR
)

# Try to import debug logging
try:
    from ...utils.debug import debug_game
except ImportError:
    def debug_game(msg, *args, **kwargs):
        pass


def extract_block_info_for_workers() -> Dict[int, Dict]:
    """
    Extract block info from Registry for worker processes.

    Workers need block transparency and tile info for mesh building.
    This extracts only the essential data to minimize serialization overhead.

    @returns: Dict mapping block_id to block info dict.
    """
    try:
        from ..registry import Registry

        block_info = {}
        for block_id in range(Registry.block_count()):
            block = Registry.get_block(block_id)
            if block:
                # Extract only essential info for mesh building
                is_transparent = block_id in Registry._transparent_blocks

                # Get tile mappings
                tiles = {}
                rendering = block.get('rendering', {})
                tile_config = rendering.get('tiles', {})

                # Map face names to tile indices
                if isinstance(tile_config, int):
                    tiles['all'] = tile_config
                elif isinstance(tile_config, dict):
                    for face_name, tile_idx in tile_config.items():
                        tiles[face_name] = tile_idx

                block_info[block_id] = {
                    'transparent': is_transparent,
                    'tiles': tiles,
                }

        return block_info
    except Exception as e:
        print(f"[ChunkBuildCoordinator] Warning: Could not extract block info: {e}")
        return {}


class ChunkBuildCoordinator:
    """
    Manages worker processes and coordinates chunk mesh building.

    Workers run in separate processes to avoid blocking the main thread.
    The coordinator queues build tasks and collects completed mesh data.
    GPU upload happens on the main thread via callbacks.

    Usage:
        coordinator = ChunkBuildCoordinator(num_workers=2)
        coordinator.start()

        # Queue chunks to build
        coordinator.queue_chunk(0, 0, blocks, neighbors)

        # In game loop, poll for completed meshes
        for result in coordinator.poll_results():
            upload_mesh_to_gpu(result)

        # On shutdown
        coordinator.stop()

    Attributes:
        num_workers: Number of worker processes.
        block_info: Block type information for mesh building.
        chunk_size: (width, height, depth) of chunks.
        max_queued: Maximum chunks in internal queue.
    """

    def __init__(
        self,
        num_workers: int = 2,
        block_info: Optional[Dict[int, Dict]] = None,
        chunk_size: Tuple[int, int, int] = (16, 320, 16),
        num_tiles: int = 17,
        max_queued: int = 100,
        on_mesh_ready: Optional[Callable[[Dict], None]] = None
    ):
        """
        Initialize the coordinator.

        @param num_workers: Number of worker processes (1-8, default 2).
        @param block_info: Block type information for mesh building.
        @param chunk_size: (width, height, depth) of chunks.
        @param num_tiles: Number of tiles in texture atlas.
        @param max_queued: Maximum chunks in queue.
        @param on_mesh_ready: Optional callback when mesh is ready.
        """
        self.num_workers = max(1, min(8, num_workers))
        self.block_info = block_info or {}
        self.chunk_size = chunk_size
        self.num_tiles = num_tiles
        self.max_queued = max_queued
        self.on_mesh_ready = on_mesh_ready

        self._workers: List[Process] = []
        self._task_queue: Optional[Queue] = None
        self._result_queue: Optional[Queue] = None
        self._build_queue = ChunkBuildQueue(max_queued=max_queued)

        self._running = False
        self._chunks_built = 0
        self._total_build_time_ms = 0.0

        # Track what's currently being processed by workers
        self._in_flight: Dict[Tuple[int, int], float] = {}  # (cx, cz) -> send_time
        self._max_in_flight = num_workers * 2  # Small buffer per worker

    def start(self) -> None:
        """
        Start worker processes.

        Creates multiprocessing queues and spawns worker processes.
        """
        if self._running:
            return

        debug_game("[BuildCoordinator] Starting {} worker(s)...", self.num_workers)
        print(f"[BuildCoordinator] Starting {self.num_workers} worker(s)...")

        # Create queues
        self._task_queue = Queue()
        self._result_queue = Queue()

        # Start workers
        for i in range(self.num_workers):
            worker = Process(
                target=chunk_builder_worker,
                args=(
                    i,
                    self._task_queue,
                    self._result_queue,
                    self.block_info,
                    self.chunk_size,
                    self.num_tiles
                ),
                daemon=True
            )
            worker.start()
            self._workers.append(worker)

        self._running = True
        debug_game("[BuildCoordinator] Started {} workers", len(self._workers))
        print(f"[BuildCoordinator] Started {len(self._workers)} workers")

    def stop(self) -> None:
        """
        Stop all worker processes.

        Sends shutdown signals and waits for workers to finish.
        """
        if not self._running:
            return

        debug_game("[BuildCoordinator] Stopping workers...")
        print("[BuildCoordinator] Stopping workers...")

        # Send shutdown signal to all workers
        for _ in self._workers:
            try:
                self._task_queue.put({'type': MSG_SHUTDOWN})
            except Exception:
                pass

        # Wait for workers to finish (with timeout)
        for worker in self._workers:
            worker.join(timeout=2.0)
            if worker.is_alive():
                worker.terminate()

        self._workers.clear()
        self._running = False
        self._in_flight.clear()

        # Clean up queues
        self._task_queue = None
        self._result_queue = None

        debug_game("[BuildCoordinator] Workers stopped")
        print("[BuildCoordinator] Workers stopped")

    def queue_chunk(
        self,
        chunk_x: int,
        chunk_z: int,
        blocks: np.ndarray,
        neighbors: Optional[Dict[str, np.ndarray]] = None,
        priority: ChunkBuildPriority = ChunkBuildPriority.NORMAL
    ) -> bool:
        """
        Queue a chunk for mesh building.

        Sends chunk data directly to workers for immediate processing.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        @param blocks: 3D numpy array of block IDs.
        @param neighbors: Dict of neighboring chunk block arrays.
        @param priority: Build priority level.
        @returns: True if queued, False if already pending or queue full.
        """
        if not self._running:
            debug_game("[BuildCoordinator] Warning: Not running, cannot queue chunk")
            return False

        key = (chunk_x, chunk_z)

        # Skip if already in flight
        if key in self._in_flight:
            return False

        # Limit in-flight chunks
        if len(self._in_flight) >= self._max_in_flight:
            # Queue internally for later dispatch
            return self._build_queue.enqueue(chunk_x, chunk_z, priority)

        # Send directly to worker
        task = {
            'type': MSG_BUILD_CHUNK,
            'chunk_x': chunk_x,
            'chunk_z': chunk_z,
            'blocks': blocks,
            'neighbors': neighbors or {},
        }

        try:
            self._task_queue.put(task)
            self._in_flight[key] = time.time()
            return True
        except Exception as e:
            debug_game("[BuildCoordinator] Failed to queue chunk: {}", e)
            return False

    def _dispatch_queued(self) -> None:
        """Dispatch chunks from internal queue to workers."""
        while len(self._in_flight) < self._max_in_flight:
            request = self._build_queue.dequeue()
            if request is None:
                break

            # Note: This path requires blocks to be stored with request
            # For now, this is a placeholder - the primary path is queue_chunk()
            # which sends blocks directly

    def poll_results(self, max_results: int = 10) -> List[Dict]:
        """
        Poll for completed mesh builds.

        Call this every frame from the main thread to receive
        completed mesh data for GPU upload.

        @param max_results: Maximum results to process per call.
        @returns: List of result dicts with mesh data.
        """
        if not self._running or self._result_queue is None:
            return []

        results = []

        for _ in range(max_results):
            try:
                result = self._result_queue.get_nowait()
            except stdlib_queue.Empty:
                break
            except Exception:
                break

            key = (result.get('chunk_x', 0), result.get('chunk_z', 0))

            # Remove from in-flight
            if key in self._in_flight:
                del self._in_flight[key]

            if result.get('type') == MSG_RESULT:
                # Success
                self._chunks_built += 1
                self._total_build_time_ms += result.get('build_time_ms', 0)
                results.append(result)

                # Mark complete in build queue
                self._build_queue.mark_complete(*key)

                # Callback if set
                if self.on_mesh_ready:
                    try:
                        self.on_mesh_ready(result)
                    except Exception as e:
                        debug_game("[BuildCoordinator] Callback error: {}", e)

            elif result.get('type') == MSG_ERROR:
                # Error - log and continue
                error_msg = result.get('error', 'Unknown error')
                print(f"[BuildCoordinator] Error building chunk {key}: {error_msg}")
                debug_game("[BuildCoordinator] Error: {}", result.get('traceback', ''))
                self._build_queue.mark_failed(*key)

        # Dispatch more work if available
        self._dispatch_queued()

        return results

    def cancel_all(self) -> None:
        """Cancel all pending build requests."""
        self._build_queue.cancel_all_pending()
        self._in_flight.clear()

    @property
    def pending_count(self) -> int:
        """Number of chunks waiting to be built."""
        return self._build_queue.pending_count + len(self._in_flight)

    @property
    def building_count(self) -> int:
        """Number of chunks currently being built by workers."""
        return len(self._in_flight)

    @property
    def chunks_built(self) -> int:
        """Total chunks built since start."""
        return self._chunks_built

    @property
    def average_build_time_ms(self) -> float:
        """Average time to build a chunk in milliseconds."""
        if self._chunks_built == 0:
            return 0.0
        return self._total_build_time_ms / self._chunks_built

    @property
    def is_idle(self) -> bool:
        """True if no chunks are pending or being built."""
        return len(self._in_flight) == 0 and self._build_queue.is_idle

    @property
    def is_running(self) -> bool:
        """True if workers are running."""
        return self._running

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about chunk building.

        @returns: Dict with statistics.
        """
        return {
            'running': self._running,
            'num_workers': self.num_workers,
            'in_flight': len(self._in_flight),
            'pending': self._build_queue.pending_count,
            'chunks_built': self._chunks_built,
            'avg_build_time_ms': self.average_build_time_ms,
        }

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"ChunkBuildCoordinator(workers={self.num_workers}, "
            f"running={self._running}, pending={self.pending_count})"
        )
