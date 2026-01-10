"""
Save system constants for VoxEx.

Defines save format version, file extensions, save directory paths,
and RLE compression parameters.
"""

import os
from pathlib import Path

# =============================================================================
# SAVE FORMAT
# =============================================================================

# Save format version (increment on breaking changes)
SAVE_VERSION: int = 1

# File extensions
SAVE_EXTENSION: str = ".voxsave"
CHUNK_EXTENSION: str = ".voxchunk"

# =============================================================================
# SAVE DIRECTORY
# =============================================================================


def get_save_directory() -> Path:
    """
    Get platform-appropriate save directory.

    Returns:
        Path: Directory for save files.
    """
    if os.name == 'nt':  # Windows
        base = Path(os.environ.get('APPDATA', Path.home()))
    else:  # Linux/Mac
        xdg_data = os.environ.get('XDG_DATA_HOME')
        if xdg_data:
            base = Path(xdg_data)
        else:
            base = Path.home() / '.local' / 'share'

    save_dir = base / 'VoxEx' / 'saves'
    save_dir.mkdir(parents=True, exist_ok=True)
    return save_dir


# =============================================================================
# QUICK SAVE
# =============================================================================

# Quick save slot name
QUICK_SAVE_NAME: str = "_quicksave"

# =============================================================================
# AUTOSAVE
# =============================================================================

# Autosave interval (seconds)
AUTOSAVE_INTERVAL: float = 300.0  # 5 minutes

# =============================================================================
# RLE COMPRESSION
# =============================================================================

# Marker byte for RLE runs
RLE_MARKER: int = 255

# Minimum run length to compress (below this, store literals)
MIN_RUN_LENGTH: int = 4

# Maximum run length in one sequence
MAX_RUN_LENGTH: int = 255
