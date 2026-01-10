"""
Chunk streaming constants.

Defines parameters for chunk loading, unloading, and cache management.
"""

# Render distance in chunks (how far the player can see)
DEFAULT_RENDER_DISTANCE: int = 8
MIN_RENDER_DISTANCE: int = 2
MAX_RENDER_DISTANCE: int = 32

# Pre-generation extends beyond render distance
# Chunks are generated PRE_GEN_PADDING chunks ahead of render distance
PRE_GEN_PADDING: int = 2

# Build queue limits
MAX_CHUNKS_PER_TICK: int = 4  # Max chunks to generate per tick
MAX_MESHES_PER_FRAME: int = 2  # Max meshes to upload per frame
MAX_BUILD_QUEUE_SIZE: int = 256  # Max tasks in generation queue

# Cache limits
MAX_CACHED_CHUNKS: int = 1024  # Max chunks in memory
EVICTION_BATCH_SIZE: int = 16  # Chunks to evict at once when over limit

# Priority weights (lower = higher priority)
# Used to prioritize chunk loading order
PRIORITY_PLAYER_CHUNK: int = 0  # Chunk player is standing in
PRIORITY_ADJACENT: int = 10  # Directly adjacent chunks
PRIORITY_NEAR: int = 50  # Chunks within 3 chunk radius
PRIORITY_FAR: int = 100  # Distant chunks
