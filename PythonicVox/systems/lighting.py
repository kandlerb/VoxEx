"""
Lighting system for PythonicVox.

This module contains the LightingSystem class which manages light propagation,
skylight calculation, and block light sources throughout the voxel world.
Also includes the Sun class for world lighting.

Classes:
    LightingSystem: Manages lighting calculations and updates.
    Sun: Static sun light source in the sky.

Usage:
    from systems.lighting import LightingSystem, Sun

    sun = Sun()
    lighting = LightingSystem(chunk_manager)
    lighting.calculate_chunk_lighting(chunk)
"""

import math


class Sun:
    """
    Static sun light source in the sky.

    The sun provides directional lighting for the world. It is positioned
    high in the sky and does not move (static).

    Attributes:
        position (tuple): World position of the sun (x, y, z).
        direction (tuple): Normalized direction light travels (toward ground).
        color (tuple): RGB color of sunlight (0-1 range).
        intensity (float): Light intensity multiplier.
        ambient (tuple): Ambient light color (0-1 range).
    """

    def __init__(self):
        """Initialize the sun with default settings."""
        # Sun position high in the sky, offset from origin
        self.position = (1000.0, 500.0, 1000.0)

        # Light direction (from sun toward ground, normalized)
        # Pointing down and slightly angled for natural shadows
        dir_x, dir_y, dir_z = -0.5, -1.0, -0.3
        length = math.sqrt(dir_x*dir_x + dir_y*dir_y + dir_z*dir_z)
        self.direction = (dir_x/length, dir_y/length, dir_z/length)

        # Warm white sunlight color
        self.color = (1.0, 0.95, 0.85)

        # Light intensity
        self.intensity = 1.0

        # Ambient light (fills shadows)
        self.ambient = (0.3, 0.35, 0.45)

    def get_light_data(self):
        """
        Get sun light data for rendering.

        Returns:
            dict: Light data including position, direction, color, intensity.
        """
        return {
            'position': self.position,
            'direction': self.direction,
            'color': self.color,
            'intensity': self.intensity,
            'ambient': self.ambient
        }

    def get_direction_to(self, position):
        """
        Get direction from a world position to the sun.

        Args:
            position (tuple): World position (x, y, z).

        Returns:
            tuple: Normalized direction vector toward sun.
        """
        dx = self.position[0] - position[0]
        dy = self.position[1] - position[1]
        dz = self.position[2] - position[2]
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        if length < 0.0001:
            return (0.0, 1.0, 0.0)
        return (dx/length, dy/length, dz/length)


class LightingSystem:
    """
    Manages lighting calculations for the voxel world.

    Light levels range from 1 (minimum visible) to 15 (full sunlight).
    Level 0 represents absence of light and is never used for visible blocks.

    Attributes:
        chunk_manager: Reference to the chunk manager.
        sun (Sun): The world's sun light source.
        max_light (int): Maximum light level (15).
        min_light (int): Minimum visible light level (1).
    """

    def __init__(self, chunk_manager):
        """
        Initialize a new LightingSystem instance.

        Args:
            chunk_manager: ChunkManager for block data access.
        """
        self.chunk_manager = chunk_manager
        self.sun = Sun()
        self.max_light = 15
        self.min_light = 1

    def calculate_chunk_lighting(self, chunk):
        """
        Calculate all lighting for a chunk.

        Args:
            chunk: Chunk object to calculate lighting for.
        """
        if chunk.blocks is None:
            return

        self.propagate_skylight(chunk)

    def propagate_skylight(self, chunk):
        """
        Propagate skylight from the top of a chunk downward.

        Skylight starts at max level (15) at the top of the world
        and decreases by 1 for each solid block encountered.

        Args:
            chunk: Chunk object to propagate skylight in.
        """
        from settings import CHUNK_SIZE, CHUNK_HEIGHT, AIR

        if chunk.sky_light is None or chunk.blocks is None:
            return

        for lx in range(CHUNK_SIZE):
            for lz in range(CHUNK_SIZE):
                light_level = self.max_light

                # Propagate from top to bottom
                for ly in range(CHUNK_HEIGHT - 1, -1, -1):
                    index = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + ly

                    if chunk.blocks[index] != AIR:
                        # Solid block reduces light
                        light_level = max(self.min_light, light_level - 1)

                    chunk.sky_light[index] = light_level

    def propagate_block_light(self, x, y, z, light_level):
        """
        Propagate light from a light source to surrounding blocks.

        Uses flood-fill algorithm to spread light to neighbors.

        Args:
            x (int): Light source X position.
            y (int): Light source Y position.
            z (int): Light source Z position.
            light_level (int): Initial light level (1-15).
        """
        from settings import CHUNK_HEIGHT

        if light_level < self.min_light:
            return

        # BFS queue: (x, y, z, level)
        queue = [(x, y, z, light_level)]
        visited = set()

        while queue:
            cx, cy, cz, level = queue.pop(0)

            if (cx, cy, cz) in visited:
                continue
            visited.add((cx, cy, cz))

            if cy < 0 or cy >= CHUNK_HEIGHT:
                continue

            # Set light level (would need chunk access)
            # For now, this is a placeholder for future implementation

            # Spread to neighbors with reduced light
            if level > self.min_light:
                next_level = level - 1
                for dx, dy, dz in [(1,0,0), (-1,0,0), (0,1,0), (0,-1,0), (0,0,1), (0,0,-1)]:
                    nx, ny, nz = cx + dx, cy + dy, cz + dz
                    if (nx, ny, nz) not in visited:
                        queue.append((nx, ny, nz, next_level))

    def update_light_at(self, x, y, z):
        """
        Recalculate lighting after a block change.

        Args:
            x (int): Block X position.
            y (int): Block Y position.
            z (int): Block Z position.
        """
        # Get the chunk containing this block
        from settings import CHUNK_SIZE

        cx = x // CHUNK_SIZE
        cz = z // CHUNK_SIZE

        if self.chunk_manager:
            chunk = self.chunk_manager.get_chunk(cx, cz)
            if chunk:
                self.propagate_skylight(chunk)

    def get_light_level(self, x, y, z):
        """
        Get the combined light level at a position.

        Returns the maximum of sky light and block light.

        Args:
            x (int): Block X position.
            y (int): Block Y position.
            z (int): Block Z position.

        Returns:
            int: Light level (1-15).
        """
        from settings import CHUNK_SIZE, CHUNK_HEIGHT

        if y < 0 or y >= CHUNK_HEIGHT:
            return self.max_light if y >= CHUNK_HEIGHT else self.min_light

        cx = x // CHUNK_SIZE
        cz = z // CHUNK_SIZE
        lx = x % CHUNK_SIZE
        lz = z % CHUNK_SIZE

        if self.chunk_manager:
            chunk = self.chunk_manager.get_chunk(cx, cz)
            if chunk and chunk.sky_light:
                index = (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + y
                sky = chunk.sky_light[index]
                block = chunk.block_light[index] if chunk.block_light else 0
                return max(sky, block, self.min_light)

        return self.max_light

    def get_sun(self):
        """
        Get the sun light source.

        Returns:
            Sun: The world's sun instance.
        """
        return self.sun
