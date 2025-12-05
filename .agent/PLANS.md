# Codex Execution Plans (ExecPlans) for VoxEx (Single-File Project)

This document defines how to write and maintain execution plans (“ExecPlans”) for this repository.
ExecPlans are detailed, living design documents that a coding agent or human can follow to implement a feature or refactor end-to-end.

This is a single-file browser-based voxel engine.
All runtime code lives in one main source file (for example, an `index.html` with an inline `<script type="module">`, or a single `main.js`).
ExecPlans MUST assume that all implementation changes happen inside this single file; they must never instruct the reader to create or split code into multiple source files.

If this PLANS.md file is checked into the repo, every ExecPlan must explicitly state that it is written in accordance with this document.

## How ExecPlans are used

ExecPlans are required for complex, multi-step work such as:

- Rebuilding or significantly optimizing the chunk system (building, caching, loading).
- Introducing new terrain/biome systems or complex rendering optimizations.
- Large refactors that affect multiple logical regions of the main file (e.g., chunk management plus meshing plus input behavior).
- Any change that is expected to take hours of focused work or require design exploration, prototyping, or benchmarking.

For small, local edits (e.g., a one-line bug fix), ExecPlans are not required, but the AGENTS.md rules still apply.

When implementing an ExecPlan:

- Do not ask the user for “next steps”; instead, follow the plan’s milestones.
- Keep the ExecPlan up to date as you work, particularly the living sections: Progress, Surprises & Discoveries, Decision Log, Outcomes & Retrospective.
- Resolve ambiguities inside the plan and document your decisions before editing code.

## Non-negotiable requirements

Every ExecPlan in this repository MUST:

1. Be self-contained and novice-friendly  
   - Assume the reader only has:
     - The current working tree of the repo.
     - The single ExecPlan file itself.
   - Explain the current relevant parts of the main code file clearly enough that a new contributor can navigate and make edits without prior knowledge.
   - Define any non-obvious term in plain language at first use (e.g., “chunk”, “greedy meshing”, “domain warping”, “object pooling”).

2. Describe observable behavior, not just code changes  
   - Focus first on what new behavior a user gains and how to see it:
     - For example: smoother chunk streaming, less visible pop-in, higher FPS, new terrain features, etc.
   - Provide instructions for running the game and verifying the result visually and/or via logs or tests.

3. Reflect the true state of the work  
   - Keep the Progress checklist accurate at all times.
   - Record all important decisions and surprising findings as they occur.
   - Update the plan when the design changes; do not leave it out of sync with the implementation.

4. Respect single-file constraints  
   - All ExecPlans must:
     - Refer to functions, classes, or “regions” inside the one main file (e.g., “Chunk Management section”, “Terrain Generation functions”).
     - Never instruct the reader to:
       - Create new `.js`, `.ts`, or `.html` files.
       - Move code into multiple modules or packages.
   - If the plan reorganizes code, it must do so by:
     - Introducing new functions or classes in the same file.
     - Grouping them under clear comment headers (e.g., `// ==== Chunk Management ====`, `// ==== Terrain Generation ====`, etc.), not by splitting files.

5. Enable safe, testable, incremental progress  
   - Describe changes in an order that keeps the project running (or quickly recoverable) after each step.
   - Include validation steps at each major milestone, not just at the end.

## Formatting rules

ExecPlans are stored as Markdown files, typically under a directory such as `.agent/plans/`.

Each ExecPlan MUST:

- Be a single Markdown document (no nested fenced code blocks for entire-plan embedding).
- Use standard Markdown headings:
  - `#`, `##`, `###` as appropriate.
  - Two blank lines after each heading for clarity.
- Prefer prose explanations; lists are allowed where they help (especially in Progress).
- Use bullet or numbered lists sparingly, except in Progress (where a checklist is mandatory).

When an ExecPlan is embedded into a chat, it may be wrapped in a single fenced code block labeled `md`.
When saved as a `.md` file in the repo, it must not include outer triple backticks.

## Required sections of every ExecPlan

Every ExecPlan must contain the following sections, in this order, with these exact headings:

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

Below is what each section must contain, adapted to this single-file voxel project.

### Purpose / Big Picture

Explain, in a few sentences:

- What new capability or behavior the user gains after this plan is implemented.
  - Example: “Chunks now stream smoothly around the player with caching to avoid rebuild spikes.”
- How to see it working:
  - Which HTML file to open or which dev server command to run.
  - What to do in the game (e.g., move quickly in different directions) and what to observe (e.g., no major frame hitches).

This section must focus on user-visible outcomes, not just internal refactors.

### Progress

Maintain a checklist of granular steps, in chronological order.

- Use checkboxes:
  - `- [x] (YYYY-MM-DD HH:MMZ) Completed step description.`
  - `- [ ] (YYYY-MM-DD HH:MMZ) Incomplete or planned step description.`
- Include timestamps (UTC) to track when work was done.
- When pausing mid-task, split it into completed vs remaining parts.

This section must accurately reflect the current state of the work at all times.

### Surprises & Discoveries

Capture unexpected behaviors, bugs, performance characteristics, or environment quirks uncovered while implementing the plan.

For each entry:

- Start with `- Observation: ...`
- Follow with `  Evidence: ...` on the next line, summarizing:
  - Short logs, console output, FPS numbers, or visual artifacts.
  - Enough detail so a future reader can understand what was found and why it mattered.

Examples:

- Discovery that a certain chunk size causes large GC pauses.
- Realization that a noise parameter drastically changes terrain shape.

### Decision Log

Record every meaningful decision that could affect implementation, maintenance, or behavior.

For each decision:

- `- Decision: ...`
- `  Rationale: ...`
- `  Date/Author: ...`

Examples:

- Choosing chunk dimensions or render distance.
- Selecting a particular caching strategy (e.g., keep voxel data cached but free meshes).
- Deciding whether to use async generation patterns inside the single file.

### Outcomes & Retrospective

Summarize, in narrative form:

- What has been achieved relative to the Purpose.
- Any gaps or partial implementations left for future work.
- Lessons learned that should influence other plans or future contributors.

Update this section when the plan reaches major milestones or is effectively “complete”.

### Context and Orientation

Write this as if the reader is new to the repo and to voxel engines.

Include:

- A description of the current single-file structure:
  - File name and how it is loaded (directly opened in a browser, via a dev server, etc.).
  - Major logical regions (e.g., chunk management, terrain generation, rendering, player/input) and how they are separated in the code (comments, function naming, etc.).
- Definitions of key terms used in the plan:
  - “Chunk” (for example, a fixed 3D region of voxels, with given dimensions).
  - “Voxel” (a cubic cell in the world grid).
  - “Greedy meshing” (algorithm that merges adjacent faces to reduce geometry).
  - “Object pooling” (reusing objects like meshes or temporary vectors to avoid repeated allocations and GC).
  - “Domain warping”, “LOD”, or others as needed.
- Commands or steps to run the project:
  - For example:
    - “Open `index.html` in a modern browser.”
    - Or “Run `npm run dev` and open `http://localhost:5173/`.”

This section must be clear enough that someone can locate the exact parts of the single file that the plan will modify.

### Plan of Work

Describe, in prose, the overall sequence of edits and additions to the single file.

For each major group of changes:

- Reference code by:
  - Region header comment (if present), e.g., “In the `// ==== Chunk Management ==== ` section...”
  - Function or class name.
- Explain what will be changed or added and why.

Example content:

- “Introduce a `buildChunk(x, z)` function that uses the existing noise and biome helpers to produce voxel data for a chunk.”
- “Refactor the existing player update loop so it calls the new `updateChunksAroundPlayer()` function that manages loading/unloading.”

Avoid excessive detail here; keep it readable as a high-level story of how the system will evolve.

### Concrete Steps

Translate the Plan of Work into explicit, ordered actions that an agent or human can follow step by step.

For each step:

- Name the file (the main code file) and the specific section/function/class to edit or create.
- Describe what code to add, remove, or refactor in enough detail that there is no ambiguity.
- Include commands to run (if any), such as:
  - Opening the HTML file.
  - Running a dev server or light build/test command.

Where useful, provide short, indented examples of expected terminal output or log messages to confirm success.
Avoid long transcripts.

This section must be updated if the approach changes.

### Validation and Acceptance

Define the criteria for considering the plan’s work “done”, in terms that are observable.

Include:

- Exact steps to run and exercise the system:
  - Which command or file to run/open.
  - What inputs or player actions to perform (e.g., move forward for 30 seconds, look around quickly).
- What the user should see or measure:
  - For example: “Chunks appear smoothly as the player moves; the frame rate does not drop below X on typical hardware; no large stutters occur when crossing chunk boundaries.”
- Any relevant logs or debug output that signal success (e.g., limits on how many chunks are being rebuilt per second).

If there are tests:

- State exactly how to run them (`npm test` or similar).
- Identify any particular test names related to this plan.

### Idempotence and Recovery

Explain how to keep the workflow safe and repeatable.

Include:

- Which steps are safe to repeat (e.g., re-running a refactoring script, reloading the page, re-running small benchmarking code).
- What to do if something goes wrong halfway:
  - How to revert changes (e.g., `git restore`/`git reset`, undoing certain functions).
  - How to disable partially integrated features quickly by toggling flags or comments, keeping the game loadable.

The goal is for someone to be able to run through the steps multiple times without corrupting the project.

### Artifacts and Notes

Collect small, focused artifacts that prove progress:

- Short code excerpts (not full file dumps) to illustrate critical interfaces or patterns.
- Brief before/after diffs for key functions or sections.
- Short performance measurements or FPS logs, with context (camera position, movement pattern).

These artifacts should be examples that the reader can recreate by following the steps, not things they must copy blind.

### Interfaces and Dependencies

Precisely define any new or changed interfaces within the single file.

This includes:

- Function signatures and responsibilities:
  - For example, `function updateChunksAroundPlayer(playerPosition) { ... }`
  - Or `class ChunkCache { /* methods */ }`.
- How these functions or classes interact:
  - Which parts of the code call them.
  - What data they expect and return.
- Any changes to configuration constants (e.g., chunk size, render distance) and where they are defined in the file.
- Any external libraries used or newly introduced (though, in this project, these should typically already be limited to the existing Three.js and related utilities).

Prefer stable names and clear responsibilities so future plans and contributors can build on them easily.

## Prototyping and parallel implementations

ExecPlans may include small prototype steps when needed to de-risk approaches:

- For instance, a minimal implementation of a new chunk builder or cache that logs behavior without yet replacing the main path.
- These prototypes should be:
  - Additive and isolatable.
  - Clearly labeled as “prototype” in the Plan of Work and Concrete Steps.
  - Backed by simple validation (e.g., custom logs or debug toggles).

If the plan temporarily keeps old and new code paths in parallel:

- Document how to validate both.
- Describe how and when one of them will be removed safely.
- Ensure the project remains runnable during the transition.

## Revising ExecPlans

ExecPlans are living documents.

When an ExecPlan is revised:

- Update all sections that depend on the changes (Context, Plan of Work, Concrete Steps, Validation, Interfaces, etc.).
- Keep the plan self-contained; do not rely on knowledge of earlier versions.
- Add a note at the bottom of the plan:

  - `Change Note (YYYY-MM-DD HH:MMZ, Author): <Short description of what changed and why>.`

ExecPlans should always tell the full, current story of how the feature or refactor is being implemented inside the single-file voxel engine.
They must explain not only what is being done, but also why those decisions were made.
