/**
 * Plays sounds generated from formula data.
 * Formulas are created using the VoxEx Sound Formula tool.
 * @module audio/SoundPlayer
 */

/** @type {AudioContext|null} Shared audio context */
let audioContext = null;

/**
 * Initialize audio context on first user interaction.
 * Must be called after a user gesture (click, key press) due to browser policies.
 * @returns {AudioContext} The initialized audio context
 */
export function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

/**
 * Get the current audio context (or null if not initialized).
 * @returns {AudioContext|null} The audio context
 */
export function getAudioContext() {
    return audioContext;
}

/**
 * Resume audio context if suspended.
 * Call this on user interaction if audio isn't playing.
 * @returns {Promise<void>}
 */
export async function resumeAudio() {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

/**
 * @typedef {Object} SoundFormula
 * @property {string} method - Reconstruction method: 'samples', 'dct', or 'fourier'
 * @property {number} [sampleRate=44100] - Sample rate in Hz
 * @property {number} [duration=0.5] - Duration in seconds
 * @property {Float32Array|number[]} [samples] - Raw samples (for method='samples')
 * @property {Float32Array|number[]} [coefficients] - DCT coefficients (for method='dct')
 * @property {Float32Array|number[]} [frequencies] - Fourier frequencies (for method='fourier')
 * @property {Float32Array|number[]} [amplitudes] - Fourier amplitudes (for method='fourier')
 * @property {Float32Array|number[]} [phases] - Fourier phases (for method='fourier')
 * @property {number} [volume=1.0] - Playback volume (0.0 to 1.0)
 */

/**
 * Reconstruct audio from DCT coefficients.
 * @private
 * @param {Float32Array} output - Output buffer to fill
 * @param {Float32Array|number[]} coefficients - DCT coefficients
 */
function reconstructFromDCT(output, coefficients) {
    const N = output.length;
    const numCoeffs = coefficients.length;
    const piOverN = Math.PI / N;

    for (let n = 0; n < N; n++) {
        let sum = 0;
        const factor = (n + 0.5) * piOverN;
        for (let k = 0; k < numCoeffs; k++) {
            sum += coefficients[k] * Math.cos(factor * k);
        }
        output[n] = sum;
    }
}

/**
 * Reconstruct audio from Fourier components.
 * @private
 * @param {Float32Array} output - Output buffer to fill
 * @param {SoundFormula} formula - Sound formula with frequencies, amplitudes, phases
 */
function reconstructFromFourier(output, formula) {
    const { frequencies, amplitudes, phases } = formula;
    const sampleRate = formula.sampleRate || 44100;
    const twoPi = Math.PI * 2;

    for (let i = 0; i < output.length; i++) {
        const t = i / sampleRate;
        let sum = 0;
        for (let j = 0; j < frequencies.length; j++) {
            sum += amplitudes[j] * Math.sin(twoPi * frequencies[j] * t + phases[j]);
        }
        output[i] = sum;
    }
}

/**
 * Normalize audio to prevent clipping.
 * @private
 * @param {Float32Array} data - Audio data to normalize in place
 */
function normalizeAudio(data) {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > max) max = abs;
    }
    if (max > 1) {
        const scale = 1 / max;
        for (let i = 0; i < data.length; i++) {
            data[i] *= scale;
        }
    }
}

/**
 * Play a sound from formula data.
 * @param {SoundFormula} formula - Sound formula with method, duration, data
 * @param {Object} [options] - Playback options
 * @param {number} [options.volume=1.0] - Volume multiplier (0.0 to 1.0)
 * @param {number} [options.pitch=1.0] - Pitch multiplier (1.0 = normal)
 * @returns {AudioBufferSourceNode|null} The audio source node (for stopping)
 */
export function playFormula(formula, options = {}) {
    const ctx = initAudio();
    if (!formula) return null;

    const sampleRate = formula.sampleRate || 44100;
    const duration = formula.duration || 0.5;
    const volume = options.volume ?? formula.volume ?? 1.0;
    const pitch = options.pitch ?? 1.0;

    const buffer = ctx.createBuffer(1, Math.floor(duration * sampleRate), sampleRate);
    const data = buffer.getChannelData(0);

    // Reconstruct audio based on method
    if (formula.method === 'samples' && formula.samples) {
        const samples = formula.samples;
        const len = Math.min(samples.length, data.length);
        for (let i = 0; i < len; i++) {
            data[i] = samples[i];
        }
    } else if (formula.method === 'dct' && formula.coefficients) {
        reconstructFromDCT(data, formula.coefficients);
    } else if (formula.method === 'fourier' && formula.frequencies) {
        reconstructFromFourier(data, formula);
    } else {
        // Unknown method or missing data
        return null;
    }

    // Normalize to prevent clipping
    normalizeAudio(data);

    // Create source and connect
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    // Add gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start();
    return source;
}

/**
 * Create a simple oscillator-based sound.
 * Useful for quick sound effects without formula data.
 * @param {Object} params - Sound parameters
 * @param {number} [params.frequency=440] - Frequency in Hz
 * @param {string} [params.type='sine'] - Oscillator type: 'sine', 'square', 'sawtooth', 'triangle'
 * @param {number} [params.duration=0.2] - Duration in seconds
 * @param {number} [params.volume=0.3] - Volume (0.0 to 1.0)
 * @returns {OscillatorNode|null} The oscillator node
 */
export function playTone(params = {}) {
    const ctx = initAudio();
    if (!ctx) return null;

    const {
        frequency = 440,
        type = 'sine',
        duration = 0.2,
        volume = 0.3
    } = params;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);

    return osc;
}

export default {
    initAudio,
    getAudioContext,
    resumeAudio,
    playFormula,
    playTone
};
