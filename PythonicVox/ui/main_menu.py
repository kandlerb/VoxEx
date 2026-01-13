"""
Main menu for PythonicVox.

This module contains the MainMenu class which manages the main menu screen
including new game, load game, settings, and exit options.

Classes:
    MainMenu: Manages the main menu interface.

Usage:
    from ui.main_menu import MainMenu

    menu = MainMenu()
    menu.show()
"""

from ursina import (
    Entity, Text, Button, application, camera, color,
    window, Vec2, Vec3, destroy
)
import settings


class MainMenu(Entity):
    """
    Manages the main menu interface.

    Inherits from Entity to integrate with Ursina's scene graph.
    Creates a centered menu panel with title and navigation buttons.

    Attributes:
        is_visible (bool): Whether the menu is currently visible.
        buttons (list): List of menu button UI elements.
        background (Entity): Background panel element.
        title (Text): Title text element.
    """

    def __init__(self):
        """Initialize a new MainMenu instance and create UI elements."""
        super().__init__(
            parent=camera.ui,
            name='main_menu'
        )
        self.is_visible = True
        self.buttons = []
        self.background = None
        self.title = None
        self._setup()

    def _setup(self):
        """Create main menu UI elements."""
        # Background panel - full screen semi-transparent overlay
        self.background = Entity(
            parent=self,
            model='quad',
            color=settings.MENU_BG_COLOR,
            scale=(2, 1),  # Cover full screen in UI space
            z=0.1
        )

        # Title text
        self.title = Text(
            parent=self,
            text='PythonicVox',
            scale=3,
            origin=(0, 0),
            y=0.35,
            color=settings.TITLE_COLOR
        )

        # Subtitle
        self.subtitle = Text(
            parent=self,
            text='A Voxel Adventure',
            scale=1.2,
            origin=(0, 0),
            y=0.25,
            color=color.gray
        )

        # Button configuration
        button_data = [
            ('New Game', self.on_new_game),
            ('Load Game', self.on_load_game),
            ('Settings', self.on_settings),
            ('Quit', self.on_quit),
        ]

        # Create buttons with vertical spacing
        button_spacing = 0.1
        start_y = 0.05

        for i, (text, callback) in enumerate(button_data):
            btn = Button(
                parent=self,
                text=text,
                scale=(0.3, 0.08),
                y=start_y - (i * button_spacing),
                color=settings.BUTTON_COLOR,
                highlight_color=settings.BUTTON_HOVER_COLOR,
                text_color=settings.BUTTON_TEXT_COLOR
            )
            btn.on_click = callback
            self.buttons.append(btn)

        # Version text in corner
        self.version_text = Text(
            parent=self,
            text='v0.1.0',
            scale=0.8,
            origin=(1, -1),
            position=(0.48, -0.45),
            color=color.dark_gray
        )

    def show(self):
        """Show the main menu."""
        self.enabled = True
        self.is_visible = True

    def hide(self):
        """Hide the main menu."""
        self.enabled = False
        self.is_visible = False

    def on_new_game(self):
        """Handle new game button click."""
        print("[MainMenu] New Game clicked - starting new world...")
        # Placeholder: Will initialize game world

    def on_load_game(self):
        """Handle load game button click."""
        print("[MainMenu] Load Game clicked - opening save selection...")
        # Placeholder: Will show save file selection

    def on_settings(self):
        """Handle settings button click."""
        print("[MainMenu] Settings clicked - opening settings menu...")
        # Placeholder: Will show settings menu

    def on_quit(self):
        """Handle quit button click - exits the application."""
        print("[MainMenu] Quit clicked - exiting application...")
        application.quit()

    def destroy(self):
        """Clean up menu UI elements."""
        for btn in self.buttons:
            destroy(btn)
        self.buttons.clear()
        if self.background:
            destroy(self.background)
        if self.title:
            destroy(self.title)
        if hasattr(self, 'subtitle'):
            destroy(self.subtitle)
        if hasattr(self, 'version_text'):
            destroy(self.version_text)
        super().disable()
