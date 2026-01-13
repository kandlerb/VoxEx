"""
Chunk management for PythonicVox.

This module contains the ChunkManager class which handles chunk loading,
unloading, caching, and coordination between terrain generation and rendering.

Classes:
    ChunkManager: Manages chunk lifecycle and data access.
    Chunk: Represents a single chunk of blocks.

Usage:
    from world.chunks import ChunkManager

    chunks = ChunkManager(terrain_generator)
    chunks.update(player_position)
    block = chunks.get_block(x, y, z)
"""

from settings import CHUNK_SIZE, CHUNK_HEIGHT, AIR


class Chunk:
    """
    Represents a 16x16x320 chunk of blocks.

    Attributes:
        cx (int): Chunk X coordinate.
        cz (int): Chunk Z coordinate.
        blocks (list): Block data array.
        sky_light (list): Skylight data array.
        block_light (list): Block light data array.
        is_dirty (bool): Whether chunk needs re-rendering.
        mesh: Rendered mesh for this chunk.
    """

    def __init__(self, cx, cz):
        """
        Initialize a new Chunk instance.

        Args:
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.
        """
        self.cx = cx
        self.cz = cz
        self.blocks = None
        self.sky_light = None
        self.block_light = None
        self.is_dirty = True
        self.mesh = None

    def load_data(self, chunk_data):
        """
        Load chunk data from terrain generator.

        Args:
            chunk_data (dict): Dict with 'blocks', 'sky_light', 'block_light'.
        """
        self.blocks = chunk_data['blocks']
        self.sky_light = chunk_data['sky_light']
        self.block_light = chunk_data['block_light']
        self.is_dirty = True

    def _get_index(self, lx, ly, lz):
        """
        Convert local coordinates to array index.

        Args:
            lx (int): Local X (0-15).
            ly (int): Local Y (0-319).
            lz (int): Local Z (0-15).

        Returns:
            int: Array index.
        """
        return (lx * CHUNK_SIZE + lz) * CHUNK_HEIGHT + ly

    def get_block(self, lx, ly, lz):
        """
        Get block type at local coordinates.

        Args:
            lx (int): Local X (0-15).
            ly (int): Local Y (0-319).
            lz (int): Local Z (0-15).

        Returns:
            int: Block type ID, or AIR if out of bounds or not loaded.
        """
        if self.blocks is None:
            return AIR

        if not (0 <= lx < CHUNK_SIZE and 0 <= lz < CHUNK_SIZE and 0 <= ly < CHUNK_HEIGHT):
            return AIR

        index = self._get_index(lx, ly, lz)
        return self.blocks[index]

    def set_block(self, lx, ly, lz, block_type):
        """
        Set block type at local coordinates.

        Args:
            lx (int): Local X (0-15).
            ly (int): Local Y (0-319).
            lz (int): Local Z (0-15).
            block_type (int): Block type ID to set.
        """
        if self.blocks is None:
            return

        if not (0 <= lx < CHUNK_SIZE and 0 <= lz < CHUNK_SIZE and 0 <= ly < CHUNK_HEIGHT):
            return

        index = self._get_index(lx, ly, lz)
        self.blocks[index] = block_type
        self.is_dirty = True

    def get_world_bounds(self):
        """
        Get world coordinate bounds for this chunk.

        Returns:
            tuple: ((min_x, min_z), (max_x, max_z)) in world coordinates.
        """
        min_x = self.cx * CHUNK_SIZE
        min_z = self.cz * CHUNK_SIZE
        max_x = min_x + CHUNK_SIZE
        max_z = min_z + CHUNK_SIZE
        return ((min_x, min_z), (max_x, max_z))


class ChunkManager:
    """
    Manages chunk loading, unloading, and data access.

    Attributes:
        chunks (dict): Loaded chunks indexed by (cx, cz) tuple.
        terrain_generator: TerrainGenerator for creating new chunks.
        render_distance (int): Chunks to load in each direction.
    """

    def __init__(self, terrain_generator, render_distance=8):
        """
        Initialize a new ChunkManager instance.

        Args:
            terrain_generator: TerrainGenerator for new chunks.
            render_distance (int): Number of chunks to load around player.
        """
        self.chunks = {}
        self.terrain_generator = terrain_generator
        self.render_distance = render_distance

    def update(self, player_position):
        """
        Update loaded chunks based on player position.

        Loads chunks within render distance and unloads distant chunks.

        Args:
            player_position (tuple): Player position (x, y, z).
        """
        px, py, pz = player_position
        center_cx = int(px) // CHUNK_SIZE
        center_cz = int(pz) // CHUNK_SIZE

        # Load chunks within render distance
        for dx in range(-self.render_distance, self.render_distance + 1):
            for dz in range(-self.render_distance, self.render_distance + 1):
                cx = center_cx + dx
                cz = center_cz + dz
                key = (cx, cz)

                if key not in self.chunks:
                    self._load_chunk(cx, cz)

        # Unload distant chunks
        self.unload_distant_chunks(center_cx, center_cz)

    def _load_chunk(self, cx, cz):
        """
        Load or generate a chunk at coordinates.

        Args:
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.
        """
        chunk = Chunk(cx, cz)
        chunk_data = self.terrain_generator.generate_chunk(cx, cz)
        chunk.load_data(chunk_data)
        self.chunks[(cx, cz)] = chunk

    def get_chunk(self, cx, cz):
        """
        Get or load a chunk at coordinates.

        Args:
            cx (int): Chunk X coordinate.
            cz (int): Chunk Z coordinate.

        Returns:
            Chunk: The chunk at the coordinates.
        """
        key = (cx, cz)
        if key not in self.chunks:
            self._load_chunk(cx, cz)
        return self.chunks[key]

    def get_block(self, x, y, z):
        """
        Get block at world coordinates.

        Args:
            x (int): World X position.
            y (int): World Y position.
            z (int): World Z position.

        Returns:
            int: Block type ID, or 0 (AIR) if out of bounds.
        """
        if y < 0 or y >= CHUNK_HEIGHT:
            return AIR

        # Convert to chunk and local coordinates
        cx = x // CHUNK_SIZE
        cz = z // CHUNK_SIZE
        lx = x % CHUNK_SIZE
        lz = z % CHUNK_SIZE

        # Handle negative coordinates
        if x < 0 and lx != 0:
            cx -= 1
            lx = CHUNK_SIZE + (x % CHUNK_SIZE)
        if z < 0 and lz != 0:
            cz -= 1
            lz = CHUNK_SIZE + (z % CHUNK_SIZE)

        chunk = self.get_chunk(cx, cz)
        return chunk.get_block(lx, y, lz)

    def set_block(self, x, y, z, block_type):
        """
        Set block at world coordinates.

        Args:
            x (int): World X position.
            y (int): World Y position.
            z (int): World Z position.
            block_type (int): Block type ID to set.
        """
        if y < 0 or y >= CHUNK_HEIGHT:
            return

        # Convert to chunk and local coordinates
        cx = x // CHUNK_SIZE
        cz = z // CHUNK_SIZE
        lx = x % CHUNK_SIZE
        lz = z % CHUNK_SIZE

        # Handle negative coordinates
        if x < 0 and lx != 0:
            cx -= 1
            lx = CHUNK_SIZE + (x % CHUNK_SIZE)
        if z < 0 and lz != 0:
            cz -= 1
            lz = CHUNK_SIZE + (z % CHUNK_SIZE)

        chunk = self.get_chunk(cx, cz)
        chunk.set_block(lx, y, lz, block_type)

    def unload_distant_chunks(self, center_cx, center_cz):
        """
        Unload chunks beyond render distance.

        Args:
            center_cx (int): Center chunk X coordinate.
            center_cz (int): Center chunk Z coordinate.
        """
        # Use a slightly larger unload distance to prevent thrashing
        unload_distance = self.render_distance + 2

        chunks_to_unload = []
        for key in self.chunks:
            cx, cz = key
            dx = abs(cx - center_cx)
            dz = abs(cz - center_cz)
            if dx > unload_distance or dz > unload_distance:
                chunks_to_unload.append(key)

        for key in chunks_to_unload:
            del self.chunks[key]

    def get_loaded_chunks(self):
        """
        Get all currently loaded chunks.

        Returns:
            list: List of Chunk objects.
        """
        return list(self.chunks.values())

    def get_chunks_in_range(self, center_x, center_z, distance):
        """
        Get chunks within a distance from a world position.

        Args:
            center_x (float): Center X world position.
            center_z (float): Center Z world position.
            distance (int): Number of chunks in each direction.

        Returns:
            list: List of Chunk objects in range.
        """
        center_cx = int(center_x) // CHUNK_SIZE
        center_cz = int(center_z) // CHUNK_SIZE

        result = []
        for dx in range(-distance, distance + 1):
            for dz in range(-distance, distance + 1):
                cx = center_cx + dx
                cz = center_cz + dz
                chunk = self.get_chunk(cx, cz)
                result.append(chunk)

        return result
