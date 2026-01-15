# VoxEx High-Performance Chunk Rendering Implementation Plan

## Phase 1: Data Architecture Refactor
*Goal: Decouple chunk data from mesh lifecycle*

### 1.1 - Chunk Data Pool
Create a `ChunkDataPool` that manages chunk block data separately from meshes. Chunks stay in memory based on a configurable `dataKeepDistance` (larger than render distance).

### 1.2 - Chunk Metadata Layer  
Add metadata per chunk: `lastAccessed`, `meshState` (none/building/ready/stale), `visibleSections` bitmap, `boundingY` (minY/maxY with blocks).

### 1.3 - LRU Eviction System
Implement LRU eviction for chunk data when memory limit exceeded. Track memory usage, evict least-recently-accessed chunks outside `dataKeepDistance`.

---

## Phase 2: Vertical Sub-Chunks (16×16×16 Sections)
*Goal: Enable per-section culling and faster partial rebuilds*

### 2.1 - Section Data Structure
Define section structure: 20 sections per column (320÷16). Each section tracks: `isEmpty`, `isFullySolid`, `hasMesh`, `faceCount`, `boundingBox`.

### 2.2 - Section Visibility Analysis
During chunk data load/generation, analyze each section and populate visibility flags. Track which sections have any exposed faces.

### 2.3 - Section-Aware Meshing (Single Mesh)
Modify `renderChunk()` to skip entirely-empty and entirely-solid sections during meshing. Still outputs single mesh per chunk column, but skips work.

---

## Phase 3: Mesh Pooling & Fast Rebuild
*Goal: Eliminate allocation overhead, enable instant mesh regeneration*

### 3.1 - Geometry Buffer Pool
Create a pool of pre-allocated `BufferGeometry` objects. Acquire/release instead of create/dispose. Reduces GC pressure.

### 3.2 - Mesh State Machine
Implement mesh lifecycle: `NONE → QUEUED → BUILDING → READY → STALE → DISPOSED`. Track transitions, prevent duplicate builds.

### 3.3 - Priority Queue with Distance Sorting
Replace simple build queue with priority queue. Chunks closer to player build first. Chunks returning to view get priority over new chunks.

### 3.4 - Hybrid Rebuild Strategy
When chunk re-enters view: if data in memory → fast mesh rebuild. If data evicted → full regeneration. Track hit rate.

---

## Phase 4: Enhanced Culling Pipeline
*Goal: Reduce rendered geometry without GPU-driven culling*

### 4.1 - Section Bounding Boxes
Calculate tight AABBs per section (based on actual block positions, not full 16³). Store in chunk metadata.

### 4.2 - Hierarchical Frustum Culling
Two-pass frustum test: (1) chunk column AABB, (2) if partially visible, test individual section AABBs. Skip sections outside frustum.

### 4.3 - Distance-Based Section LOD
Far chunks: merge multiple sections into single simplified mesh. Near chunks: full detail per section.

### 4.4 - Hybrid Occlusion (Optional)
Simple CPU-side occlusion: track "horizon line" per column in cardinal directions. Skip sections fully below horizon. Low-cost approximation.

---

## Phase 5: Memory Management & Persistence
*Goal: Support 64+ chunk radius without running out of memory*

### 5.1 - Memory Budget System
Track total memory: chunk data + mesh data + textures. Configurable budget (512MB-2GB). Automatic quality scaling.

### 5.2 - Chunk Data Compression
Compress inactive chunk data using RLE or LZ4-js. Decompress on access. Reduces memory footprint ~60-80%.

### 5.3 - IndexedDB Persistence Layer
Save/load chunk data to IndexedDB for persistence across sessions. Chunks load from disk instead of regenerating.

### 5.4 - Background Data Streaming
Load chunk data in background worker. Prioritize visible chunks. Predictive loading based on movement direction.

---

## Phase 6: WebGPU Migration (Future)
*Goal: True GPU-driven rendering for maximum performance*

### 6.1 - WebGPU Renderer Bootstrap
Add `THREE.WebGPURenderer` alongside WebGL. Feature detection and graceful fallback.

### 6.2 - Storage Buffer Vertex Pool
Single GPU buffer as vertex pool. Sub-allocate per chunk. Enable indirect drawing.

### 6.3 - Compute Shader Frustum Culling
GPU-side frustum tests. Output visible chunk list to indirect draw buffer.

### 6.4 - Hi-Z Occlusion Culling
Depth pyramid from previous frame. GPU occlusion queries per section. True GPU-driven culling.

---

## Implementation Order Recommendation

| Priority | Substep | Impact | Risk | Dependencies |
|----------|---------|--------|------|--------------|
| 1 | 1.1 | High | Low | None |
| 2 | 1.2 | Medium | Low | 1.1 |
| 3 | 3.1 | High | Low | None |
| 4 | 3.2 | High | Medium | 1.2 |
| 5 | 3.3 | High | Low | 3.2 |
| 6 | 2.1 | Medium | Medium | 1.2 |
| 7 | 2.2 | Medium | Low | 2.1 |
| 8 | 2.3 | High | Medium | 2.2 |
| 9 | 1.3 | Medium | Low | 1.1, 1.2 |
| 10 | 3.4 | High | Low | 3.3, 1.3 |
| 11 | 4.1 | Medium | Low | 2.1 |
| 12 | 4.2 | High | Medium | 4.1 |
| 13 | 5.1 | Medium | Low | 1.3 |
| 14+ | Rest | Varies | Higher | Earlier phases |
