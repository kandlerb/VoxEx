# VoxEx

**The Modular Voxel Explorer** - A browser-based voxel game engine inspired by Minecraft.

## Play

- **Modular Version**: https://kandlerb.github.io/VoxEx/
- **Standalone Version**: Download `voxEx.html` for offline play

## Architecture

VoxEx now supports two modes:
1. **Modular ES Modules** (`index.html`) - For development, served via GitHub Pages
2. **Single-File Standalone** (`voxEx.html`) - ~23K lines, works offline

### Project Structure

```
VoxEx/
├── index.html          # Modular entry point (ES modules)
├── voxEx.html          # Standalone offline version (~23K lines)
├── src/
│   ├── main.js         # Game initialization
│   ├── core/           # Constants and type definitions
│   │   ├── index.js
│   │   ├── constants.js    # Block IDs (AIR, GRASS, STONE, etc.)
│   │   └── types.js        # JSDoc type definitions
│   ├── config/         # All configuration objects
│   │   ├── index.js
│   │   ├── BlockConfig.js  # Block properties, textures, inventory
│   │   ├── WorldConfig.js  # World dimensions, chunk settings
│   │   ├── BiomeConfig.js  # Biome definitions (6 biomes)
│   │   ├── TreeConfig.js   # Tree generation parameters
│   │   ├── Settings.js     # Game settings and profiles
│   │   ├── ZombieConfig.js # Zombie behavior parameters
│   │   ├── PlayerConfig.js # Player physics and proportions
│   │   └── PosePresets.js  # Animation pose definitions
│   └── math/           # Math utilities
│       ├── index.js
│       ├── noise.js        # Perlin noise (2D, 3D, fBm)
│       ├── SeededRandom.js # Deterministic PRNG
│       └── animation.js    # Spring dampers, interpolation
├── styles/
│   └── main.css        # Extracted CSS styles
└── CLAUDE.md           # AI assistant guidelines
```

### Phase 1 Complete ✓

Core configuration modules extracted:
- **15 block types** with full texture and UI configuration
- **6 biomes** (plains, hills, forests, mountains, swamp, longwoods)
- **Noise functions** (Perlin 2D/3D, fBm, domain warp)
- **Seeded random** for deterministic world generation
- **Animation math** (spring dampers, pose interpolation)

### Future Phases

- **Phase 2**: World system (chunks, terrain, lighting)
- **Phase 3**: Rendering system (Three.js, materials, shaders)
- **Phase 4**: Entity system (player, zombies, AI)
- **Phase 5**: UI system (menus, HUD, inventory)
- **Phase 6**: Audio system (sound synthesis)

## Key Features

1. **Voxel Engine**
   - Infinite procedural world generation
   - Chunk size: 16×16×320
   - Streaming chunk system with configurable pre-generation
   - Optimized rendering with face culling and frustum culling
   - Hostile zombie mobs with AI

2. **Biome System**
   - 6 Biomes: Plains, Hills, Forests, Mountains, Swamps, Longwoods
   - Dynamic tree generation per-biome
   - Heightmap blending using noise and domain warping

3. **Advanced Lighting**
   - Sunlight propagation system
   - Ambient Occlusion baked into vertex colors
   - Dynamic day/night cycle
   - 3D Voxel Torch with point lighting

4. **Persistence**
   - IndexedDB for chunk storage
   - RLE compression for efficient saves
   - LocalStorage for settings

## For Developers

### Quick Start

1. Clone this repo
2. Serve with any local server:
   - **VS Code**: Install "Live Server" → Right-click `index.html` → Open with Live Server
   - **Python**: `python -m http.server 8080` → http://localhost:8080
   - **Node**: `npx serve` → http://localhost:3000
3. Push changes to deploy to GitHub Pages

### No Build Tools Required

This project uses native ES modules. No npm, webpack, or bundlers needed.

Three.js is loaded from CDN via import map:
```html
<script type="importmap">
{
    "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
}
</script>
```

### Console Debugging

The `window.VoxEx` object is available:
```javascript
VoxEx.Core.GRASS        // Block ID: 1
VoxEx.Config.BIOME_CONFIG.mountains
VoxEx.MathUtils.noise2D(0.5, 0.5)
```

## Controls

| Key | Action |
|-----|--------|
| W, A, S, D | Move |
| SPACE | Jump / Fly Up |
| C | Crouch / Fly Down |
| SHIFT | Sprint |
| F | Toggle Torch |
| E | Inventory |
| 1-9 / Scroll | Hotbar |
| Left Click | Break Block |
| Right Click | Place Block |
| ~ (Tilde) | Debug Overlay |
| ESC | Pause |

## Tech Stack

- **Three.js r160** - 3D rendering
- **Native ES Modules** - No bundler required
- **IndexedDB** - Chunk persistence
- **LocalStorage** - Settings and saves
- **Canvas API** - Procedural textures (17-tile atlas)

## Contributing

For the modular version (`src/`):
- Follow JSDoc documentation standards
- Use ES modules with explicit exports
- No external dependencies beyond Three.js CDN

For the standalone version (`voxEx.html`):
- All code must remain in the single file
- No external CSS or JS files

## License

MIT
