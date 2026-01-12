# VoxEx Start Menu Setup Plan

## Overview

This document compares the JavaScript (voxEx.html) and Python (voxel_engine/) start menu implementations and outlines what needs to be set up and wired for the Python version to achieve feature parity.

---

## Current State Comparison

### JavaScript (voxEx.html) - Full Featured

The JavaScript version has a comprehensive multi-screen start menu system:

#### 1. Main Menu (`#seed-menu` - lines 1547-1569)
- Title: "VoxEx" / "The HTML Voxel Explorer"
- **Create New World** button → navigates to Create World Panel
- **Saved Worlds Container** with:
  - World cards (thumbnail, name, seed, date, size)
  - Selection mechanism (click to select)
  - Per-world Delete and Manage buttons
- **Play Selected World** button (disabled until selection)
- **Total Storage Overview** display
- **Settings** button → opens Settings Menu

#### 2. Create World Panel (`#create-world-panel` - lines 1627-1760)
- World Name input field
- Seed input with Random and Copy buttons
- **World Type Presets** (6 options):
  - Default, Amplified, Flat, Archipelago, Superflat, Caves+
- **Biome Selection** grid (toggle biomes on/off)
- **Structure Toggles**:
  - Trees (checkbox)
  - Caves (checkbox + density slider)
  - Rivers (checkbox)
- **Terrain Settings** sliders:
  - Tree Density (0-200%)
  - Terrain Amplitude (25-200%)
  - Sea Level (40-80)
- **Advanced Options** (collapsible):
  - Biome Size (25-400%)
  - Noise Persistence (0.20-0.80)
  - Noise Lacunarity (1.5-3.0)
  - Spawn Coordinates (X, Z)
- **World Preview Canvas** (real-time terrain preview)
- Back to Menu button
- Start Game button

#### 3. World Management Modal (`#world-manage-modal` - lines 1571-1626)
- Rename World input + button
- Duplicate World input + button
- Storage Info (progress bar + stats)
- Export/Import buttons
- Clear Chunk Cache (danger zone)

#### 4. Settings System (lines 2070-2500+)
- Settings Search with autocomplete
- Quick Profiles (Performance, Balanced, Quality, Custom)
- **Categories**:
  - **Performance**:
    - Rendering (Dynamic Render Distance, Frustum Culling, FPS Thresholds, Pixel Ratio)
    - Streaming (Build Queue, Pre-gen Distance, Max Cached Chunks)
  - **Graphics**:
    - Visual (AO, Texture Resolution, Antialiasing)
    - Lighting (Shadows, Shadow Quality, Bias, Softness, Sun Color/Intensity)
    - Water (Transparency, Animation, Reflections)
    - Effects (Volumetric, God Rays, Fog, Vignette)
  - **Gameplay**:
    - Movement (Walk Speed, Sprint Speed, Jump Force, Fly Speed)
    - Controls (Mouse Sensitivity, Invert Y)
  - **World**:
    - Day/Night Cycle, Day Length, Time of Day

---

### Python (voxel_engine/engine/ui/start_menu.py) - Basic

The Python version has a minimal start menu:

#### 1. StartMenu Class (lines 308-549)
- Title: "VoxEx" / "The Python Voxel Explorer"
- Seed display (random number, read-only)
- **Create New World** button → triggers `MenuAction.CREATE_WORLD`
- **Settings** button → triggers `MenuAction.SETTINGS`
- 'R' key to randomize seed
- Footer hint text

#### 2. SettingsPanel Class (lines 77-305)
- Render Distance slider (2-16)
- Back button

---

## Gap Analysis: What Needs to Be Implemented

### Priority 1: Core Functionality (Required for Basic Operation)

| Feature | Python Location | Status | Notes |
|---------|-----------------|--------|-------|
| Seed input (editable) | `start_menu.py` | Missing | Need text input component |
| Start Game action | `MenuAction` | Missing | Only has CREATE_WORLD, need to wire to game init |
| Game initialization | `game.py` | Partial | Need to wire seed → world generation |

### Priority 2: Saved Worlds System

| Feature | Python Location | Status | Notes |
|---------|-----------------|--------|-------|
| World cards UI | `start_menu.py` | Missing | Need `WorldCard` component class |
| World list container | `start_menu.py` | Missing | Scrollable list of cards |
| World selection | `start_menu.py` | Missing | Click handling + selection state |
| Load World button | `start_menu.py` | Missing | New button with `MenuAction.LOAD_WORLD` |
| Delete World | `start_menu.py` | Missing | Confirmation dialog + delete action |
| Save/Load persistence | `persistence/` | Exists | Already have `save_manager.py` |

### Priority 3: Create World Panel

| Feature | Status | Notes |
|---------|--------|-------|
| World Name input | Missing | Text input component |
| Seed input + buttons | Missing | Input + Random/Copy buttons |
| World Type Presets | Missing | 6 preset buttons with configs |
| Biome Selection grid | Missing | Toggle buttons for each biome |
| Structure toggles | Missing | Checkbox components |
| Terrain sliders | Missing | Tree density, amplitude, sea level |
| Advanced options | Missing | Collapsible section |
| World Preview | Missing | Noise-based terrain preview |
| Back navigation | Missing | Return to main menu |

### Priority 4: World Management Modal

| Feature | Status | Notes |
|---------|--------|-------|
| Modal overlay | Missing | Popup panel component |
| Rename input | Missing | Text input + save action |
| Duplicate | Missing | Copy world with new name |
| Storage info | Missing | Calculate and display sizes |
| Export/Import | Missing | File serialization |
| Clear Cache | Missing | IndexedDB equivalent cleanup |

### Priority 5: Extended Settings

| Feature | Status | Notes |
|---------|--------|-------|
| Settings categories | Missing | Nested menu structure |
| Performance settings | Partial | Only render distance exists |
| Graphics settings | Missing | AO, shadows, water, effects |
| Gameplay settings | Missing | Movement speeds, sensitivity |
| World settings | Missing | Day/night cycle |
| Profiles | Missing | Preset configurations |
| Settings search | Missing | Filter/search UI |

---

## Implementation Order

### Phase 1: Wire Existing Components (Minimal Effort)

1. **Add `MenuAction.START_GAME`** to `pause_menu.py`
2. **Wire Create World button** to call game initialization with seed
3. **Add seed input field** (requires text input component)

### Phase 2: Saved Worlds (Core Feature)

1. **Create `WorldCard` component** in `start_menu.py`:
   ```python
   class WorldCard:
       name: str
       seed: int
       timestamp: float
       size_bytes: int
       thumbnail: Optional[bytes]
       selected: bool
   ```

2. **Add `WorldListPanel` component**:
   ```python
   class WorldListPanel:
       cards: List[WorldCard]
       selected_index: int
       scroll_offset: float
   ```

3. **Wire to `SaveManager`**:
   - `SaveManager.list_saves()` → populate cards
   - `SaveManager.load()` → load selected world
   - `SaveManager.delete()` → remove world

4. **Add "Play Selected World" button**

### Phase 3: Create World Panel (Enhanced UX)

1. **Create `CreateWorldPanel` class** (new file or extend `start_menu.py`):
   ```python
   class CreateWorldPanel:
       visible: bool
       world_name: str
       seed: str
       preset: str  # 'default', 'amplified', etc.
       biome_toggles: Dict[str, bool]
       tree_density: float
       terrain_amplitude: float
       sea_level: int
       # ... advanced options
   ```

2. **Add input components**:
   - `TextInput` class for name/seed
   - `Slider` class (already have this)
   - `Checkbox` class for toggles
   - `PresetButton` class for world types

3. **Add preview renderer** (optional - complex):
   - Generate noise-based heightmap
   - Render to texture
   - Display in panel

### Phase 4: World Management Modal

1. **Create `ModalOverlay` base class**
2. **Create `WorldManageModal` class**
3. **Wire storage calculation**
4. **Implement export/import** (JSON serialization)

### Phase 5: Extended Settings

1. **Restructure `SettingsPanel`** into category-based navigation:
   ```
   SettingsPanel (main)
   ├── PerformanceSettings
   │   ├── RenderingSettings
   │   └── StreamingSettings
   ├── GraphicsSettings
   │   ├── VisualSettings
   │   ├── LightingSettings
   │   ├── WaterSettings
   │   └── EffectsSettings
   ├── GameplaySettings
   └── WorldSettings
   ```

2. **Add settings to `game_state.py`** or dedicated settings file
3. **Wire settings to game systems**

---

## File Changes Required

### New Files

| File | Purpose |
|------|---------|
| `engine/ui/text_input.py` | Text input component |
| `engine/ui/checkbox.py` | Checkbox component |
| `engine/ui/modal.py` | Modal overlay base |
| `engine/ui/world_card.py` | World card component |
| `engine/ui/create_world_panel.py` | Create world screen |
| `engine/ui/world_manage_modal.py` | World management popup |

### Modified Files

| File | Changes |
|------|---------|
| `engine/ui/pause_menu.py` | Add `MenuAction.START_GAME`, `LOAD_WORLD` |
| `engine/ui/start_menu.py` | Add world list, navigation, input handling |
| `engine/ui/constants.py` | Add colors/sizes for new components |
| `engine/ui/__init__.py` | Export new components |
| `engine/state/game_state.py` | Add settings state (if not using separate file) |
| `engine/game.py` | Handle menu navigation and game initialization |

---

## UI Component Dependencies

```
UIRenderer (existing)
├── BitmapFont (existing)
├── draw_rect (existing)
├── draw_text (existing)
└── measure_text (existing)

New Components Needed:
├── TextInput
│   ├── text: str
│   ├── focused: bool
│   ├── cursor_pos: int
│   ├── render(ui: UIRenderer)
│   └── handle_key(key: str)
├── Checkbox
│   ├── checked: bool
│   ├── label: str
│   └── render(ui: UIRenderer)
├── WorldCard
│   ├── name, seed, timestamp, size
│   ├── selected: bool
│   ├── render(ui: UIRenderer)
│   └── contains(mx, my) -> bool
├── Modal
│   ├── visible: bool
│   ├── title: str
│   ├── content: List[Widget]
│   └── render(ui: UIRenderer)
└── PresetButton
    ├── label: str
    ├── selected: bool
    └── render(ui: UIRenderer)
```

---

## Settings Configuration Schema

```python
# Suggested structure for settings state
@dataclass
class PerformanceSettings:
    render_distance: int = 8
    dynamic_render_distance: bool = False
    frustum_culling: bool = True
    min_fps_threshold: int = 30
    max_fps_threshold: int = 50
    pixel_ratio: float = 1.0
    build_queue_limit: int = 8
    pregen_distance: int = 16
    max_cached_chunks: int = 350

@dataclass
class GraphicsSettings:
    ambient_occlusion: bool = True
    texture_resolution: int = 16
    antialiasing: bool = False
    shadows: bool = True
    shadow_quality: int = 1024
    shadow_bias: float = 0.0001
    shadow_softness: float = 0.0
    # ... water, effects, etc.

@dataclass
class GameplaySettings:
    walk_speed: float = 4.3
    sprint_speed: float = 5.6
    jump_force: float = 8.5
    fly_speed: float = 10.8
    mouse_sensitivity: float = 0.002
    invert_y: bool = False

@dataclass
class WorldSettings:
    day_night_cycle: bool = True
    day_length: float = 1200.0
    time_of_day: float = 0.25  # 0-1
```

---

## World Generation Settings (for Create World Panel)

```python
@dataclass
class WorldGenSettings:
    # Basic
    name: str = "New World"
    seed: Optional[int] = None  # None = random

    # Preset
    preset: str = "default"  # default, amplified, flat, archipelago, superflat, caves

    # Biomes (which are enabled)
    enabled_biomes: Set[str] = field(default_factory=lambda: {
        'plains', 'hills', 'forests', 'mountains', 'swamp', 'longwoods'
    })

    # Structures
    enable_trees: bool = True
    enable_caves: bool = True
    cave_density: float = 1.0  # 0-2
    enable_rivers: bool = True

    # Terrain
    tree_density: float = 1.0  # 0-2
    terrain_amplitude: float = 1.0  # 0.25-2
    sea_level: int = 60  # 40-80

    # Advanced
    biome_size: float = 1.0  # 0.25-4
    noise_persistence: float = 0.5  # 0.2-0.8
    noise_lacunarity: float = 2.0  # 1.5-3.0
    spawn_x: int = 0
    spawn_z: int = 0
```

---

## Event Flow

### Creating New World
```
1. User clicks "Create New World" on main menu
2. → Show CreateWorldPanel
3. User configures world settings
4. User clicks "Start Game"
5. → Validate settings
6. → Generate seed if not provided
7. → Pass WorldGenSettings to Game.initialize()
8. → Hide menus, start game
```

### Loading Saved World
```
1. User clicks world card in saved worlds list
2. → Mark card as selected
3. → Enable "Play Selected World" button
4. User clicks "Play Selected World"
5. → SaveManager.load(world_name)
6. → Extract seed, player position, modified chunks
7. → Game.initialize(seed, player_data, chunks)
8. → Hide menus, start game
```

### Managing World
```
1. User clicks gear icon on world card
2. → Open WorldManageModal
3. User can:
   a. Rename → SaveManager.rename()
   b. Duplicate → SaveManager.copy()
   c. Export → SaveManager.export_to_file()
   d. Import → SaveManager.import_from_file()
   e. Clear Cache → SaveManager.clear_chunks()
   f. Close modal
```

---

## Summary

### Immediate Actions (to match basic JS functionality)

1. Add editable seed input to `StartMenu`
2. Wire "Create New World" to actually initialize the game
3. Connect to `SaveManager` for listing saved worlds
4. Add world card display for saved games
5. Add "Play Selected World" button

### Medium-term (full Create World panel)

1. Build `CreateWorldPanel` with all world generation options
2. Add world type presets
3. Add biome selection
4. Add terrain sliders
5. Add advanced options

### Long-term (parity with JS version)

1. World management modal
2. Extended settings categories
3. Settings profiles
4. World preview renderer
5. Export/import functionality

---

*Generated: 2026-01-11*
*Based on analysis of voxEx.html and voxel_engine/engine/ui/start_menu.py*
