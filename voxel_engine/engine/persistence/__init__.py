"""
VoxEx persistence layer.

Provides save/load functionality including:
- RLE compression for chunk data
- Save file metadata and serialization
- Modified chunk tracking
- SaveManager for complete persistence operations

Usage:
    from voxel_engine.engine.persistence import SaveManager

    save_manager = SaveManager()
    save_manager.save(state, "My World")
    save_manager.load("My World", state)
"""

from .constants import (
    SAVE_VERSION,
    SAVE_EXTENSION,
    CHUNK_EXTENSION,
    QUICK_SAVE_NAME,
    AUTOSAVE_INTERVAL,
    RLE_MARKER,
    MIN_RUN_LENGTH,
    MAX_RUN_LENGTH,
    get_save_directory,
)
from .compression import (
    rle_encode,
    rle_decode,
    compress_chunk,
    decompress_chunk,
)
from .save_data import (
    SaveFile,
    SaveMetadata,
    PlayerSaveData,
    WorldSaveData,
)
from .chunk_tracker import ModifiedChunkTracker
from .save_manager import SaveManager

__all__ = [
    # Constants
    'SAVE_VERSION',
    'SAVE_EXTENSION',
    'CHUNK_EXTENSION',
    'QUICK_SAVE_NAME',
    'AUTOSAVE_INTERVAL',
    'RLE_MARKER',
    'MIN_RUN_LENGTH',
    'MAX_RUN_LENGTH',
    'get_save_directory',
    # Compression
    'rle_encode',
    'rle_decode',
    'compress_chunk',
    'decompress_chunk',
    # Data structures
    'SaveFile',
    'SaveMetadata',
    'PlayerSaveData',
    'WorldSaveData',
    # Tracking
    'ModifiedChunkTracker',
    # Manager
    'SaveManager',
]
