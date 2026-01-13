"""
Reusable UI components for PythonicVox.

This package contains generic, reusable UI components built on pygame
for creating menus, settings screens, and other interfaces.

Components:
    Button: Clickable button with hover states and optional icon
    TextInput: Text field with focus, cursor, and placeholder
    Slider: Draggable value slider with labels
    Toggle: On/off switch with smooth animation
    CollapsibleSection: Expandable/collapsible content section
    ScrollableArea: Scrollable container with scrollbar
"""

from .button import Button
from .text_input import TextInput
from .slider import Slider
from .toggle import Toggle
from .collapsible import CollapsibleSection
from .scrollable_area import ScrollableArea

__all__ = [
    'Button',
    'TextInput',
    'Slider',
    'Toggle',
    'CollapsibleSection',
    'ScrollableArea',
]
