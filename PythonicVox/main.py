#!/usr/bin/env python3
"""
PythonicVox - Main Entry Point

This is the main entry point for the PythonicVox voxel engine.
Run this file to start the game.

Usage:
    python main.py

The game engine uses pygame-ce for windowing/input and moderngl for
3D rendering. The main menu uses pygame's 2D rendering capabilities,
while the game state will use moderngl for voxel rendering.

Architecture:
    - State machine pattern manages transitions between menu and game
    - Events collected once per frame and passed to active state
    - Menu returns signals for state transitions (doesn't call quit directly)
"""

import pygame
from settings import (
    WINDOW_TITLE, WINDOW_WIDTH, WINDOW_HEIGHT,
    FPS_CAP, COLOR_BG
)
from ui.main_menu import MainMenu
from ui.settings_menu import SettingsMenu


def main():
    """
    Initialize and run the voxel engine.

    Sets up the pygame display, creates the main menu, and enters
    the main game loop with state-based update and rendering.
    """
    print("PythonicVox - Voxel Engine")
    print("=" * 40)
    print("Initializing pygame...")

    # Initialize pygame
    pygame.init()
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption(WINDOW_TITLE)
    clock = pygame.time.Clock()

    print(f"Window: {WINDOW_WIDTH}x{WINDOW_HEIGHT}")
    print("Creating main menu...")

    # Game state management
    current_state = "main_menu"
    main_menu = MainMenu(screen)
    settings_menu = SettingsMenu(screen)

    print("Creating settings menu...")
    print("Starting game loop...")
    print("=" * 40)

    running = True
    while running:
        # Collect events once per frame
        events = pygame.event.get()

        # Handle global events
        for event in events:
            if event.type == pygame.QUIT:
                running = False

        # State-based update and render
        if current_state == "main_menu":
            result = main_menu.update(events)

            if result == "quit":
                running = False
            elif result == "start_game":
                current_state = "game"
                print("[Game] Starting new game... (moderngl integration pending)")
            elif result == "load_game":
                print("[Game] Load game not implemented yet")
            elif result == "settings":
                current_state = "settings"
                print("[Game] Opening settings menu...")

            # Render menu
            screen.fill(COLOR_BG)
            main_menu.draw(screen)

        elif current_state == "settings":
            result = settings_menu.update(events)

            if result == "main_menu":
                current_state = "main_menu"

            # Render settings menu
            screen.fill(COLOR_BG)
            settings_menu.draw(screen)

        elif current_state == "game":
            # Future: moderngl 3D rendering
            # ctx = moderngl.create_context()
            screen.fill((30, 40, 50))

            # Placeholder text
            font = pygame.font.Font(None, 48)
            text = font.render("Game State - Press ESC for menu", True, (200, 200, 200))
            text_rect = text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2))
            screen.blit(text, text_rect)

            # Handle ESC to return to menu
            for event in events:
                if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    current_state = "main_menu"
                    print("[Game] Returning to main menu")

        # Update display
        pygame.display.flip()
        clock.tick(FPS_CAP)

    print("=" * 40)
    print("Shutting down...")
    pygame.quit()


if __name__ == "__main__":
    main()
