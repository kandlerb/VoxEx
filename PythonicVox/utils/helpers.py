"""
Utility functions for PythonicVox.

This module contains helper functions and utilities used throughout the
project including coordinate conversions, math helpers, UI helpers,
and common operations.

Functions:
    draw_text_centered: Render text centered at a position.
    world_to_chunk: Convert world coordinates to chunk coordinates.
    chunk_to_world: Convert chunk coordinates to world coordinates.
    local_to_index: Convert local block coordinates to array index.
    index_to_local: Convert array index to local block coordinates.
    clamp: Clamp a value between minimum and maximum.
    lerp: Linear interpolation between two values.

Usage:
    from utils.helpers import world_to_chunk, clamp, draw_text_centered

    cx, cz = world_to_chunk(x, z)
    value = clamp(value, 0, 100)
    draw_text_centered(screen, "Hello", font, color, (100, 100))
"""

# Constants for coordinate conversions
CHUNK_SIZE = 16
CHUNK_HEIGHT = 320


# =============================================================================
# UI Helper Functions
# =============================================================================

def draw_text_centered(surface, text, font, color, center_pos):
    """
    Render text centered at the given position.

    Args:
        surface (pygame.Surface): Surface to draw on.
        text (str): Text to render.
        font (pygame.font.Font): Font to use for rendering.
        color (tuple): RGB color tuple.
        center_pos (tuple): (x, y) center position for the text.

    Returns:
        pygame.Rect: The bounding rectangle of the rendered text.
    """
    text_surface = font.render(text, True, color)
    text_rect = text_surface.get_rect(center=center_pos)
    surface.blit(text_surface, text_rect)
    return text_rect


# =============================================================================
# Coordinate Conversion Functions
# =============================================================================

def world_to_chunk(x, z):
    """
    Convert world coordinates to chunk coordinates.

    Args:
        x (int): World X position.
        z (int): World Z position.

    Returns:
        tuple: (chunk_x, chunk_z) coordinates.
    """
    return x // CHUNK_SIZE, z // CHUNK_SIZE


def chunk_to_world(cx, cz):
    """
    Convert chunk coordinates to world coordinates (chunk origin).

    Args:
        cx (int): Chunk X coordinate.
        cz (int): Chunk Z coordinate.

    Returns:
        tuple: (world_x, world_z) of chunk origin.
    """
    return cx * CHUNK_SIZE, cz * CHUNK_SIZE


def world_to_local(x, y, z):
    """
    Convert world coordinates to local chunk coordinates.

    Args:
        x (int): World X position.
        y (int): World Y position.
        z (int): World Z position.

    Returns:
        tuple: (local_x, local_y, local_z) coordinates.
    """
    return x % CHUNK_SIZE, y, z % CHUNK_SIZE


def local_to_index(lx, ly, lz):
    """
    Convert local block coordinates to array index.

    Args:
        lx (int): Local X (0-15).
        ly (int): Local Y (0-319).
        lz (int): Local Z (0-15).

    Returns:
        int: Array index for the block.
    """
    return ly * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx


def index_to_local(index):
    """
    Convert array index to local block coordinates.

    Args:
        index (int): Array index.

    Returns:
        tuple: (local_x, local_y, local_z) coordinates.
    """
    ly = index // (CHUNK_SIZE * CHUNK_SIZE)
    remainder = index % (CHUNK_SIZE * CHUNK_SIZE)
    lz = remainder // CHUNK_SIZE
    lx = remainder % CHUNK_SIZE
    return lx, ly, lz


def clamp(value, min_val, max_val):
    """
    Clamp a value between minimum and maximum.

    Args:
        value: Value to clamp.
        min_val: Minimum allowed value.
        max_val: Maximum allowed value.

    Returns:
        Clamped value.
    """
    return max(min_val, min(max_val, value))


def lerp(a, b, t):
    """
    Linear interpolation between two values.

    Args:
        a: Start value.
        b: End value.
        t (float): Interpolation factor (0-1).

    Returns:
        Interpolated value.
    """
    return a + (b - a) * t


def distance_3d(pos1, pos2):
    """
    Calculate 3D distance between two positions.

    Args:
        pos1 (tuple): First position (x, y, z).
        pos2 (tuple): Second position (x, y, z).

    Returns:
        float: Distance between positions.
    """
    dx = pos2[0] - pos1[0]
    dy = pos2[1] - pos1[1]
    dz = pos2[2] - pos1[2]
    return (dx * dx + dy * dy + dz * dz) ** 0.5


def distance_2d(pos1, pos2):
    """
    Calculate 2D distance between two positions (ignoring Y).

    Args:
        pos1 (tuple): First position (x, z) or (x, y, z).
        pos2 (tuple): Second position (x, z) or (x, y, z).

    Returns:
        float: Horizontal distance between positions.
    """
    dx = pos2[0] - pos1[0]
    dz = pos2[-1] - pos1[-1]  # Use last element for Z
    return (dx * dx + dz * dz) ** 0.5


def get_chunk_key(cx, cz):
    """
    Get string key for a chunk coordinate pair.

    Args:
        cx (int): Chunk X coordinate.
        cz (int): Chunk Z coordinate.

    Returns:
        str: Chunk key string "cx,cz".
    """
    return f"{cx},{cz}"
