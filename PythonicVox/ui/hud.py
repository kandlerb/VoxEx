"""
Heads-up display for PythonicVox.

This module contains the HUD class which manages the in-game heads-up display
including crosshair, hotbar, health, and other real-time information.

Classes:
    HUD: Manages all HUD elements and their updates.

Usage:
    from ui.hud import HUD

    hud = HUD(player)
    hud.update()
    hud.toggle_debug()
"""


class HUD:
    """
    Manages the heads-up display during gameplay.

    Attributes:
        player: Reference to the player entity.
        show_debug (bool): Whether debug overlay is visible.
        crosshair: Crosshair UI element.
        hotbar: Hotbar UI element.
        health_bar: Health bar UI element.
    """

    def __init__(self, player):
        """
        Initialize a new HUD instance.

        Args:
            player: Player entity to display info for.
        """
        self.player = player
        self.show_debug = False
        self.crosshair = None
        self.hotbar = None
        self.health_bar = None

    def setup(self):
        """Create and position all HUD elements."""
        pass

    def update(self):
        """Update all HUD elements with current game state."""
        pass

    def toggle_debug(self):
        """Toggle visibility of debug overlay."""
        pass

    def update_hotbar(self, selected_slot, inventory):
        """
        Update hotbar display.

        Args:
            selected_slot (int): Currently selected slot (0-8).
            inventory (list): Inventory contents for hotbar slots.
        """
        pass

    def update_health(self, current, maximum):
        """
        Update health bar display.

        Args:
            current (int): Current health points.
            maximum (int): Maximum health points.
        """
        pass

    def show_block_name(self, block_name):
        """
        Display the name of the targeted block.

        Args:
            block_name (str): Name of the block to display.
        """
        pass

    def destroy(self):
        """Clean up HUD elements."""
        pass
