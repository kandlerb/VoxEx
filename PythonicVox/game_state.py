"""
Game state for PythonicVox.

This module contains the GameState class which manages the in-game state,
including world rendering, player control, and game logic.

Classes:
    GameState: Manages the active game session.

Usage:
    from game_state import GameState

    game = GameState(screen, world_config)
    result = game.update(events, delta_time)
    game.draw(screen)
"""

import pygame
import math
from settings import (
    WINDOW_WIDTH, WINDOW_HEIGHT, CHUNK_SIZE, CHUNK_HEIGHT,
    AIR, GRASS, DIRT, STONE, BEDROCK,
    COLOR_TEXT_PRIMARY
)
from entities.player import Player
from systems.camera import CameraController
from systems.input_handler import InputHandler
from systems.lighting import LightingSystem, Sun
from world.terrain import TerrainGenerator
from world.chunks import ChunkManager


# Block colors for rendering (RGB)
BLOCK_COLORS = {
    AIR: None,  # Don't render air
    GRASS: (34, 139, 34),    # Forest green
    DIRT: (139, 90, 43),     # Brown
    STONE: (128, 128, 128),  # Gray
    BEDROCK: (48, 48, 48),   # Dark gray
}


class GameState:
    """
    Manages the active game session.

    Handles world generation, player control, camera, and rendering
    for the in-game state.

    Attributes:
        screen: Pygame screen surface.
        player (Player): The player entity.
        camera (CameraController): First-person camera.
        input_handler (InputHandler): Input manager.
        chunk_manager (ChunkManager): World chunk manager.
        lighting (LightingSystem): Lighting system with sun.
        running (bool): Whether the game is running.
    """

    def __init__(self, screen, world_config=None):
        """
        Initialize a new game session.

        Args:
            screen: Pygame screen surface.
            world_config (dict): World configuration from create world menu.
        """
        self.screen = screen
        self.world_config = world_config or {}

        # Get seed from config or generate random
        seed = self.world_config.get('seed', None)
        if seed == '' or seed is None:
            import random
            seed = random.randint(0, 2**32 - 1)
        elif isinstance(seed, str):
            # Convert string seed to integer
            seed = hash(seed) & 0xFFFFFFFF

        print(f"[Game] Initializing world with seed: {seed}")

        # Initialize terrain generator (flat mode)
        self.terrain_generator = TerrainGenerator(seed=seed, flat_mode=True)

        # Initialize chunk manager with small render distance for performance
        self.chunk_manager = ChunkManager(self.terrain_generator, render_distance=4)

        # Initialize player at spawn point (on top of flat terrain)
        spawn_y = 65.0  # Just above grass level (63)
        self.player = Player(position=(0.0, spawn_y, 0.0))

        # Initialize camera
        self.camera = CameraController(self.player, fov=75.0, sensitivity=0.15)

        # Initialize input handler
        self.input_handler = InputHandler()

        # Initialize lighting with sun
        self.lighting = LightingSystem(self.chunk_manager)

        # Game state
        self.running = True
        self.game_time = 0.0

        # Pre-generate chunks around spawn
        print("[Game] Pre-generating terrain...")
        self.chunk_manager.update(self.player.get_position())
        print(f"[Game] Loaded {len(self.chunk_manager.chunks)} chunks")

        # Font for debug info
        self.debug_font = pygame.font.Font(None, 24)
        self.show_debug = True

        # Lock mouse for first-person control
        self.input_handler.lock_mouse()

    def update(self, events, delta_time):
        """
        Update game state for the current frame.

        Args:
            events (list): Pygame events for this frame.
            delta_time (float): Time since last frame in seconds.

        Returns:
            str or None: 'main_menu' to return to menu, None to continue.
        """
        self.game_time += delta_time

        # Update input handler
        self.input_handler.update(events)

        # Check for ESC to return to menu
        for event in events:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self.input_handler.unlock_mouse()
                    return 'main_menu'
                elif event.key == pygame.K_F3:
                    self.show_debug = not self.show_debug
                elif event.key == pygame.K_f:
                    self.player.toggle_flight()

        # Handle mouse look
        if self.input_handler.mouse_locked:
            self.camera.update(delta_time, self.input_handler.mouse_delta)

        # Get camera-relative movement direction
        move_dir = self.input_handler.get_movement_vector(self.camera.yaw)
        vertical_input = self.input_handler.get_vertical_input()

        # Update sprint state
        self.player.set_sprinting(self.input_handler.is_action_pressed('sprint'))

        # Handle jump
        if self.input_handler.is_action_just_pressed('jump'):
            self.player.jump(self.game_time)

        # Update player position
        self.player.update(delta_time, move_dir, vertical_input)

        # Apply sprint FOV
        self.camera.apply_sprint_fov(self.player.is_sprinting, delta_time)

        # Apply view bob when moving
        is_moving = abs(move_dir[0]) > 0.01 or abs(move_dir[1]) > 0.01
        self.camera.apply_view_bob(is_moving, self.player.is_sprinting, delta_time)

        # Update chunks around player
        self.chunk_manager.update(self.player.get_position())

        return None

    def draw(self, screen):
        """
        Render the game world to the screen.

        Uses a simple pseudo-3D rendering approach with pygame.

        Args:
            screen: Pygame screen surface.
        """
        # Clear screen with sky color
        sky_color = (135, 206, 235)  # Light blue
        screen.fill(sky_color)

        # Get camera data
        cam_pos = self.camera.get_position()
        cam_dir = self.camera.get_direction()

        # Render the world using raycasting-style projection
        self._render_world(screen, cam_pos, cam_dir)

        # Draw crosshair
        self._draw_crosshair(screen)

        # Draw HUD
        self._draw_hud(screen)

        # Draw debug info if enabled
        if self.show_debug:
            self._draw_debug(screen)

    def _render_world(self, screen, cam_pos, cam_dir):
        """
        Render the voxel world using simple 3D projection.

        This uses a basic raymarching/projection approach to render
        visible blocks as colored rectangles.

        Args:
            screen: Pygame screen surface.
            cam_pos (tuple): Camera position (x, y, z).
            cam_dir (tuple): Camera look direction.
        """
        width = WINDOW_WIDTH
        height = WINDOW_HEIGHT
        half_width = width // 2
        half_height = height // 2

        # Get sun for lighting
        sun = self.lighting.get_sun()
        sun_dir = sun.direction

        # Camera orientation
        yaw_rad = math.radians(self.camera.yaw)
        pitch_rad = math.radians(self.camera.pitch)

        # Forward, right, up vectors
        cos_yaw = math.cos(yaw_rad)
        sin_yaw = math.sin(yaw_rad)
        cos_pitch = math.cos(pitch_rad)
        sin_pitch = math.sin(pitch_rad)

        # Collect visible faces
        faces = []

        # Render chunks in view
        render_range = 3  # Chunks to render
        player_cx = int(cam_pos[0]) // CHUNK_SIZE
        player_cz = int(cam_pos[2]) // CHUNK_SIZE

        for dx in range(-render_range, render_range + 1):
            for dz in range(-render_range, render_range + 1):
                cx = player_cx + dx
                cz = player_cz + dz
                chunk = self.chunk_manager.get_chunk(cx, cz)

                if chunk and chunk.blocks:
                    self._collect_chunk_faces(
                        faces, chunk, cam_pos,
                        sin_yaw, cos_yaw, sin_pitch, cos_pitch,
                        sun_dir
                    )

        # Sort faces by distance (painter's algorithm - back to front)
        faces.sort(key=lambda f: -f['dist'])

        # Draw faces
        for face in faces:
            pygame.draw.polygon(screen, face['color'], face['points'])

    def _collect_chunk_faces(self, faces, chunk, cam_pos, sin_yaw, cos_yaw, sin_pitch, cos_pitch, sun_dir):
        """
        Collect visible block faces from a chunk.

        Args:
            faces (list): List to append face data to.
            chunk: Chunk to process.
            cam_pos (tuple): Camera position.
            sin_yaw, cos_yaw, sin_pitch, cos_pitch: Precomputed trig values.
            sun_dir (tuple): Sun light direction.
        """
        fov_factor = 1.0 / math.tan(math.radians(self.camera.fov / 2))
        half_width = WINDOW_WIDTH // 2
        half_height = WINDOW_HEIGHT // 2
        aspect = WINDOW_WIDTH / WINDOW_HEIGHT

        # Only render blocks near the surface for performance
        # For flat terrain, blocks are at y=0-63
        min_y = max(0, int(cam_pos[1]) - 10)
        max_y = min(CHUNK_HEIGHT, int(cam_pos[1]) + 10)

        # World offset for this chunk
        world_x_offset = chunk.cx * CHUNK_SIZE
        world_z_offset = chunk.cz * CHUNK_SIZE

        for lx in range(CHUNK_SIZE):
            for lz in range(CHUNK_SIZE):
                for ly in range(min_y, max_y):
                    block_type = chunk.get_block(lx, ly, lz)

                    if block_type == AIR:
                        continue

                    # World position of block center
                    wx = world_x_offset + lx + 0.5
                    wy = ly + 0.5
                    wz = world_z_offset + lz + 0.5

                    # Distance to camera
                    dx = wx - cam_pos[0]
                    dy = wy - cam_pos[1]
                    dz = wz - cam_pos[2]
                    dist = math.sqrt(dx*dx + dy*dy + dz*dz)

                    # Skip if too far
                    if dist > 50:
                        continue

                    # Skip if behind camera (basic culling)
                    # Transform to camera space
                    # Rotate around Y (yaw)
                    rx = dx * cos_yaw - dz * sin_yaw
                    rz = dx * sin_yaw + dz * cos_yaw

                    # Skip if behind
                    if rz < 0.1:
                        continue

                    # Get block color
                    base_color = BLOCK_COLORS.get(block_type, (200, 200, 200))
                    if base_color is None:
                        continue

                    # Project block to screen
                    # Simple perspective projection
                    screen_x = half_width + (rx / rz) * fov_factor * half_width

                    # Rotate around X (pitch)
                    ry_pitched = dy * cos_pitch - rz * sin_pitch
                    rz_pitched = dy * sin_pitch + rz * cos_pitch

                    screen_y = half_height - (ry_pitched / rz) * fov_factor * half_height

                    # Block size on screen
                    block_screen_size = (1.0 / rz) * fov_factor * half_width * 0.8

                    if block_screen_size < 1:
                        continue

                    # Calculate lighting based on block face
                    # Top faces are brighter
                    # Use simple directional lighting
                    light_factor = 0.7 + 0.3 * max(0, -sun_dir[1])

                    # Apply lighting
                    lit_color = (
                        int(base_color[0] * light_factor),
                        int(base_color[1] * light_factor),
                        int(base_color[2] * light_factor)
                    )

                    # Create screen-space quad
                    half_size = block_screen_size / 2
                    points = [
                        (screen_x - half_size, screen_y - half_size),
                        (screen_x + half_size, screen_y - half_size),
                        (screen_x + half_size, screen_y + half_size),
                        (screen_x - half_size, screen_y + half_size),
                    ]

                    # Skip if completely off screen
                    if screen_x + half_size < 0 or screen_x - half_size > WINDOW_WIDTH:
                        continue
                    if screen_y + half_size < 0 or screen_y - half_size > WINDOW_HEIGHT:
                        continue

                    faces.append({
                        'color': lit_color,
                        'points': points,
                        'dist': dist
                    })

    def _draw_crosshair(self, screen):
        """Draw crosshair in center of screen."""
        cx = WINDOW_WIDTH // 2
        cy = WINDOW_HEIGHT // 2
        size = 10
        thickness = 2
        color = (255, 255, 255)

        # Horizontal line
        pygame.draw.line(screen, color, (cx - size, cy), (cx + size, cy), thickness)
        # Vertical line
        pygame.draw.line(screen, color, (cx, cy - size), (cx, cy + size), thickness)

    def _draw_hud(self, screen):
        """Draw heads-up display elements."""
        # Flight mode indicator
        if self.player.is_flying:
            text = self.debug_font.render("FLYING", True, (255, 255, 100))
            screen.blit(text, (WINDOW_WIDTH - 100, 10))

        # Sprint indicator
        if self.player.is_sprinting:
            text = self.debug_font.render("SPRINTING", True, (255, 200, 100))
            screen.blit(text, (WINDOW_WIDTH - 100, 30))

    def _draw_debug(self, screen):
        """Draw debug information overlay."""
        pos = self.player.get_position()
        lines = [
            f"PythonicVox Debug (F3 to toggle)",
            f"",
            f"Position: ({pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f})",
            f"Yaw: {self.camera.yaw:.1f}  Pitch: {self.camera.pitch:.1f}",
            f"FOV: {self.camera.fov:.1f}",
            f"",
            f"Chunks loaded: {len(self.chunk_manager.chunks)}",
            f"Flying: {self.player.is_flying}",
            f"",
            f"Controls:",
            f"  WASD - Move (camera relative)",
            f"  Mouse - Look",
            f"  SPACE - Jump/Fly up",
            f"  C - Crouch/Fly down",
            f"  SHIFT - Sprint",
            f"  F - Toggle flight",
            f"  ESC - Menu",
        ]

        y = 10
        for line in lines:
            text = self.debug_font.render(line, True, (255, 255, 255))
            # Draw shadow
            shadow = self.debug_font.render(line, True, (0, 0, 0))
            screen.blit(shadow, (11, y + 1))
            screen.blit(text, (10, y))
            y += 20

    def cleanup(self):
        """Clean up resources when leaving game state."""
        self.input_handler.unlock_mouse()
