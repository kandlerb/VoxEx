# Biomes
### Longwoods
#### Concept: A biome with massive trees (2x2 - 3x3 trunks) that tower over the player, creating a sense of scale.
**Implementation Strategy:**
1. Biome Config: Add a `longWoods` entry to `BIOME_CONFIG` in `voxEx.html`. Use a `heightFunc` similar to `plainsHeightFunc` to keep the ground relatively flat, emphasizing the tree height.
2. Tree Generation: The current default tree logic only supports 1x1 trunks. You need a custom `longWoodsDecorateColumn` function:  
    a. Trunk: Instead of setting just `(lx, ly, lz)`, set a 2x2 footprint (e.g., `lx, lx+1` and `lz, lz+1`) to `LOG` for the entire height.  
    b. Height: Increase `trunkHeightMin` to ~20-30 blocks.  
    c. Leaves: Create a "cone" shape starting high up. You can generate leaves in rings or widely spaced layers to mimic real redwood branches.

### Broken Plains (Canyons)
#### Concept: Deep, broken terrain with massive vertical drops and flat plateaus. Tectonic shifts and erosion should be evident.
**Implementation Strategy:**
1. Plateau Base: Define a `brokenPlainsHeightFunc` with a high base height (e.g., y=85 to y=100). The canyon isn't just a hole; it's a hole cut into a high table-land.
2. Tectonic Terracing: Modify the noise function to use "stepping". Instead of returning a smooth curve, apply a floor function to the noise output: `h = Math.floor(noise * steps) / steps`. This creates distinct, flat vertical steps (terraces) rather than smooth slopes, mimicking hard geological shifts.
3. The "Erosion" Carver: Instead of a simple negative height map, use a Ridge Noise function (`Math.abs(noise)`) inverted.  
   a. Define a "Canyon Factor" using low-frequency 2D noise.  
   b. Where this factor is high, subtract aggressively from the terrain height, carving through the plateau down to y=30 or y=40.  
   c. This creates steep, jagged walls that cut through the terraced landscape.
4. Sedimentary Layers: In `generateChunkData`, override the default block placement for this biome. Instead of random dirt/stone, place blocks based on fixed Y-levels (e.g., y=30-50 is Stone, y=51-70 is Dirt, y=71+ is Sand). This creates visible horizontal striations on the canyon walls.

### Shaded Forest
#### Concept: A biome where sunlight cannot reach the floor, even at noon. 
**Implementation Strategy:**
1. Leverage Existing Light System: The engine propagates sunlight downwards, reducing it by 1 for every leaf block and stopping completely at solid blocks.
2. "Roofed" Forest: Create a `shadedForestDecorateColumn` function.
3. Generate trees with massive, interlocking canopies (leaves) that cover 95-100% of the sky.
4. Thick Canopy: Generate a layer of solid wood or very thick leaves (5+ layers) at y=80 or y=90. This will mechanically block the skyLight propagation, forcing the ground level light to 1.
5. Atmosphere: In updateDayNight, check getBiomeParams(playerX, playerZ). If the player is in the Shaded Forest biome, lerp the skyMaterial and fog colors to a light gret to simulate oppressive darkness.

# Features
### Inventory & Hotbar Changing
#### Concept: Moving beyond the current fixed hotbar selection to allow players to store blocks and customize their active slots. 
**Implementation Strategy:**
Data Structure:
1. Create a simple array: `const inventory = new Array(36).fill(null);`
2. Create a hotbar array: `const hotbar = [GRASS, DIRT, STONE, ...];`
UI Overlay:
1. Add a new `<div id="inventory-screen">` in the HTML, styled with CSS grid (9x4 slots).
2. Bind the E key to toggle this screen (unlocking pointer controls similar to the Pause menu).
**Logic:**
1. Implement drag-and-drop or "click-to-swap" logic in JavaScript.
2. Update the `setSlotIcon` function to read from your dynamic hotbar array instead of hardcoded IDs.
