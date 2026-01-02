/**
 * VoxEx Audio Module.
 * Provides sound playback using formula-based synthesis.
 * @module audio
 */

export {
    initAudio,
    getAudioContext,
    resumeAudio,
    playFormula,
    playTone,
    default as SoundPlayerDefault
} from './SoundPlayer.js';

export {
    formulas,
    getFormula,
    registerFormula,
    default as FormulasDefault
} from './formulas/index.js';
