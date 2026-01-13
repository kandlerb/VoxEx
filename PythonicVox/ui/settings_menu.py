"""
Settings menu for PythonicVox.

This module contains the SettingsMenu class which manages a tabbed settings
interface using pygame for 2D rendering. The menu handles tab navigation,
displays placeholder content for each tab, and returns state change signals.

Classes:
    SettingsMenu: Manages the tabbed settings interface.

Usage:
    from ui.settings_menu import SettingsMenu

    settings_menu = SettingsMenu(screen)
    result = settings_menu.update(events)
    settings_menu.draw(screen)
"""

import pygame
import settings
from utils.helpers import draw_text_centered, draw_close_button


class SettingsMenu:
    """
    Manages the tabbed settings menu interface using pygame.

    Renders a panel with tab headers across the top and a content area below.
    Each tab can display different settings (currently placeholders).
    The menu can be closed via ESC key or X button.

    Attributes:
        screen (pygame.Surface): Reference to the display surface.
        active_tab (int): Index of currently selected tab.
        hovered_tab (int or None): Index of hovered tab, or None.
        close_button_hovered (bool): Whether close button is hovered.
        panel_rect (pygame.Rect): Main panel rectangle.
        tab_rects (list): List of pygame.Rect for each tab.
        close_button_rect (pygame.Rect): Close button rectangle.
        content_rect (pygame.Rect): Content area rectangle.
    """

    def __init__(self, screen):
        """
        Initialize a new SettingsMenu instance.

        Args:
            screen (pygame.Surface): The pygame display surface.
        """
        self.screen = screen
        self.active_tab = 0
        self.hovered_tab = None
        self.close_button_hovered = False

        # Initialize fonts
        self.tab_font = pygame.font.Font(None, settings.TAB_FONT_SIZE)
        self.content_font = pygame.font.Font(None, 36)
        self.title_font = pygame.font.Font(None, 48)

        # Layout elements (calculated in _calculate_layout)
        self.panel_rect = None
        self.tab_rects = []
        self.close_button_rect = None
        self.content_rect = None

        self._calculate_layout()

    def _calculate_layout(self):
        """Calculate all UI element positions based on screen dimensions."""
        screen_width = self.screen.get_width()
        screen_height = self.screen.get_height()
        margin = settings.SETTINGS_PANEL_MARGIN

        # Main panel with margins
        self.panel_rect = pygame.Rect(
            margin,
            margin,
            screen_width - 2 * margin,
            screen_height - 2 * margin
        )

        # Tab buttons evenly distributed across top of panel
        num_tabs = len(settings.SETTINGS_TABS)
        tab_width = (self.panel_rect.width - settings.CLOSE_BUTTON_SIZE - 10) // num_tabs

        self.tab_rects = []
        for i in range(num_tabs):
            tab_rect = pygame.Rect(
                self.panel_rect.left + i * tab_width,
                self.panel_rect.top,
                tab_width,
                settings.TAB_HEIGHT
            )
            self.tab_rects.append(tab_rect)

        # Close button in top-right corner
        self.close_button_rect = pygame.Rect(
            self.panel_rect.right - settings.CLOSE_BUTTON_SIZE - 5,
            self.panel_rect.top + 5,
            settings.CLOSE_BUTTON_SIZE,
            settings.CLOSE_BUTTON_SIZE
        )

        # Content area fills remaining space below tabs
        self.content_rect = pygame.Rect(
            self.panel_rect.left,
            self.panel_rect.top + settings.TAB_HEIGHT + settings.TAB_UNDERLINE_HEIGHT,
            self.panel_rect.width,
            self.panel_rect.height - settings.TAB_HEIGHT - settings.TAB_UNDERLINE_HEIGHT
        )

    def update(self, events):
        """
        Process input events and update menu state.

        Args:
            events (list): List of pygame events from the main loop.

        Returns:
            str or None: "main_menu" to return to main menu, None to stay.
        """
        mouse_pos = pygame.mouse.get_pos()

        # Update hover states
        self.hovered_tab = None
        for i, tab_rect in enumerate(self.tab_rects):
            if tab_rect.collidepoint(mouse_pos):
                self.hovered_tab = i
                break

        self.close_button_hovered = self.close_button_rect.collidepoint(mouse_pos)

        # Handle events
        for event in events:
            # ESC key returns to main menu
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                print("[Settings] Returning to main menu (ESC)")
                return "main_menu"

            # Mouse clicks
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                # Check tab clicks
                for i, tab_rect in enumerate(self.tab_rects):
                    if tab_rect.collidepoint(event.pos):
                        self.active_tab = i
                        print(f"[Settings] Switched to {settings.SETTINGS_TABS[i]} tab")
                        break

                # Check close button click
                if self.close_button_rect.collidepoint(event.pos):
                    print("[Settings] Returning to main menu (close button)")
                    return "main_menu"

        return None

    def draw(self, screen):
        """
        Render the settings menu to the screen.

        Args:
            screen (pygame.Surface): Surface to draw on.
        """
        # Draw panel background
        pygame.draw.rect(screen, settings.SETTINGS_PANEL_COLOR, self.panel_rect,
                         border_radius=8)
        pygame.draw.rect(screen, settings.SETTINGS_PANEL_BORDER_COLOR, self.panel_rect,
                         width=2, border_radius=8)

        # Draw tabs
        self._draw_tabs(screen)

        # Draw close button
        self._draw_close_button(screen)

        # Draw content area
        self._draw_content(screen)

    def _draw_tabs(self, screen):
        """
        Render tab headers with appropriate styling.

        Args:
            screen (pygame.Surface): Surface to draw on.
        """
        for i, tab_rect in enumerate(self.tab_rects):
            tab_name = settings.SETTINGS_TABS[i]

            # Determine tab color based on state
            if i == self.active_tab:
                color = settings.TAB_ACTIVE_COLOR
            elif i == self.hovered_tab:
                color = settings.TAB_HOVER_COLOR
            else:
                color = settings.TAB_COLOR

            # Draw tab background
            pygame.draw.rect(screen, color, tab_rect)

            # Draw tab border on sides
            border_color = settings.SETTINGS_PANEL_BORDER_COLOR
            pygame.draw.line(screen, border_color,
                             (tab_rect.right - 1, tab_rect.top),
                             (tab_rect.right - 1, tab_rect.bottom), 1)

            # Draw tab text
            draw_text_centered(
                screen,
                tab_name,
                self.tab_font,
                settings.COLOR_TEXT,
                tab_rect.center
            )

            # Draw underline on active tab
            if i == self.active_tab:
                underline_rect = pygame.Rect(
                    tab_rect.left,
                    tab_rect.bottom - settings.TAB_UNDERLINE_HEIGHT,
                    tab_rect.width,
                    settings.TAB_UNDERLINE_HEIGHT
                )
                pygame.draw.rect(screen, settings.TAB_UNDERLINE_COLOR, underline_rect)

    def _draw_close_button(self, screen):
        """
        Render X close button in corner.

        Args:
            screen (pygame.Surface): Surface to draw on.
        """
        # Determine color based on hover state
        if self.close_button_hovered:
            bg_color = settings.CLOSE_BUTTON_HOVER_COLOR
        else:
            bg_color = settings.CLOSE_BUTTON_COLOR

        # Draw button background
        pygame.draw.rect(screen, bg_color, self.close_button_rect, border_radius=4)

        # Draw X using helper function
        draw_close_button(screen, self.close_button_rect, settings.COLOR_TEXT, line_width=2)

    def _draw_content(self, screen):
        """
        Render current tab's content (placeholder for now).

        Args:
            screen (pygame.Surface): Surface to draw on.
        """
        # Draw content area background (slightly different from panel)
        content_bg = (30, 30, 45)
        pygame.draw.rect(screen, content_bg, self.content_rect)

        # Get active tab name
        tab_name = settings.SETTINGS_TABS[self.active_tab]

        # Draw placeholder text
        placeholder_text = f"[ {tab_name} Settings ]"
        draw_text_centered(
            screen,
            placeholder_text,
            self.title_font,
            settings.COLOR_SUBTITLE,
            self.content_rect.center
        )

        # Draw hint text below
        hint_text = "Settings controls coming soon..."
        draw_text_centered(
            screen,
            hint_text,
            self.content_font,
            (80, 80, 100),
            (self.content_rect.centerx, self.content_rect.centery + 50)
        )
