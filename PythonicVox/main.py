#!/usr/bin/env python3
"""
PythonicVox - Main Entry Point

This is the main entry point for the PythonicVox voxel engine.
Run this file to start the game.

Usage:
    python main.py

The game engine uses Ursina for rendering and provides a Minecraft-inspired
voxel exploration experience with procedural terrain generation.
"""

from ursina import Ursina, window, color

import settings
from ui.main_menu import MainMenu


# Global references for game state
app = None
main_menu = None


def main():
    """
    Initialize and run the voxel engine.

    This function sets up the Ursina application with window settings,
    creates the main menu, and enters the main game loop.
    """
    global app, main_menu

    print("PythonicVox - Voxel Engine")
    print("=" * 40)
    print("Initializing Ursina...")

    # Initialize Ursina application with window settings
    app = Ursina(
        title=settings.WINDOW_TITLE,
        borderless=settings.WINDOW_BORDERLESS,
        fullscreen=settings.FULLSCREEN,
        size=settings.WINDOW_SIZE,
        development_mode=True,
        vsync=True
    )

    # Set window background color
    window.color = color.color(0, 0, 0.05)

    # Create and display the main menu
    print("Creating main menu...")
    main_menu = MainMenu()

    print("Starting game loop...")
    print("=" * 40)

    # Run the application
    app.run()


if __name__ == "__main__":
    main()
