/**
 * Async sunlight propagation task.
 * State machine for incremental, non-blocking sunlight updates.
 * @module world/lighting/SunlightTask
 */

import { CHUNK_SIZE, CHUNK_HEIGHT, Y_OFFSET } from '../../config/WorldConfig.js';
import {
    HARD_CAP_BASE_CHUNKS,
    HARD_CAP_MAX_CHUNKS,
    HARD_CAP_GROWTH_RATIO
} from './LightConstants.js';
import { getChunkKey, parseChunkKey } from '../../config/WorldConfig.js';

// =====================================================
// SUNLIGHT TASK CLASS
// =====================================================
// SunlightTask encapsulates the state for incremental sunlight updates.
// It uses BFS queues to spread light changes across potentially multiple chunks,
// with pressure management to prevent runaway propagation.
//
// Key features:
// - Add queue: Blocks receiving more light
// - Remove queue: Blocks losing light
// - Pressure tracking to detect and bail out on large updates
// - Per-frame work budget to avoid frame drops
// =====================================================

/**
 * SunlightTask class - Encapsulates sunlight update state and operations.
 * Used for incremental lighting updates when blocks change.
 */
export class SunlightTask {
    /**
     * Create a new sunlight task.
     * @param {number} x - Global X coordinate of changed block
     * @param {number} y - Global Y coordinate of changed block
     * @param {number} z - Global Z coordinate of changed block
     * @param {number} oldId - Previous block ID
     * @param {number} newId - New block ID
     * @param {Object} [tracker] - Light task tracker for chunk management
     * @param {number} [chunkSize=16] - Chunk size
     * @param {number} [chunkHeight=320] - Chunk height
     * @param {number} [yOffset=64] - Y offset for world coordinates
     */
    constructor(x, y, z, oldId, newId, tracker = null, chunkSize = CHUNK_SIZE, chunkHeight = CHUNK_HEIGHT, yOffset = Y_OFFSET) {
        // Position and block info
        this.x = x;
        this.y = y;
        this.z = z;
        this.oldId = oldId;
        this.newId = newId;

        // World dimensions (cached to avoid repeated lookups)
        this.chunkSize = chunkSize;
        this.chunkHeight = chunkHeight;
        this.yOffset = yOffset;
        this.chunkVolume = chunkSize * chunkSize * chunkHeight;

        // Queues for light propagation (flat arrays: x, y, z, level per entry)
        this.addQueue = [];
        this.removeQueue = [];
        this.addVisited = new Map();
        this.removeVisited = new Map();
        this.addIndex = 0;
        this.removeIndex = 0;

        // Pressure management
        this.blockedAddBuffer = [];
        this.blockedRemoveBuffer = [];
        this.enqueueBlocked = false;

        // Chunk tracking
        this.touchedChunks = new Set();
        const baseChunkKey = getChunkKey(Math.floor(x / chunkSize), Math.floor(z / chunkSize));
        this.touchedChunks.add(baseChunkKey);
        tracker?.mark?.(baseChunkKey);

        // Capacity limits
        this.HARD_CAP_BASE_CHUNKS = HARD_CAP_BASE_CHUNKS;
        this.HARD_CAP_MAX_CHUNKS = HARD_CAP_MAX_CHUNKS;
        this.HARD_CAP_GROWTH_RATIO = HARD_CAP_GROWTH_RATIO;
        this.SOFT_CAP_BASE = this.chunkVolume * 2;

        // State flags
        this.bailedOut = false;
        this.done = false;
        this.inQueue = false;
        this.softWarned = false;

        // Statistics (built-in instrumentation)
        this.totalEnqueued = 0;
        this.peakEntries = 0;
        this.resolveVisitCalls = 0;
        this.pressureChecks = 0;

        // Keep tracker reference for later use
        this.tracker = tracker;

        // Callback for completion
        this.onComplete = null;
    }

    /**
     * Resolve world coordinates to chunk/local coords and track visits.
     * @param {Map<string, Uint8Array>} visitMap - Visit tracking map
     * @param {number} qx - Global X coordinate
     * @param {number} qy - Global Y coordinate
     * @param {number} qz - Global Z coordinate
     * @returns {string|null} Chunk key if not yet visited, null otherwise
     */
    resolveVisit(visitMap, qx, qy, qz) {
        this.resolveVisitCalls++;

        const ly = qy + this.yOffset;
        if (ly < 0 || ly >= this.chunkHeight) return null;

        const cx = Math.floor(qx / this.chunkSize);
        const cz = Math.floor(qz / this.chunkSize);
        const lx = ((qx % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const lz = ((qz % this.chunkSize) + this.chunkSize) % this.chunkSize;

        const chunkKey = getChunkKey(cx, cz);
        this.touchedChunks.add(chunkKey);
        this.tracker?.mark?.(chunkKey);

        let visitTracker = visitMap.get(chunkKey);
        if (!visitTracker) {
            visitTracker = new Uint8Array(this.chunkVolume);
            visitMap.set(chunkKey, visitTracker);
        }

        const idx = lx + lz * this.chunkSize + ly * this.chunkSize * this.chunkSize;
        if (visitTracker[idx]) return null;
        visitTracker[idx] = 1;

        return chunkKey;
    }

    /**
     * Calculate dynamic hard cap based on touched chunks.
     * @returns {number} Maximum allowed queue entries
     */
    getDynamicHardCap() {
        const touched = Math.max(1, this.touchedChunks.size);
        const extraChunks = Math.max(0, touched - this.HARD_CAP_BASE_CHUNKS);
        const allowedChunks = Math.min(
            this.HARD_CAP_MAX_CHUNKS,
            this.HARD_CAP_BASE_CHUNKS + Math.floor(extraChunks * this.HARD_CAP_GROWTH_RATIO)
        );
        return allowedChunks * this.chunkVolume;
    }

    /**
     * Flush blocked buffers to main queues.
     */
    flushBlocked() {
        if (!this.blockedAddBuffer.length && !this.blockedRemoveBuffer.length) return;

        if (this.blockedRemoveBuffer.length) {
            for (let i = 0; i < this.blockedRemoveBuffer.length; i++) {
                this.removeQueue.push(this.blockedRemoveBuffer[i]);
            }
            this.blockedRemoveBuffer.length = 0;
        }

        if (this.blockedAddBuffer.length) {
            for (let i = 0; i < this.blockedAddBuffer.length; i++) {
                this.addQueue.push(this.blockedAddBuffer[i]);
            }
            this.blockedAddBuffer.length = 0;
        }
    }

    /**
     * Check queue pressure and trigger bailout if needed.
     * @returns {boolean} True if bailed out
     */
    checkPressure() {
        this.pressureChecks++;
        if (this.bailedOut) return true;

        const dynamicHardCap = this.getDynamicHardCap();
        const dynamicSoftCap = this.SOFT_CAP_BASE * Math.max(1, this.touchedChunks.size / 4);
        const throttleLimit = dynamicHardCap * 0.8;
        const unblockThreshold = dynamicHardCap * 0.6;

        // Calculate current queue sizes (4 values per entry)
        const addEntries = this.addQueue.length >> 2;
        const removeEntries = this.removeQueue.length >> 2;
        const bufferedEntries = (this.blockedAddBuffer.length + this.blockedRemoveBuffer.length) >> 2;
        const currentEntries = Math.max(addEntries, removeEntries);
        const maxEntries = Math.max(currentEntries, bufferedEntries);

        this.peakEntries = Math.max(this.peakEntries, maxEntries);

        // Throttle enqueueing if approaching hard cap
        if (maxEntries > throttleLimit && !this.enqueueBlocked) {
            this.enqueueBlocked = true;
            return false;
        }

        // Handle blocked state
        if (this.enqueueBlocked) {
            if (maxEntries <= unblockThreshold) {
                this.enqueueBlocked = false;
                this.flushBlocked();
            } else if (maxEntries > dynamicHardCap) {
                return this.bailoutToFullRecalc("hard cap");
            }
            return false;
        }

        // Check caps
        if (maxEntries > dynamicHardCap) {
            return this.bailoutToFullRecalc("hard cap");
        }

        if (maxEntries > dynamicSoftCap) {
            if (!this.softWarned) {
                this.softWarned = true;
                console.warn(
                    `[Lighting] Soft cap reached (${maxEntries} entries across ${this.touchedChunks.size} chunks, cap ${Math.floor(dynamicSoftCap)}); falling back.`
                );
            }
            return this.bailoutToFullRecalc("soft cap");
        }

        return false;
    }

    /**
     * Bailout to full chunk recalculation.
     * @param {string} [reason="cap exceeded"] - Reason for bailout
     * @returns {boolean} Always true
     */
    bailoutToFullRecalc(reason = "cap exceeded") {
        if (this.bailedOut) return true;

        this.bailedOut = true;
        this.done = true;
        this.addQueue.length = 0;
        this.removeQueue.length = 0;

        console.warn(`[Lighting] Sunlight fallback triggered (${reason}); scheduling chunk-level recalcs.`);

        // Collect affected chunks (including neighbors)
        const targets = this.collectAffectedChunks();

        return true;
    }

    /**
     * Collect affected chunks and their neighbors.
     * @returns {Set<string>} Set of affected chunk keys
     */
    collectAffectedChunks() {
        const targets = new Set();

        this.touchedChunks.forEach((chunkKey) => {
            const { cx, cz } = parseChunkKey(chunkKey);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    targets.add(getChunkKey(cx + dx, cz + dz));
                }
            }
        });

        return targets;
    }

    /**
     * Enqueue a light removal operation.
     * @param {number} qx - Global X coordinate
     * @param {number} qy - Global Y coordinate
     * @param {number} qz - Global Z coordinate
     * @param {number} level - Current light level
     */
    enqueueRemove(qx, qy, qz, level) {
        if (this.bailedOut) return;
        if (this.resolveVisit(this.removeVisited, qx, qy, qz) === null) return;

        if (this.enqueueBlocked) {
            this.blockedRemoveBuffer.push(qx, qy, qz, level);
            return;
        }

        this.removeQueue.push(qx, qy, qz, level);
        this.totalEnqueued++;
        this.checkPressure();
    }

    /**
     * Enqueue a light addition operation.
     * @param {number} qx - Global X coordinate
     * @param {number} qy - Global Y coordinate
     * @param {number} qz - Global Z coordinate
     * @param {number} level - New light level
     */
    enqueueAdd(qx, qy, qz, level) {
        if (this.bailedOut) return;
        if (this.resolveVisit(this.addVisited, qx, qy, qz) === null) return;

        if (this.enqueueBlocked) {
            this.blockedAddBuffer.push(qx, qy, qz, level);
            return;
        }

        this.addQueue.push(qx, qy, qz, level);
        this.totalEnqueued++;
        this.checkPressure();
    }

    /**
     * Check if the task has pending work.
     * @returns {boolean} True if there is pending work
     */
    hasPendingWork() {
        return !this.done && !this.bailedOut && (
            this.addIndex < this.addQueue.length ||
            this.removeIndex < this.removeQueue.length ||
            this.blockedAddBuffer.length > 0 ||
            this.blockedRemoveBuffer.length > 0
        );
    }

    /**
     * Mark the task as complete.
     */
    markComplete() {
        this.done = true;
        if (this.onComplete) {
            this.onComplete();
        }
    }

    /**
     * Returns task statistics for debugging.
     * @returns {Object} Task stats including queue sizes, chunks touched, etc.
     */
    stats() {
        return {
            position: { x: this.x, y: this.y, z: this.z },
            state: {
                done: this.done,
                bailedOut: this.bailedOut,
                enqueueBlocked: this.enqueueBlocked
            },
            queues: {
                addQueueSize: this.addQueue.length >> 2,
                removeQueueSize: this.removeQueue.length >> 2,
                addIndex: this.addIndex >> 2,
                removeIndex: this.removeIndex >> 2,
                blockedAdd: this.blockedAddBuffer.length >> 2,
                blockedRemove: this.blockedRemoveBuffer.length >> 2
            },
            chunks: {
                touched: this.touchedChunks.size,
                visitMapsAdd: this.addVisited.size,
                visitMapsRemove: this.removeVisited.size
            },
            counters: {
                totalEnqueued: this.totalEnqueued,
                peakEntries: this.peakEntries,
                resolveVisitCalls: this.resolveVisitCalls,
                pressureChecks: this.pressureChecks
            }
        };
    }
}

/**
 * Create a light task tracker for managing pending light updates.
 * @param {Array<string>} [initialChunks=[]] - Initial chunk keys to track
 * @returns {Object} Tracker object with mark and finalize methods
 */
export function createLightTaskTracker(initialChunks = []) {
    const tracked = new Set(initialChunks);

    return {
        tracked,
        done: false,
        mark: (chunkKey) => {
            if (!chunkKey || tracked.has(chunkKey)) return;
            tracked.add(chunkKey);
        },
        finalize: () => {
            tracked.clear();
        }
    };
}

/**
 * Finalize a light task tracker.
 * @param {Object} tracker - Tracker to finalize
 */
export function finalizeLightTracker(tracker) {
    if (!tracker || tracker.done) return;
    tracker.done = true;
    tracker.finalize();
}

export default SunlightTask;
