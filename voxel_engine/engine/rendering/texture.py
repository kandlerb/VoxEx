"""
Texture atlas generation and loading.

Procedurally generates a 16x16 pixel art texture atlas matching
voxEx.html style. Supports ModernGL texture creation with pixel-art
filtering (nearest neighbor).

Usage:
    from voxel_engine.engine.rendering.texture import TextureAtlas

    atlas = TextureAtlas()
    atlas.initialize(ctx)
    atlas.use(0)  # Bind to texture unit 0
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, TYPE_CHECKING

from voxel_engine.engine.meshing.constants import (
    NUM_TILES, TILE_SIZE, ATLAS_WIDTH
)

if TYPE_CHECKING:
    import moderngl


def generate_texture_atlas() -> NDArray[np.uint8]:
    """
    Generate procedural texture atlas matching voxEx.html.

    Creates a horizontal strip of 17 tiles, each 16x16 pixels.
    Uses deterministic RNG for consistent results.

    Returns:
        NDArray[np.uint8]: RGBA image as (height, width, 4) array.
    """
    atlas = np.zeros((TILE_SIZE, ATLAS_WIDTH, 4), dtype=np.uint8)

    # Tile definitions: (base_color, noise_intensity, pattern_type)
    # Colors are (R, G, B, A)
    tile_defs = [
        # 0: Grass top
        ((76, 153, 0, 255), 20, 'noise'),
        # 1: Grass side
        ((139, 90, 43, 255), 15, 'grass_side'),
        # 2: Dirt
        ((139, 90, 43, 255), 20, 'noise'),
        # 3: Stone
        ((128, 128, 128, 255), 30, 'noise'),
        # 4: Wood planks
        ((180, 140, 90, 255), 10, 'planks'),
        # 5: Log side
        ((100, 70, 40, 255), 15, 'bark'),
        # 6: Log top
        ((180, 140, 90, 255), 15, 'rings'),
        # 7: Leaves
        ((50, 120, 50, 200), 25, 'noise'),
        # 8: Bedrock
        ((40, 40, 40, 255), 20, 'noise'),
        # 9: Sand
        ((220, 200, 140, 255), 15, 'noise'),
        # 10: Water
        ((50, 100, 200, 180), 10, 'noise'),
        # 11: Torch
        ((255, 200, 100, 255), 20, 'noise'),
        # 12: Snow
        ((250, 250, 255, 255), 5, 'noise'),
        # 13: Gravel
        ((120, 110, 100, 255), 25, 'noise'),
        # 14: Longwood log
        ((80, 55, 30, 255), 15, 'bark'),
        # 15: Longwood leaves
        ((40, 100, 40, 200), 25, 'noise'),
        # 16: Glass (placeholder)
        ((200, 220, 255, 100), 5, 'noise'),
    ]

    # Deterministic RNG for consistent textures
    rng = np.random.default_rng(42)

    for tile_idx, (base_color, noise_intensity, pattern) in enumerate(tile_defs):
        x_start = tile_idx * TILE_SIZE
        x_end = x_start + TILE_SIZE

        # Fill with base color
        atlas[:, x_start:x_end, :] = base_color

        # Add noise to RGB channels
        if noise_intensity > 0:
            noise = rng.integers(
                -noise_intensity, noise_intensity + 1,
                size=(TILE_SIZE, TILE_SIZE, 3),
                dtype=np.int16
            )
            atlas[:, x_start:x_end, :3] = np.clip(
                atlas[:, x_start:x_end, :3].astype(np.int16) + noise,
                0, 255
            ).astype(np.uint8)

        # Pattern-specific modifications
        if pattern == 'grass_side':
            # Green top strip (dirt with grass on top)
            atlas[:3, x_start:x_end, 0] = 76
            atlas[:3, x_start:x_end, 1] = 153
            atlas[:3, x_start:x_end, 2] = 0

        elif pattern == 'planks':
            # Horizontal lines for wood grain
            for y in [4, 8, 12]:
                atlas[y, x_start:x_end, :3] = np.clip(
                    atlas[y, x_start:x_end, :3].astype(np.int16) - 20,
                    0, 255
                ).astype(np.uint8)

        elif pattern == 'bark':
            # Vertical streaks for tree bark
            for x in range(0, TILE_SIZE, 3):
                if x_start + x < x_end:
                    atlas[:, x_start + x, :3] = np.clip(
                        atlas[:, x_start + x, :3].astype(np.int16) - 15,
                        0, 255
                    ).astype(np.uint8)

        elif pattern == 'rings':
            # Concentric circles for log top
            center = TILE_SIZE // 2
            for y in range(TILE_SIZE):
                for x in range(TILE_SIZE):
                    dist = np.sqrt((x - center) ** 2 + (y - center) ** 2)
                    if int(dist) % 3 == 0:
                        atlas[y, x_start + x, :3] = np.clip(
                            atlas[y, x_start + x, :3].astype(np.int16) - 20,
                            0, 255
                        ).astype(np.uint8)

    return atlas


def create_texture(
    ctx: "moderngl.Context",
    image: NDArray[np.uint8]
) -> "moderngl.Texture":
    """
    Create ModernGL texture from image array.

    Args:
        ctx: ModernGL context.
        image: Image array (height, width, channels).

    Returns:
        moderngl.Texture: GPU texture object.
    """
    height, width = image.shape[:2]
    components = image.shape[2] if len(image.shape) > 2 else 1

    texture = ctx.texture((width, height), components, image.tobytes())
    texture.filter = (ctx.NEAREST, ctx.NEAREST)  # Pixel art filtering
    texture.build_mipmaps()

    return texture


class TextureAtlas:
    """
    Manages the block texture atlas.

    Generates procedural textures and uploads to GPU.
    Provides texture binding for shader use.
    """

    __slots__ = ('_texture', '_image')

    def __init__(self):
        """Initialize atlas (not yet generated)."""
        self._texture: Optional["moderngl.Texture"] = None
        self._image: Optional[NDArray[np.uint8]] = None

    def initialize(self, ctx: "moderngl.Context") -> None:
        """
        Generate and upload atlas texture.

        Args:
            ctx: ModernGL context.
        """
        self._image = generate_texture_atlas()
        self._texture = create_texture(ctx, self._image)

    @property
    def texture(self) -> Optional["moderngl.Texture"]:
        """Get the GPU texture object."""
        return self._texture

    @property
    def image(self) -> Optional[NDArray[np.uint8]]:
        """Get the CPU-side image array."""
        return self._image

    def use(self, location: int = 0) -> None:
        """
        Bind texture to texture unit.

        Args:
            location: Texture unit index (default 0).
        """
        if self._texture is not None:
            self._texture.use(location)

    def release(self) -> None:
        """Release GPU resources."""
        if self._texture is not None:
            self._texture.release()
            self._texture = None

    @property
    def is_initialized(self) -> bool:
        """Check if atlas is initialized."""
        return self._texture is not None
