"""
Scrollable area component for PythonicVox UI.

Provides a scrollable container with mouse wheel scrolling
and draggable scrollbar.
"""

import pygame
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')
import settings


class ScrollableArea:
    """
    Scrollable container with scrollbar.

    Attributes:
        rect (pygame.Rect): Visible area bounds.
        content_height (int): Total content height.
        scroll_offset (int): Current scroll position.
        is_dragging_scrollbar (bool): Whether scrollbar is being dragged.
    """

    def __init__(self, rect, content_height):
        """
        Initialize a new ScrollableArea.

        Args:
            rect: (x, y, width, height) tuple or pygame.Rect.
            content_height (int): Total height of scrollable content.
        """
        self.rect = pygame.Rect(rect)
        self.content_height = content_height
        self.scroll_offset = 0
        self.scrollbar_width = 12
        self.is_dragging_scrollbar = False
        self.scroll_speed = 30
        self.drag_start_y = 0
        self.drag_start_offset = 0

    def update(self, events, mouse_pos):
        """
        Handle mouse wheel and scrollbar dragging.

        Args:
            events (list): pygame events for this frame.
            mouse_pos: Current mouse position (x, y).
        """
        # Mouse wheel scrolling when hovering over area
        if self.rect.collidepoint(mouse_pos):
            for event in events:
                if event.type == pygame.MOUSEWHEEL:
                    self.scroll_offset -= event.y * self.scroll_speed
                    self._clamp_scroll()

        # Scrollbar dragging
        scrollbar_rect = self._get_scrollbar_rect()
        thumb_rect = self._get_thumb_rect()

        for event in events:
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if thumb_rect and thumb_rect.collidepoint(mouse_pos):
                    self.is_dragging_scrollbar = True
                    self.drag_start_y = mouse_pos[1]
                    self.drag_start_offset = self.scroll_offset
                elif scrollbar_rect.collidepoint(mouse_pos):
                    # Click on track - jump to position
                    self._scroll_to_position(mouse_pos[1])
            elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                self.is_dragging_scrollbar = False

        if self.is_dragging_scrollbar:
            # Calculate new scroll position based on drag
            delta_y = mouse_pos[1] - self.drag_start_y
            max_scroll = self.content_height - self.rect.height
            track_height = self.rect.height - self._get_thumb_height()
            if track_height > 0:
                scroll_per_pixel = max_scroll / track_height
                self.scroll_offset = self.drag_start_offset + delta_y * scroll_per_pixel
                self._clamp_scroll()

    def _scroll_to_position(self, mouse_y):
        """Scroll to position based on click on scrollbar track."""
        max_scroll = self.content_height - self.rect.height
        if max_scroll <= 0:
            return
        rel_y = mouse_y - self.rect.y
        ratio = rel_y / self.rect.height
        self.scroll_offset = ratio * max_scroll
        self._clamp_scroll()

    def _clamp_scroll(self):
        """Clamp scroll offset to valid range."""
        max_scroll = max(0, self.content_height - self.rect.height)
        self.scroll_offset = max(0, min(max_scroll, self.scroll_offset))

    def _get_scrollbar_rect(self):
        """Get the scrollbar track rectangle."""
        return pygame.Rect(
            self.rect.right - self.scrollbar_width,
            self.rect.top,
            self.scrollbar_width,
            self.rect.height
        )

    def _get_thumb_height(self):
        """Calculate scrollbar thumb height."""
        if self.content_height <= self.rect.height:
            return self.rect.height
        ratio = self.rect.height / self.content_height
        return max(30, int(self.rect.height * ratio))

    def _get_thumb_rect(self):
        """Get the scrollbar thumb rectangle."""
        if self.content_height <= self.rect.height:
            return None

        thumb_height = self._get_thumb_height()
        max_scroll = self.content_height - self.rect.height
        scroll_ratio = self.scroll_offset / max_scroll if max_scroll > 0 else 0
        track_height = self.rect.height - thumb_height
        thumb_y = self.rect.top + scroll_ratio * track_height

        return pygame.Rect(
            self.rect.right - self.scrollbar_width,
            int(thumb_y),
            self.scrollbar_width,
            thumb_height
        )

    def draw_scrollbar(self, surface):
        """
        Draw custom scrollbar if content exceeds view.

        Args:
            surface (pygame.Surface): Surface to draw on.
        """
        if self.content_height <= self.rect.height:
            return  # No scrollbar needed

        # Draw track
        track_rect = self._get_scrollbar_rect()
        pygame.draw.rect(surface, settings.COLOR_DARK_BG, track_rect)

        # Draw thumb
        thumb_rect = self._get_thumb_rect()
        if thumb_rect:
            thumb_color = settings.COLOR_BORDER if not self.is_dragging_scrollbar else settings.COLOR_PRIMARY
            pygame.draw.rect(surface, thumb_color, thumb_rect, border_radius=4)

    def get_offset(self):
        """
        Get current scroll offset.

        Returns:
            int: Current scroll position in pixels.
        """
        return int(self.scroll_offset)

    def set_content_height(self, height):
        """
        Update content height.

        Args:
            height (int): New content height.
        """
        self.content_height = height
        self._clamp_scroll()
