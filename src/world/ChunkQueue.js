/**
 * ChunkQueue - Manages chunk build/rebuild queues with frame budgeting.
 * Handles prioritization by distance and coordinates mesh generation timing.
 * @module world/ChunkQueue
 */

// =====================================================
// CHUNK QUEUE CONFIGURATION
// =====================================================

/**
 * Default configuration for chunk queue processing.
 * @type {Object}
 */
export const CHUNK_QUEUE_CONFIG = {
    /** Maximum time in ms to spend on chunk builds per frame */
    buildBudgetMs: 8,
    /** Default build queue limit per frame */
    buildQueueLimit: 4,
    /** Debounce delay in ms for chunk updates */
    debounceDelayMs: 50,
    /** Cooldown between rebuilds of same chunk */
    rebuildCooldownMs: 50
};

// =====================================================
// CHUNK QUEUE CLASS
// =====================================================

/**
 * ChunkQueue manages chunk generation and rebuild scheduling.
 * Features distance-based prioritization and frame budget management.
 */
export class ChunkQueue {
    /**
     * Create a new ChunkQueue.
     * @param {Object} [settings=null] - Settings object with buildQueueLimit
     */
    constructor(settings = null) {
        /** @type {Object} Settings reference */
        this.settings = settings;

        // =====================================================
        // BUILD QUEUE (chunks needing generation/rendering)
        // =====================================================
        /**
         * Queue of chunks awaiting build.
         * @type {Array<{key: string, cx: number, cz: number, dist: number, force?: boolean, allowLightingBypass?: boolean}>}
         */
        this.buildQueue = [];

        /**
         * Set of chunk keys currently in build queue (O(1) lookup).
         * @type {Set<string>}
         */
        this.queuedKeys = new Set();

        // =====================================================
        // DIRTY CHUNKS (need rebuild but keep current mesh visible)
        // =====================================================
        /**
         * Chunks marked dirty that need rebuild.
         * @type {Set<string>}
         */
        this.dirtyChunks = new Set();

        /**
         * Pending chunk updates (debounced).
         * @type {Set<string>}
         */
        this.pendingUpdates = new Set();

        /**
         * Chunk updates deferred while lighting is pending.
         * @type {Set<string>}
         */
        this.deferredUpdates = new Set();

        // =====================================================
        // NEIGHBOR UPDATE QUEUE
        // =====================================================
        /**
         * Chunks needing neighbor-triggered updates.
         * @type {Set<string>}
         */
        this.neighborUpdateQueue = new Set();

        /**
         * Chunks needing edge lighting updates.
         * @type {Set<string>}
         */
        this.edgeLightingQueue = new Set();

        /**
         * Chunks needing adjacent chunk updates (cross-chunk features).
         * @type {Set<string>}
         */
        this.adjacentUpdateQueue = new Set();

        // =====================================================
        // LIGHTING BYPASS
        // =====================================================
        /**
         * Chunk keys that should bypass lighting checks.
         * @type {Set<string>}
         */
        this.forceLightingBypassKeys = new Set();

        // =====================================================
        // DEBOUNCE STATE
        // =====================================================
        /** @private @type {number|null} */
        this._updateTimeout = null;

        // =====================================================
        // DIAGNOSTICS
        // =====================================================
        /**
         * Diagnostic tracking for chunk updates.
         * @type {Object}
         */
        this.diagnostics = {
            pending: new Map(),
            lastDispatchKeys: [],
            debounceResets: 0,
            lastDispatchReason: '',
            lastDispatchTime: 0,
            lastHeartbeat: 0,
            deferredFlushes: 0,
            neighborStats: { processed: 0, requeued: 0, lastRun: 0 }
        };
    }

    /**
     * Get a setting value with fallback.
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value
     * @returns {*} Setting value
     * @private
     */
    _getSetting(key, defaultValue) {
        if (this.settings && this.settings[key] !== undefined) {
            return this.settings[key];
        }
        return defaultValue;
    }

    // =====================================================
    // QUEUE MANAGEMENT
    // =====================================================

    /**
     * Add a chunk to the build queue.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {Object} [options={}] - Queue options
     * @param {number} [options.dist=0] - Distance squared from player
     * @param {boolean} [options.force=false] - Force processing
     * @param {boolean} [options.allowLightingBypass=false] - Allow skipping lighting checks
     * @returns {boolean} True if added, false if already queued
     */
    enqueue(cx, cz, options = {}) {
        const key = `${cx},${cz}`;

        if (this.queuedKeys.has(key)) {
            return false;
        }

        this.buildQueue.push({
            key,
            cx,
            cz,
            dist: options.dist ?? 0,
            force: options.force ?? false,
            allowLightingBypass: options.allowLightingBypass ?? false
        });
        this.queuedKeys.add(key);
        return true;
    }

    /**
     * Remove a chunk key from the queued set (allows re-queueing).
     * @param {string} key - Chunk key
     * @returns {void}
     */
    removeFromQueued(key) {
        this.queuedKeys.delete(key);
    }

    /**
     * Check if a chunk is currently queued.
     * @param {string} key - Chunk key
     * @returns {boolean} True if queued
     */
    isQueued(key) {
        return this.queuedKeys.has(key);
    }

    /**
     * Mark a chunk as dirty (needs rebuild).
     * @param {string} key - Chunk key
     * @returns {void}
     */
    markDirty(key) {
        this.dirtyChunks.add(key);
    }

    /**
     * Check if a chunk is dirty.
     * @param {string} key - Chunk key
     * @returns {boolean} True if dirty
     */
    isDirty(key) {
        return this.dirtyChunks.has(key);
    }

    /**
     * Clear dirty flag for a chunk.
     * @param {string} key - Chunk key
     * @returns {void}
     */
    clearDirty(key) {
        this.dirtyChunks.delete(key);
    }

    /**
     * Sort the build queue by distance (closest first).
     * @param {number} playerCX - Player chunk X
     * @param {number} playerCZ - Player chunk Z
     * @returns {void}
     */
    sortByDistance(playerCX, playerCZ) {
        if (this.buildQueue.length <= 1) return;

        // Update distances and sort
        for (const job of this.buildQueue) {
            // Parse key if coordinates are missing
            if (typeof job.cx !== 'number' || typeof job.cz !== 'number') {
                if (job.key) {
                    const [jcX, jcZ] = job.key.split(',').map(Number);
                    job.cx = jcX;
                    job.cz = jcZ;
                }
            }
            if (typeof job.cx === 'number' && typeof job.cz === 'number') {
                const dx = job.cx - playerCX;
                const dz = job.cz - playerCZ;
                job.dist = dx * dx + dz * dz;
            }
        }

        this.buildQueue.sort((a, b) => (a.dist || 0) - (b.dist || 0));
    }

    /**
     * Get the next job from the queue.
     * @returns {Object|null} Next job or null if empty
     */
    dequeue() {
        return this.buildQueue.shift() || null;
    }

    /**
     * Re-queue a job (push back to end).
     * @param {Object} job - Job to re-queue
     * @returns {void}
     */
    requeue(job) {
        this.buildQueue.push(job);
    }

    /**
     * Get current queue length.
     * @returns {number} Queue length
     */
    get length() {
        return this.buildQueue.length;
    }

    // =====================================================
    // CHUNK UPDATE SCHEDULING (with debounce)
    // =====================================================

    /**
     * Schedule a chunk for update with debouncing.
     * @param {number} cx - Chunk X coordinate
     * @param {number} cz - Chunk Z coordinate
     * @param {boolean} [force=false] - Force immediate processing
     * @param {string} [source='generic'] - Source of the update (for diagnostics)
     * @param {Object} [options={}] - Additional options
     * @param {boolean} [options.bypassLighting=false] - Skip lighting checks
     * @param {Function} [options.lightingPendingCheck] - Function to check if lighting is pending
     * @param {Function} [options.onDispatch] - Callback when updates are dispatched
     * @returns {void}
     */
    scheduleUpdate(cx, cz, force = false, source = 'generic', options = {}) {
        const key = `${cx},${cz}`;

        if (options.bypassLighting) {
            this.forceLightingBypassKeys.add(key);
        }

        this.diagnostics.pending.set(key, { source, time: performance.now() });

        // Check if lighting is pending for this chunk or neighbors
        const lightingPending = options.lightingPendingCheck
            ? options.lightingPendingCheck(cx, cz)
            : false;

        if (!force && lightingPending) {
            this.deferredUpdates.add(key);
            this.dirtyChunks.add(key);
            return;
        }

        this.pendingUpdates.add(key);
        this.dirtyChunks.add(key);

        // Debounce
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
            this.diagnostics.debounceResets++;
        }

        const debounceMs = CHUNK_QUEUE_CONFIG.debounceDelayMs;
        this._updateTimeout = setTimeout(() => {
            this._dispatchPendingUpdates('debounce', options.onDispatch);
            this._updateTimeout = null;
        }, debounceMs);
    }

    /**
     * Dispatch all pending updates to the build queue.
     * @param {string} reason - Reason for dispatch
     * @param {Function} [callback] - Optional callback
     * @private
     */
    _dispatchPendingUpdates(reason, callback) {
        if (this.pendingUpdates.size === 0) return;

        const keys = Array.from(this.pendingUpdates);
        this.diagnostics.lastDispatchKeys = keys;
        this.diagnostics.lastDispatchReason = reason;
        this.diagnostics.lastDispatchTime = performance.now();

        for (const key of keys) {
            const [cx, cz] = key.split(',').map(Number);
            this.enqueue(cx, cz, { force: true });
        }

        this.pendingUpdates.clear();

        if (callback) {
            callback(keys, reason);
        }
    }

    /**
     * Process deferred updates that were waiting for lighting.
     * @param {Function} lightingPendingCheck - Function to check if lighting is still pending
     * @returns {number} Number of updates dispatched
     */
    processDeferredUpdates(lightingPendingCheck) {
        let dispatched = 0;

        for (const key of this.deferredUpdates) {
            const [cx, cz] = key.split(',').map(Number);

            if (!lightingPendingCheck(cx, cz)) {
                this.deferredUpdates.delete(key);
                this.pendingUpdates.add(key);
                dispatched++;
            }
        }

        if (dispatched > 0) {
            this.diagnostics.deferredFlushes++;
            this._dispatchPendingUpdates('deferred-flush');
        }

        return dispatched;
    }

    // =====================================================
    // NEIGHBOR UPDATES
    // =====================================================

    /**
     * Queue a neighbor chunk for update.
     * @param {string} key - Chunk key
     * @returns {void}
     */
    queueNeighborUpdate(key) {
        this.neighborUpdateQueue.add(key);
    }

    /**
     * Process neighbor updates with budget.
     * @param {number} limit - Maximum updates to process
     * @param {Function} processor - Function to process each update
     * @param {Function} [lightingPendingCheck] - Optional lighting check
     * @returns {number} Number processed
     */
    processNeighborUpdates(limit, processor, lightingPendingCheck) {
        if (this.neighborUpdateQueue.size === 0) return 0;

        const toUpdate = Array.from(this.neighborUpdateQueue).slice(0, limit);
        let processed = 0;

        for (const key of toUpdate) {
            this.neighborUpdateQueue.delete(key);

            // Check if lighting is pending
            if (lightingPendingCheck) {
                const [cx, cz] = key.split(',').map(Number);
                if (lightingPendingCheck(cx, cz)) {
                    this.neighborUpdateQueue.add(key);
                    this.diagnostics.neighborStats.requeued++;
                    continue;
                }
            }

            processor(key);
            processed++;
            this.diagnostics.neighborStats.processed++;
        }

        this.diagnostics.neighborStats.lastRun = performance.now();
        return processed;
    }

    // =====================================================
    // EDGE LIGHTING UPDATES
    // =====================================================

    /**
     * Queue a chunk for edge lighting update.
     * @param {string} key - Chunk key
     * @returns {void}
     */
    queueEdgeLighting(key) {
        this.edgeLightingQueue.add(key);
    }

    /**
     * Get edge lighting queue size.
     * @returns {number} Queue size
     */
    get edgeLightingQueueSize() {
        return this.edgeLightingQueue.size;
    }

    // =====================================================
    // ADJACENT CHUNK UPDATES
    // =====================================================

    /**
     * Queue a chunk for adjacent update (cross-chunk features).
     * @param {string} key - Chunk key
     * @returns {void}
     */
    queueAdjacentUpdate(key) {
        this.adjacentUpdateQueue.add(key);
    }

    /**
     * Get adjacent update queue size.
     * @returns {number} Queue size
     */
    get adjacentUpdateQueueSize() {
        return this.adjacentUpdateQueue.size;
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Clear all queues and reset state.
     * @returns {void}
     */
    clear() {
        this.buildQueue = [];
        this.queuedKeys.clear();
        this.dirtyChunks.clear();
        this.pendingUpdates.clear();
        this.deferredUpdates.clear();
        this.neighborUpdateQueue.clear();
        this.edgeLightingQueue.clear();
        this.adjacentUpdateQueue.clear();
        this.forceLightingBypassKeys.clear();

        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
            this._updateTimeout = null;
        }
    }

    /**
     * Get diagnostic information.
     * @returns {Object} Diagnostics object
     */
    getDiagnostics() {
        return {
            ...this.diagnostics,
            buildQueueLength: this.buildQueue.length,
            queuedKeysCount: this.queuedKeys.size,
            dirtyChunksCount: this.dirtyChunks.size,
            pendingUpdatesCount: this.pendingUpdates.size,
            deferredUpdatesCount: this.deferredUpdates.size,
            neighborQueueSize: this.neighborUpdateQueue.size,
            edgeLightingQueueSize: this.edgeLightingQueue.size,
            adjacentUpdateQueueSize: this.adjacentUpdateQueue.size
        };
    }
}

// =====================================================
// FRAME BUDGET HELPER
// =====================================================

/**
 * Process items from a queue with frame budget.
 * @param {Array|Set} queue - Queue to process
 * @param {number} budgetMs - Time budget in milliseconds
 * @param {Function} processor - Function to process each item
 * @param {Object} [options={}] - Options
 * @param {number} [options.limit=Infinity] - Maximum items to process
 * @param {Function} [options.shouldContinue] - Additional check to continue processing
 * @returns {{processed: number, timeUsed: number, remaining: number}} Processing stats
 */
export function processWithBudget(queue, budgetMs, processor, options = {}) {
    const startTime = performance.now();
    const limit = options.limit ?? Infinity;
    let processed = 0;

    const isArray = Array.isArray(queue);
    const isSet = queue instanceof Set;

    if (isArray) {
        while (queue.length > 0 && processed < limit) {
            // Check budget
            if (processed > 0 && (performance.now() - startTime) > budgetMs) {
                break;
            }

            // Check additional condition
            if (options.shouldContinue && !options.shouldContinue()) {
                break;
            }

            const item = queue.shift();
            processor(item);
            processed++;
        }
    } else if (isSet) {
        const iterator = queue.values();
        let result = iterator.next();

        while (!result.done && processed < limit) {
            // Check budget
            if (processed > 0 && (performance.now() - startTime) > budgetMs) {
                break;
            }

            // Check additional condition
            if (options.shouldContinue && !options.shouldContinue()) {
                break;
            }

            const item = result.value;
            queue.delete(item);
            processor(item);
            processed++;
            result = iterator.next();
        }
    }

    return {
        processed,
        timeUsed: performance.now() - startTime,
        remaining: isArray ? queue.length : queue.size
    };
}

export default ChunkQueue;
