"""
Slider component for PythonicVox UI.

Provides a draggable slider for numeric value selection with
track, handle, and optional value display.
"""

import pygame
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')
import settings


class Slider:
    """
    Draggable slider for numeric value selection.

    Attributes:
        rect (pygame.Rect): Slider bounds.
        min_val: Minimum value.
        max_val: Maximum value.
        value: Current value.
        step: Value increment step.
        is_dragging (bool): Whether slider is being dragged.
    """

    def __init__(self, rect, min_val, max_val, default_val,
                 step=1, suffix="", show_value=True):
        """
        Initialize a new Slider.

        Args:
            rect: (x, y, width, height) tuple or pygame.Rect.
            min_val: Minimum slider value.
            max_val: Maximum slider value.
            default_val: Initial value.
            step: Value increment step.
            suffix (str): Suffix for value display (e.g., "%", " blocks").
            show_value (bool): Whether to show value label.
        """
        self.rect = pygame.Rect(rect)
        self.min_val = min_val
        self.max_val = max_val
        self.value = default_val
        self.step = step
        self.suffix = suffix
        self.show_value = show_value
        self.is_dragging = False
        self.handle_radius = settings.SLIDER_HANDLE_RADIUS
        self.font = pygame.font.Font(None, settings.FONT_SIZE_SMALL)

    def update(self, mouse_pos, mouse_down, mouse_clicked):
        """
        Handle drag interaction.

        Args:
            mouse_pos: Current mouse position (x, y).
            mouse_down (bool): Whether mouse button is held.
            mouse_clicked (bool): Whether mouse was clicked this frame.
        """
        # Calculate track area (exclude value label space)
        track_width = self.rect.width - 60 if self.show_value else self.rect.width
        track_rect = pygame.Rect(
            self.rect.x,
            self.rect.y,
            track_width,
            self.rect.height
        )

        # Start dragging on click in track area
        if mouse_clicked and track_rect.collidepoint(mouse_pos):
            self.is_dragging = True

        # Stop dragging when mouse released
        if not mouse_down:
            self.is_dragging = False

        # Update value while dragging
        if self.is_dragging:
            # Map mouse x to value range
            rel_x = mouse_pos[0] - self.rect.x
            rel_x = max(0, min(track_width, rel_x))
            ratio = rel_x / track_width

            raw_value = self.min_val + ratio * (self.max_val - self.min_val)

            # Snap to step
            if self.step >= 1:
                self.value = round(raw_value / self.step) * self.step
            else:
                # For float steps, round to appropriate precision
                precision = len(str(self.step).split('.')[-1])
                self.value = round(raw_value / self.step) * self.step
                self.value = round(self.value, precision)

            # Clamp to range
            self.value = max(self.min_val, min(self.max_val, self.value))

    def draw(self, surface):
        """
        Draw track, filled portion, handle, and value label.

        Args:
            surface (pygame.Surface): Surface to draw on.
        """
        # Calculate track dimensions
        track_width = self.rect.width - 60 if self.show_value else self.rect.width
        track_y = self.rect.centery
        track_height = settings.SLIDER_TRACK_HEIGHT

        # Calculate handle position
        value_ratio = (self.value - self.min_val) / (self.max_val - self.min_val)
        handle_x = self.rect.x + int(value_ratio * track_width)

        # Draw track background
        track_rect = pygame.Rect(
            self.rect.x,
            track_y - track_height // 2,
            track_width,
            track_height
        )
        pygame.draw.rect(surface, settings.SLIDER_TRACK_COLOR, track_rect, border_radius=3)

        # Draw filled portion
        filled_rect = pygame.Rect(
            self.rect.x,
            track_y - track_height // 2,
            handle_x - self.rect.x,
            track_height
        )
        pygame.draw.rect(surface, settings.SLIDER_FILL_COLOR, filled_rect, border_radius=3)

        # Draw handle
        pygame.draw.circle(surface, settings.COLOR_TEXT_PRIMARY,
                           (handle_x, track_y), self.handle_radius)
        pygame.draw.circle(surface, settings.SLIDER_FILL_COLOR,
                           (handle_x, track_y), self.handle_radius - 2)

        # Draw value label
        if self.show_value:
            if isinstance(self.value, float):
                value_text = f"{self.value:.2f}{self.suffix}"
            else:
                value_text = f"{int(self.value)}{self.suffix}"
            value_surface = self.font.render(value_text, True, settings.COLOR_TEXT_SECONDARY)
            value_x = self.rect.x + track_width + 10
            value_y = track_y - value_surface.get_height() // 2
            surface.blit(value_surface, (value_x, value_y))

    def get_value(self):
        """
        Get current slider value.

        Returns:
            Current value (int or float based on step).
        """
        return self.value
