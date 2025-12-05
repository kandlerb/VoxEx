# Project AGENTS.md for VoxEx

This file defines how AI coding agents and contributors should work in this repository.
It focuses on: the tech stack, code conventions for a browser-based voxel engine, and how to use ExecPlans for complex work.

## Tech stack and project goals

This project is a 3D voxel game/engine running in the browser using modern JavaScript or TypeScript, ES modules, and Three.js for rendering.
The game world is chunk-based and procedurally generated, with systems for terrain generation, biomes, voxel meshing, pooling, and instanced rendering organized into modular classes under `src/`. 

Prefer the following structure when adding or modifying systems:

- `src/core/` for orchestration and high-level engine modules, e.g.:
  - `Scene.js` – scene setup, main loop, render loop binding.
  - `ChunkManager.js` – chunk loading/unloading, world-to-chunk mapping, and player-driven streaming.
- `src/generation/` for procedural generation and world logic:
  - `NoiseGenerator.js` – multi-layer noise, domain warping utilities.
  - `TerrainGenerator.js` – chunk voxel data generation using layered noise and biome data.
  - `BiomeSystem.js` – biome selection and block composition rules.
- `src/rendering/` for meshes, materials, and visual optimizations:
  - `VoxelMesh.js` – greedy meshing over chunk voxel data into optimized `BufferGeometry`.
  - `InstancedVegetation.js` and similar – instanced meshes for repeated details like grass or foliage.
  - `MaterialManager.js`, `MeshOptimizer.js` – texture atlases, culling, and draw‑call reduction utilities.
- `src/physics/` for movement and collisions:
  - `PlayerController.js` – input, camera, and movement controls.
  - `CollisionDetector.js` – voxel-based collision checks.
- `src/utils/` for reusable helpers:
  - `ObjectPool.js` – reusable object management for meshes and helper objects.
  - `Constants.js` – shared configuration (chunk size, heights, render distance, etc).

Follow ES module style (`export default class ...` or named exports) and keep each module focused on a single responsibility.

## Code style and quality expectations

- Use ES modules everywhere. Do not introduce CommonJS or global script tags.
- Prefer classes or small focused functions per file; avoid “god objects” that mix generation, rendering, and input logic.
- Always respect performance constraints for WebGL and the browser main thread:
  - Use chunked voxel storage and meshing; never create one mesh per block.
  - Prefer `BufferGeometry` over legacy geometries.
  - Use greedy meshing, frustum culling, and LOD where appropriate.
  - Use object pooling for frequently created / destroyed objects like chunks and temporary matrices.
- Keep APIs clear and typed where possible (TypeScript or JSDoc) for engine-facing modules.
- When adding new dependencies, prefer small, browser‑friendly libraries and document why they are needed.

## ExecPlans

ExecPlans are structured design+implementation documents used for non-trivial work, such as:

- Adding or refactoring a core engine system (e.g., a new terrain pipeline, LOD system, or physics overhaul).
- Significant performance changes that affect rendering, meshing, or generation.
- Features that span multiple subsystems (e.g., new biome system touching generation, rendering, and save/load).

ExecPlans are stored under:

- `.agent/plans/<short-feature-name>.md`

ExecPlans must follow the rules and section layout defined in `.agent/PLANS.md`.
They should be written so that a new contributor, with only the current repository and that single ExecPlan file, can implement the feature end‑to‑end.

### When to create or update an ExecPlan

Create or update an ExecPlan when:

- A change will touch more than one major module (e.g., `ChunkManager`, `TerrainGenerator`, and `VoxelMesh` together).
- A change is expected to take more than one focused coding session or requires careful research or prototyping.
- A refactor may temporarily require dual code paths (e.g., old and new mesh builders in parallel).

Do not use an ExecPlan for very small, local changes (e.g., fixing a small bug in `NoiseGenerator`, or tweaking a single shader parameter).

### How agents should use ExecPlans

When asked to implement a complex feature or refactor:

1. If no suitable ExecPlan exists:
   - Create a new file under `.agent/plans/` using the format and headings prescribed in `.agent/PLANS.md`.
   - Fill out all sections before significant coding work, including context, plan of work, validation, and progress checklist.
2. If an ExecPlan already exists:
   - Read it fully.
   - Follow the milestones and concrete steps in order, updating the `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections as work proceeds.
3. Do not ask the user for “next steps” when executing an ExecPlan.
   - Instead, continue to the next milestone or step already described in the plan.
   - If ambiguities appear, resolve them inside the plan (and document the decision) before changing code.

### Repository commands and assumptions

Unless told otherwise:

- Install dependencies with `npm install` or `pnpm install` at the project root.
- Start the dev server with `npm run dev` (or the script configured in `package.json`).
- Run tests with `npm test` or the configured test script.

ExecPlans must explicitly state which commands to run for validation, including expected visible behavior (e.g., “start dev server and visit a specific URL; you should see generated terrain with X behavior”).

## Folder-specific behavior for agents

- For files under `src/generation/`:
  - Prioritize clarity of math and noise composition; document constants like octaves, persistence, and lacunarity in comments.
  - Keep noise modules deterministic via seeds and avoid hard-coding randomness in generation logic.
- For files under `src/rendering/`:
  - Favor batching and instancing; minimize material and draw-call counts.
  - Keep shader-related code and material setup centralized in dedicated modules (e.g., `MaterialManager`).
- For files under `src/core/`:
  - Preserve a clean separation between orchestration (scene setup, loop) and feature modules (generation, rendering, input).
  - Add new high-level integrations via composition rather than large monolithic changes.

## Summary for agents

- Use ExecPlans for substantial work and follow `.agent/PLANS.md`.
- Keep code modular, chunk-based, and performance-aware, respecting existing architecture.
- Always provide observable validation steps (visual changes in the running game or passing tests) for any non-trivial change.
