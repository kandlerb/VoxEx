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

# Face definitions for 3D rendering: (normal, light_factor, vertex_offsets, neighbor_offset)
# Each face has 4 vertices in counter-clockwise order when viewed from outside
FACE_DATA = (
    # Top face
    ((0, 1, 0), 1.0, ((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)), (0, 1, 0)),
    # Bottom face
    ((0, -1, 0), 0.5, ((0, 0, 1), (1, 0, 1), (1, 0, 0), (0, 0, 0)), (0, -1, 0)),
    # North face (Z-)
    ((0, 0, -1), 0.7, ((1, 0, 0), (0, 0, 0), (0, 1, 0), (1, 1, 0)), (0, 0, -1)),
    # South face (Z+)
    ((0, 0, 1), 0.7, ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)), (0, 0, 1)),
    # East face (X+)
    ((1, 0, 0), 0.8, ((1, 0, 1), (1, 0, 0), (1, 1, 0), (1, 1, 1)), (1, 0, 0)),
    # West face (X-)
    ((-1, 0, 0), 0.6, ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)), (-1, 0, 0)),
)


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
        Render the voxel world using proper 3D face projection.

        Renders cube faces with correct world-space vertices and
        face culling for exposed surfaces only.

        Args:
            screen: Pygame screen surface.
            cam_pos (tuple): Camera position (x, y, z).
            cam_dir (tuple): Camera look direction.
        """
        half_width = WINDOW_WIDTH // 2
        half_height = WINDOW_HEIGHT // 2

        # Get sun for lighting
        sun = self.lighting.get_sun()
        sun_dir = sun.direction

        # Camera orientation
        yaw_rad = math.radians(self.camera.yaw)
        pitch_rad = math.radians(self.camera.pitch)

        # Precompute trig values
        cos_yaw = math.cos(yaw_rad)
        sin_yaw = math.sin(yaw_rad)
        cos_pitch = math.cos(pitch_rad)
        sin_pitch = math.sin(pitch_rad)

        # FOV projection factor
        fov_factor = 1.0 / math.tan(math.radians(self.camera.fov / 2))

        # Collect visible faces
        faces = []

        # Render chunks in view
        render_range = 3
        player_cx = int(cam_pos[0]) // CHUNK_SIZE
        player_cz = int(cam_pos[2]) // CHUNK_SIZE

        for dx in range(-render_range, render_range + 1):
            for dz in range(-render_range, render_range + 1):
                cx = player_cx + dx
                cz = player_cz + dz
                chunk = self.chunk_manager.get_chunk(cx, cz)

                if chunk and chunk.blocks:
                    self._collect_chunk_faces_3d(
                        faces, chunk, cam_pos,
                        sin_yaw, cos_yaw, sin_pitch, cos_pitch,
                        fov_factor, half_width, half_height, sun_dir
                    )

        # Sort faces by distance (painter's algorithm - back to front)
        faces.sort(key=lambda f: -f['dist'])

        # Draw faces
        for face in faces:
            pygame.draw.polygon(screen, face['color'], face['points'])

    def _project_vertex(self, wx, wy, wz, cam_pos, sin_yaw, cos_yaw, sin_pitch, cos_pitch, fov_factor, half_width, half_height):
        """
        Project a 3D world vertex to 2D screen coordinates.

        Args:
            wx, wy, wz: World position of vertex.
            cam_pos: Camera position tuple.
            sin_yaw, cos_yaw, sin_pitch, cos_pitch: Precomputed trig values.
            fov_factor: FOV projection factor.
            half_width, half_height: Half screen dimensions.

        Returns:
            tuple: (screen_x, screen_y, depth) or None if behind camera.
        """
        # Translate to camera-relative position
        dx = wx - cam_pos[0]
        dy = wy - cam_pos[1]
        dz = wz - cam_pos[2]

        # Rotate around Y axis (yaw) - looking left/right
        rx = dx * cos_yaw + dz * sin_yaw
        rz = -dx * sin_yaw + dz * cos_yaw

        # Rotate around X axis (pitch) - looking up/down
        ry = dy * cos_pitch - rz * sin_pitch
        depth = dy * sin_pitch + rz * cos_pitch

        # Behind camera check
        if depth < 0.1:
            return None

        # Perspective projection
        screen_x = half_width + (rx / depth) * fov_factor * half_width
        screen_y = half_height - (ry / depth) * fov_factor * half_height

        return (screen_x, screen_y, depth)

    def _collect_chunk_faces_3d(self, faces, chunk, cam_pos, sin_yaw, cos_yaw, sin_pitch, cos_pitch, fov_factor, half_width, half_height, sun_dir):
        """
        Collect visible block faces from a chunk with proper 3D projection.

        Only renders exposed faces (adjacent to air) with correct world-space
        vertices for proper block alignment.

        Args:
            faces (list): List to append face data to.
            chunk: Chunk to process.
            cam_pos (tuple): Camera position.
            sin_yaw, cos_yaw, sin_pitch, cos_pitch: Precomputed trig values.
            fov_factor: FOV projection factor.
            half_width, half_height: Half screen dimensions.
            sun_dir (tuple): Sun light direction.
        """
        cam_x, cam_y, cam_z = cam_pos

        # Only render blocks near camera for performance
        min_y = max(0, int(cam_y) - 16)
        max_y = min(CHUNK_HEIGHT, int(cam_y) + 16)

        # World offset for this chunk
        world_x = chunk.cx * CHUNK_SIZE
        world_z = chunk.cz * CHUNK_SIZE

        # Screen bounds with margin
        screen_min_x = -100
        screen_max_x = WINDOW_WIDTH + 100
        screen_min_y = -100
        screen_max_y = WINDOW_HEIGHT + 100

        for lx in range(CHUNK_SIZE):
            for lz in range(CHUNK_SIZE):
                for ly in range(min_y, max_y):
                    block_type = chunk.get_block(lx, ly, lz)

                    if block_type == AIR:
                        continue

                    # World position of block origin (corner, not center)
                    bx = world_x + lx
                    by = ly
                    bz = world_z + lz

                    # Quick distance check to block center
                    dx = bx + 0.5 - cam_x
                    dy = by + 0.5 - cam_y
                    dz = bz + 0.5 - cam_z
                    dist_sq = dx*dx + dy*dy + dz*dz

                    # Skip if too far (40 block radius for performance)
                    if dist_sq > 1600:
                        continue

                    dist = math.sqrt(dist_sq)

                    # Get block base color
                    base_color = BLOCK_COLORS.get(block_type)
                    if base_color is None:
                        continue

                    # Check and render each face using module-level FACE_DATA
                    for normal, light, verts, offset in FACE_DATA:
                        # Check if neighbor is air (face is exposed)
                        ox, oy, oz = offset
                        neighbor_x = lx + ox
                        neighbor_y = ly + oy
                        neighbor_z = lz + oz

                        # Get neighbor block (handle chunk boundaries)
                        if 0 <= neighbor_x < CHUNK_SIZE and 0 <= neighbor_z < CHUNK_SIZE:
                            neighbor = chunk.get_block(neighbor_x, neighbor_y, neighbor_z)
                        else:
                            # Cross-chunk lookup
                            neighbor = self.chunk_manager.get_block(bx + ox, neighbor_y, bz + oz)

                        # Only render if neighbor is air
                        if neighbor != AIR:
                            continue

                        # Back-face culling: skip faces pointing away from camera
                        nx, ny, nz = normal
                        # Vector from face center to camera
                        to_cam_x = cam_x - (bx + 0.5 + nx * 0.5)
                        to_cam_y = cam_y - (by + 0.5 + ny * 0.5)
                        to_cam_z = cam_z - (bz + 0.5 + nz * 0.5)
                        dot = nx * to_cam_x + ny * to_cam_y + nz * to_cam_z
                        if dot < 0:
                            continue  # Face pointing away from camera

                        # Project all 4 vertices
                        screen_verts = []
                        all_visible = True
                        for vx, vy, vz in verts:
                            proj = self._project_vertex(
                                bx + vx, by + vy, bz + vz,
                                cam_pos, sin_yaw, cos_yaw, sin_pitch, cos_pitch,
                                fov_factor, half_width, half_height
                            )
                            if proj is None:
                                all_visible = False
                                break
                            screen_verts.append((proj[0], proj[1]))

                        if not all_visible:
                            continue

                        # Check if any vertex is on screen
                        on_screen = False
                        for sx, sy in screen_verts:
                            if screen_min_x <= sx <= screen_max_x and screen_min_y <= sy <= screen_max_y:
                                on_screen = True
                                break
                        if not on_screen:
                            continue

                        # Apply lighting
                        lit_color = (
                            min(255, int(base_color[0] * light)),
                            min(255, int(base_color[1] * light)),
                            min(255, int(base_color[2] * light))
                        )

                        faces.append({
                            'color': lit_color,
                            'points': screen_verts,
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
