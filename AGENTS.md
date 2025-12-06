# Project AGENTS.md for VoxEx (Single-File Version)

This project is a browser-based voxel engine implemented as a single source file.
All game logic, rendering, and procedural generation live in that one file.
AI coding agents MUST NOT create new source files; all changes must be made inside the existing file.

## Project structure

- There is exactly one code file that contains the entire engine.
  - Example patterns:
    - `index.html` with an inline `<script type="module">` block containing all JavaScript/TypeScript, or
    - A single `main.js` (or similar) file loaded by the HTML page.
- Inside that file, the code is organized into logical regions and/or classes such as:
  - Chunk management and world streaming.
  - Procedural terrain and biome generation.
  - Voxel meshing and rendering.
  - Player input, camera control, and collisions.
  - Shared utilities and constants.

When you add or refactor functionality, keep it inside this one file.
You may introduce new classes or functions, but do NOT split them into separate files or modules.

## Tech stack and constraints

- Runtime: modern browsers, using WebGL via Three.js.
- Language: JavaScript or TypeScript compiled to JavaScript, using ES module syntax if supported by the single file.
- Rendering: Three.js with `THREE.Scene`, `THREE.PerspectiveCamera`, `THREE.WebGLRenderer`, etc.
- World: chunk-based voxel world; do NOT create one mesh per block.
- Performance:
  - Use BufferGeometry for voxel meshes.
  - Use greedy meshing or equivalent batching; minimize draw calls.
  - Use frustum culling, basic LOD, and object pooling where useful.
  - Avoid blocking the main thread with large synchronous loops; where possible, break work into smaller batches or use async patterns that still fit within a single file.

## One-file coding rules

- Do not create new `.js`, `.ts`, or `.html` files.
- Do not introduce bundler or build steps that require multiple entry points.
- Keep any new code as:
  - New functions or classes in the existing file, or
  - Refactors of existing functions/classes in that file.
- When reorganizing code, prefer:
  - Grouped regions with clear comments, for example:

    // ==== Chunk Management ====
    // ==== Terrain Generation ====
    // ==== Rendering / Meshing ====
    // ==== Player / Input ====
    // ==== Utilities / Constants ====

- Maintain a clear separation of concerns within the single file:
  - Chunk management handles which chunks exist and when to build/unload them.
  - Terrain generation functions compute voxel data.
  - Rendering/meshing functions turn voxel data into Three.js meshes.
  - Player/input code deals only with movement and camera, not with generation or meshing.

## ExecPlans and PLANS.md

This repository uses `.agent/PLANS.md` to define ExecPlans for complex or multi-hour tasks.

When performing substantial work such as rebuilding chunk building, caching, or loading:

- First, read `.agent/PLANS.md` to understand the ExecPlan format.
- Create or update an ExecPlan under `.agent/plans/` if the task is non-trivial.
- In that ExecPlan:
  - Treat the project as a single-file engine.
  - Refer to functions, classes, and “regions” inside the single file instead of multiple modules.
  - Explicitly state: “All code changes in this plan are confined to the single source file; no new files are created.”

ExecPlans must:
- Be self-contained, explain the current single-file layout, and define any terms like “chunk”, “greedy meshing”, or “object pooling” in plain language.
- Describe exactly which functions or sections of the single file are edited or added.
- Provide concrete validation steps (how to run the page, what to look for in the browser, how to spot performance regressions).

## Commands and validation

Unless otherwise specified:

- Open the HTML file in a modern browser (or run `npm run dev` / equivalent if a simple dev server is configured).
- After changes:
  - The page must load without console errors.
  - The voxel world must render.
  - Player movement, chunk streaming, and other core behaviors must still function.

If tests or simple debug toggles exist, ExecPlans should specify how to run/enable them and what “pass” looks like.

## Summary for agents

- This is a single-file project; never create or split code into multiple files.
- Make all changes inside the one main source file, using clear function/class boundaries and well-labeled regions.
- For complex refactors (e.g., chunk building and caching), use ExecPlans as defined in `.agent/PLANS.md`, but always describe work in terms of edits to this single file.
- Always give explanation for how to test and subsequently, the coding agent must run a test.
