#!/usr/bin/env python3
"""
PythonicVox - Main Entry Point

This is the main entry point for the PythonicVox voxel engine.
Run this file to start the game.

Usage:
    python main.py

The game engine uses pygame-ce for windowing/input and a custom
3D renderer for voxel rendering.

Architecture:
    - State machine pattern manages transitions between menu and game
    - Events collected once per frame and passed to active state
    - Menu returns signals for state transitions (doesn't call quit directly)
    - GameState handles all in-game logic and rendering
"""

import pygame
from settings import (
    WINDOW_TITLE, WINDOW_WIDTH, WINDOW_HEIGHT,
    FPS_CAP, COLOR_BG, COLOR_DARK_BG
)
from ui.main_menu import MainMenu
from ui.settings_menu import SettingsMenu
from ui.create_world_menu import CreateWorldMenu
from game_state import GameState


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
    create_world_menu = CreateWorldMenu(screen)
    game_state = None  # Created when entering game
    world_config = None  # Stores config from create world menu

    print("Creating settings menu...")
    print("Creating world menu...")
    print("Starting game loop...")
    print("=" * 40)

    running = True
    while running:
        # Calculate delta time
        delta_time = clock.tick(FPS_CAP) / 1000.0  # Convert ms to seconds

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
                current_state = "create_world"
                print("[Game] Opening world creation menu...")
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

        elif current_state == "create_world":
            result, config = create_world_menu.update(events)

            if result == "main_menu":
                current_state = "main_menu"
            elif result == "start_game":
                print(f"[Game] Starting game with config: {config}")
                world_config = config
                # Create the game state with world config
                game_state = GameState(screen, world_config)
                current_state = "game"

            # Render create world menu
            screen.fill(COLOR_DARK_BG)
            create_world_menu.draw(screen)

        elif current_state == "game":
            if game_state is None:
                # Fallback: create game state without config
                game_state = GameState(screen, {})

            # Update game state
            result = game_state.update(events, delta_time)

            if result == "main_menu":
                # Clean up game state
                game_state.cleanup()
                game_state = None
                current_state = "main_menu"
                print("[Game] Returning to main menu")
            else:
                # Render game
                game_state.draw(screen)

        # Update display
        pygame.display.flip()

    print("=" * 40)
    print("Shutting down...")
    if game_state:
        game_state.cleanup()
    pygame.quit()


if __name__ == "__main__":
    main()
