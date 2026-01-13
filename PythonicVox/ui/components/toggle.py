"""
Toggle switch component for PythonicVox UI.

Provides an on/off toggle switch with smooth animation
and optional label.
"""

import pygame
import sys
sys.path.insert(0, '/home/user/VoxEx/PythonicVox')
import settings


class Toggle:
    """
    On/off toggle switch with smooth animation.

    Attributes:
        x, y (int): Toggle position.
        label (str): Label text shown to the left.
        icon (str): Optional icon prefix.
        is_on (bool): Current toggle state.
        animation_progress (float): 0-1 for smooth sliding.
    """

    def __init__(self, pos, label="", default_on=True, icon=None):
        """
        Initialize a new Toggle.

        Args:
            pos: (x, y) position tuple.
            label (str): Label text.
            default_on (bool): Initial state.
            icon (str): Optional icon prefix.
        """
        self.x, self.y = pos
        self.label = label
        self.icon = icon
        self.is_on = default_on
        self.rect = pygame.Rect(self.x, self.y, settings.TOGGLE_WIDTH, settings.TOGGLE_HEIGHT)
        self.animation_progress = 1.0 if default_on else 0.0
        self.font = pygame.font.Font(None, settings.FONT_SIZE_MEDIUM)

    def update(self, mouse_pos, mouse_clicked):
        """
        Toggle on click and animate.

        Args:
            mouse_pos: Current mouse position (x, y).
            mouse_clicked (bool): Whether mouse was clicked.

        Returns:
            bool: True if state changed.
        """
        state_changed = False

        # Check for click on toggle
        if self.rect.collidepoint(mouse_pos) and mouse_clicked:
            self.is_on = not self.is_on
            state_changed = True

        # Animate progress toward target
        target = 1.0 if self.is_on else 0.0
        diff = target - self.animation_progress
        if abs(diff) > 0.01:
            self.animation_progress += diff * 0.3  # Smooth animation
        else:
            self.animation_progress = target

        return state_changed

    def draw(self, surface):
        """
        Draw toggle switch with label.

        Args:
            surface (pygame.Surface): Surface to draw on.
        """
        # Use rect coordinates for consistency
        x = self.rect.x
        y = self.rect.y

        # Draw label to the left
        if self.label or self.icon:
            label_text = f"{self.icon} {self.label}" if self.icon else self.label
            label_surface = self.font.render(label_text, True, settings.COLOR_TEXT_PRIMARY)
            label_x = x - label_surface.get_width() - 15
            label_y = y + (settings.TOGGLE_HEIGHT - label_surface.get_height()) // 2
            surface.blit(label_surface, (label_x, label_y))

        # Interpolate track color
        off_color = settings.TOGGLE_OFF_COLOR
        on_color = settings.TOGGLE_ON_COLOR
        track_color = (
            int(off_color[0] + (on_color[0] - off_color[0]) * self.animation_progress),
            int(off_color[1] + (on_color[1] - off_color[1]) * self.animation_progress),
            int(off_color[2] + (on_color[2] - off_color[2]) * self.animation_progress),
        )

        # Draw rounded track
        pygame.draw.rect(surface, track_color, self.rect, border_radius=settings.TOGGLE_HEIGHT // 2)

        # Calculate handle position
        handle_radius = (settings.TOGGLE_HEIGHT - 6) // 2
        handle_left = x + handle_radius + 3
        handle_right = x + settings.TOGGLE_WIDTH - handle_radius - 3
        handle_x = handle_left + (handle_right - handle_left) * self.animation_progress
        handle_y = y + settings.TOGGLE_HEIGHT // 2

        # Draw handle
        pygame.draw.circle(surface, settings.COLOR_TEXT_PRIMARY,
                           (int(handle_x), handle_y), handle_radius)

    def get_value(self):
        """
        Get current toggle state.

        Returns:
            bool: True if on, False if off.
        """
        return self.is_on
