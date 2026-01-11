"""Orthographic projection for 2D UI."""
import numpy as np
from numpy.typing import NDArray


def orthographic_matrix(width: float, height: float) -> NDArray[np.float32]:
    """
    Create orthographic projection matrix for 2D rendering.

    Origin at top-left, Y increases downward (screen coordinates).
    Maps (0, 0) to (-1, 1) and (width, height) to (1, -1) in NDC.

    The matrix is laid out for GLSL which reads matrices column-major.
    When NumPy's row-major data is sent to GLSL, GLSL interprets
    NumPy row N as GLSL column N. So we put translation in row 3.

    @param width: Screen width in pixels.
    @param height: Screen height in pixels.
    @returns: 4x4 orthographic projection matrix.
    """
    result = np.zeros((4, 4), dtype=np.float32)

    # Scale X: 0..width -> -1..1
    result[0, 0] = 2.0 / width
    # Scale Y: 0..height -> 1..-1 (flip Y for screen coords)
    result[1, 1] = -2.0 / height
    # Z stays as-is (not used in 2D)
    result[2, 2] = -1.0
    # W
    result[3, 3] = 1.0

    # Translation in row 3 (GLSL reads as column 3 due to column-major)
    result[3, 0] = -1.0
    result[3, 1] = 1.0

    return result
