/**
 * VoxEx Audio Module.
 * Provides sound playback using formula-based synthesis and game audio.
 * @module audio
 */

// =====================================================
// AUDIOMANAGER CLASS (Phase 6)
// =====================================================
// Main audio manager for game sounds
export {
    AudioManager,
    setAudioDebug,
    default as AudioManagerDefault
} from './AudioManager.js';

// =====================================================
// SOUND PLAYER UTILITIES
// =====================================================
export {
    initAudio,
    getAudioContext,
    resumeAudio,
    playFormula,
    playTone,
    default as SoundPlayerDefault
} from './SoundPlayer.js';

// =====================================================
// FORMULA SYSTEM
// =====================================================
export {
    formulas,
    getFormula,
    registerFormula,
    default as FormulasDefault
} from './formulas/index.js';
