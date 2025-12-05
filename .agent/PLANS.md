# ExecPlan Guidelines for VoxEx

This document defines what an ExecPlan is, how it should be structured, and how it must be maintained for this repository.
Every ExecPlan is a living design+implementation document that enables a new contributor to implement a feature or refactor end‑to‑end using only the current working tree and that single ExecPlan file.

## What ExecPlans are for

ExecPlans are required for complex or multi-hour tasks, including:

- New systems (e.g., new terrain algorithm, biome system, multi-threaded generation pipeline).
- Major refactors in core engine modules (e.g., chunk management, voxel meshing, rendering pipeline).
- Performance or memory overhauls that affect multiple subsystems.
- Features that produce clearly observable changes in the game (e.g., caves, rivers, advanced vegetation, or LOD).

An ExecPlan must explain, in plain language, what new behavior the user gains and how to observe it in the running game.
The plan must describe both design and implementation at a level where a novice can follow it safely.

## Global requirements for ExecPlans

Every ExecPlan in this project must:

- Be fully self-contained:
  - Include all explanations, definitions, and repository orientation needed to complete the work.
  - Avoid referring to external blogs, docs, or prior plans unless they are already checked into the repo; if they are, restate needed context.
- Enable observable behavior:
  - Describe what can be seen or measured after implementation (e.g., terrain differences, FPS improvements, or specific on-screen effects).
  - Define exact commands or keybindings that demonstrate the new behavior.
- Define all non-obvious terms:
  - If you use terms like “chunk”, “greedy meshing”, “domain warping”, or “object pooling”, explain them in plain language and name where they are implemented (e.g., `src/core/ChunkManager.js`, `src/rendering/VoxelMesh.js`).
- Target this repository specifically:
  - Discuss files and modules using full repository-relative paths.
  - Explain how new code integrates into existing architecture (core, generation, rendering, physics, utils).
- Be a living document:
  - Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections up to date as work proceeds.
  - Reflect every major decision and any change of direction in the plan itself.

ExecPlans must produce working, testable outcomes, not just code that compiles.

## Formatting rules

Each ExecPlan file under `.agent/plans/` must:

- Be a single Markdown document that could be wrapped in one fenced code block labeled `md` when used inline in a chat context.
- When stored as a `.md` file in this repo, it should contain only the Markdown content described here (no outer triple backticks).
- Use normal Markdown headings (`#`, `##`, `###`) with two blank lines after each heading for readability.
- Prefer prose paragraphs; lists are allowed where they clarify steps or progress, but narrative explanation comes first.
- Use checklists only in the `Progress` section.

Avoid nested code fences inside ExecPlans; show snippets, commands, and diffs using indentation.

## Required sections in every ExecPlan

Every ExecPlan must contain the following sections in this order, with these exact headings:

- `# <Short, action-oriented description>`
- `## Purpose / Big Picture`
- `## Progress`
- `## Surprises & Discoveries`
- `## Decision Log`
- `## Outcomes & Retrospective`
- `## Context and Orientation`
- `## Plan of Work`
- `## Concrete Steps`
- `## Validation and Acceptance`
- `## Idempotence and Recovery`
- `## Artifacts and Notes`
- `## Interfaces and Dependencies`

The content inside each section is described below.

### Purpose / Big Picture

Explain in a few sentences:

- What new capability or behavior the user gets (for example, “infinite scrolling terrain with biomes and caves”, or “distant chunks render with lower LOD to keep 60 FPS”).
- How to see it in action (what to run, where to look, what to expect on screen).

Focus on user-visible results rather than internal details.

### Progress

Maintain a checklist of granular steps with timestamps in UTC:

- Use `- [ ]` / `- [x]` style items.
- Include timestamps in ISO-like format, e.g., `(2025-12-05 15:32Z)`.
- Split partially completed tasks into “completed” vs “remaining” parts when you pause.

This section must always match the real current state of the work.

Example pattern:

- `[x] (2025-12-05 15:32Z) Implemented basic chunk streaming in ChunkManager.`
- `[ ] Implement frustum culling for far chunks (completed: basic test harness; remaining: integrate into main render loop).`

### Surprises & Discoveries

Document unexpected behaviors, bugs, or performance findings.

For each item:

- Provide a brief “Observation” sentence.
- Provide short “Evidence” with logs, benchmark numbers, or visual notes (described in words) that justify the observation.

Use this section to record things like:

- Noise functions that behave differently at certain scales.
- Browser performance quirks or GPU limits for large voxel scenes.
- Side effects of new optimizations (e.g., aggressive pooling causing stale state).

### Decision Log

Record each meaningful decision related to the plan.

For each decision, include:

- `Decision:` short description.
- `Rationale:` why this choice was made, including trade-offs.
- `Date/Author:` timestamp and agent identifier or name.

Examples:

- Choosing a chunk size of 16×64×16 instead of 32×128×32.
- Selecting domain-warped noise instead of simple Perlin for terrain features.
- Deciding to keep an old mesh path temporarily while a new greedy mesher is validated.

### Outcomes & Retrospective

Summarize:

- What the plan has achieved so far, especially observable behavior.
- Any gaps or unfinished work.
- Lessons learned that should influence future work, especially around performance and architecture.

Update this section at major milestones or when the plan is considered done.

### Context and Orientation

Write as if the reader knows nothing about the repo.

Include:

- A brief overview of the relevant parts of the architecture:
  - Which core modules are involved (e.g., `src/core/ChunkManager.js`, `src/core/Scene.js`).
  - Which generation modules participate (e.g., `src/generation/NoiseGenerator.js`, `src/generation/TerrainGenerator.js`, `src/generation/BiomeSystem.js`).
  - Which rendering modules are affected (e.g., `src/rendering/VoxelMesh.js`, `src/rendering/InstancedVegetation.js`).
- Definitions of key terms used in the plan (chunk, world coordinates vs chunk coordinates, greedy meshing, domain warping, object pooling, LOD, etc.).
- A short explanation of how to run the project (install, dev server, tests) as needed for this plan.

The goal is to let a novice contributor navigate confidently and know exactly where to look.

### Plan of Work

Describe, in prose, the sequence of edits and additions.

For each major change:

- Name the file(s) with full paths.
- Name the functions or classes to update or create.
- Describe what each change will achieve and how it moves closer to the goal.

Keep this narrative high-level enough to read like a story (goal → work → result), but concrete enough that it unambiguously guides the next steps.

For example:

- “Add a `generateChunkData(chunkX, chunkZ, chunkSize, chunkHeight)` method in `src/generation/TerrainGenerator.js` that returns a typed array of voxel IDs.”
- “Integrate `TerrainGenerator` into `src/core/ChunkManager.js` so that newly loaded chunks are filled with voxel data before being meshed.”

### Concrete Steps

Translate the Plan of Work into explicit, ordered actions.

Include:

- Exact files to open and what to add or change.
- Commands to run in the repo root (e.g., `npm run dev`, `npm test`, `npm run build`).
- Short expected terminal output snippets or descriptions (no long transcripts).

This section should be detailed enough that an agent can follow it step by step with minimal interpretation.

### Validation and Acceptance

Define how to prove that the plan’s goals are met.

Include:

- Exact commands to run.
- Runtime actions (e.g., “start dev server, open the browser at `http://localhost:5173/`”).
- What to observe visually (e.g., “new biomes appear with distinct grass and foliage; FPS remains above 60 when moving quickly through world”).
- Any tests that should fail before the plan and pass after (name test files or test cases where possible).

Phrase acceptance in terms a human can verify by running the game and/or tests.

### Idempotence and Recovery

Explain:

- Which steps can be safely repeated (e.g., re-running generation, reapplying migrations, or replaying code transformations).
- Any potentially risky operations and how to back up or roll back (e.g., how to revert a configuration change or feature flag).
- How to return the repo to a clean, runnable state if an intermediate step fails.

Favor additive, testable changes that can be validated incremental step by step.

### Artifacts and Notes

Collect the most important evidence here:

- Short diff excerpts (only as much as needed to illustrate key changes).
- Small benchmark snippets and FPS measurements.
- Concise logs or console output that prove part of the system works.

These artifacts should be reconstructible by following the plan, not something the reader must paste blindly.

### Interfaces and Dependencies

Define the public surface area and critical dependencies introduced or modified by this plan.

Include:

- New or updated function signatures, classes, and interfaces, with file paths.
- Description of how modules interact, such as:
  - How `ChunkManager` calls `TerrainGenerator` and `VoxelMesh`.
  - How `NoiseGenerator` and `BiomeSystem` are wired into terrain generation.
  - How new rendering components integrate with the main scene and camera.
- Any third-party libraries added, with justification and how they are used.

Prefer stable names and clearly defined responsibilities so that future contributors can reason about the system without re-reading all implementation details.

## Idempotent use of ExecPlans

ExecPlans should be safe to revisit and continue after interruptions.

- A contributor should be able to:
  - Read the ExecPlan.
  - Sync the repo.
  - Resume work using the `Progress` section and milestones without guessing what was done.
- If you change direction mid-implementation:
  - Update the `Decision Log`.
  - Adjust `Plan of Work`, `Concrete Steps`, and `Validation and Acceptance` to match the new path.
  - Leave a note at the bottom of the plan describing what changed and why.

## Maintaining and revising ExecPlans

When you revise an ExecPlan:

- Ensure changes are reflected consistently in all sections that depend on them.
- Keep the plan self-contained; do not rely on readers knowing earlier versions.
- Record a short “Change Note” at the very bottom, specifying:
  - The date.
  - A one-sentence summary of the revision.
  - The reason (e.g., new constraints discovered, different optimization strategy chosen).

ExecPlans are authoritative stories of how complex features are implemented in this voxel engine.
Treat them as durable documentation for future maintainers, not just temporary checklists.
