/**
 * Effects barrel export
 * @module render/effects
 */

// =====================================================
// POST-PROCESSING
// =====================================================
export {
    PostProcessingManager,
    VignetteShader,
    DesaturationShader,
    ColorGradingShader,
    default as PostProcessingManagerDefault
} from './PostProcessing.js';

// =====================================================
// PARTICLE SYSTEM (Phase 6)
// =====================================================
export {
    ParticleSystem,
    PARTICLE_CONFIG,
    PARTICLE_DEFAULTS,
    getBlockParticleColor,
    default as ParticleSystemDefault
} from './ParticleSystem.js';

// =====================================================
// WATER EFFECTS (Phase 6)
// =====================================================
export {
    WaterEffects,
    MAX_WATER_RIPPLES,
    WATER_EFFECT_DEFAULTS,
    createSquareRippleGeometry,
    createChevronWakeGeometry,
    default as WaterEffectsDefault
} from './WaterEffects.js';
