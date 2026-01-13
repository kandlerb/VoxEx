"""
Main menu for PythonicVox.

This module contains the MainMenu class which manages the main menu screen
using pygame for 2D rendering. The menu handles user input for navigation
and returns state change signals to the main game loop.

Classes:
    MainMenu: Manages the main menu interface with pygame.

Usage:
    from ui.main_menu import MainMenu

    menu = MainMenu(screen)
    result = menu.update(events)
    menu.draw(screen)
"""

import pygame
import settings
from utils.helpers import draw_text_centered


class MainMenu:
    """
    Manages the main menu interface using pygame.

    Renders a centered menu with title text and navigation buttons.
    Handles mouse hover states and click events, returning state
    change signals to the main game loop.

    Attributes:
        screen (pygame.Surface): Reference to the display surface.
        buttons (list): List of (label, rect, callback) tuples.
        hovered_button (int): Index of currently hovered button, or -1.
        title_font (pygame.font.Font): Font for title text.
        button_font (pygame.font.Font): Font for button text.
    """

    def __init__(self, screen):
        """
        Initialize a new MainMenu instance.

        Args:
            screen (pygame.Surface): The pygame display surface.
        """
        self.screen = screen
        self.hovered_button = -1

        # Initialize fonts
        self.title_font = pygame.font.Font(None, settings.TITLE_FONT_SIZE)
        self.subtitle_font = pygame.font.Font(None, 32)
        self.button_font = pygame.font.Font(None, settings.BUTTON_FONT_SIZE)
        self.version_font = pygame.font.Font(None, settings.VERSION_FONT_SIZE)

        # Button definitions: (label, callback_result)
        self.button_data = [
            ("New Game", "start_game"),
            ("Load Game", "load_game"),
            ("Settings", "settings"),
            ("Quit", "quit"),
        ]

        # Build button rectangles
        self.buttons = self._create_buttons()

    def _create_buttons(self):
        """
        Create button rectangles centered on screen.

        Returns:
            list: List of (label, rect, result) tuples.
        """
        buttons = []
        screen_width = self.screen.get_width()
        screen_height = self.screen.get_height()

        # Calculate total height of button group
        num_buttons = len(self.button_data)
        total_height = (
            num_buttons * settings.BUTTON_HEIGHT +
            (num_buttons - 1) * settings.BUTTON_SPACING
        )

        # Start position (centered vertically, slightly below center)
        start_y = (screen_height - total_height) // 2 + 40

        for i, (label, result) in enumerate(self.button_data):
            x = (screen_width - settings.BUTTON_WIDTH) // 2
            y = start_y + i * (settings.BUTTON_HEIGHT + settings.BUTTON_SPACING)
            rect = pygame.Rect(x, y, settings.BUTTON_WIDTH, settings.BUTTON_HEIGHT)
            buttons.append((label, rect, result))

        return buttons

    def update(self, events):
        """
        Process input events and update menu state.

        Args:
            events (list): List of pygame events from the main loop.

        Returns:
            str or None: State change signal ("quit", "start_game", etc.)
                         or None if no state change.
        """
        mouse_pos = pygame.mouse.get_pos()

        # Update hover state
        self.hovered_button = -1
        for i, (label, rect, result) in enumerate(self.buttons):
            if rect.collidepoint(mouse_pos):
                self.hovered_button = i
                break

        # Handle click events
        for event in events:
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                for i, (label, rect, result) in enumerate(self.buttons):
                    if rect.collidepoint(event.pos):
                        return self._handle_button_click(i, result)

        return None

    def _handle_button_click(self, index, result):
        """
        Handle a button click and return appropriate signal.

        Args:
            index (int): Button index that was clicked.
            result (str): The result string for this button.

        Returns:
            str: State change signal.
        """
        label = self.button_data[index][0]
        print(f"[MainMenu] {label} clicked")
        return result

    def draw(self, screen):
        """
        Render the main menu to the screen.

        Args:
            screen (pygame.Surface): Surface to draw on.
        """
        screen_width = screen.get_width()
        screen_height = screen.get_height()

        # Draw title
        title_y = screen_height // 4
        draw_text_centered(
            screen,
            "PythonicVox",
            self.title_font,
            settings.COLOR_TITLE,
            (screen_width // 2, title_y)
        )

        # Draw subtitle
        draw_text_centered(
            screen,
            "A Voxel Adventure",
            self.subtitle_font,
            settings.COLOR_SUBTITLE,
            (screen_width // 2, title_y + 50)
        )

        # Draw buttons
        for i, (label, rect, result) in enumerate(self.buttons):
            # Determine button color based on hover state
            if i == self.hovered_button:
                color = settings.COLOR_BUTTON_HOVER
            else:
                color = settings.COLOR_BUTTON

            # Draw button background
            pygame.draw.rect(screen, color, rect, border_radius=8)

            # Draw button border
            border_color = (100, 100, 130) if i == self.hovered_button else (80, 80, 100)
            pygame.draw.rect(screen, border_color, rect, width=2, border_radius=8)

            # Draw button text
            draw_text_centered(
                screen,
                label,
                self.button_font,
                settings.COLOR_TEXT,
                rect.center
            )

        # Draw version text in bottom right
        version_text = "v0.1.0"
        version_surface = self.version_font.render(version_text, True, settings.COLOR_VERSION)
        version_rect = version_surface.get_rect(bottomright=(screen_width - 20, screen_height - 20))
        screen.blit(version_surface, version_rect)
