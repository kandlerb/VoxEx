"""Color palettes for procedural texture generation."""

# Dirt colors used by grass_side and dirt
DIRT_PALETTE = {
    "base": "#5d4037",      # Mid-tone brown (Main dirt body)
    "shadow": "#3e2723",    # Dark chocolate (Depths)
    "highlight": "#8d6e63", # Light dry earth (Top/Dry spots)
    "grit": "#795548",      # Small stones/particles
}

# Grass colors
GRASS_PALETTE = {
    "base1": "#378a32",
    "base2": "#2c6b2f",
    "dark": "#266e2c",
    "light": "#4caf50",
}

# Oak wood palette (warm medium brown, moderate contrast)
OAK_PALETTE = {
    "bark_base": "#5D4037",
    "bark_dark": "#4E342E",
    "bark_groove": "#281814",
    "bark_groove_edge": "#3E2723",
    "bark_highlight": "#795548",
    "bark_highlight2": "#8D6E63",
    "wood_base": "#C19A6B",
    "wood_ring": "#8B5A2B",
    "wood_center": "#A6764A",
    "wood_noise": "#A17E55",
    "wood_bark": "#5D4037",
    "wood_bark_dark": "#3E2723",
    "ring_spacing": 4,
    "ring_threshold": 0.65,
}

# Longwood palette - very dark, rough bark
LONGWOOD_PALETTE = {
    "bark_base": "#3D2A1F",
    "bark_dark": "#2A1A12",
    "bark_groove": "#1A0F08",
    "bark_groove_edge": "#2D1810",
    "bark_highlight": "#5A4030",
    "bark_highlight2": "#6B5040",
    "wood_base": "#8B6B50",
    "wood_ring": "#4A3020",
    "wood_center": "#6B5040",
    "wood_noise": "#7A5A40",
    "wood_bark": "#3D2A1F",
    "wood_bark_dark": "#2A1A12",
    "ring_spacing": 2,
    "ring_threshold": 0.50,
}

# Stone colors
STONE_PALETTE = {
    "base": "#9e9e9e",
    "dark": "#858585",
    "darker": "#757575",
    "fleck_dark": "#6b6a6a",
    "fleck_darker": "#505050",
    "fleck_blue": "#78909c",
}

# Bedrock colors
BEDROCK_PALETTE = {
    "base": "#1a1a1a",
    "mid": "#2b2b2b",
    "light": "#555555",
    "highlight": "#777777",
    "dark": "#000000",
    "static": "#999999",
}

# Sand colors
SAND_PALETTE = {
    "base_light": "#E6D6AC",
    "base_dark": "#DECFA3",
    "grain1": "#D4C08E",
    "grain_light": "#F2E6C9",
    "grain_dark": "#C2B280",
    "wave": "#D1C296",
}

# Water colors
WATER_PALETTE = {
    "base_light": "#2389DA",
    "base_dark": "#1B609E",
    "ripple_light": "#4FC3F7",
    "ripple_dark": "#1565C0",
    "sparkle": "#E1F5FE",
}

# Snow colors
SNOW_PALETTE = {
    "base": ["#FAFAFA", "#F5F5F5", "#EEEEEE"],
    "shadow": ["#E0E0E0", "#D6E6F2", "#CFE2F3"],
    "sparkle": "#FFFFFF",
}

# Gravel colors
GRAVEL_PALETTE = {
    "base": ["#6B6B6B", "#787878", "#5C5C5C"],
    "accent": ["#8B8B8B", "#4A4A4A", "#9E9E9E", "#707070"],
    "dark": "#3D3D3D",
}

# Leaves colors (oak)
LEAVES_PALETTE = {
    "dark": "#1B5E20",
    "mid": "#2E7D32",
    "light": "#4CAF50",
}

# Longwood leaves (darker)
LONGWOOD_LEAVES_PALETTE = {
    "very_dark": "#0F3F0F",
    "dark": "#1B4F1B",
    "mid": "#2A6A2A",
    "light": "#3A7A3A",
}

# Wood planks
PLANKS_PALETTE = {
    "base": "#C19A6B",
    "noise1": "#a17e55",
    "noise2": "#c9a77d",
    "gap": "#8B5A2B",
    "gap_dark": "#6D4C41",
    "gap_darker": "#5D4037",
}

# Torch
TORCH_PALETTE = {
    "handle": "#8b4513",
    "flame_top": "#ffeb3b",
    "flame_bottom": "#ff9800",
    "background": "#808080",
}
