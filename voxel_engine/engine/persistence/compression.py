"""
Run-length encoding compression for chunk data.

Provides RLE compression and decompression for efficient storage
of voxel data, which often contains long runs of identical values.
"""

import numpy as np
from numpy.typing import NDArray
from typing import Tuple

from .constants import RLE_MARKER, MIN_RUN_LENGTH, MAX_RUN_LENGTH


def rle_encode(data: NDArray[np.uint8]) -> bytes:
    """
    Compress byte array using run-length encoding.

    Format:
    - Single byte: literal value (if != RLE_MARKER)
    - RLE_MARKER, count, value: run of 'count' copies of 'value'
    - RLE_MARKER, 0, RLE_MARKER: literal RLE_MARKER byte

    Args:
        data: Input byte array.

    Returns:
        Compressed bytes.
    """
    if len(data) == 0:
        return b''

    result = bytearray()
    i = 0
    n = len(data)

    while i < n:
        value = data[i]

        # Count consecutive identical bytes
        run_length = 1
        while (i + run_length < n and
               data[i + run_length] == value and
               run_length < MAX_RUN_LENGTH):
            run_length += 1

        if run_length >= MIN_RUN_LENGTH:
            # Encode as RLE
            result.append(RLE_MARKER)
            result.append(run_length)
            result.append(value)
            i += run_length
        elif value == RLE_MARKER:
            # Escape literal marker byte
            result.append(RLE_MARKER)
            result.append(0)
            result.append(RLE_MARKER)
            i += 1
        else:
            # Literal byte
            result.append(value)
            i += 1

    return bytes(result)


def rle_decode(data: bytes, expected_size: int) -> NDArray[np.uint8]:
    """
    Decompress RLE-encoded data.

    Args:
        data: Compressed bytes.
        expected_size: Expected output size.

    Returns:
        Decompressed byte array.

    Raises:
        ValueError: If decompressed size doesn't match expected.
    """
    result = bytearray()
    i = 0
    n = len(data)

    while i < n:
        byte = data[i]

        if byte == RLE_MARKER:
            if i + 2 >= n:
                raise ValueError("Truncated RLE sequence")

            count = data[i + 1]
            value = data[i + 2]

            if count == 0 and value == RLE_MARKER:
                # Escaped marker byte
                result.append(RLE_MARKER)
            else:
                # RLE run
                result.extend([value] * count)

            i += 3
        else:
            # Literal byte
            result.append(byte)
            i += 1

    if len(result) != expected_size:
        raise ValueError(f"Size mismatch: got {len(result)}, expected {expected_size}")

    return np.array(result, dtype=np.uint8)


def compress_chunk(
    blocks: NDArray[np.uint8],
    skylight: NDArray[np.uint8] = None,
    blocklight: NDArray[np.uint8] = None
) -> bytes:
    """
    Compress full chunk data (blocks + optional light arrays).

    Format: [compressed_blocks][compressed_skylight][compressed_blocklight]
    With 4-byte length prefixes for each section.

    Args:
        blocks: Block data array (flattened).
        skylight: Sky light data array (optional).
        blocklight: Block light data array (optional).

    Returns:
        Compressed bytes.
    """
    result = bytearray()

    # Flatten arrays if needed
    blocks_flat = blocks.flatten() if blocks.ndim > 1 else blocks

    # Compress blocks
    blocks_compressed = rle_encode(blocks_flat)
    result.extend(len(blocks_compressed).to_bytes(4, 'little'))
    result.extend(blocks_compressed)

    # Compress skylight (if present)
    if skylight is not None:
        sky_flat = skylight.flatten() if skylight.ndim > 1 else skylight
        sky_compressed = rle_encode(sky_flat)
        result.extend(len(sky_compressed).to_bytes(4, 'little'))
        result.extend(sky_compressed)
    else:
        result.extend((0).to_bytes(4, 'little'))

    # Compress blocklight (if present)
    if blocklight is not None:
        block_flat = blocklight.flatten() if blocklight.ndim > 1 else blocklight
        block_compressed = rle_encode(block_flat)
        result.extend(len(block_compressed).to_bytes(4, 'little'))
        result.extend(block_compressed)
    else:
        result.extend((0).to_bytes(4, 'little'))

    return bytes(result)


def decompress_chunk(
    data: bytes,
    chunk_size: int
) -> Tuple[NDArray[np.uint8], NDArray[np.uint8], NDArray[np.uint8]]:
    """
    Decompress chunk data.

    Args:
        data: Compressed bytes.
        chunk_size: Expected size of each array (total voxels).

    Returns:
        (blocks, skylight, blocklight) arrays.
    """
    offset = 0

    # Read blocks
    blocks_len = int.from_bytes(data[offset:offset + 4], 'little')
    offset += 4
    blocks = rle_decode(data[offset:offset + blocks_len], chunk_size)
    offset += blocks_len

    # Read skylight
    sky_len = int.from_bytes(data[offset:offset + 4], 'little')
    offset += 4
    if sky_len > 0:
        skylight = rle_decode(data[offset:offset + sky_len], chunk_size)
        offset += sky_len
    else:
        skylight = np.full(chunk_size, 15, dtype=np.uint8)  # Default full light

    # Read blocklight
    block_len = int.from_bytes(data[offset:offset + 4], 'little')
    offset += 4
    if block_len > 0:
        blocklight = rle_decode(data[offset:offset + block_len], chunk_size)
    else:
        blocklight = np.zeros(chunk_size, dtype=np.uint8)

    return blocks, skylight, blocklight
