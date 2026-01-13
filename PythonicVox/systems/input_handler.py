"""
Input handler for PythonicVox.

This module contains the InputHandler class which manages all keyboard and
mouse input, including key bindings, input state tracking, and input event
dispatching.

Classes:
    InputHandler: Manages input mapping and event handling.

Usage:
    from systems.input_handler import InputHandler

    input_handler = InputHandler()
    input_handler.update(events)
    if input_handler.is_action_pressed('forward'):
        # Move forward
"""

import pygame
import math


class InputHandler:
    """
    Manages keyboard and mouse input for the game.

    Attributes:
        key_bindings (dict): Mapping of action names to pygame key codes.
        keys_pressed (set): Set of currently pressed key codes.
        keys_just_pressed (set): Set of keys pressed this frame.
        keys_just_released (set): Set of keys released this frame.
        mouse_position (tuple): Current mouse position (x, y).
        mouse_delta (tuple): Mouse movement since last frame (dx, dy).
        mouse_locked (bool): Whether mouse is captured for look control.
    """

    def __init__(self):
        """Initialize a new InputHandler instance with default bindings."""
        # Map actions to pygame key constants
        self.key_bindings = {
            'forward': pygame.K_w,
            'backward': pygame.K_s,
            'left': pygame.K_a,
            'right': pygame.K_d,
            'jump': pygame.K_SPACE,
            'crouch': pygame.K_c,
            'sprint': pygame.K_LSHIFT,
            'inventory': pygame.K_e,
            'torch': pygame.K_f,
            'fly_up': pygame.K_SPACE,
            'fly_down': pygame.K_c,
        }
        self.keys_pressed = set()
        self.keys_just_pressed = set()
        self.keys_just_released = set()
        self.mouse_position = (0, 0)
        self.mouse_delta = (0, 0)
        self.mouse_locked = False
        self._last_mouse_pos = None

    def update(self, events):
        """
        Update input state for the current frame.

        Args:
            events (list): List of pygame events for this frame.
        """
        # Clear per-frame states
        self.keys_just_pressed.clear()
        self.keys_just_released.clear()

        # Process events
        for event in events:
            if event.type == pygame.KEYDOWN:
                self.keys_pressed.add(event.key)
                self.keys_just_pressed.add(event.key)
            elif event.type == pygame.KEYUP:
                self.keys_pressed.discard(event.key)
                self.keys_just_released.add(event.key)
            elif event.type == pygame.MOUSEMOTION:
                self.mouse_position = event.pos
                if self.mouse_locked:
                    # Get relative mouse movement when locked
                    self.mouse_delta = event.rel
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:  # Left click
                    self.lock_mouse()

        # Reset mouse delta if not locked
        if not self.mouse_locked:
            self.mouse_delta = (0, 0)

    def lock_mouse(self):
        """Lock the mouse cursor for first-person look control."""
        pygame.mouse.set_visible(False)
        pygame.event.set_grab(True)
        self.mouse_locked = True
        self._last_mouse_pos = pygame.mouse.get_pos()

    def unlock_mouse(self):
        """Unlock the mouse cursor."""
        pygame.mouse.set_visible(True)
        pygame.event.set_grab(False)
        self.mouse_locked = False

    def is_key_pressed(self, key_code):
        """
        Check if a key is currently pressed.

        Args:
            key_code (int): Pygame key code to check.

        Returns:
            bool: True if the key is pressed.
        """
        return key_code in self.keys_pressed

    def is_key_just_pressed(self, key_code):
        """
        Check if a key was just pressed this frame.

        Args:
            key_code (int): Pygame key code to check.

        Returns:
            bool: True if the key was just pressed.
        """
        return key_code in self.keys_just_pressed

    def is_action_pressed(self, action):
        """
        Check if an action's bound key is pressed.

        Args:
            action (str): Action name to check.

        Returns:
            bool: True if the action's key is pressed.
        """
        key_code = self.key_bindings.get(action)
        if key_code is None:
            return False
        return key_code in self.keys_pressed

    def is_action_just_pressed(self, action):
        """
        Check if an action's key was just pressed this frame.

        Args:
            action (str): Action name to check.

        Returns:
            bool: True if the action's key was just pressed.
        """
        key_code = self.key_bindings.get(action)
        if key_code is None:
            return False
        return key_code in self.keys_just_pressed

    def rebind_key(self, action, new_key_code):
        """
        Rebind an action to a new key.

        Args:
            action (str): Action name to rebind.
            new_key_code (int): New pygame key code to bind.
        """
        if action in self.key_bindings:
            self.key_bindings[action] = new_key_code

    def get_movement_vector(self, yaw):
        """
        Get movement direction vector based on input and camera yaw.

        Movement is relative to the camera's horizontal facing direction.
        Forward/backward moves along the camera's look direction (XZ plane).
        Left/right strafes perpendicular to the look direction.

        Args:
            yaw (float): Camera yaw angle in degrees (0 = +Z, 90 = +X).

        Returns:
            tuple: (dx, dz) normalized movement direction, or (0, 0) if no input.
        """
        # Convert yaw to radians
        yaw_rad = math.radians(yaw)

        # Calculate forward direction vector (in XZ plane)
        # Yaw 0 = looking down +Z, Yaw 90 = looking down +X
        forward_x = math.sin(yaw_rad)
        forward_z = math.cos(yaw_rad)

        # Right vector is perpendicular to forward
        right_x = math.cos(yaw_rad)
        right_z = -math.sin(yaw_rad)

        # Accumulate movement based on input
        move_x = 0.0
        move_z = 0.0

        if self.is_action_pressed('forward'):
            move_x += forward_x
            move_z += forward_z

        if self.is_action_pressed('backward'):
            move_x -= forward_x
            move_z -= forward_z

        if self.is_action_pressed('right'):
            move_x += right_x
            move_z += right_z

        if self.is_action_pressed('left'):
            move_x -= right_x
            move_z -= right_z

        # Normalize if moving diagonally
        length = math.sqrt(move_x * move_x + move_z * move_z)
        if length > 0.0001:
            move_x /= length
            move_z /= length

        return (move_x, move_z)

    def get_vertical_input(self):
        """
        Get vertical movement input for flying.

        Returns:
            float: -1 for down, 0 for none, 1 for up.
        """
        vertical = 0.0
        if self.is_action_pressed('fly_up'):
            vertical += 1.0
        if self.is_action_pressed('fly_down'):
            vertical -= 1.0
        return vertical
