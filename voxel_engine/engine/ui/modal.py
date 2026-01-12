"""Modal overlay components for VoxEx UI.

Provides base modal class and confirmation dialog for popup overlays.
Modals render on top of all other UI elements with a semi-transparent backdrop.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Callable
from enum import Enum, auto

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


class ModalResult(Enum):
    """Result of modal interaction."""
    NONE = auto()
    CLOSED = auto()
    CONFIRMED = auto()
    CANCELLED = auto()


# Modal colors
MODAL_BACKDROP_COLOR = (0, 0, 0, 180)
MODAL_BG_COLOR = (30, 30, 35, 255)
MODAL_BORDER_COLOR = (80, 80, 90, 255)
MODAL_TITLE_BG = (40, 40, 50, 255)
MODAL_TITLE_COLOR = (255, 255, 255, 255)
MODAL_CLOSE_COLOR = (120, 60, 60, 255)
MODAL_CLOSE_HOVER = (160, 70, 70, 255)
MODAL_CLOSE_TEXT = (255, 255, 255, 255)


@dataclass
class Modal:
    """
    Base modal overlay component.

    Provides a centered popup window with title bar, close button,
    and semi-transparent backdrop. Subclasses override render_content()
    and handle_content_click() for custom behavior.
    """

    title: str = "Modal"
    width: int = 400
    height: int = 300
    visible: bool = False

    # Screen dimensions for centering
    screen_width: int = 800
    screen_height: int = 600

    # Title bar and close button
    title_bar_height: int = 36
    close_button_size: int = 24
    close_button_margin: int = 6

    # State
    close_hovered: bool = False

    @property
    def x(self) -> float:
        """Get centered X position."""
        return (self.screen_width - self.width) / 2

    @property
    def y(self) -> float:
        """Get centered Y position."""
        return (self.screen_height - self.height) / 2

    @property
    def content_x(self) -> float:
        """Get X position for content area."""
        return self.x + 20

    @property
    def content_y(self) -> float:
        """Get Y position for content area (below title bar)."""
        return self.y + self.title_bar_height + 15

    @property
    def content_width(self) -> float:
        """Get width of content area."""
        return self.width - 40

    def show(self) -> None:
        """Show the modal."""
        self.visible = True

    def hide(self) -> None:
        """Hide the modal."""
        self.visible = False
        self.close_hovered = False

    def toggle(self) -> None:
        """Toggle modal visibility."""
        if self.visible:
            self.hide()
        else:
            self.show()

    def update_screen_size(self, width: int, height: int) -> None:
        """
        Update screen dimensions for centering.

        @param width: Screen width in pixels.
        @param height: Screen height in pixels.
        """
        self.screen_width = width
        self.screen_height = height

    def contains(self, mx: float, my: float) -> bool:
        """
        Check if point is inside the modal bounds.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: True if point is inside modal.
        """
        return (self.x <= mx <= self.x + self.width and
                self.y <= my <= self.y + self.height)

    def _get_close_button_rect(self) -> tuple:
        """Get (x, y, w, h) for close button."""
        btn_x = self.x + self.width - self.close_button_size - self.close_button_margin
        btn_y = self.y + self.close_button_margin
        return (btn_x, btn_y, self.close_button_size, self.close_button_size)

    def _contains_close_button(self, mx: float, my: float) -> bool:
        """Check if point is inside close button."""
        bx, by, bw, bh = self._get_close_button_rect()
        return bx <= mx <= bx + bw and by <= my <= by + bh

    def update_mouse(self, mx: float, my: float) -> None:
        """
        Update hover states based on mouse position.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        if not self.visible:
            return

        self.close_hovered = self._contains_close_button(mx, my)
        self.update_content_mouse(mx, my)

    def update_content_mouse(self, mx: float, my: float) -> None:
        """
        Override to update hover states in content area.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        """
        pass

    def handle_click(self, mx: float, my: float) -> ModalResult:
        """
        Handle mouse click.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: ModalResult indicating what happened.
        """
        if not self.visible:
            return ModalResult.NONE

        # Click outside modal closes it
        if not self.contains(mx, my):
            self.hide()
            return ModalResult.CLOSED

        # Check close button
        if self._contains_close_button(mx, my):
            self.hide()
            return ModalResult.CLOSED

        # Delegate to content handler
        return self.handle_content_click(mx, my)

    def handle_content_click(self, mx: float, my: float) -> ModalResult:
        """
        Override to handle clicks within modal content area.

        @param mx: Mouse X coordinate.
        @param my: Mouse Y coordinate.
        @returns: ModalResult from the click.
        """
        return ModalResult.NONE

    def handle_key(self, key: str, mods: int = 0) -> bool:
        """
        Handle keyboard input.

        @param key: Key identifier string.
        @param mods: Modifier flags.
        @returns: True if key was handled.
        """
        if not self.visible:
            return False

        # Escape closes modal
        if key.lower() == 'escape':
            self.hide()
            return True

        return self.handle_content_key(key, mods)

    def handle_content_key(self, key: str, mods: int = 0) -> bool:
        """
        Override to handle keyboard input in content area.

        @param key: Key identifier string.
        @param mods: Modifier flags.
        @returns: True if key was handled.
        """
        return False

    def handle_text_input(self, char: str) -> bool:
        """
        Handle text character input.

        @param char: Character to insert.
        @returns: True if character was handled.
        """
        return False

    def render_backdrop(self, ui: "UIRenderer") -> None:
        """
        Render semi-transparent backdrop over entire screen.

        @param ui: UI renderer.
        """
        ui.draw_rect(0, 0, self.screen_width, self.screen_height, MODAL_BACKDROP_COLOR)

    def render_frame(self, ui: "UIRenderer") -> None:
        """
        Render modal frame with title bar and close button.

        @param ui: UI renderer.
        """
        x, y = self.x, self.y
        w, h = self.width, self.height

        # Border
        ui.draw_rect(x - 2, y - 2, w + 4, h + 4, MODAL_BORDER_COLOR)

        # Background
        ui.draw_rect(x, y, w, h, MODAL_BG_COLOR)

        # Title bar
        ui.draw_rect(x, y, w, self.title_bar_height, MODAL_TITLE_BG)

        # Title text
        title_w, title_h = ui.measure_text(self.title, scale=1.0)
        title_x = x + 15
        title_y = y + (self.title_bar_height - title_h) / 2
        ui.draw_text(self.title, title_x, title_y, MODAL_TITLE_COLOR, scale=1.0)

        # Close button
        bx, by, bw, bh = self._get_close_button_rect()
        close_color = MODAL_CLOSE_HOVER if self.close_hovered else MODAL_CLOSE_COLOR
        ui.draw_rect(bx, by, bw, bh, close_color)

        # X in close button
        x_w, x_h = ui.measure_text("X", scale=0.9)
        x_x = bx + (bw - x_w) / 2
        x_y = by + (bh - x_h) / 2
        ui.draw_text("X", x_x, x_y, MODAL_CLOSE_TEXT, scale=0.9)

    def render_content(self, ui: "UIRenderer") -> None:
        """
        Override to render modal-specific content.

        @param ui: UI renderer.
        """
        pass

    def render(self, ui: "UIRenderer") -> None:
        """
        Render the complete modal.

        @param ui: UI renderer.
        """
        if not self.visible:
            return

        self.render_backdrop(ui)
        self.render_frame(ui)
        self.render_content(ui)


# Confirm dialog colors
CONFIRM_MESSAGE_COLOR = (220, 220, 220, 255)
CONFIRM_BTN_COLOR = (70, 130, 180, 255)
CONFIRM_BTN_HOVER = (90, 150, 200, 255)
CONFIRM_DANGER_COLOR = (180, 60, 60, 255)
CONFIRM_DANGER_HOVER = (200, 80, 80, 255)
CANCEL_BTN_COLOR = (80, 80, 90, 255)
CANCEL_BTN_HOVER = (100, 100, 110, 255)
BUTTON_TEXT_COLOR = (255, 255, 255, 255)


@dataclass
class ConfirmDialog(Modal):
    """
    Simple confirmation dialog with message and Yes/No buttons.

    Used for dangerous actions like clearing cache or deleting worlds.
    """

    message: str = ""
    confirm_text: str = "Confirm"
    cancel_text: str = "Cancel"
    is_dangerous: bool = False

    # Callbacks
    on_confirm: Optional[Callable[[], None]] = field(default=None, repr=False)
    on_cancel: Optional[Callable[[], None]] = field(default=None, repr=False)

    # Button state
    confirm_hovered: bool = False
    cancel_hovered: bool = False

    # Button dimensions
    button_width: int = 100
    button_height: int = 36
    button_spacing: int = 20

    def __post_init__(self):
        """Set default dimensions for confirm dialog."""
        self.width = 380
        self.height = 180
        self.title = "Confirm"

    def _get_confirm_button_rect(self) -> tuple:
        """Get (x, y, w, h) for confirm button."""
        total_width = 2 * self.button_width + self.button_spacing
        start_x = self.x + (self.width - total_width) / 2
        btn_y = self.y + self.height - self.button_height - 20
        return (start_x, btn_y, self.button_width, self.button_height)

    def _get_cancel_button_rect(self) -> tuple:
        """Get (x, y, w, h) for cancel button."""
        total_width = 2 * self.button_width + self.button_spacing
        start_x = self.x + (self.width - total_width) / 2
        btn_x = start_x + self.button_width + self.button_spacing
        btn_y = self.y + self.height - self.button_height - 20
        return (btn_x, btn_y, self.button_width, self.button_height)

    def update_content_mouse(self, mx: float, my: float) -> None:
        """Update button hover states."""
        cx, cy, cw, ch = self._get_confirm_button_rect()
        self.confirm_hovered = cx <= mx <= cx + cw and cy <= my <= cy + ch

        nx, ny, nw, nh = self._get_cancel_button_rect()
        self.cancel_hovered = nx <= mx <= nx + nw and ny <= my <= ny + nh

    def handle_content_click(self, mx: float, my: float) -> ModalResult:
        """Handle confirm/cancel button clicks."""
        # Check confirm button
        cx, cy, cw, ch = self._get_confirm_button_rect()
        if cx <= mx <= cx + cw and cy <= my <= cy + ch:
            if self.on_confirm:
                self.on_confirm()
            self.hide()
            return ModalResult.CONFIRMED

        # Check cancel button
        nx, ny, nw, nh = self._get_cancel_button_rect()
        if nx <= mx <= nx + nw and ny <= my <= ny + nh:
            if self.on_cancel:
                self.on_cancel()
            self.hide()
            return ModalResult.CANCELLED

        return ModalResult.NONE

    def handle_content_key(self, key: str, mods: int = 0) -> bool:
        """Handle Enter to confirm, Escape handled by parent."""
        if key.lower() == 'return' or key.lower() == 'enter':
            if self.on_confirm:
                self.on_confirm()
            self.hide()
            return True
        return False

    def render_content(self, ui: "UIRenderer") -> None:
        """Render message and buttons."""
        # Message (may be multi-line)
        lines = self.message.split('\n')
        y = self.y + self.title_bar_height + 25

        for line in lines:
            if line.strip():
                line_w, line_h = ui.measure_text(line, scale=0.9)
                line_x = self.x + (self.width - line_w) / 2
                ui.draw_text(line, line_x, y, CONFIRM_MESSAGE_COLOR, scale=0.9)
            y += 22

        # Confirm button
        cx, cy, cw, ch = self._get_confirm_button_rect()
        if self.is_dangerous:
            btn_color = CONFIRM_DANGER_HOVER if self.confirm_hovered else CONFIRM_DANGER_COLOR
        else:
            btn_color = CONFIRM_BTN_HOVER if self.confirm_hovered else CONFIRM_BTN_COLOR
        ui.draw_rect(cx, cy, cw, ch, btn_color)

        txt_w, txt_h = ui.measure_text(self.confirm_text, scale=0.9)
        txt_x = cx + (cw - txt_w) / 2
        txt_y = cy + (ch - txt_h) / 2
        ui.draw_text(self.confirm_text, txt_x, txt_y, BUTTON_TEXT_COLOR, scale=0.9)

        # Cancel button
        nx, ny, nw, nh = self._get_cancel_button_rect()
        cancel_color = CANCEL_BTN_HOVER if self.cancel_hovered else CANCEL_BTN_COLOR
        ui.draw_rect(nx, ny, nw, nh, cancel_color)

        txt_w, txt_h = ui.measure_text(self.cancel_text, scale=0.9)
        txt_x = nx + (nw - txt_w) / 2
        txt_y = ny + (nh - txt_h) / 2
        ui.draw_text(self.cancel_text, txt_x, txt_y, BUTTON_TEXT_COLOR, scale=0.9)
