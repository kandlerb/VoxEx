/**
 * AudioManager - handles all game audio using the Web Audio API.
 * Uses cached buffers and oscillator patterns for efficient sound playback.
 * @module audio/AudioManager
 */

// =====================================================
// DEBUG FLAG
// =====================================================

/** Debug mode flag - controls call counting for verification */
let isDebug = false;

/**
 * Enable or disable debug mode for call counting.
 * @param {boolean} enabled - Whether to enable debug mode
 * @returns {void}
 */
export function setAudioDebug(enabled) {
    isDebug = enabled;
}

// =====================================================
// AUDIOMANAGER CLASS
// =====================================================

/**
 * AudioManager - handles all game audio using the Web Audio API.
 * Uses cached buffers and oscillator patterns for efficient sound playback.
 *
 * OPTIMIZATION NOTES:
 * - NOT A HOT PATH: All methods are event-driven (UI clicks, block actions, footsteps)
 * - No per-frame audio processing occurs
 * - Cached noise buffer for playClick() avoids AudioBuffer allocation per click
 * - Helper method _playSimpleOsc() reduces code duplication
 *
 * WHY NODE POOLING ISN'T USED:
 * - OscillatorNode/BufferSourceNode are one-shot by Web Audio API design
 * - GainNode automation curves persist, requiring cancelScheduledValues() + reset
 * - Browser handles cleanup efficiently for short-lived audio nodes
 */
export class AudioManager {
    /**
     * Create a new AudioManager.
     * @param {Object|null} settingsManager - Settings manager for audio preferences.
     */
    constructor(settingsManager) {
        /** @type {Object|null} Settings manager instance */
        this.settings = settingsManager;
        /** @type {AudioContext|null} Web Audio context (created lazily) */
        this.ctx = null;
        /** @type {boolean} Whether audio is enabled */
        this.enabled = true;
        /** @type {number} Master volume (0-1) */
        this.masterVolume = 0.3;
        /** @type {Map<string, AudioBuffer>} Named sound registry */
        this.sounds = new Map();
        /** @type {Map<string, AudioBuffer>} Decoded audio buffer cache */
        this.bufferCache = new Map();

        // OPTIMIZATION: Cached noise buffer for click sounds (avoids per-call allocation)
        /** @private @type {AudioBuffer|null} */
        this._clickNoiseBuffer = null;
        /** @private @type {number} */
        this._clickNoiseDuration = 0.04;

        // DEBUG: Call counters for verification
        /** @private */
        this._callCounts = { playClick: 0, playFootstep: 0, playBlockPlace: 0, playBlockBreak: 0 };
    }

    // =====================================================
    // AUDIO CONTEXT LIFECYCLE
    // =====================================================

    /**
     * Initialize the AudioContext lazily on first sound.
     * @returns {AudioContext} The audio context instance.
     */
    initContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.ctx;
    }

    /**
     * Resume the audio context if suspended (required after user interaction).
     * @returns {void}
     */
    resumeContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Enable or disable audio playback.
     * @param {boolean} enabled - Whether audio should be enabled.
     * @returns {void}
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Set the master volume level.
     * @param {number} volume - Volume level (0-1, clamped to valid range).
     * @returns {void}
     */
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    // =====================================================
    // PRIVATE HELPER METHODS
    // =====================================================

    /**
     * Lazily create and cache the click noise buffer.
     * @returns {AudioBuffer} The cached noise buffer for click sounds.
     * @private
     */
    _getClickNoiseBuffer() {
        if (!this._clickNoiseBuffer) {
            const ctx = this.initContext();
            const sampleCount = Math.ceil(ctx.sampleRate * this._clickNoiseDuration);
            this._clickNoiseBuffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
            const noiseData = this._clickNoiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) {
                noiseData[i] = (Math.random() * 2 - 1) * 0.6;
            }
        }
        return this._clickNoiseBuffer;
    }

    /**
     * Play a simple oscillator sound with pitch bend and volume envelope.
     * @param {string} type - Oscillator type ('sine', 'triangle', 'sawtooth', 'square').
     * @param {number} startFreq - Starting frequency in Hz.
     * @param {number} endFreq - Ending frequency in Hz (for pitch bend).
     * @param {number} duration - Sound duration in seconds.
     * @param {number} volume - Volume multiplier (0-1), multiplied by masterVolume.
     * @returns {void}
     * @private
     */
    _playSimpleOsc(type, startFreq, endFreq, duration, volume) {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), now + duration);

        gain.gain.setValueAtTime(this.masterVolume * volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
    }

    // =====================================================
    // SOUND LOADING AND PLAYBACK
    // =====================================================

    /**
     * Load a sound from base64-encoded audio data into the buffer cache.
     * @param {string} name - Unique name for the sound.
     * @param {string} base64Data - Base64-encoded audio data.
     * @returns {Promise<AudioBuffer|null>} The decoded audio buffer, or null on failure.
     */
    async loadSound(name, base64Data) {
        const ctx = this.initContext();

        if (this.bufferCache.has(name)) {
            return this.bufferCache.get(name);
        }

        try {
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
            this.bufferCache.set(name, audioBuffer);
            return audioBuffer;
        } catch (e) {
            console.warn(`[AudioManager] Failed to load sound '${name}':`, e);
            return null;
        }
    }

    /**
     * Play a cached sound by name with optional volume and playback rate.
     * @param {string} name - Name of the cached sound to play.
     * @param {Object} [options={}] - Playback options.
     * @param {number} [options.volume=1.0] - Volume multiplier (0-1).
     * @param {number} [options.playbackRate] - Playback rate multiplier.
     * @returns {void}
     */
    play(name, options = {}) {
        if (!this.enabled || !this.ctx) return;

        const buffer = this.bufferCache.get(name);
        if (!buffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = (options.volume || 1.0) * this.masterVolume;

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        if (options.playbackRate) {
            source.playbackRate.value = options.playbackRate;
        }

        source.start(0);
    }

    // =====================================================
    // UI SOUNDS
    // =====================================================

    /**
     * Play a UI click sound (for buttons and menu interactions).
     * Uses cached noise buffer for efficient playback.
     * @returns {void}
     */
    playClick() {
        if (isDebug) this._callCounts.playClick++;
        // Generate and play a rich UI click sound (clink)
        if (!this.enabled) return;

        const ctx = this.initContext();
        const now = ctx.currentTime;

        // Slight randomization so repeated clicks don't sound identical
        const baseFreq = 650 + Math.random() * 80; // 650–730 Hz

        // Main tonal body: soft, percussive blip
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + 0.08);

        osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.08);

        // OPTIMIZATION: Use cached noise buffer instead of creating new one each call
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = this._getClickNoiseBuffer();

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(this.masterVolume * 0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + this._clickNoiseDuration);

        // Shared gain envelope (final amplitude)
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.7, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        // Gentle low-pass filter to keep things soft and UI-friendly
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3500, now);
        filter.Q.value = 0.7;

        // Routing: oscillators -> filter -> gain -> destination
        osc1.connect(filter);
        osc2.connect(filter);
        noiseSource.connect(noiseGain);
        noiseGain.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Start/stop everything
        osc1.start(now);
        osc2.start(now);
        noiseSource.start(now);

        const stopTime = now + 0.2;
        osc1.stop(stopTime);
        osc2.stop(stopTime);
        noiseSource.stop(stopTime);
    }

    // =====================================================
    // BLOCK SOUNDS
    // =====================================================

    /**
     * Play a block placement sound (wood-like thunk).
     * @returns {void}
     */
    playBlockPlace() {
        if (isDebug) this._callCounts.playBlockPlace++;
        if (!this.enabled) return;
        this.initContext();
        // Wood-like thunk sound: triangle 150->80 Hz, 80ms
        this._playSimpleOsc('triangle', 150, 80, 0.08, 0.4);
    }

    /**
     * Play a block breaking sound (crumble effect).
     * @returns {void}
     */
    playBlockBreak() {
        if (isDebug) this._callCounts.playBlockBreak++;
        if (!this.enabled) return;
        this.initContext();
        // Breaking/crumble sound: sawtooth 200->50 Hz, 100ms
        this._playSimpleOsc('sawtooth', 200, 50, 0.1, 0.3);
    }

    // =====================================================
    // MOVEMENT SOUNDS
    // =====================================================

    /**
     * Play a footstep sound (soft thud with randomized pitch).
     * @returns {void}
     */
    playFootstep() {
        if (isDebug) this._callCounts.playFootstep++;
        if (!this.enabled) return;
        this.initContext();
        // Soft thud: sine at random 100-150 Hz, 50ms
        const freq = 100 + Math.random() * 50;
        this._playSimpleOsc('sine', freq, freq, 0.05, 0.15);
    }

    // =====================================================
    // ENTITY SOUNDS
    // =====================================================

    /**
     * Play a zombie growl sound (low sawtooth with pitch bend).
     * @returns {void}
     */
    playZombieGrowl() {
        if (!this.enabled) return;
        this.initContext();
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80 + Math.random() * 40, now);
        osc.frequency.linearRampToValueAtTime(60 + Math.random() * 30, now + 0.3);
        gain.gain.setValueAtTime(this.masterVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    /**
     * Play a zombie hurt sound (square wave with pitch drop).
     * @returns {void}
     */
    playZombieHurt() {
        if (!this.enabled) return;
        this.initContext();
        // Hurt sound: square 200->100 Hz, 150ms
        this._playSimpleOsc('square', 200, 100, 0.15, 0.35);
    }

    /**
     * Play a player hurt sound (sine wave with pitch drop).
     * @returns {void}
     */
    playPlayerHurt() {
        if (!this.enabled) return;
        this.initContext();
        // Player hurt: sine 400->200 Hz, 100ms
        this._playSimpleOsc('sine', 400, 200, 0.1, 0.4);
    }

    // =====================================================
    // DEBUG UTILITIES
    // =====================================================

    /**
     * Get debug call statistics for optimization verification.
     * @returns {{playClick: number, playFootstep: number, playBlockPlace: number, playBlockBreak: number}} Copy of call counts.
     */
    getCallStats() {
        return { ...this._callCounts };
    }

    /**
     * Reset debug call counters (call at start of frame to measure per-frame calls).
     * @returns {void}
     */
    resetCallStats() {
        for (const key in this._callCounts) {
            this._callCounts[key] = 0;
        }
    }
}

export default AudioManager;
