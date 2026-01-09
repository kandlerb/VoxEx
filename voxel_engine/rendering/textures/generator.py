"""
Data-driven procedural texture atlas generator.
Reads texture generation parameters from block.json files and generates the atlas.
"""

from PIL import Image
import math
import random
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
import json


class SeededRNG:
    """Deterministic random number generator for reproducible textures."""

    def __init__(self, seed: int):
        self.seed = seed

    def next(self) -> float:
        """Returns a float in [0, 1)."""
        self.seed = (self.seed * 1103515245 + 12345) & 0x7fffffff
        return self.seed / 0x7fffffff

    def randint(self, min_val: int, max_val: int) -> int:
        """Returns an integer in [min_val, max_val]."""
        return min_val + int(self.next() * (max_val - min_val + 1))

    def choice(self, items: list):
        """Returns a random item from the list."""
        if not items:
            return None
        return items[self.randint(0, len(items) - 1)]


class TextureGenerator:
    """
    Generates a texture atlas from block.json texture configs.

    Supports these generation types:
    - noise_fill: Random pixels with optional clustering
    - layered: Horizontal zones with different generation
    - log_bark: Vertical grooves (bark texture)
    - log_rings: Concentric rings (log top)
    - sparse: Partial coverage with holes (leaves)
    - gradient: Top/bottom color variation with features
    - planks: Wood grain with horizontal gaps
    - shape: Specific geometric shapes (torch)
    - reference: Use another texture
    """

    def __init__(self, pixels_per_tile: int = 16):
        self.ppt = pixels_per_tile
        self.tiles: Dict[str, Image.Image] = {}
        self.tile_order: List[str] = []
        self.block_configs: Dict[str, dict] = {}
        self.tile_map: Dict[str, int] = {}

    def hex_to_rgb(self, hex_color: str) -> tuple:
        """Convert hex color string to RGB tuple."""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def get_color(self, palette: dict, key: str, rng: Optional[SeededRNG] = None) -> str:
        """Get a color from palette, handling arrays."""
        value = palette.get(key, "#FF00FF")  # Magenta for missing
        if isinstance(value, list):
            if rng:
                return rng.choice(value)
            return random.choice(value)
        return value

    def load_blocks(self, content_path: Path):
        """Load all block.json files from content/blocks/."""
        blocks_path = content_path / "blocks"
        if not blocks_path.exists():
            raise FileNotFoundError(f"Blocks directory not found: {blocks_path}")

        for block_dir in sorted(blocks_path.iterdir()):
            if not block_dir.is_dir():
                continue

            block_json = block_dir / "block.json"
            if block_json.exists():
                with open(block_json) as f:
                    config = json.load(f)
                    block_key = block_dir.name
                    self.block_configs[block_key] = config

    def generate_atlas(self, content_path: Path) -> Image.Image:
        """Generate complete texture atlas from block configs."""
        self.load_blocks(content_path)

        # Determine tile order and generate each texture
        tile_index = 0

        # Process blocks in ID order for consistent atlas layout
        sorted_blocks = sorted(
            self.block_configs.items(),
            key=lambda x: x[1].get("id", 999)
        )

        for block_key, config in sorted_blocks:
            textures = config.get("textures")
            if not textures:
                continue

            # Handle "all" vs per-face textures
            if "all" in textures:
                tex_config = textures["all"]
                if tex_config.get("type") == "reference":
                    # Handle reference later
                    continue
                tile_key = f"{block_key}:all"
                self._generate_tile(tile_key, tex_config, tile_index)
                self.tile_map[tile_key] = tile_index
                tile_index += 1
            else:
                for face in ["top", "side", "bottom"]:
                    if face not in textures:
                        continue

                    tex_config = textures[face]

                    # Handle references
                    if tex_config.get("type") == "reference":
                        ref = tex_config.get("ref")
                        if ref in ["top", "side", "bottom"]:
                            # Reference another face of same block
                            ref_key = f"{block_key}:{ref}"
                        else:
                            # Reference another block
                            ref_key = f"{ref}:all"
                        self.tile_map[f"{block_key}:{face}"] = self.tile_map.get(ref_key, 0)
                        continue

                    tile_key = f"{block_key}:{face}"
                    self._generate_tile(tile_key, tex_config, tile_index)
                    self.tile_map[tile_key] = tile_index
                    tile_index += 1

        # Create atlas image
        num_tiles = len(self.tiles)
        if num_tiles == 0:
            return Image.new('RGBA', (16, 16), (255, 0, 255, 255))

        atlas = Image.new('RGBA', (num_tiles * self.ppt, self.ppt), (0, 0, 0, 255))

        for i, tile_key in enumerate(self.tile_order):
            tile = self.tiles[tile_key]
            atlas.paste(tile, (i * self.ppt, 0))

        return atlas

    def _generate_tile(self, tile_key: str, config: dict, tile_index: int):
        """Generate a single tile based on config."""
        tex_type = config.get("type", "noise_fill")
        palette = config.get("palette", {})
        params = config.get("params", {})
        allow_transparency = config.get("allow_transparency", False)
        seed_offset = config.get("seed_offset", tile_index)

        # Create tile image
        if allow_transparency:
            tile = Image.new('RGBA', (self.ppt, self.ppt), (0, 0, 0, 0))
        else:
            tile = Image.new('RGBA', (self.ppt, self.ppt), (0, 0, 0, 255))

        # Select generator based on type
        generators = {
            "noise_fill": self._gen_noise_fill,
            "layered": self._gen_layered,
            "log_bark": self._gen_log_bark,
            "log_rings": self._gen_log_rings,
            "sparse": self._gen_sparse,
            "gradient": self._gen_gradient,
            "planks": self._gen_planks,
            "shape": self._gen_shape,
        }

        gen_func = generators.get(tex_type)
        if gen_func:
            gen_func(tile, palette, params, seed_offset)

        self.tiles[tile_key] = tile
        self.tile_order.append(tile_key)

    def _fill_pixel(self, tile: Image.Image, x: int, y: int, color: str, alpha: int = 255):
        """Fill a pixel with bounds checking."""
        if 0 <= x < self.ppt and 0 <= y < self.ppt:
            rgb = self.hex_to_rgb(color)
            tile.putpixel((x, y), (*rgb, alpha))

    def _fill_tile(self, tile: Image.Image, color: str):
        """Fill entire tile with solid color."""
        rgb = self.hex_to_rgb(color)
        for y in range(self.ppt):
            for x in range(self.ppt):
                tile.putpixel((x, y), (*rgb, 255))

    # =========================================================================
    # GENERATION ALGORITHMS
    # =========================================================================

    def _gen_noise_fill(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate noise-based fill texture (stone, dirt, bedrock, snow, gravel)."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt

        # Base fill
        base_color = params.get("base_color")
        base_colors = params.get("base_colors")
        base_thresholds = params.get("base_thresholds", [])
        random_from_array = params.get("random_from_array", False)

        for y in range(ppt):
            for x in range(ppt):
                if base_color:
                    col = self.get_color(palette, base_color, rng)
                elif base_colors:
                    if random_from_array and isinstance(palette.get(base_colors), list):
                        col = rng.choice(palette[base_colors])
                    elif isinstance(base_colors, list):
                        r = rng.next()
                        col = palette.get(base_colors[0], "#808080")
                        for i, thresh in enumerate(base_thresholds):
                            if r > thresh and i + 1 < len(base_colors):
                                col = palette.get(base_colors[i + 1], col)
                    else:
                        col = self.get_color(palette, base_colors, rng)
                else:
                    col = "#808080"
                self._fill_pixel(tile, x, y, col)

        # Apply layers
        layers = params.get("layers", [])
        for layer in layers:
            layer_colors = layer.get("colors") or layer.get("color")
            density = layer.get("density", 0.1)
            cluster_chance = layer.get("cluster_chance", 0)
            cluster_size = layer.get("cluster_size", 1)
            rand_array = layer.get("random_from_array", False)

            count = int(ppt * ppt * density)
            for _ in range(count):
                x = rng.randint(0, ppt - 2)
                y = rng.randint(0, ppt - 2)

                if rand_array and isinstance(palette.get(layer_colors), list):
                    col = rng.choice(palette[layer_colors])
                else:
                    col = self.get_color(palette, layer_colors, rng)

                self._fill_pixel(tile, x, y, col)

                # Clustering
                if cluster_chance > 0 and rng.next() < cluster_chance:
                    for _ in range(cluster_size - 1):
                        dx = 1 if rng.next() > 0.5 else 0
                        dy = 0 if dx else 1
                        self._fill_pixel(tile, x + dx, y + dy, col)

        # Special layers (rocks, static, pebbles, etc.)
        for special_key in ["rocks", "static", "pebbles", "darks", "flecks"]:
            special = params.get(special_key)
            if not special:
                continue

            density = special.get("density", 0.1)
            colors = special.get("colors") or special.get("color")
            thresholds = special.get("thresholds", [])
            cluster_chance = special.get("cluster_chance", 0)

            count = int(ppt * ppt * density)
            for _ in range(count):
                x = rng.randint(0, ppt - 2)
                y = rng.randint(0, ppt - 2)

                if isinstance(colors, list):
                    r = rng.next()
                    col = palette.get(colors[0], colors[0])
                    for i, thresh in enumerate(thresholds):
                        if r > thresh and i + 1 < len(colors):
                            col = palette.get(colors[i + 1], colors[i + 1])
                else:
                    col = self.get_color(palette, colors, rng)

                self._fill_pixel(tile, x, y, col)

                if cluster_chance > 0 and rng.next() < cluster_chance:
                    dx = 1 if rng.next() > 0.5 else -1
                    dy = 1 if rng.next() > 0.5 else -1
                    self._fill_pixel(tile, (x + dx) % ppt, (y + dy) % ppt, col)

    def _gen_log_bark(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate log bark texture with vertical grooves."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt

        # Fill base
        self._fill_tile(tile, palette.get("bark_base", "#5D4037"))

        # Base noise
        for y in range(ppt):
            for x in range(ppt):
                if rng.next() > 0.5:
                    self._fill_pixel(tile, x, y, palette.get("bark_dark", "#4E342E"))

        # Vertical grooves
        groove_count = int(ppt * params.get("groove_count_ratio", 0.333))
        wiggle_left = params.get("groove_wiggle_left", 0.2)
        wiggle_right = params.get("groove_wiggle_right", 0.2)
        skip_chance = params.get("groove_skip_chance", 0.1)

        for _ in range(groove_count):
            x = rng.randint(0, ppt - 1)
            y = 0
            while y < ppt:
                left = (x - 1 + ppt) % ppt
                right = (x + 1) % ppt

                self._fill_pixel(tile, left, y, palette.get("bark_groove_edge", "#3E2723"))
                self._fill_pixel(tile, right, y, palette.get("bark_groove_edge", "#3E2723"))
                self._fill_pixel(tile, x, y, palette.get("bark_groove", "#281814"))

                # Wiggle
                wiggle = rng.next()
                if wiggle < wiggle_left:
                    x = (x - 1 + ppt) % ppt
                elif wiggle > (1 - wiggle_right):
                    x = (x + 1) % ppt

                # Skip ahead occasionally
                if rng.next() > (1 - skip_chance):
                    y += 1
                y += 1

        # Highlights
        highlight_density = params.get("highlight_density", 0.5)
        highlight_chance = params.get("highlight_chance", 0.25)
        count = int(ppt * ppt * highlight_density)

        for _ in range(count):
            x = rng.randint(0, ppt - 1)
            y = rng.randint(0, ppt - 1)
            if rng.next() < highlight_chance:
                hl = palette.get("bark_highlight" if rng.next() > 0.5 else "bark_highlight2", "#795548")
                self._fill_pixel(tile, x, y, hl)

    def _gen_log_rings(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate log top texture with concentric rings."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt
        center = (ppt - 1) / 2

        ring_spacing = params.get("ring_spacing", 4)
        ring_threshold = params.get("ring_threshold", 0.65)
        center_radius = params.get("center_radius", 1.5)
        noise_chance = params.get("noise_chance", 0.15)
        bark_edge = params.get("bark_edge_width", 1)

        self._fill_tile(tile, palette.get("wood_base", "#C19A6B"))

        for y in range(ppt):
            for x in range(ppt):
                dx = x - center
                dy = y - center
                dist = math.sqrt(dx * dx + dy * dy)

                if dist >= center - bark_edge:
                    # Bark edge
                    col = palette.get("bark", "#5D4037")
                    if rng.next() > 0.5:
                        col = palette.get("bark_dark", "#3E2723")
                else:
                    col = palette.get("wood_base", "#C19A6B")

                    # Rings
                    ring_index = dist / ring_spacing
                    if (ring_index % 1) > ring_threshold:
                        col = palette.get("wood_ring", "#8B5A2B")

                    # Center knot
                    if dist < center_radius:
                        col = palette.get("wood_center", "#A6764A")

                    # Noise
                    if rng.next() > (1 - noise_chance):
                        base = palette.get("wood_base", "#C19A6B")
                        noise = palette.get("wood_noise", "#A17E55")
                        col = noise if col == base else base

                self._fill_pixel(tile, x, y, col)

    def _gen_sparse(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate sparse texture with holes (leaves)."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt

        coverage = params.get("coverage", 1.0)
        colors = params.get("colors", [])
        thresholds = params.get("thresholds", [])
        cluster_chance = params.get("cluster_chance", 0)
        holes_config = params.get("holes", {})

        # Fill with leaves
        if coverage < 1.0:
            # Sparse mode - coverage determines pixel placement
            for y in range(ppt):
                for x in range(ppt):
                    r = rng.next()
                    if r > coverage:
                        continue  # Leave transparent

                    r2 = rng.next()
                    col = palette.get(colors[0], "#2E7D32") if colors else "#2E7D32"
                    for i, thresh in enumerate(thresholds):
                        if r2 > thresh and i + 1 < len(colors):
                            col = palette.get(colors[i + 1], col)

                    self._fill_pixel(tile, x, y, col)
        else:
            # Dense mode with holes
            density = int(ppt * ppt * coverage)
            for _ in range(density):
                x = rng.randint(0, ppt - 1)
                y = rng.randint(0, ppt - 1)

                r = rng.next()
                col = palette.get(colors[0], "#2E7D32") if colors else "#2E7D32"
                for i, thresh in enumerate(thresholds):
                    if r > thresh and i + 1 < len(colors):
                        col = palette.get(colors[i + 1], col)

                self._fill_pixel(tile, x, y, col)

                # Cluster
                if cluster_chance > 0:
                    r = rng.next()
                    if r < cluster_chance:
                        self._fill_pixel(tile, min(x + 1, ppt - 1), y, col)

            # Create holes
            if holes_config:
                hole_count = int(math.sqrt(ppt) * holes_config.get("count_factor", 1.5))
                max_radius = max(2, int(ppt * holes_config.get("max_radius_ratio", 0.1)))
                keep_chance = holes_config.get("keep_chance", 0.2)

                for _ in range(hole_count):
                    cx = rng.randint(0, ppt - 1)
                    cy = rng.randint(0, ppt - 1)
                    r_size = rng.next()
                    size = 1 + r_size * (max_radius - 1)

                    for dy in range(int(-size), int(size) + 1):
                        for dx in range(int(-size), int(size) + 1):
                            px, py = cx + dx, cy + dy
                            if 0 <= px < ppt and 0 <= py < ppt:
                                if dx * dx + dy * dy <= size * size:
                                    r = rng.next()
                                    if r > keep_chance:
                                        tile.putpixel((px, py), (0, 0, 0, 0))

    def _gen_gradient(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate gradient texture with features (sand, water)."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt

        grad_colors = params.get("gradient_colors", ["top", "bottom"])
        grad_split = params.get("gradient_split", 0.5)

        # Base gradient
        for y in range(ppt):
            for x in range(ppt):
                if y < ppt * grad_split:
                    col = palette.get(grad_colors[0], "#808080")
                else:
                    col = palette.get(grad_colors[1], "#606060")
                self._fill_pixel(tile, x, y, col)

        # Grains (sand)
        grains = params.get("grains")
        if grains:
            density = grains.get("density", 0.333)
            colors = grains.get("colors", [])
            thresholds = grains.get("thresholds", [])

            count = int(ppt * ppt * density)
            for _ in range(count):
                x = rng.randint(0, ppt - 1)
                y = rng.randint(0, ppt - 1)

                r = rng.next()
                col = palette.get(colors[0], "#808080") if colors else "#808080"
                for i, thresh in enumerate(thresholds):
                    if r > thresh and i + 1 < len(colors):
                        col = palette.get(colors[i + 1], col)

                self._fill_pixel(tile, x, y, col)

        # Waves (sand)
        waves = params.get("waves")
        if waves:
            count_ratio = waves.get("count_ratio", 0.125)
            wave_color = palette.get(waves.get("color", "wave"), "#D1C296")
            coverage = waves.get("coverage", 0.3)

            wave_count = max(2, int(ppt * count_ratio))
            for _ in range(wave_count):
                wave_y = 2 + rng.randint(0, ppt - 5)
                for x in range(ppt):
                    if rng.next() < coverage:
                        self._fill_pixel(tile, x, wave_y, wave_color)

        # Ripples (water)
        ripples = params.get("ripples")
        if ripples:
            count_ratio = ripples.get("count_ratio", 0.5)
            min_len = ripples.get("min_length_ratio", 0.2)
            max_len = ripples.get("max_length_ratio", 0.5)
            light = palette.get(ripples.get("light_color", "ripple_light"), "#4FC3F7")
            dark = palette.get(ripples.get("dark_color", "ripple_dark"), "#1565C0")

            count = int(ppt * count_ratio)
            for _ in range(count):
                y = rng.randint(0, ppt - 1)
                length = int(ppt * min_len + rng.next() * ppt * (max_len - min_len))
                start_x = rng.randint(0, ppt - 1)

                for k in range(length):
                    x = (start_x + k) % ppt
                    self._fill_pixel(tile, x, y, light)
                    if y + 1 < ppt:
                        self._fill_pixel(tile, x, y + 1, dark)

        # Sparkles (water)
        sparkles = params.get("sparkles")
        if sparkles:
            count_ratio = sparkles.get("count_ratio", 0.25)
            color = palette.get(sparkles.get("color", "sparkle"), "#FFFFFF")

            count = int(ppt * count_ratio)
            for _ in range(count):
                x = rng.randint(0, ppt - 1)
                y = rng.randint(0, ppt - 1)
                self._fill_pixel(tile, x, y, color)

    def _gen_planks(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate wood planks texture with gaps."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt

        self._fill_tile(tile, palette.get("base", "#C19A6B"))

        # Wood grain noise
        noise_density = params.get("noise_density", 4.0)
        noise_colors = params.get("noise_colors", ["noise1", "noise2"])
        noise_threshold = params.get("noise_threshold", 0.7)

        count = int(ppt * ppt * noise_density)
        for _ in range(count):
            x = rng.randint(0, ppt - 1)
            y = rng.randint(0, ppt - 1)
            col = palette.get(noise_colors[0] if rng.next() > noise_threshold else noise_colors[1], "#a17e55")
            self._fill_pixel(tile, x, y, col)

        # Horizontal plank gaps
        planks_per_tile = params.get("planks_per_tile", 4)
        gap_size_ratio = params.get("gap_size_ratio", 0.03125)
        gap_colors = params.get("gap_colors", ["gap", "gap_dark", "gap_darker"])
        gap_thresholds = params.get("gap_thresholds", [0.7, 0.9])

        plank_height = ppt // planks_per_tile
        gap_size = max(1, int(ppt * gap_size_ratio))

        for row in range(plank_height - gap_size, ppt, plank_height):
            for g in range(gap_size):
                if row + g >= ppt:
                    break
                for x in range(ppt):
                    r = rng.next()
                    col = palette.get(gap_colors[0], "#8B5A2B")
                    for i, thresh in enumerate(gap_thresholds):
                        if r > thresh and i + 1 < len(gap_colors):
                            col = palette.get(gap_colors[i + 1], col)
                    self._fill_pixel(tile, x, row + g, col)

    def _gen_shape(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate shape-based texture (torch)."""
        ppt = self.ppt
        shape = params.get("shape", "torch")

        if shape == "torch":
            # Background
            self._fill_tile(tile, palette.get("background", "#808080"))

            center_x = ppt // 2
            handle_width = max(2, int(ppt * params.get("handle_width_ratio", 0.125)))
            handle_height = int(ppt * params.get("handle_height_ratio", 0.6))
            flame_height = int(ppt * params.get("flame_height_ratio", 0.35))

            # Handle
            for y in range(ppt - handle_height, ppt):
                for x in range(center_x - handle_width // 2, center_x + handle_width // 2 + 1):
                    if 0 <= x < ppt:
                        self._fill_pixel(tile, x, y, palette.get("handle", "#8b4513"))

            # Flame
            flame_start = ppt - handle_height - flame_height
            for y in range(flame_start, ppt - handle_height):
                for x in range(center_x - handle_width // 2, center_x + handle_width // 2 + 1):
                    if 0 <= x < ppt:
                        progress = (y - flame_start) / flame_height
                        col = palette.get("flame_top" if progress < 0.5 else "flame_bottom", "#ff9800")
                        self._fill_pixel(tile, x, y, col)

    def _gen_layered(self, tile: Image.Image, palette: dict, params: dict, seed: int):
        """Generate layered texture (grass side)."""
        rng = SeededRNG(12345 + seed)
        ppt = self.ppt

        layers = params.get("layers", [])
        current_y = 0

        for layer in layers:
            height_ratio = layer.get("height_ratio", 0.5)
            layer_height = int(ppt * height_ratio)
            layer_type = layer.get("type", "solid")

            end_y = current_y + layer_height

            if layer_type == "noise_fill":
                colors_key = layer.get("colors")
                weights = layer.get("weights", [0.5, 0.5])
                colors = palette.get(colors_key, [])
                if isinstance(colors, str):
                    colors = [colors]

                for y in range(current_y, min(end_y, ppt)):
                    for x in range(ppt):
                        r = rng.next()
                        col = colors[0] if isinstance(colors, list) and colors else "#808080"
                        cumulative = 0
                        for i, w in enumerate(weights):
                            cumulative += w
                            if r < cumulative and i < len(colors):
                                col = colors[i]
                                break
                        self._fill_pixel(tile, x, y, col)

            elif layer_type == "dirt_fill":
                base = palette.get(layer.get("base_color"), "#3e2723")
                clump = palette.get(layer.get("clump_color"), "#5d4037")
                highlight = palette.get(layer.get("highlight_color"), "#8d6e63")
                grit = palette.get(layer.get("grit_color"), "#795548")

                # Base fill
                for y in range(current_y, min(end_y, ppt)):
                    for x in range(ppt):
                        self._fill_pixel(tile, x, y, base)

                # Clumps
                clump_density = layer.get("clump_density", 0.4)
                layer_area = layer_height * ppt
                for _ in range(int(layer_area * clump_density)):
                    x = rng.randint(0, ppt - 2)
                    y = current_y + rng.randint(0, max(0, layer_height - 2))
                    if y < ppt:
                        self._fill_pixel(tile, x, y, clump)
                        if rng.next() > 0.4:
                            self._fill_pixel(tile, x + 1, y, clump)
                        if rng.next() > 0.4 and y + 1 < ppt:
                            self._fill_pixel(tile, x, y + 1, clump)

                # Highlights
                for _ in range(int(layer_area * layer.get("highlight_density", 0.1))):
                    x = rng.randint(0, ppt - 1)
                    y = current_y + rng.randint(0, max(0, layer_height - 1))
                    if y < ppt:
                        self._fill_pixel(tile, x, y, highlight)

                # Grit
                for _ in range(int(layer_area * layer.get("grit_density", 0.08))):
                    x = rng.randint(0, ppt - 1)
                    y = current_y + rng.randint(0, max(0, layer_height - 1))
                    if y < ppt:
                        self._fill_pixel(tile, x, y, grit)

            current_y = end_y

        # Drip effect (grass hanging over dirt)
        drip = params.get("drip")
        if drip and drip.get("enabled", False):
            colors_key = drip.get("colors")
            colors = palette.get(colors_key, ["#378a32", "#2c6b2f"])
            if isinstance(colors, str):
                colors = [colors]

            seed_count = max(2, int((ppt / 16) * drip.get("seed_count_per_16px", 4)))
            max_drip_len = max(3, int(ppt * drip.get("max_length_ratio", 0.167)))
            tuft_half = max(1, int(ppt * drip.get("tuft_width_ratio", 0.03125)))

            # Find grass/dirt boundary (first layer height)
            grass_height = int(ppt * layers[0].get("height_ratio", 0.25)) if layers else ppt // 4

            for _ in range(seed_count):
                x = rng.randint(0, ppt - 1)
                drip_color = rng.choice(colors) if colors else "#378a32"

                # Tuft at boundary
                for tx in range(-tuft_half, tuft_half + 1):
                    hx = (x + tx) % ppt
                    self._fill_pixel(tile, hx, grass_height, drip_color)
                    if grass_height + 1 < ppt and rng.next() < 0.5:
                        self._fill_pixel(tile, hx, grass_height + 1, drip_color)

                # Drip downward
                drip_length = 1 + rng.randint(0, max_drip_len - 1)
                cur_x = x
                for d in range(drip_length):
                    dy = grass_height + d
                    if dy >= ppt:
                        break
                    self._fill_pixel(tile, cur_x, dy, drip_color)

                    if rng.next() < 0.6:
                        side = -1 if rng.next() < 0.5 else 1
                        nx = (cur_x + side) % ppt
                        self._fill_pixel(tile, nx, dy, drip_color)

                    if rng.next() < 0.3:
                        cur_x = (cur_x + (-1 if rng.next() < 0.5 else 1)) % ppt

                    if d > 1 and rng.next() < 0.25:
                        break

    def save(self, path: str):
        """Save the generated atlas."""
        if self.tiles:
            atlas = self.generate_atlas_image()
            atlas.save(path)

    def generate_atlas_image(self) -> Image.Image:
        """Create atlas from generated tiles."""
        if not self.tiles:
            return Image.new('RGBA', (16, 16), (255, 0, 255, 255))

        num_tiles = len(self.tiles)
        atlas = Image.new('RGBA', (num_tiles * self.ppt, self.ppt), (0, 0, 0, 255))

        for i, tile_key in enumerate(self.tile_order):
            tile = self.tiles[tile_key]
            atlas.paste(tile, (i * self.ppt, 0))

        return atlas


if __name__ == "__main__":
    # Test texture generation
    from pathlib import Path
    content_path = Path(__file__).parent.parent.parent / "content"
    print(f"Loading blocks from: {content_path}")

    gen = TextureGenerator(pixels_per_tile=16)
    atlas = gen.generate_atlas(content_path)

    output_path = Path(__file__).parent / "test_atlas.png"
    atlas.save(output_path)

    print(f"Generated atlas with {len(gen.tiles)} tiles")
    print(f"Tile order: {gen.tile_order}")
    print(f"Saved to: {output_path}")
