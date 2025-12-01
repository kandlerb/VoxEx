# CLAUDE.md - VoxEx AI Assistant Guide

## Project Overview

**VoxEx v3.204** is a fully-featured, browser-based voxel exploration game inspired by Minecraft. It's a single-file HTML application that runs entirely in the browser without requiring external servers or installations.

**Key Characteristics:**
- **Type**: Browser-based 3D voxel game engine
- **Platform**: HTML5 + JavaScript ES6 modules
- **Main File**: `v3.204_VoxEx.html` (~52,831 tokens, ~3,580 lines)
- **Architecture**: Self-contained single-page application
- **Tech Stack**: Three.js r160, WebGL, IndexedDB, LocalStorage

## Repository Structure

```
VoxEx/
├── .git/                           # Git repository data
├── v3.204_VoxEx.html              # Complete application (HTML + CSS + JS)
└── CLAUDE.md                       # This file
```

**Important**: This is a single-file application. All functionality is contained within `v3.204_VoxEx.html`.

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Three.js** | 0.160.0 | 3D rendering, lighting, camera control |
| **PointerLockControls** | Three.js addon | First-person camera/input control |
| **IndexedDB** | Native browser API | Chunk data persistence with RLE compression |
| **LocalStorage** | Native browser API | Game saves and settings storage |
| **Canvas API** | Native | Procedural texture generation |
| **WebGL** | Via Three.js | GPU-accelerated rendering |

## Architecture Overview

```
VoxEx Architecture:
┌─────────────────────────────────────────────────────────────┐
│                    UI Layer (HTML/CSS)                       │
│  - Start Menu, Pause Menu, Settings, Controls, Hotbar       │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Game Engine (Three.js Renderer)                 │
│  - Camera, Lighting (Sun/Moon), Sky, Debug Grid             │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│           World Management System                            │
│  ├─ Chunk Generation & Management                           │
│  ├─ Biome System (5 biome types)                            │
│  ├─ Terrain Generation (Perlin Noise)                       │
│  ├─ Structure Generation (Trees, Caves, Rivers)             │
│  └─ Block Placement & Destruction                           │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│         Data Persistence Layer                              │
│  ├─ IndexedDB (Chunk Cache with RLE Compression)           │
│  ├─ LocalStorage (Game Saves & Settings)                   │
│  └─ Chunk Compression/Decompression (RLE)                  │
└─────────────────────────────────────────────────────────────┘
```

## Code Organization

The `v3.204_VoxEx.html` file is organized into logical sections:

### 1. HTML Structure (Lines 1-278)
- Document metadata and viewport configuration
- CSS styling for UI components
- DOM elements (menus, hotbar, overlays)
- Three.js ES6 module import map

### 2. JavaScript Module (Line 292+)

**Configuration Objects:**
- `WORLD_CONFIG` - World generation parameters
- `BIOME_CONFIG` - Biome definitions and weights
- `TREE_CONFIG` - Tree generation parameters
- `SETTINGS` - User settings and performance parameters
- `WORLD_DIMS` - Chunk dimensions and constraints

**Core Systems:**
1. **Utility Classes & Functions**
   - `SeededRandom` - Deterministic random number generator
   - `Float32ArrayPool` - Memory pool for mesh geometry
   - `ChunkCompressor` - RLE compression/decompression
   - `SaveManager` - LocalStorage persistence
   - Noise functions (2D, 3D, FBM, domain warping)
   - Biome selection and blending

2. **World Generation**
   - Height generation (biome-specific)
   - Terrain layers (solids, water, decorations)
   - Tree generation (forests & default)
   - Cave generation (3D noise tunnels)
   - River generation (domain warping)
   - `generateChunkData()` - Main generation pipeline

3. **Rendering System**
   - Texture generation (canvas-based)
   - Material setup (terrain + water)
   - Face vertex generation with AO
   - Mesh pooling for performance
   - `addFace()` - Geometry construction
   - `renderChunk()` - Mesh creation and optimization

4. **Chunk Management**
   - `updateChunks()` - Dynamic load/unload
   - `processChunkQueue()` - Mesh building
   - Frustum culling for directional loading
   - Cleanup & cache pruning
   - Neighbor updates on block changes

5. **Physics & Collision**
   - `collide()` - AABB collision detection
   - `checkGround()` - Ground detection
   - `pickVoxel()` - DDA raycasting for block selection
   - `updateHighlight()` - Block outline rendering

6. **Player Mechanics**
   - Movement input handling (WASD, Sprint, Crouch)
   - Gravity & jump physics
   - Flight mode (double-tap Space)
   - Block breaking/placing
   - Day/night cycle progression

7. **Persistence**
   - IndexedDB initialization
   - Chunk caching with compression
   - Save/load world state
   - Pre-generation system for spawn area

8. **UI Event Handlers**
   - Menu navigation
   - Settings changes with live updates
   - Keyboard/mouse input
   - Window resize handling

9. **Main Game Loop** (`animate()`)
   - Physics updates
   - Rendering
   - Chunk queue processing
   - FPS tracking

## Key Systems Explained

### Chunk System

**Structure:**
- Chunks are 16×16×128 blocks (X×Z×Y)
- Block data stored as `Uint8Array` (one byte per block)
- Chunk keys: `"${cx},${cz}"` format

**Lifecycle:**
```
Generation → Caching → Loading → Rendering → Cleanup
```

**Performance Parameters:**
```javascript
renderDistance: 8,              // Chunks in each direction
buildQueueLimit: 8,             // Meshes built per frame
maxCachedChunks: 1200,         // Max in-memory chunks
preGenRenderDistance: 16,      // Initial spawn radius
```

### Block System

**Block Types:**
```javascript
AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, WOOD = 4,
LOG = 5, LEAVES = 6, BEDROCK = 7, SAND = 8, WATER = 9
```

**Block Interaction:**
- Left Click: Mine block (0.5s default)
- Right Click: Place block (selected from hotbar)
- Keys 1-8: Select block type
- Cannot break bedrock
- Collision checking prevents placing inside player

### World Generation

**Biomes (5 types):**
1. **Plains** - Low-frequency rolling hills
2. **Forests** - Standard FBM with dense trees
3. **Hills** - Rounded "humps" (absolute value squared)
4. **Mountains** - Sharp peaks (ridged multifractal)
5. **Swamp** - Low amplitude, flat terrain

**Generation Pipeline (3 passes):**
```
Pass 1: Height Cache
  └─ Compute height for each XZ column

Pass 2: Solids & Water
  ├─ Bedrock layer (Y=0)
  ├─ Terrain layers (grass/dirt/stone)
  ├─ Cave carving (3D noise tunnels)
  └─ Water filling (to sea level)

Pass 3: Decorations
  ├─ Tree generation
  ├─ Tree mask culling (prevent overlap)
  └─ Canopy placement
```

**Special Features:**
- **Rivers**: Domain-warped noise, ~8 blocks wide
- **Caves**: 3D noise tunnels, fade near surface
- **Trees**: Noise-based placement, 5-11 blocks tall

### Rendering System

**Mesh Generation:**
1. Iterate all blocks in chunk
2. Check 6 faces per block
3. Cull hidden faces (adjacent solid blocks)
4. Generate vertices with AO (ambient occlusion)
5. Separate terrain and water meshes
6. Use geometry pooling for performance

**Materials:**
- **Terrain**: Lambert material + vertex colors (AO)
- **Water**: Transparent, blue tint, separate render pass

**Lighting:**
- Directional light (sun/moon) follows day/night cycle
- Ambient light varies with time of day
- PCF shadow mapping (optional)
- Day/night cycle: 360 seconds (configurable)

### Physics & Movement

**Player Movement:**
- Base speed: 50 units/s
- Sprint: ×2.0 multiplier (Shift key)
- Crouch: ×0.5 multiplier + reduced eye height (C key)
- Jump force: 10 units/s (Space)
- Gravity: 30 units/s²
- Flight mode: Double-tap Space

**Collision:**
- Bounding box: 0.6×1.7×0.6 (width×height×depth)
- Multi-step physics (up to 10 steps per frame)
- Axis-aligned collision (x, y, z separate)
- 4-corner ground detection

### Data Persistence

**IndexedDB (Chunks):**
- RLE compression (~50-70% reduction)
- Cache up to 1,200 chunks in memory
- Automatic pruning when limit reached

**LocalStorage (Saves):**
- Save slots with metadata
- Stores: seed, position, rotation, modified chunks
- Settings persistence (AO, shadows, render distance, etc.)

## Naming Conventions

```javascript
// Chunk coordinates (global grid)
cx, cz                        // Chunk X/Z

// Local block coordinates (within chunk 0-15)
lx, ly, lz                    // Local X/Y/Z

// World/global coordinates
gx, gy, gz                    // Global X/Y/Z

// Chunk keys
getChunkKey(cx, cz) → "${cx},${cz}"

// UI elements
#slot-1 through #slot-8       // Hotbar slots
#debug-overlay                // Debug info display
#chunk-loader                 // Loading indicator
#blocker                      // Menu overlay
```

## Development Guidelines for AI Assistants

### When Making Changes

1. **Read First**: Always read `v3.204_VoxEx.html` before making any changes
   - File is large (~52,831 tokens), use offset/limit or grep for targeted reading
   - Understand context around changes

2. **Single-File Architecture**: All code is in one HTML file
   - Changes affect HTML structure, CSS styling, or embedded JavaScript
   - Be careful with line numbers when editing

3. **Test Before Committing**:
   - VoxEx runs in browser - open in modern browser to test
   - Check console for JavaScript errors
   - Test affected features (e.g., if changing chunk gen, test world loading)

4. **Performance Considerations**:
   - Changes to rendering/chunk management affect FPS
   - Keep buildQueueLimit reasonable (8 is well-tested)
   - Be cautious with loop optimizations in hot paths

5. **Preserve Configuration**:
   - Don't change `WORLD_CONFIG`, `BIOME_CONFIG`, etc. without good reason
   - These affect existing saved worlds
   - Changing world gen breaks reproducibility from seeds

### Common Tasks

#### Adding a New Block Type

1. Add constant: `const NEWBLOCK = 10;`
2. Update `blockIds` object
3. Add texture generation in texture setup section
4. Add to hotbar HTML (slot-9)
5. Update texture atlas size if needed

#### Modifying World Generation

1. Locate `generateChunkData()` function
2. Make changes to appropriate pass (Height/Solids/Decorations)
3. Test with consistent seed to verify changes
4. Consider impact on existing worlds (may need versioning)

#### Adjusting Performance

1. Modify `SETTINGS` object for render distance, build queue, etc.
2. Test FPS impact with debug overlay (`~` key)
3. Dynamic render distance can auto-adjust (see `dynamicRenderDistance`)

#### Adding UI Features

1. Add HTML in appropriate `<div>` section
2. Add CSS styling in `<style>` block
3. Add event handlers in JavaScript section
4. Update menu navigation logic if needed

### Code Style Conventions

- **Indentation**: Tabs
- **Naming**: camelCase for variables/functions
- **Constants**: UPPER_CASE for block types and globals
- **Comments**: Use `//` for single-line, `/* */` for blocks
- **Strings**: Use backticks for template literals

### Performance Best Practices

1. **Avoid Creating New Functions in Loops**: Pre-define reusable functions
2. **Use Geometry Pooling**: Reuse Float32Arrays when possible
3. **Batch Updates**: Group chunk updates, avoid single-block rebuilds
4. **Cache Calculations**: Height maps, biome data, face vertices
5. **Limit Per-Frame Work**: Respect `buildQueueLimit`

### Debugging Tips

1. **Enable Debug Overlay**: Press `~` key in-game
   - Shows FPS, position, biome, chunk counts
   - Useful for diagnosing performance issues

2. **Browser Console**: Open DevTools (F12)
   - Check for JavaScript errors
   - Use `console.log()` for debugging
   - Monitor IndexedDB in Application tab

3. **Common Issues**:
   - **Low FPS**: Reduce render distance or disable shadows/AO
   - **Chunks Not Loading**: Check console for errors, verify chunk generation
   - **Blocks Not Placing**: Check collision detection, verify block type exists
   - **Save/Load Fails**: Check LocalStorage/IndexedDB permissions

## Git Workflow

### Branch Convention
- Feature branches: `claude/claude-md-<session-id>`
- Main branch: (check repository settings)

### Commit Guidelines

1. **Clear Messages**: Describe what changed and why
   ```bash
   git commit -m "Add new block type: Glass with transparency"
   ```

2. **Test Before Push**: Always verify changes work in browser

3. **Push with Upstream**:
   ```bash
   git push -u origin claude/claude-md-<session-id>
   ```

4. **Network Retry**: Retry up to 4 times with exponential backoff if push fails

## File Locations Reference

Since this is a single-file application, use these search patterns:

### Find Configuration:
```bash
grep -n "const WORLD_CONFIG" v3.204_VoxEx.html
grep -n "const BIOME_CONFIG" v3.204_VoxEx.html
grep -n "const SETTINGS" v3.204_VoxEx.html
```

### Find Functions:
```bash
grep -n "function generateChunkData" v3.204_VoxEx.html
grep -n "function renderChunk" v3.204_VoxEx.html
grep -n "function updateChunks" v3.204_VoxEx.html
```

### Find UI Elements:
```bash
grep -n "id=\"blocker\"" v3.204_VoxEx.html
grep -n "id=\"hotbar\"" v3.204_VoxEx.html
grep -n "id=\"debug-overlay\"" v3.204_VoxEx.html
```

## Common Commands

### Development:
```bash
# Open in browser (Linux)
xdg-open v3.204_VoxEx.html

# Search for specific function
grep -n "function nameHere" v3.204_VoxEx.html

# Count lines of code
wc -l v3.204_VoxEx.html
```

### Git Operations:
```bash
# Check status
git status

# Stage changes
git add v3.204_VoxEx.html

# Commit with message
git commit -m "Description of changes"

# Push to branch
git push -u origin claude/claude-md-<session-id>

# View recent commits
git log --oneline -10
```

## Important Notes for AI Assistants

### DO:
- ✓ Read the file before making changes
- ✓ Test changes in a browser
- ✓ Preserve existing functionality unless explicitly asked to change
- ✓ Use grep/search to find specific sections in the large file
- ✓ Consider performance impact of changes
- ✓ Update comments when changing code behavior
- ✓ Maintain consistent code style

### DON'T:
- ✗ Change world generation without understanding seed reproducibility
- ✗ Modify configuration constants without testing impact
- ✗ Add external dependencies (keep single-file architecture)
- ✗ Break existing save game compatibility without versioning
- ✗ Introduce performance regressions (monitor FPS)
- ✗ Remove features without explicit request
- ✗ Change file structure (keep single HTML file)

## Performance Benchmarks

**Target Metrics:**
- FPS: 60 (target), 30-50 (acceptable)
- Chunk builds per frame: 8 (maximum)
- Chunk update frequency: 200ms
- Max chunks in memory: 1,200
- Render distance: 6-16 chunks (dynamic)

**Typical Resource Usage:**
- Memory: ~500MB-1GB (browser process)
- IndexedDB: ~50-200MB (depends on exploration)
- LocalStorage: <1MB (saves + settings)

## Troubleshooting Guide

### Issue: Low FPS / Performance
**Solutions:**
- Reduce render distance in settings
- Disable shadows
- Disable ambient occlusion
- Lower texture resolution to 16x
- Enable dynamic render distance

### Issue: Chunks Not Loading
**Check:**
- Browser console for errors
- IndexedDB permissions
- Chunk generation function (`generateChunkData`)
- Render distance settings

### Issue: Blocks Not Placing
**Check:**
- Selected block type (hotbar)
- Collision with player bounding box
- Target block within range (8 blocks)
- Block type exists in `blockIds`

### Issue: Save/Load Not Working
**Check:**
- LocalStorage enabled in browser
- Save slot not corrupted
- Console errors during save/load
- JSON parse errors

## Additional Resources

### Three.js Documentation:
- Docs: https://threejs.org/docs/
- Examples: https://threejs.org/examples/

### WebGL/Graphics:
- WebGL Fundamentals: https://webglfundamentals.org/
- GPU Gems (advanced): https://developer.nvidia.com/gpugems/

### Procedural Generation:
- Perlin Noise: https://en.wikipedia.org/wiki/Perlin_noise
- Fractional Brownian Motion: https://iquilezles.org/articles/fbm/

## Version History

- **v3.204** - Current version
  - Single-file HTML application
  - Complete voxel game engine
  - 5 biomes, procedural generation
  - IndexedDB persistence
  - Dynamic render distance
  - Day/night cycle

## Contact & Support

This is a single-developer project. For issues or questions:
- Check browser console for errors
- Review this guide for common solutions
- Test in latest Chrome/Firefox for best compatibility

---

**Last Updated**: 2025-12-01
**File Version**: v3.204
**Documentation Version**: 1.0
