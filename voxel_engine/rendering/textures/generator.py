"""
Procedural texture atlas generator.
Generates all block textures at runtime using PIL/Pillow.
"""

from PIL import Image, ImageDraw
import math
from typing import Callable, Dict, Optional
from .palettes import *


class SeededRNG:
    """Deterministic random number generator for reproducible textures."""

    def __init__(self, seed: int):
        self.seed = seed

    def next(self) -> float:
        """Returns a float in [0, 1)."""
        self.seed = (self.seed * 1103515245 + 12345) & 0x7fffffff
        return self.seed / 0x7fffffff


class TextureGenerator:
    """
    Generates a texture atlas for all blocks.

    Atlas layout: horizontal strip, one tile per block texture.
    Each tile is pixels_per_tile x pixels_per_tile.
    """

    def __init__(self, pixels_per_tile: int = 16, num_tiles: int = 17):
        self.pixels_per_tile = pixels_per_tile
        self.num_tiles = num_tiles
        self.tile_size = pixels_per_tile  # 1:1 for PIL (no upscaling needed)

        # Create atlas image
        self.atlas = Image.new(
            'RGBA',
            (num_tiles * self.tile_size, self.tile_size),
            (0, 0, 0, 255)
        )
        self.draw = ImageDraw.Draw(self.atlas)

        # Track which tiles allow transparency
        self.allow_transparency: set[int] = set()

    def hex_to_rgb(self, hex_color: str) -> tuple[int, int, int]:
        """Convert hex color string to RGB tuple."""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def fill_pixel(self, tile_index: int, x: int, y: int, color: str, alpha: int = 255):
        """Fill a single pixel at logical coordinates within a tile."""
        if x < 0 or x >= self.pixels_per_tile or y < 0 or y >= self.pixels_per_tile:
            return

        px = tile_index * self.tile_size + x
        py = y
        rgb = self.hex_to_rgb(color)
        self.atlas.putpixel((px, py), (*rgb, alpha))

    def fill_tile(self, tile_index: int, color: str):
        """Fill entire tile with a solid color."""
        rgb = self.hex_to_rgb(color)
        x0 = tile_index * self.tile_size
        for y in range(self.tile_size):
            for x in range(self.tile_size):
                self.atlas.putpixel((x0 + x, y), (*rgb, 255))

    def clear_tile(self, tile_index: int):
        """Clear tile to transparent."""
        x0 = tile_index * self.tile_size
        for y in range(self.tile_size):
            for x in range(self.tile_size):
                self.atlas.putpixel((x0 + x, y), (0, 0, 0, 0))

    def generate_atlas(self) -> Image.Image:
        """Generate all textures and return the atlas."""
        import random

        ppt = self.pixels_per_tile

        # Tile indices (must match TILE constants)
        GRASS_TOP = 0
        GRASS_SIDE = 1
        DIRT = 2
        STONE = 3
        PLANK = 4
        LOG_SIDE = 5
        LEAF = 6
        BEDROCK = 7
        LOG_TOP = 8
        SAND = 9
        WATER = 10
        TORCH = 11
        SNOW = 12
        GRAVEL = 13
        LONGWOOD_LOG_SIDE = 14
        LONGWOOD_LOG_TOP = 15
        LONGWOOD_LEAF = 16

        # Mark transparent tiles
        self.allow_transparency = {LEAF, LONGWOOD_LEAF}

        # === TILE 0: Grass Top ===
        self._generate_grass_top(GRASS_TOP)

        # === TILE 1: Grass Side ===
        self._generate_grass_side(GRASS_SIDE)

        # === TILE 2: Dirt ===
        self._generate_dirt(DIRT)

        # === TILE 3: Stone ===
        self._generate_stone(STONE)

        # === TILE 4: Wood Planks ===
        self._generate_planks(PLANK)

        # === TILE 5: Log Side (Oak) ===
        self._generate_log_side(LOG_SIDE, OAK_PALETTE, SeededRNG(12345 + LOG_SIDE))

        # === TILE 6: Leaves ===
        self._generate_leaves(LEAF)

        # === TILE 7: Bedrock ===
        self._generate_bedrock(BEDROCK)

        # === TILE 8: Log Top (Oak) ===
        self._generate_log_top(LOG_TOP, OAK_PALETTE, SeededRNG(12345 + LOG_TOP))

        # === TILE 9: Sand ===
        self._generate_sand(SAND)

        # === TILE 10: Water ===
        self._generate_water(WATER)

        # === TILE 11: Torch ===
        self._generate_torch(TORCH)

        # === TILE 12: Snow ===
        self._generate_snow(SNOW)

        # === TILE 13: Gravel ===
        self._generate_gravel(GRAVEL)

        # === TILE 14: Longwood Log Side ===
        self._generate_log_side(LONGWOOD_LOG_SIDE, LONGWOOD_PALETTE, SeededRNG(12345 + LONGWOOD_LOG_SIDE))

        # === TILE 15: Longwood Log Top ===
        self._generate_log_top(LONGWOOD_LOG_TOP, LONGWOOD_PALETTE, SeededRNG(12345 + LONGWOOD_LOG_TOP))

        # === TILE 16: Longwood Leaves ===
        self._generate_longwood_leaves(LONGWOOD_LEAF)

        return self.atlas

    def _generate_grass_top(self, tile: int):
        """Generate grass top texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                base = GRASS_PALETTE["base1"] if random.random() > 0.4 else GRASS_PALETTE["base2"]
                self.fill_pixel(tile, x, y, base)

        noise_count = (ppt * ppt) // 4
        for _ in range(noise_count):
            x = random.randint(0, ppt - 2)
            y = random.randint(0, ppt - 2)
            col = GRASS_PALETTE["dark"] if random.random() > 0.5 else GRASS_PALETTE["light"]
            self.fill_pixel(tile, x, y, col)
            if random.random() > 0.5:
                if random.random() > 0.5:
                    self.fill_pixel(tile, x, y + 1, col)
                else:
                    self.fill_pixel(tile, x + 1, y, col)

    def _generate_grass_side(self, tile: int):
        """Generate grass side texture with dirt and dripping grass."""
        import random
        ppt = self.pixels_per_tile
        grass_height = ppt // 4

        # Base fill
        for y in range(ppt):
            for x in range(ppt):
                if y < grass_height:
                    col = GRASS_PALETTE["base1"] if random.random() > 0.3 else GRASS_PALETTE["base2"]
                else:
                    col = DIRT_PALETTE["shadow"]
                self.fill_pixel(tile, x, y, col)

        # Dirt clumps
        clump_count = int((ppt * ppt) * 0.4)
        for _ in range(clump_count):
            x = random.randint(0, ppt - 2)
            y = grass_height + random.randint(0, ppt - grass_height - 2)
            self.fill_pixel(tile, x, y, DIRT_PALETTE["base"])
            if random.random() > 0.4:
                self.fill_pixel(tile, x + 1, y, DIRT_PALETTE["base"])
            if random.random() > 0.4 and y + 1 < ppt:
                self.fill_pixel(tile, x, y + 1, DIRT_PALETTE["base"])

        # Highlights and grit
        for _ in range((ppt * ppt) // 10):
            x = random.randint(0, ppt - 1)
            y = grass_height + random.randint(0, ppt - grass_height - 1)
            self.fill_pixel(tile, x, y, DIRT_PALETTE["highlight"])

        for _ in range((ppt * ppt) // 8):
            x = random.randint(0, ppt - 1)
            y = grass_height + random.randint(0, ppt - grass_height - 1)
            self.fill_pixel(tile, x, y, DIRT_PALETTE["grit"])

        # Grass drips
        seed_count = max(2, ppt // 4)
        max_drip = max(3, ppt // 6)
        for _ in range(seed_count):
            x = random.randint(0, ppt - 1)
            drip_color = GRASS_PALETTE["base1"] if random.random() < 0.5 else GRASS_PALETTE["base2"]

            # Tuft at boundary
            tuft_half = max(1, ppt // 32)
            for tx in range(-tuft_half, tuft_half + 1):
                hx = (x + tx) % ppt
                self.fill_pixel(tile, hx, grass_height, drip_color)

            # Drip downward
            drip_length = 1 + random.randint(0, max_drip - 1)
            cur_x = x
            for d in range(drip_length):
                dy = grass_height + d
                if dy >= ppt:
                    break
                self.fill_pixel(tile, cur_x, dy, drip_color)
                if random.random() < 0.6:
                    side = -1 if random.random() < 0.5 else 1
                    nx = (cur_x + side) % ppt
                    self.fill_pixel(tile, nx, dy, drip_color)
                if random.random() < 0.3:
                    cur_x = (cur_x + (-1 if random.random() < 0.5 else 1)) % ppt
                if d > 1 and random.random() < 0.25:
                    break

    def _generate_dirt(self, tile: int):
        """Generate dirt texture."""
        import random
        ppt = self.pixels_per_tile

        # Base shadow
        self.fill_tile(tile, DIRT_PALETTE["shadow"])

        # Clumps
        for _ in range((ppt * ppt) // 2):
            x = random.randint(0, ppt - 2)
            y = random.randint(0, ppt - 2)
            self.fill_pixel(tile, x, y, DIRT_PALETTE["base"])
            if random.random() > 0.3:
                self.fill_pixel(tile, x + 1, y, DIRT_PALETTE["base"])
            if random.random() > 0.3:
                self.fill_pixel(tile, x, y + 1, DIRT_PALETTE["base"])

        # Highlights
        for _ in range((ppt * ppt) // 8):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            self.fill_pixel(tile, x, y, DIRT_PALETTE["highlight"])

        # Grit
        for _ in range((ppt * ppt) // 6):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            self.fill_pixel(tile, x, y, DIRT_PALETTE["grit"])

    def _generate_stone(self, tile: int):
        """Generate stone texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                r = random.random()
                if r > 0.6:
                    col = STONE_PALETTE["dark"]
                elif r > 0.9:
                    col = STONE_PALETTE["darker"]
                else:
                    col = STONE_PALETTE["base"]
                self.fill_pixel(tile, x, y, col)

        # Flecks
        for _ in range((ppt * ppt) // 8):
            x = random.randint(0, ppt - 2)
            y = random.randint(0, ppt - 2)
            r = random.random()
            if r > 0.85:
                col = STONE_PALETTE["fleck_blue"]
            elif r > 0.5:
                col = STONE_PALETTE["fleck_darker"]
            else:
                col = STONE_PALETTE["fleck_dark"]
            self.fill_pixel(tile, x, y, col)
            if random.random() > 0.5:
                self.fill_pixel(tile, x + 1, y, col)
            elif random.random() > 0.5:
                self.fill_pixel(tile, x, y + 1, col)

    def _generate_log_side(self, tile: int, palette: dict, rng: SeededRNG):
        """Generate log bark texture with vertical grooves."""
        ppt = self.pixels_per_tile

        self.fill_tile(tile, palette["bark_base"])

        # Base noise
        for y in range(ppt):
            for x in range(ppt):
                if rng.next() > 0.5:
                    self.fill_pixel(tile, x, y, palette["bark_dark"])

        # Vertical grooves
        num_grooves = ppt // 3
        for _ in range(num_grooves):
            x = int(rng.next() * ppt)
            for y in range(ppt):
                left = (x - 1 + ppt) % ppt
                right = (x + 1) % ppt
                self.fill_pixel(tile, left, y, palette["bark_groove_edge"])
                self.fill_pixel(tile, right, y, palette["bark_groove_edge"])
                self.fill_pixel(tile, x, y, palette["bark_groove"])

                wiggle = rng.next()
                if wiggle < 0.2:
                    x -= 1
                elif wiggle > 0.8:
                    x += 1
                x = x % ppt
                if rng.next() > 0.9:
                    y += 1

        # Highlights
        for y in range(ppt):
            for x in range(ppt):
                if rng.next() > 0.75:
                    hl = palette["bark_highlight"] if rng.next() > 0.5 else palette["bark_highlight2"]
                    self.fill_pixel(tile, x, y, hl)

    def _generate_log_top(self, tile: int, palette: dict, rng: SeededRNG):
        """Generate log top texture with rings."""
        ppt = self.pixels_per_tile
        center = (ppt - 1) / 2
        ring_spacing = palette["ring_spacing"]
        ring_threshold = palette["ring_threshold"]

        self.fill_tile(tile, palette["wood_base"])

        for y in range(ppt):
            for x in range(ppt):
                dx = x - center
                dy = y - center
                dist = math.sqrt(dx * dx + dy * dy)

                if dist >= center - 1:
                    # Bark edge
                    col = palette["wood_bark"]
                    if rng.next() > 0.5:
                        col = palette["wood_bark_dark"]
                else:
                    col = palette["wood_base"]
                    # Rings
                    ring_index = dist / ring_spacing
                    if (ring_index % 1) > ring_threshold:
                        col = palette["wood_ring"]
                    # Center knot
                    if dist < 1.5:
                        col = palette["wood_center"]
                    # Noise
                    if rng.next() > 0.85:
                        col = palette["wood_noise"] if col == palette["wood_base"] else palette["wood_base"]

                self.fill_pixel(tile, x, y, col)

    def _generate_leaves(self, tile: int):
        """Generate leaf texture with transparency holes."""
        import random
        ppt = self.pixels_per_tile

        self.clear_tile(tile)

        density = int(ppt * ppt * 1.2)
        for _ in range(density):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            r = random.random()
            if r > 0.7:
                col = LEAVES_PALETTE["light"]
            elif r < 0.4:
                col = LEAVES_PALETTE["dark"]
            else:
                col = LEAVES_PALETTE["mid"]
            self.fill_pixel(tile, x, y, col)
            if random.random() > 0.5:
                self.fill_pixel(tile, min(x + 1, ppt - 1), y, col)

        # Create holes
        gap_count = int(math.sqrt(ppt) * 1.5)
        max_radius = max(2, ppt // 10)
        for _ in range(gap_count):
            cx = random.randint(0, ppt - 1)
            cy = random.randint(0, ppt - 1)
            size = 1 + random.random() * (max_radius - 1)
            for dy in range(int(-size), int(size) + 1):
                for dx in range(int(-size), int(size) + 1):
                    px, py = cx + dx, cy + dy
                    if 0 <= px < ppt and 0 <= py < ppt:
                        if dx * dx + dy * dy <= size * size:
                            if random.random() > 0.2:
                                self.fill_pixel(tile, px, py, "#000000", alpha=0)

    def _generate_longwood_leaves(self, tile: int):
        """Generate dark longwood leaves with sparse coverage."""
        ppt = self.pixels_per_tile
        rng = SeededRNG(12345 + tile)

        self.clear_tile(tile)

        for y in range(ppt):
            for x in range(ppt):
                if rng.next() < 0.35:
                    continue  # 35% holes

                r = rng.next()
                if r < 0.35:
                    col = LONGWOOD_LEAVES_PALETTE["dark"]
                elif r < 0.65:
                    col = LONGWOOD_LEAVES_PALETTE["mid"]
                elif r < 0.85:
                    col = LONGWOOD_LEAVES_PALETTE["light"]
                else:
                    col = LONGWOOD_LEAVES_PALETTE["very_dark"]

                self.fill_pixel(tile, x, y, col)

    def _generate_bedrock(self, tile: int):
        """Generate bedrock texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                r = random.random()
                if r > 0.8:
                    col = BEDROCK_PALETTE["light"]
                elif r > 0.6:
                    col = BEDROCK_PALETTE["mid"]
                else:
                    col = BEDROCK_PALETTE["base"]
                self.fill_pixel(tile, x, y, col)

        rock_count = (ppt * ppt) // 5
        for _ in range(rock_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            col = BEDROCK_PALETTE["highlight"] if random.random() > 0.5 else BEDROCK_PALETTE["dark"]
            self.fill_pixel(tile, x, y, col)
            if random.random() > 0.5:
                dx = 1 if random.random() > 0.5 else -1
                dy = 1 if random.random() > 0.5 else -1
                self.fill_pixel(tile, (x + dx) % ppt, (y + dy) % ppt, col)

        static_count = (ppt * ppt) // 16
        for _ in range(static_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            self.fill_pixel(tile, x, y, BEDROCK_PALETTE["static"])

    def _generate_sand(self, tile: int):
        """Generate sand texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                base = SAND_PALETTE["base_light"] if y < ppt // 2 else SAND_PALETTE["base_dark"]
                self.fill_pixel(tile, x, y, base)

        grain_count = (ppt * ppt) // 3
        for _ in range(grain_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            r = random.random()
            if r > 0.8:
                col = SAND_PALETTE["grain_light"]
            elif r > 0.6:
                col = SAND_PALETTE["grain_dark"]
            else:
                col = SAND_PALETTE["grain1"]
            self.fill_pixel(tile, x, y, col)

        wave_count = max(2, ppt // 8)
        for _ in range(wave_count):
            wave_y = 2 + random.randint(0, ppt - 5)
            for x in range(ppt):
                if random.random() > 0.7:
                    self.fill_pixel(tile, x, wave_y, SAND_PALETTE["wave"])

    def _generate_water(self, tile: int):
        """Generate water texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                col = WATER_PALETTE["base_light"] if y < ppt // 2 else WATER_PALETTE["base_dark"]
                self.fill_pixel(tile, x, y, col)

        ripple_count = ppt // 2
        for _ in range(ripple_count):
            y = random.randint(0, ppt - 1)
            length = int(ppt * 0.2 + random.random() * ppt * 0.3)
            start_x = random.randint(0, ppt - 1)
            for k in range(length):
                x = (start_x + k) % ppt
                self.fill_pixel(tile, x, y, WATER_PALETTE["ripple_light"])
                if y + 1 < ppt:
                    self.fill_pixel(tile, x, y + 1, WATER_PALETTE["ripple_dark"])

        sparkle_count = ppt // 4
        for _ in range(sparkle_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            self.fill_pixel(tile, x, y, WATER_PALETTE["sparkle"])

    def _generate_torch(self, tile: int):
        """Generate torch texture."""
        ppt = self.pixels_per_tile

        self.fill_tile(tile, TORCH_PALETTE["background"])

        center_x = ppt // 2
        torch_width = max(2, ppt // 8)
        handle_height = int(ppt * 0.6)
        flame_height = int(ppt * 0.35)

        # Handle
        for y in range(ppt - handle_height, ppt):
            for x in range(center_x - torch_width // 2, center_x + torch_width // 2 + 1):
                if 0 <= x < ppt:
                    self.fill_pixel(tile, x, y, TORCH_PALETTE["handle"])

        # Flame
        flame_start_y = ppt - handle_height - flame_height
        for y in range(flame_start_y, ppt - handle_height):
            for x in range(center_x - torch_width // 2, center_x + torch_width // 2 + 1):
                if 0 <= x < ppt:
                    progress = (y - flame_start_y) / flame_height
                    col = TORCH_PALETTE["flame_top"] if progress < 0.5 else TORCH_PALETTE["flame_bottom"]
                    self.fill_pixel(tile, x, y, col)

    def _generate_snow(self, tile: int):
        """Generate snow texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                col = random.choice(SNOW_PALETTE["base"])
                self.fill_pixel(tile, x, y, col)

        shadow_count = (ppt * ppt) // 4
        for _ in range(shadow_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            col = random.choice(SNOW_PALETTE["shadow"])
            self.fill_pixel(tile, x, y, col)

        sparkle_count = (ppt * ppt) // 6
        for _ in range(sparkle_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            self.fill_pixel(tile, x, y, SNOW_PALETTE["sparkle"])

    def _generate_gravel(self, tile: int):
        """Generate gravel texture."""
        import random
        ppt = self.pixels_per_tile

        for y in range(ppt):
            for x in range(ppt):
                col = random.choice(GRAVEL_PALETTE["base"])
                self.fill_pixel(tile, x, y, col)

        pebble_count = (ppt * ppt) // 3
        for _ in range(pebble_count):
            x = random.randint(0, ppt - 2)
            y = random.randint(0, ppt - 2)
            col = random.choice(GRAVEL_PALETTE["accent"])
            self.fill_pixel(tile, x, y, col)
            if random.random() > 0.5:
                if random.random() > 0.5:
                    self.fill_pixel(tile, x + 1, y, col)
                else:
                    self.fill_pixel(tile, x, y + 1, col)

        dark_count = (ppt * ppt) // 8
        for _ in range(dark_count):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            self.fill_pixel(tile, x, y, GRAVEL_PALETTE["dark"])

    def _generate_planks(self, tile: int):
        """Generate wood planks texture."""
        import random
        ppt = self.pixels_per_tile

        self.fill_tile(tile, PLANKS_PALETTE["base"])

        # Noise
        noise_density = ppt * ppt * 4
        for _ in range(noise_density):
            x = random.randint(0, ppt - 1)
            y = random.randint(0, ppt - 1)
            col = PLANKS_PALETTE["noise1"] if random.random() > 0.7 else PLANKS_PALETTE["noise2"]
            self.fill_pixel(tile, x, y, col)

        # Horizontal gaps between planks
        planks_per_tile = 4
        plank_height = ppt // planks_per_tile
        gap_size = max(1, ppt // 32)

        for row in range(plank_height - gap_size, ppt, plank_height):
            for g in range(gap_size):
                if row + g >= ppt:
                    break
                for x in range(ppt):
                    r = random.random()
                    if r > 0.9:
                        col = PLANKS_PALETTE["gap_darker"]
                    elif r > 0.7:
                        col = PLANKS_PALETTE["gap_dark"]
                    else:
                        col = PLANKS_PALETTE["gap"]
                    self.fill_pixel(tile, x, row + g, col)

    def save(self, path: str):
        """Save atlas to file."""
        self.atlas.save(path)

    def get_bytes(self) -> bytes:
        """Get atlas as PNG bytes for OpenGL upload."""
        import io
        buffer = io.BytesIO()
        self.atlas.save(buffer, format='PNG')
        return buffer.getvalue()


if __name__ == "__main__":
    # Test texture generation
    print("Generating texture atlas...")
    gen = TextureGenerator(16, 17)
    gen.generate_atlas()
    gen.save("test_atlas.png")
    print("Saved to test_atlas.png")
