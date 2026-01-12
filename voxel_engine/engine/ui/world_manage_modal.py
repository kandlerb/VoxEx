"""World management modal for VoxEx UI.

Provides a modal dialog for managing saved worlds with:
- Rename world
- Duplicate world
- Storage information with progress bar
- Export/Import world
- Clear chunk cache (danger zone)
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional, Callable

from .modal import Modal, ModalResult, ConfirmDialog
from .text_input import TextInput
from .progress_bar import ProgressBar
from .start_menu import StartMenuButton
from .pause_menu import MenuAction

if TYPE_CHECKING:
    from .ui_renderer import UIRenderer


# Section colors
SECTION_LABEL_COLOR = (180, 180, 180, 255)
SECTION_DIVIDER_COLOR = (60, 60, 70, 255)
HINT_COLOR = (130, 130, 130, 255)
STATUS_SUCCESS_COLOR = (100, 200, 100, 255)
STATUS_ERROR_COLOR = (200, 100, 100, 255)

# Button colors
ACTION_BTN_COLOR = (70, 120, 160, 255)
ACTION_BTN_HOVER = (90, 140, 180, 255)
DANGER_BTN_COLOR = (160, 50, 50, 255)
DANGER_BTN_HOVER = (180, 70, 70, 255)
BTN_TEXT_COLOR = (255, 255, 255, 255)

# Info colors
INFO_LABEL_COLOR = (150, 150, 150, 255)
INFO_VALUE_COLOR = (200, 200, 200, 255)


@dataclass
class WorldManageModal(Modal):
    """
    Modal for managing a saved world.

    Provides rename, duplicate, storage info, export/import,
    and cache clearing functionality.
    """

    # World being managed
    world_name: str = ""
    world_seed: int = 0

    # Storage information
    total_chunks: int = 0
    cache_size_bytes: int = 0
    metadata_size_bytes: int = 0
    max_cache_bytes: int = 50 * 1024 * 1024  # 50MB default max

    # Callbacks
    on_rename: Optional[Callable[[str, str], bool]] = field(default=None, repr=False)
    on_duplicate: Optional[Callable[[str, str], bool]] = field(default=None, repr=False)
    on_export: Optional[Callable[[str], bool]] = field(default=None, repr=False)
    on_import: Optional[Callable[[], Optional[str]]] = field(default=None, repr=False)
    on_clear_cache: Optional[Callable[[str], bool]] = field(default=None, repr=False)

    # UI Components (initialized in __post_init__)
    _rename_input: Optional[TextInput] = field(default=None, repr=False)
    _duplicate_input: Optional[TextInput] = field(default=None, repr=False)
    _storage_bar: Optional[ProgressBar] = field(default=None, repr=False)

    # Button hover states
    _rename_btn_hovered: bool = False
    _duplicate_btn_hovered: bool = False
    _export_btn_hovered: bool = False
    _import_btn_hovered: bool = False
    _clear_cache_btn_hovered: bool = False

    # Confirmation dialog
    _confirm_dialog: Optional[ConfirmDialog] = field(default=None, repr=False)

    # Status message
    _status_message: str = ""
    _status_is_error: bool = False
    _status_timer: float = 0.0

    # Layout constants
    SECTION_SPACING: int = 25
    BTN_WIDTH: int = 85
    BTN_HEIGHT: int = 32

    def __post_init__(self):
        """Initialize modal dimensions and components."""
        self.title = "Manage World"
        self.width = 450
        self.height = 520
        self._init_components()

    def _init_components(self) -> None:
        """Create UI components."""
        # Rename input
        self._rename_input = TextInput(
            text="",
            placeholder="Enter new name...",
            max_length=32,
            numeric_only=False
        )

        # Duplicate input
        self._duplicate_input = TextInput(
            text="",
            placeholder="Enter copy name...",
            max_length=32,
            numeric_only=False
        )

        # Storage progress bar
        self._storage_bar = ProgressBar(
            width=self.width - 60,
            height=22,
            label_format="{percent:.0f}%",
            label_position="right"
        )

    def set_world(self, name: str, seed: int) -> None:
        """
        Set the world to manage.

        @param name: World name.
        @param seed: World seed.
        """
        self.world_name = name
        self.world_seed = seed
        self._rename_input.set_text(name)
        self._duplicate_input.set_text(f"{name} (copy)")
        self._status_message = ""
        self._status_timer = 0.0

    def set_storage_info(
        self,
        chunk_count: int,
        cache_bytes: int,
        metadata_bytes: int,
        max_bytes: int = 50 * 1024 * 1024
    ) -> None:
        """
        Set storage statistics.

        @param chunk_count: Number of modified chunks.
        @param cache_bytes: Total chunk cache size in bytes.
        @param metadata_bytes: Metadata file size in bytes.
        @param max_bytes: Maximum cache size for progress bar.
        """
        self.total_chunks = chunk_count
        self.cache_size_bytes = cache_bytes
        self.metadata_size_bytes = metadata_bytes
        self.max_cache_bytes = max_bytes
        self._storage_bar.set_value(cache_bytes, max_bytes)

    def _show_status(self, message: str, is_error: bool = False, duration: float = 3.0) -> None:
        """
        Show temporary status message.

        @param message: Message to display.
        @param is_error: True for error styling.
        @param duration: Display duration in seconds.
        """
        self._status_message = message
        self._status_is_error = is_error
        self._status_timer = duration

    def update(self, dt: float) -> None:
        """
        Update timers.

        @param dt: Delta time in seconds.
        """
        if self._status_timer > 0:
            self._status_timer -= dt
            if self._status_timer <= 0:
                self._status_message = ""

    def show(self) -> None:
        """Show the modal."""
        super().show()
        self._status_message = ""
        self._status_timer = 0.0

    def hide(self) -> None:
        """Hide the modal."""
        super().hide()
        self._confirm_dialog = None
        self._rename_input.focused = False
        self._duplicate_input.focused = False

    # ===== Button rectangles =====

    def _get_rename_btn_rect(self) -> tuple:
        """Get rename button rectangle."""
        return (
            self.x + self.width - self.BTN_WIDTH - 25,
            self.content_y + 45,
            self.BTN_WIDTH,
            self.BTN_HEIGHT
        )

    def _get_duplicate_btn_rect(self) -> tuple:
        """Get duplicate button rectangle."""
        return (
            self.x + self.width - self.BTN_WIDTH - 25,
            self.content_y + 120,
            self.BTN_WIDTH,
            self.BTN_HEIGHT
        )

    def _get_export_btn_rect(self) -> tuple:
        """Get export button rectangle."""
        return (
            self.content_x,
            self.content_y + 280,
            120,
            36
        )

    def _get_import_btn_rect(self) -> tuple:
        """Get import button rectangle."""
        return (
            self.content_x + 140,
            self.content_y + 280,
            120,
            36
        )

    def _get_clear_cache_btn_rect(self) -> tuple:
        """Get clear cache button rectangle."""
        return (
            self.content_x,
            self.content_y + 380,
            150,
            36
        )

    # ===== Event handling =====

    def update_content_mouse(self, mx: float, my: float) -> None:
        """Update hover states for buttons and inputs."""
        # Button hovers
        rx, ry, rw, rh = self._get_rename_btn_rect()
        self._rename_btn_hovered = rx <= mx <= rx + rw and ry <= my <= ry + rh

        dx, dy, dw, dh = self._get_duplicate_btn_rect()
        self._duplicate_btn_hovered = dx <= mx <= dx + dw and dy <= my <= dy + dh

        ex, ey, ew, eh = self._get_export_btn_rect()
        self._export_btn_hovered = ex <= mx <= ex + ew and ey <= my <= ey + eh

        ix, iy, iw, ih = self._get_import_btn_rect()
        self._import_btn_hovered = ix <= mx <= ix + iw and iy <= my <= iy + ih

        cx, cy, cw, ch = self._get_clear_cache_btn_rect()
        self._clear_cache_btn_hovered = cx <= mx <= cx + cw and cy <= my <= cy + ch

    def handle_click(self, mx: float, my: float) -> ModalResult:
        """Handle mouse click, checking confirm dialog first."""
        if not self.visible:
            return ModalResult.NONE

        # Handle confirm dialog if visible
        if self._confirm_dialog and self._confirm_dialog.visible:
            result = self._confirm_dialog.handle_click(mx, my)
            if result != ModalResult.NONE:
                self._confirm_dialog = None
            return ModalResult.NONE

        return super().handle_click(mx, my)

    def handle_content_click(self, mx: float, my: float) -> ModalResult:
        """Handle clicks within modal content area."""
        # Handle text input clicks
        self._rename_input.handle_click(mx, my)
        self._duplicate_input.handle_click(mx, my)

        # Check rename button
        rx, ry, rw, rh = self._get_rename_btn_rect()
        if rx <= mx <= rx + rw and ry <= my <= ry + rh:
            self._handle_rename()
            return ModalResult.NONE

        # Check duplicate button
        dx, dy, dw, dh = self._get_duplicate_btn_rect()
        if dx <= mx <= dx + dw and dy <= my <= dy + dh:
            self._handle_duplicate()
            return ModalResult.NONE

        # Check export button
        ex, ey, ew, eh = self._get_export_btn_rect()
        if ex <= mx <= ex + ew and ey <= my <= ey + eh:
            self._handle_export()
            return ModalResult.NONE

        # Check import button
        ix, iy, iw, ih = self._get_import_btn_rect()
        if ix <= mx <= ix + iw and iy <= my <= iy + ih:
            self._handle_import()
            return ModalResult.NONE

        # Check clear cache button
        cx, cy, cw, ch = self._get_clear_cache_btn_rect()
        if cx <= mx <= cx + cw and cy <= my <= cy + ch:
            self._show_clear_cache_confirm()
            return ModalResult.NONE

        return ModalResult.NONE

    def handle_content_key(self, key: str, mods: int = 0) -> bool:
        """Handle keyboard input for text inputs."""
        if self._rename_input.focused:
            return self._rename_input.handle_key(key, mods)
        if self._duplicate_input.focused:
            return self._duplicate_input.handle_key(key, mods)
        return False

    def handle_text_input(self, char: str) -> bool:
        """Handle text character input."""
        if self._rename_input.focused:
            return self._rename_input.handle_text_input(char)
        if self._duplicate_input.focused:
            return self._duplicate_input.handle_text_input(char)
        return False

    def handle_key(self, key: str, mods: int = 0) -> bool:
        """Handle keyboard input, checking confirm dialog first."""
        if not self.visible:
            return False

        # Handle confirm dialog first
        if self._confirm_dialog and self._confirm_dialog.visible:
            return self._confirm_dialog.handle_key(key, mods)

        return super().handle_key(key, mods)

    # ===== Action handlers =====

    def _handle_rename(self) -> None:
        """Execute rename action."""
        new_name = self._rename_input.get_value().strip()

        if not new_name:
            self._show_status("Name cannot be empty", is_error=True)
            return

        if new_name == self.world_name:
            self._show_status("Name unchanged", is_error=True)
            return

        if self.on_rename:
            success = self.on_rename(self.world_name, new_name)
            if success:
                self.world_name = new_name
                self.title = "Manage World"
                self._show_status(f"Renamed to '{new_name}'")
            else:
                self._show_status("Rename failed - name may exist", is_error=True)

    def _handle_duplicate(self) -> None:
        """Execute duplicate action."""
        new_name = self._duplicate_input.get_value().strip()

        if not new_name:
            self._show_status("Name cannot be empty", is_error=True)
            return

        if new_name == self.world_name:
            self._show_status("Choose a different name", is_error=True)
            return

        if self.on_duplicate:
            success = self.on_duplicate(self.world_name, new_name)
            if success:
                self._show_status(f"Created copy '{new_name}'")
            else:
                self._show_status("Duplicate failed - name may exist", is_error=True)

    def _handle_export(self) -> None:
        """Execute export action."""
        if self.on_export:
            success = self.on_export(self.world_name)
            if success:
                self._show_status("World exported successfully")
            else:
                self._show_status("Export failed", is_error=True)

    def _handle_import(self) -> None:
        """Execute import action."""
        if self.on_import:
            imported_name = self.on_import()
            if imported_name:
                self._show_status(f"Imported '{imported_name}'")
            else:
                self._show_status("Import failed or cancelled", is_error=True)

    def _show_clear_cache_confirm(self) -> None:
        """Show confirmation dialog for clearing cache."""
        self._confirm_dialog = ConfirmDialog(
            title="Clear Cache?",
            message=f"Delete all {self.total_chunks} cached chunks?\nThis cannot be undone.",
            confirm_text="Clear",
            cancel_text="Cancel",
            is_dangerous=True,
            on_confirm=self._do_clear_cache,
            on_cancel=lambda: setattr(self, '_confirm_dialog', None)
        )
        self._confirm_dialog.screen_width = self.screen_width
        self._confirm_dialog.screen_height = self.screen_height
        self._confirm_dialog.show()

    def _do_clear_cache(self) -> None:
        """Actually clear the chunk cache."""
        if self.on_clear_cache:
            success = self.on_clear_cache(self.world_name)
            if success:
                self.total_chunks = 0
                self.cache_size_bytes = 0
                self._storage_bar.set_value(0, self.max_cache_bytes)
                self._show_status("Cache cleared")
            else:
                self._show_status("Failed to clear cache", is_error=True)
        self._confirm_dialog = None

    # ===== Rendering =====

    def render_content(self, ui: "UIRenderer") -> None:
        """Render all modal content sections."""
        y = self.content_y

        # World info header
        info_text = f"{self.world_name}  |  Seed: {self.world_seed}"
        ui.draw_text(info_text, self.content_x, y, INFO_VALUE_COLOR, scale=0.85)
        y += 20

        # Divider
        ui.draw_rect(self.content_x, y, self.content_width, 1, SECTION_DIVIDER_COLOR)
        y += 15

        # Rename section
        y = self._render_rename_section(ui, y)

        # Duplicate section
        y = self._render_duplicate_section(ui, y)

        # Storage section
        y = self._render_storage_section(ui, y)

        # Export/Import section
        y = self._render_export_import_section(ui, y)

        # Danger zone
        y = self._render_danger_zone(ui, y)

        # Status message
        self._render_status(ui)

        # Confirm dialog on top
        if self._confirm_dialog and self._confirm_dialog.visible:
            self._confirm_dialog.render(ui)

    def _render_rename_section(self, ui: "UIRenderer", y: float) -> float:
        """Render rename world section."""
        ui.draw_text("Rename World", self.content_x, y, SECTION_LABEL_COLOR, scale=0.9)
        y += 22

        # Position and render input
        input_width = self.content_width - self.BTN_WIDTH - 15
        self._rename_input.x = self.content_x
        self._rename_input.y = y
        self._rename_input.width = input_width
        self._rename_input.height = self.BTN_HEIGHT
        self._rename_input.render(ui)

        # Rename button
        rx, ry, rw, rh = self._get_rename_btn_rect()
        btn_color = ACTION_BTN_HOVER if self._rename_btn_hovered else ACTION_BTN_COLOR
        ui.draw_rect(rx, ry, rw, rh, btn_color)
        txt_w, txt_h = ui.measure_text("Rename", scale=0.85)
        ui.draw_text("Rename", rx + (rw - txt_w) / 2, ry + (rh - txt_h) / 2,
                     BTN_TEXT_COLOR, scale=0.85)

        return y + self.BTN_HEIGHT + self.SECTION_SPACING

    def _render_duplicate_section(self, ui: "UIRenderer", y: float) -> float:
        """Render duplicate world section."""
        ui.draw_text("Duplicate World", self.content_x, y, SECTION_LABEL_COLOR, scale=0.9)
        y += 22

        # Position and render input
        input_width = self.content_width - self.BTN_WIDTH - 15
        self._duplicate_input.x = self.content_x
        self._duplicate_input.y = y
        self._duplicate_input.width = input_width
        self._duplicate_input.height = self.BTN_HEIGHT
        self._duplicate_input.render(ui)

        # Duplicate button
        dx, dy, dw, dh = self._get_duplicate_btn_rect()
        btn_color = ACTION_BTN_HOVER if self._duplicate_btn_hovered else ACTION_BTN_COLOR
        ui.draw_rect(dx, dy, dw, dh, btn_color)
        txt_w, txt_h = ui.measure_text("Copy", scale=0.85)
        ui.draw_text("Copy", dx + (dw - txt_w) / 2, dy + (dh - txt_h) / 2,
                     BTN_TEXT_COLOR, scale=0.85)

        return y + self.BTN_HEIGHT + self.SECTION_SPACING

    def _render_storage_section(self, ui: "UIRenderer", y: float) -> float:
        """Render storage information section."""
        ui.draw_text("Storage", self.content_x, y, SECTION_LABEL_COLOR, scale=0.9)
        y += 22

        # Progress bar
        self._storage_bar.x = self.content_x
        self._storage_bar.y = y
        self._storage_bar.render(ui)
        y += 28

        # Stats text
        cache_mb = self.cache_size_bytes / (1024 * 1024)
        max_mb = self.max_cache_bytes / (1024 * 1024)
        meta_kb = self.metadata_size_bytes / 1024

        stats_text = f"Chunks: {self.total_chunks}  |  Cache: {cache_mb:.1f}/{max_mb:.0f} MB  |  Meta: {meta_kb:.1f} KB"
        ui.draw_text(stats_text, self.content_x, y, HINT_COLOR, scale=0.75)

        return y + 20 + self.SECTION_SPACING

    def _render_export_import_section(self, ui: "UIRenderer", y: float) -> float:
        """Render export and import buttons."""
        ui.draw_text("Transfer", self.content_x, y, SECTION_LABEL_COLOR, scale=0.9)
        y += 22

        # Export button
        ex, ey, ew, eh = self._get_export_btn_rect()
        btn_color = ACTION_BTN_HOVER if self._export_btn_hovered else ACTION_BTN_COLOR
        ui.draw_rect(ex, ey, ew, eh, btn_color)
        txt_w, txt_h = ui.measure_text("Export World", scale=0.85)
        ui.draw_text("Export World", ex + (ew - txt_w) / 2, ey + (eh - txt_h) / 2,
                     BTN_TEXT_COLOR, scale=0.85)

        # Import button
        ix, iy, iw, ih = self._get_import_btn_rect()
        btn_color = ACTION_BTN_HOVER if self._import_btn_hovered else ACTION_BTN_COLOR
        ui.draw_rect(ix, iy, iw, ih, btn_color)
        txt_w, txt_h = ui.measure_text("Import World", scale=0.85)
        ui.draw_text("Import World", ix + (iw - txt_w) / 2, iy + (ih - txt_h) / 2,
                     BTN_TEXT_COLOR, scale=0.85)

        return y + 36 + self.SECTION_SPACING

    def _render_danger_zone(self, ui: "UIRenderer", y: float) -> float:
        """Render danger zone section."""
        # Divider with warning color
        danger_line_color = (180, 60, 60, 255)
        ui.draw_rect(self.content_x, y, self.content_width, 1, danger_line_color)
        y += 12

        ui.draw_text("Danger Zone", self.content_x, y, danger_line_color, scale=0.9)
        y += 25

        # Clear cache button
        cx, cy, cw, ch = self._get_clear_cache_btn_rect()
        btn_color = DANGER_BTN_HOVER if self._clear_cache_btn_hovered else DANGER_BTN_COLOR
        ui.draw_rect(cx, cy, cw, ch, btn_color)
        txt_w, txt_h = ui.measure_text("Clear Cache", scale=0.85)
        ui.draw_text("Clear Cache", cx + (cw - txt_w) / 2, cy + (ch - txt_h) / 2,
                     BTN_TEXT_COLOR, scale=0.85)

        # Warning text
        y = cy + ch + 12
        warning_color = (150, 100, 100, 255)
        ui.draw_text("Deletes all cached chunks.", self.content_x, y, warning_color, scale=0.7)
        y += 14
        ui.draw_text("World will regenerate from seed.", self.content_x, y, warning_color, scale=0.7)

        return y + 20

    def _render_status(self, ui: "UIRenderer") -> None:
        """Render status message if active."""
        if not self._status_message or self._status_timer <= 0:
            return

        color = STATUS_ERROR_COLOR if self._status_is_error else STATUS_SUCCESS_COLOR
        status_y = self.y + self.height - 35
        ui.draw_text(self._status_message, self.content_x, status_y, color, scale=0.85)

    def render(self, ui: "UIRenderer") -> None:
        """Render the modal with confirm dialog on top if present."""
        if not self.visible:
            return

        self.render_backdrop(ui)
        self.render_frame(ui)
        self.render_content(ui)
