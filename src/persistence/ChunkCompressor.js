/**
 * Run-Length Encoding compressor for chunk data.
 * Handles blocks, skyLight, and blockLight arrays.
 * @module persistence/ChunkCompressor
 */

/**
 * @typedef {Object} CompressedChunk
 * @property {number} version - Format version (2 for new format)
 * @property {number[]} blocks - RLE-compressed block data
 * @property {number[]} skyLight - RLE-compressed sky light data
 * @property {number[]|null} blockLight - RLE-compressed block light data
 */

/**
 * @typedef {Object} ChunkData
 * @property {Uint8Array} blocks - Block ID array
 * @property {Uint8Array} skyLight - Sky light level array
 * @property {Uint8Array} blockLight - Block light level array
 */

/**
 * Chunk data compressor using Run-Length Encoding.
 * Supports both legacy v1 format (raw Uint8Array) and v2 format (structured data).
 */
export const ChunkCompressor = {
    /** Debug call counters for performance analysis */
    _callCounts: {
        compressArray: 0,
        decompressArray: 0,
        compress: 0,
        decompress: 0,
        bytesCompressed: 0,
        bytesDecompressed: 0
    },

    /**
     * Compress a single Uint8Array using RLE.
     * @private
     * @param {Uint8Array} uint8Data - Data to compress
     * @returns {Uint16Array} RLE-compressed data (count, value pairs)
     */
    _compressArray(uint8Data) {
        this._callCounts.compressArray++;
        if (!uint8Data || uint8Data.length === 0) return new Uint16Array(0);
        this._callCounts.bytesCompressed += uint8Data.length;

        // First pass: count runs to allocate exact size
        let runCount = 1;
        let prev = uint8Data[0];
        for (let i = 1; i < uint8Data.length; i++) {
            if (uint8Data[i] !== prev) {
                runCount++;
                prev = uint8Data[i];
            }
        }

        // Allocate typed array with exact size needed
        const result = new Uint16Array(runCount * 2);
        let writeIdx = 0;
        prev = uint8Data[0];
        let count = 1;

        // Second pass: fill the typed array
        for (let i = 1; i < uint8Data.length; i++) {
            const current = uint8Data[i];
            if (current === prev) {
                count++;
            } else {
                result[writeIdx++] = count;
                result[writeIdx++] = prev;
                prev = current;
                count = 1;
            }
        }

        // Write the last run
        result[writeIdx++] = count;
        result[writeIdx] = prev;
        return result;
    },

    /**
     * Decompress RLE data back to a Uint8Array.
     * @private
     * @param {Uint16Array|number[]} compressedData - RLE data (count, value pairs)
     * @returns {Uint8Array} Decompressed data
     */
    _decompressArray(compressedData) {
        this._callCounts.decompressArray++;
        if (!compressedData || compressedData.length === 0) return new Uint8Array(0);

        // Calculate total size
        let totalSize = 0;
        for (let i = 0; i < compressedData.length; i += 2) {
            totalSize += compressedData[i];
        }
        this._callCounts.bytesDecompressed += totalSize;

        const data = new Uint8Array(totalSize);
        let writeIdx = 0;

        // Manual fill loop (faster than .fill() for this pattern)
        for (let i = 0; i < compressedData.length; i += 2) {
            const count = compressedData[i];
            const id = compressedData[i + 1];
            const endIdx = writeIdx + count;

            // Unrolled loop for common small counts (optimization)
            if (count <= 4) {
                for (let j = writeIdx; j < endIdx; j++) {
                    data[j] = id;
                }
            } else {
                data.fill(id, writeIdx, endIdx);
            }
            writeIdx = endIdx;
        }

        return data;
    },

    /**
     * Compress chunk data (handles both old and new format).
     * @param {Uint8Array|ChunkData} chunkData - Chunk data to compress
     * @returns {CompressedChunk|number[]|null} Compressed data
     */
    compress(chunkData) {
        this._callCounts.compress++;
        if (!chunkData) return null;

        // New format: {blocks, skyLight, blockLight}
        if (chunkData.blocks && chunkData.skyLight) {
            return {
                version: 2,
                blocks: Array.from(this._compressArray(chunkData.blocks)),
                skyLight: Array.from(this._compressArray(chunkData.skyLight)),
                blockLight: chunkData.blockLight
                    ? Array.from(this._compressArray(chunkData.blockLight))
                    : null,
            };
        }

        // Old format: Uint8Array
        return Array.from(this._compressArray(chunkData));
    },

    /**
     * Decompress chunk data (handles both old and new format).
     * @param {CompressedChunk|number[]} compressedData - Compressed data
     * @returns {ChunkData|Uint8Array|null} Decompressed chunk data
     */
    decompress(compressedData) {
        this._callCounts.decompress++;
        if (!compressedData) return null;

        // New format (version 2)
        if (compressedData.version === 2) {
            const blocks = this._decompressArray(new Uint16Array(compressedData.blocks));
            const skyLight = this._decompressArray(new Uint16Array(compressedData.skyLight));
            // Initialize blockLight with proper size if not present
            const blockLight = compressedData.blockLight
                ? this._decompressArray(new Uint16Array(compressedData.blockLight))
                : new Uint8Array(blocks.length);
            return { blocks, skyLight, blockLight };
        }

        // Old format: just a Uint16Array
        return this._decompressArray(new Uint16Array(compressedData));
    },

    /**
     * Returns compression statistics for debugging.
     * @returns {Object} Stats including call counts and bytes processed
     */
    stats() {
        const ratio = this._callCounts.bytesCompressed > 0
            ? (this._callCounts.bytesDecompressed / this._callCounts.bytesCompressed).toFixed(2)
            : 'N/A';

        return {
            calls: { ...this._callCounts },
            bytesCompressedMB: (this._callCounts.bytesCompressed / (1024 * 1024)).toFixed(2),
            bytesDecompressedMB: (this._callCounts.bytesDecompressed / (1024 * 1024)).toFixed(2),
            ratio
        };
    },

    /**
     * Get call statistics.
     * @returns {Object} Copy of call counts
     */
    getCallStats() {
        return { ...this._callCounts };
    },

    /**
     * Reset call statistics to zero.
     */
    resetCallStats() {
        for (const key in this._callCounts) {
            this._callCounts[key] = 0;
        }
    }
};

export default ChunkCompressor;
