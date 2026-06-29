# CCR — Glass Mesh: Route Through GeometryBufferPool Instead of Raw BufferGeometry

**ID:** VOXEX-CCR-VRAM-003
**File:** `voxEx.html` (single-file rule honored)
**Date:** 2026-06-27
**Status:** 🔴 Proposed
**GitHub:** #573
**Scope:** The glass mesh builds a fresh `new THREE.BufferGeometry()` per remesh instead of using `GeometryBufferPool`, so glass geometry is never reused — pure allocation/GC churn on glass-chunk load/unload/remesh.

> Line numbers are as of build `2026-06-24.x` and **WILL DRIFT** — grep `new THREE.BufferGeometry()` inside the `_GLASS` build block (the glass site is near `gGeo`, NOT the ParticleSystem/stars/clouds sites ~15158/15640/15778/16009). Grep `cKey + "_GLASS"` to land on the glass path.

---

**AUDIT FLAG — the draft's "not reliably disposed / slow leak" premise is FALSE.** Glass geometry IS disposed today: on remesh (`gMesh.geometry.dispose()`, line ~42581) and on chunk unload (`releaseMeshForKey`'s `_GLASS` branch, line ~41511, which removes from scene + `geometry.dispose()` + `chunkMeshes.delete`). There is no leak and the geometry-leak watchdog will NOT fire on glass. The only real defect is **missing pooling/reuse** (allocation + GC churn from `new THREE.BufferGeometry()` + four fresh `.slice()`-backed `BufferAttribute`s per build). Scope this CCR as a perf/consistency improvement, not a leak fix.

**AUDIT FLAG — attribute-schema mismatch blocks a drop-in.** The terrain pool's geometry has a FIXED schema: color is **`Uint8` RGBA, itemSize 4, normalized** (`_createTerrainGeometry`, line ~20316), quadSize is **`Uint16`** (line ~20317). The glass build currently writes **`Float32` RGB color, itemSize 3** (line ~42575) and `Float32` quadSize. To use `acquireTerrain`, glass MUST fill the pool's pre-allocated buffers IN PLACE and pack color via the existing `packColorRGBA8` helper (line ~39935) — exactly like the terrain mesher does (line ~42280). This is the same Uint8-RGBA color the chunk shader already reads as `vColor.rgb` (USE_COLOR_ALPHA), and `glassMaterial` shares the `applyCylindricalFog` shader path, so it is compatible (per build-2026-06-22.4 note: "safe for vec3 glass too"). Do NOT route glass through the opaque chunk MATERIAL — only through the geometry POOL; `glassMaterial` (transparent, DoubleSide, alphaTest 0.5, depthWrite false, renderOrder 1, `glassDepthMaterial`) and all glass mesh flags stay exactly as-is.

---

### #573 — Acquire/release the glass geometry from GeometryBufferPool
**Location:** glass mesh build in `renderChunk()` — line ~42572 (grep: `gGeo = new THREE.BufferGeometry`); release in `releaseMeshForKey()` — line ~41509 (grep: `key.includes("_GLASS")`)
**Why:** Each glass remesh allocates a new geometry + 5 typed-array-backed attributes and disposes the old one — no buffer reuse, so glass-heavy scenes churn the allocator/GC. Terrain/water reuse pooled buffers; glass should too.
**Change:** Build the glass mesh into a pooled terrain geometry (`geometryPool.acquireTerrain(gFaceCount)`), filling its fixed attributes in place: native `.set()` for position/uv/index/quadSize and `packColorRGBA8()` for the Uint8-RGBA color lane; set draw range + per-attribute update ranges; compute bounds. On release, return it via `geometryPool.releaseTerrain(...)` instead of `dispose()`. The glass MATERIAL and all mesh flags are unchanged.

**Context:**
- **`geometryPool.acquireTerrain(estimatedFaces = GEO_TIER_SMALL)`** (line ~20404): selects a tier from `estimatedFaces`, pops a pooled geometry if available and **resets `geo.setDrawRange(0, Infinity)`** before returning, else creates a new tier geometry. Returns a geometry whose `userData.tier` is set, so it can later route back to the right tier pool. Because acquire leaves drawRange at `Infinity` and release sets it to `0`, glass MUST explicitly `setDrawRange(0, gIIdx)` after filling (the old fresh-`BufferGeometry` path didn't).
- **`geometryPool.releaseTerrain(geo)`** (line ~20457): reads `geo.userData.tier` (default `'large'`), and if the tier pool has room, calls `geo.setDrawRange(0, 0)` and pushes it back; otherwise `geo.dispose()`. Safe for the glass geometry because `acquireTerrain` stamped `userData.tier` — no pool corruption.
- **`_createTerrainGeometry(maxFaces, tier)` attribute schema** (line ~20292) — the fixed layout glass must fill in place (`maxVerts = maxFaces * 4`, `maxIndices = maxFaces * 6`):
  ```js
  const posArray      = new Float32Array(maxVerts * 3);          // position itemSize 3
  const uvArray       = new Float32Array(maxVerts * 2);          // uv       itemSize 2
  const colArray      = new Uint8Array(maxVerts * 4);            // color RGBA, itemSize 4, NORMALIZED  (line ~20309)
  const quadSizeArray = new Uint16Array(maxVerts * 2);           // quadSize itemSize 2, NON-normalized (line ~20310)
  const idxArray      = new Uint32Array(maxIndices);             // index    Uint32                     (line ~20311)
  // attributes: Float32BufferAttribute(pos,3), Float32BufferAttribute(uv,2),
  //             Uint8BufferAttribute(col,4,/*normalized*/true), Uint16BufferAttribute(quad,2,/*normalized*/false),
  //             Uint32BufferAttribute(idx,1)  — all DynamicDrawUsage  (lines ~20314-20324)
  ```
  The Uint8-RGBA-normalized color makes Three.js define `USE_COLOR_ALPHA` (vColor is `vec4`); the chunk/glass shaders already read `vColor.rgb` via `applyCylindricalFog` — compatible with glass.
- **`packColorRGBA8(dst, src, nVerts)`** (line ~39935): reads `src` as Float32 RGB (3/vertex), writes `dst` as Uint8 RGBA (4/vertex), rounding `(c*255+0.5)|0` clamped to 255 and forcing alpha 255. So call it as `packColorRGBA8(gColAttr.array, gCols, gCIdx / 3)` — `gCIdx` is the filled RGB element count, `gCIdx/3` = vertex count. A plain `.set()` of Float32 [0,1] into the Uint8 lane would truncate to 0 (black) — that's why the helper is required.
- **EXACT terrain mesher reference block (lines ~42269-42312)** — glass must mirror this fill+range pattern:
  ```js
  const terrainGeo = geometryPool.acquireTerrain(tFaceCount);                 // ~42269
  const posAttr = terrainGeo.attributes.position;
  const uvAttr  = terrainGeo.attributes.uv;
  const colAttr = terrainGeo.attributes.color;
  const quadSizeAttr = terrainGeo.attributes.quadSize;
  const idxAttr = terrainGeo.index;
  posAttr.array.set(terrainPos.subarray(0, tVIdx));                            // ~42280
  uvAttr.array.set(terrainUvs.subarray(0, tUvIdx));
  packColorRGBA8(colAttr.array, terrainCols, tCIdx / 3);                       // ~42286  Float32 RGB -> Uint8 RGBA
  quadSizeAttr.array.set(terrainQuadSize.subarray(0, tQsIdx));                 // native set; Float32->Uint16 exact for ints
  idxAttr.array.set(terrainIndices.subarray(0, tIIdx));
  posAttr.clearUpdateRanges();  posAttr.addUpdateRange(0, tVIdx);  posAttr.needsUpdate = true;       // ~42291
  uvAttr.clearUpdateRanges();   uvAttr.addUpdateRange(0, tUvIdx);  uvAttr.needsUpdate = true;
  colAttr.clearUpdateRanges();  colAttr.addUpdateRange(0, (tCIdx / 3) * 4);  colAttr.needsUpdate = true; // RGB count -> RGBA count
  quadSizeAttr.clearUpdateRanges(); quadSizeAttr.addUpdateRange(0, tQsIdx); quadSizeAttr.needsUpdate = true;
  idxAttr.clearUpdateRanges();  idxAttr.addUpdateRange(0, tIIdx);  idxAttr.needsUpdate = true;
  terrainGeo.setDrawRange(0, tIIdx);                                           // ~42312  index count
  ```
  Glass uses `computeBoundingSphere()` (its current call) rather than `applyTightChunkBounds` — keep that.
- **The `gFaceCount` safety cap** (line ~42552): `if (gFaceCount + 6 > maxFaces) break;` inside the glass block bounds glass to `MAX_FACES_PER_CHUNK`, so `acquireTerrain(gFaceCount)` always sizes a fitting tier.
- **Glass material + flags block to leave UNTOUCHED.** `glassMaterial = new THREE.MeshStandardMaterial({ ... })` (line ~31423): `map: tex`, `roughnessMap`, `vertexColors: true`, `side: THREE.DoubleSide`, `transparent: true`, `opacity: 1.0`, `color: 0xffffff`, `alphaTest: 0.5`, `depthWrite: false`, `depthTest: true`, `roughness: 1.0`, `metalness: 0.0`, `flatShading: true`. The mesh-creation tail (lines ~42584-42602) sets `customDepthMaterial = glassDepthMaterial`, `castShadow = SETTINGS.shadows`, `receiveShadow = false`, `frustumCulled = SETTINGS.enableFrustumCulling`, `matrixAutoUpdate = false`, `renderOrder = 1`. NONE of these change — only the geometry source (acquire/release) changes.
- **Release site — `releaseMeshForKey(key)` glass branch** (function line ~41506; branch line ~41509): currently `if (gm.geometry) gm.geometry.dispose();` at line ~41511. Swap to `geometryPool.releaseTerrain(gm.geometry)`. NOTE: there are TWO other glass dispose sites in `renderChunk` that also handle stale glass — the "else if (oldGlassMesh)" branches at lines ~42605-42608 and ~42611-42616 (`oldGlassMesh.geometry.dispose()`); the CCR's Before/After only covers the remesh-reuse dispose (line ~42581) and `releaseMeshForKey`. If aiming for full pooling consistency, those two stale-drop dispose calls should ALSO become `releaseTerrain` — otherwise a pooled geometry gets `dispose()`d on the "chunk no longer has glass" path (works, but defeats reuse there). Flagging for the implementer; the two listed edits are the minimum.

**Before** (glass geometry creation, line ~42571 — the `gFaceCount > 0` block; mesh-flag tail unchanged):
```js
                            if (gFaceCount > 0) {
                                const gGeo = new THREE.BufferGeometry();
                                gGeo.setAttribute('position', new THREE.BufferAttribute(gPos.slice(0, gVIdx), 3));
                                gGeo.setAttribute('uv', new THREE.BufferAttribute(gUvs.slice(0, gUvIdx), 2));
                                gGeo.setAttribute('color', new THREE.BufferAttribute(gCols.slice(0, gCIdx), 3));
                                gGeo.setAttribute('quadSize', new THREE.BufferAttribute(gQuad.slice(0, gQsIdx), 2));
                                gGeo.setIndex(new THREE.BufferAttribute(gIndices.slice(0, gIIdx), 1));
                                gGeo.computeBoundingSphere();
                                let gMesh = oldGlassMesh;
                                if (gMesh) {
                                    if (gMesh.geometry) gMesh.geometry.dispose();
                                    gMesh.geometry = gGeo;
                                } else {
```
**After:**
```js
                            if (gFaceCount > 0) {
                                // #573: build into a POOLED terrain geometry (reuse buffers) instead of a
                                // fresh BufferGeometry. Pool schema: color Uint8 RGBA (pack via packColorRGBA8),
                                // quadSize Uint16, index Uint32 — fill in place + set update/draw ranges, exactly
                                // like the terrain mesher. Material/flags below are untouched.
                                const gGeo = geometryPool.acquireTerrain(gFaceCount);
                                const gPosAttr = gGeo.attributes.position;
                                const gUvAttr = gGeo.attributes.uv;
                                const gColAttr = gGeo.attributes.color;
                                const gQsAttr = gGeo.attributes.quadSize;
                                const gIdxAttr = gGeo.index;
                                gPosAttr.array.set(gPos.subarray(0, gVIdx));
                                gUvAttr.array.set(gUvs.subarray(0, gUvIdx));
                                packColorRGBA8(gColAttr.array, gCols, gCIdx / 3); // Float32 RGB scratch -> Uint8 RGBA
                                gQsAttr.array.set(gQuad.subarray(0, gQsIdx));
                                gIdxAttr.array.set(gIndices.subarray(0, gIIdx));
                                gPosAttr.clearUpdateRanges(); gPosAttr.addUpdateRange(0, gVIdx); gPosAttr.needsUpdate = true;
                                gUvAttr.clearUpdateRanges(); gUvAttr.addUpdateRange(0, gUvIdx); gUvAttr.needsUpdate = true;
                                gColAttr.clearUpdateRanges(); gColAttr.addUpdateRange(0, (gCIdx / 3) * 4); gColAttr.needsUpdate = true;
                                gQsAttr.clearUpdateRanges(); gQsAttr.addUpdateRange(0, gQsIdx); gQsAttr.needsUpdate = true;
                                gIdxAttr.clearUpdateRanges(); gIdxAttr.addUpdateRange(0, gIIdx); gIdxAttr.needsUpdate = true;
                                gGeo.setDrawRange(0, gIIdx);
                                gGeo.computeBoundingSphere();
                                let gMesh = oldGlassMesh;
                                if (gMesh) {
                                    if (gMesh.geometry) geometryPool.releaseTerrain(gMesh.geometry); // #573: pool, don't dispose
                                    gMesh.geometry = gGeo;
                                } else {
```

**Before** (`releaseMeshForKey` glass branch, line ~41509):
```js
                if (key.includes("_GLASS")) {
                    const gm = chunkMeshes.get(key);
                    if (gm) { if (gm.parent) gm.parent.remove(gm); else scene.remove(gm); if (gm.geometry) gm.geometry.dispose(); chunkMeshes.delete(key); }
                    return;
                }
```
**After:**
```js
                if (key.includes("_GLASS")) {
                    const gm = chunkMeshes.get(key);
                    if (gm) { if (gm.parent) gm.parent.remove(gm); else scene.remove(gm); if (gm.geometry) geometryPool.releaseTerrain(gm.geometry); chunkMeshes.delete(key); } // #573: return pooled geo
                    return;
                }
```

**Before** (`renderChunk` stale-drop paths — TWO MORE `dispose()` sites that MUST ALSO be converted, ~42605–42616; grep `oldGlassMesh.geometry.dispose`. **REQUIRED, not optional** — once glass geometry comes from the pool, calling `.dispose()` on it destroys a buffer the pool still owns → use-after-free into the free list):
```js
                            } else if (oldGlassMesh) {
                                if (oldGlassMesh.parent) oldGlassMesh.parent.remove(oldGlassMesh); else scene.remove(oldGlassMesh);
                                if (oldGlassMesh.geometry) oldGlassMesh.geometry.dispose();
                                chunkMeshes.delete(glassKey);
                            }
                            posPool.release(gPos); uvPool.release(gUvs); colPool.release(gCols); indexPool.release(gIndices); quadSizePool.release(gQuad);
                        } else if (oldGlassMesh) {
                            // chunk no longer contains glass — drop the stale glass mesh
                            if (oldGlassMesh.parent) oldGlassMesh.parent.remove(oldGlassMesh); else scene.remove(oldGlassMesh);
                            if (oldGlassMesh.geometry) oldGlassMesh.geometry.dispose();
                            chunkMeshes.delete(glassKey);
                        }
```
**After:** (both `oldGlassMesh.geometry.dispose()` → `geometryPool.releaseTerrain(...)`; the `posPool.release(...)` scratch-pool line and everything else stay exactly as-is)
```js
                            } else if (oldGlassMesh) {
                                if (oldGlassMesh.parent) oldGlassMesh.parent.remove(oldGlassMesh); else scene.remove(oldGlassMesh);
                                if (oldGlassMesh.geometry) geometryPool.releaseTerrain(oldGlassMesh.geometry); // #573: pooled glass dropped (gFaceCount became 0)
                                chunkMeshes.delete(glassKey);
                            }
                            posPool.release(gPos); uvPool.release(gUvs); colPool.release(gCols); indexPool.release(gIndices); quadSizePool.release(gQuad);
                        } else if (oldGlassMesh) {
                            // chunk no longer contains glass — drop the stale glass mesh
                            if (oldGlassMesh.parent) oldGlassMesh.parent.remove(oldGlassMesh); else scene.remove(oldGlassMesh);
                            if (oldGlassMesh.geometry) geometryPool.releaseTerrain(oldGlassMesh.geometry); // #573: pooled glass dropped (chunk lost glass)
                            chunkMeshes.delete(glassKey);
                        }
```
> **CRITICAL — all FOUR glass release paths must use `releaseTerrain()` once pooled:** the remesh-reuse site (~42581), the two stale-drop sites above (~42607, ~42614), and `releaseMeshForKey` (~41511). After editing, grep `oldGlassMesh.geometry.dispose` AND `gMesh.geometry.dispose` in the glass path — both must return ZERO hits. Note `posPool/uvPool/colPool/indexPool/quadSizePool` are the SCRATCH-array pools that fill the geometry; keep their `.release()` calls (they are unrelated to `geometryPool`).

**Verify:**
- Place glass and look through it: body stays clear, frame/glints opaque, glint sweep present — pixel-identical to before (color is now Uint8-packed but baked light×AO is lossless at 8-bit, same as terrain). No black/blown-out/transparent panes.
- Glass shadow still casts (frame/glint cutout) with light through the body — `glassDepthMaterial`/`castShadow`/`renderOrder 1` untouched.
- Fly through many glass-containing chunks (load/unload/remesh by editing glass): `window.geometryPool.getStats()` shows glass acquisitions reusing the terrain pool (acquire/release balanced, active count stable); no leak warning from `checkGeometryLeaks` (5 s / 500+ excess).
- Run `tools/voxex-tests.html` meshing tests.

## Safety Checks
- [ ] Glass geometry acquired via `geometryPool.acquireTerrain(gFaceCount)` and released via `geometryPool.releaseTerrain(...)` — NO `new THREE.BufferGeometry()` and NO `geometry.dispose()` left in the glass build OR the `_GLASS` release branch (grep both).
- [ ] Color packed with `packColorRGBA8(gColAttr.array, gCols, gCIdx / 3)` (Uint8 RGBA), NOT a raw `.set()` of Float32 RGB (a plain set truncates [0,1] floats to 0 = black). `gCols` remains the Float32 RGB scratch the glass loop writes.
- [ ] `gFaceCount` ≤ pool tier capacity — the existing `if (gFaceCount + 6 > maxFaces) break;` cap (line ~42552) already bounds it to `MAX_FACES_PER_CHUNK`, so `acquireTerrain` sizes a fitting tier.
- [ ] Draw range set (`gGeo.setDrawRange(0, gIIdx)`) — pooled geometries reset drawRange to `Infinity` on acquire and `0` on release, so glass MUST set it explicitly (the old fresh-geometry path didn't need to).
- [ ] Glass MATERIAL + flags unchanged: still `glassMaterial` (transparent, DoubleSide, alphaTest 0.5, depthWrite false), `glassDepthMaterial`, `renderOrder 1`, `castShadow = SETTINGS.shadows`, `receiveShadow false`. Glass is NOT routed through the opaque chunk material.
- [ ] `releaseTerrain` is correct for glass geometry: it's a terrain-schema geometry (`userData.tier` set by `acquireTerrain`), so it returns to the right tier pool — no pool corruption.
- [ ] `window.geometryPool.getStats()` acquire/release balanced across glass load/unload; `checkGeometryLeaks` quiet.
- [ ] `tools/voxex-tests.html` (~204 tests) green (meshing).
- [ ] Update `VOXEX_BUILD` + `VOXEX_RECENT_CHANGES`.
