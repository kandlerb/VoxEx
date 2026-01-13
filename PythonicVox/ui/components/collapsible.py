"""
Collapsible section component for PythonicVox UI.

Provides an expandable/collapsible section with header
and animated expand/collapse.
"""

import pygame
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')
import settings


class CollapsibleSection:
    """
    Expandable/collapsible content section.

    Attributes:
        x, y (int): Section position.
        width (int): Section width.
        title (str): Header title.
        is_expanded (bool): Whether section is expanded.
        content_height (int): Height of content when expanded.
        animation_progress (float): 0-1 for smooth animation.
    """

    def __init__(self, pos, width, title, icon=None):
        """
        Initialize a new CollapsibleSection.

        Args:
            pos: (x, y) position tuple.
            width (int): Section width.
            title (str): Header title.
            icon (str): Optional icon prefix.
        """
        self.x, self.y = pos
        self.width = width
        self.title = title
        self.icon = icon
        self.is_expanded = False
        self.header_height = 40
        self.content_height = 0  # Set by parent based on content
        self.header_rect = pygame.Rect(self.x, self.y, width, self.header_height)
        self.animation_progress = 0.0  # 0=collapsed, 1=expanded
        self.font = pygame.font.Font(None, settings.FONT_SIZE_MEDIUM)

    def update(self, mouse_pos, mouse_clicked):
        """
        Toggle expansion on header click.

        Args:
            mouse_pos: Current mouse position (x, y).
            mouse_clicked (bool): Whether mouse was clicked.
        """
        # Check for click on header
        if self.header_rect.collidepoint(mouse_pos) and mouse_clicked:
            self.is_expanded = not self.is_expanded

        # Animate progress toward target
        target = 1.0 if self.is_expanded else 0.0
        diff = target - self.animation_progress
        if abs(diff) > 0.01:
            self.animation_progress += diff * 0.2  # Smooth animation
        else:
            self.animation_progress = target

    def draw_header(self, surface):
        """
        Draw collapsible header with chevron.

        Args:
            surface (pygame.Surface): Surface to draw on.
        """
        # Use header_rect coordinates for consistency
        x = self.header_rect.x
        y = self.header_rect.y

        # Draw header background
        pygame.draw.rect(surface, settings.COLOR_PANEL_BG, self.header_rect, border_radius=4)
        pygame.draw.rect(surface, settings.COLOR_BORDER, self.header_rect, width=1, border_radius=4)

        # Draw icon + title
        title_text = f"{self.icon} {self.title}" if self.icon else self.title
        title_surface = self.font.render(title_text, True, settings.COLOR_TEXT_PRIMARY)
        title_x = x + 15
        title_y = y + (self.header_height - title_surface.get_height()) // 2
        surface.blit(title_surface, (title_x, title_y))

        # Draw chevron (rotates based on animation_progress)
        chevron_x = x + self.width - 25
        chevron_y = y + self.header_height // 2

        # Calculate chevron points based on animation
        if self.animation_progress > 0.5:
            # Pointing down (expanded)
            points = [
                (chevron_x - 6, chevron_y - 3),
                (chevron_x + 6, chevron_y - 3),
                (chevron_x, chevron_y + 5),
            ]
        else:
            # Pointing right (collapsed)
            points = [
                (chevron_x - 3, chevron_y - 6),
                (chevron_x - 3, chevron_y + 6),
                (chevron_x + 5, chevron_y),
            ]

        pygame.draw.polygon(surface, settings.COLOR_TEXT_SECONDARY, points)

    def get_content_rect(self):
        """
        Get rect for content area.

        Returns:
            pygame.Rect: Content area rectangle (height scaled by animation).
        """
        visible_height = int(self.content_height * self.animation_progress)
        return pygame.Rect(
            self.header_rect.x,
            self.header_rect.y + self.header_height,
            self.width,
            visible_height
        )

    def is_content_visible(self):
        """
        Check if content should be rendered.

        Returns:
            bool: True if animation_progress > 0.01.
        """
        return self.animation_progress > 0.01
