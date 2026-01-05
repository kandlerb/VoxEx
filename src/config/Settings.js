/**
 * VoxEx Settings Configuration
 * Game settings, profiles, and SettingsManager class.
 * @module config/Settings
 */

import { WORLD_DIMS } from './WorldConfig.js';

// =====================================================
// RUNTIME-ONLY CONSTANTS (not persisted to localStorage)
// =====================================================

/**
 * Runtime-only settings constants (not saved/loaded)
 * @type {Object}
 */
export const RUNTIME_CONSTANTS = {
    minRenderDistance: 6,
    maxRenderDistance: 16,
    targetFPS: 60,
    frameUpdateInterval: 5,
    fog: true,
    fogColor: 0xb3d9ff,
};

/**
 * Default settings values
 * @type {Object}
 */
export const DEFAULTS = {
    // Performance
    renderDistance: 8,
    buildQueueLimit: 2,
    maxCachedChunks: 350,
    preGenRenderDistance: 16,
    dynamicRenderDistance: false,
    lowerBoundFPS: 30,
    upperBoundFPS: 50,
    enableFrustumCulling: true,

    // Graphics - Basic
    AO: true,
    shadows: true,
    textureResolution: 16,

    // Graphics - Lighting
    sunColor: 0xfce7bb,      // Warm sunlight color (slightly orange)
    sunIntensity: 0.8,       // Base sun intensity (0-1)
    moonColor: 0x8899ff,     // Cool moonlight color (blue-ish)
    moonIntensity: 0.15,     // Moon is much dimmer than sun
    ambientIntensity: 1.0,   // Global ambient fill light
    lighting: {},            // Extended lighting settings
    torchColor: 0xffaa33,    // Warm torch glow (orange)
    torchIntensity: 3.0,     // Torch brightness multiplier
    torchRange: 48,          // Torch light radius in blocks

    // Graphics - Sky & Fog
    daySkyTop: 0x87ceeb,
    daySkyBottom: 0xb3d9ff,
    nightSkyTop: 0x0a1628,
    nightSkyBottom: 0x0a1628,

    // Graphics - Water
    waterFastMode: false,
    waterColor: 0x4488ff,
    waterOpacity: 0.7,
    waterFogDensity: 0.5,
    waterAbsorptionR: 0.25,
    waterAbsorptionG: 0.06,
    waterAbsorptionB: 0.01,
    waterRefractionEnabled: true,
    waterRefractionStrength: 0.02,

    // Gameplay - Movement
    playerSpeed: 50.0,
    sprintMultiplier: 2.0,
    crouchMultiplier: 0.5,
    flySpeedMultiplier: 4.0,
    jumpForce: 10.0,
    gravity: 30.0,
    blockReach: 8,

    // Gameplay - Camera
    normalFOV: 75,
    sprintFOV: 80,

    // World
    dayLength: 1200,

    // Shader
    shadowQuality: 2048,
    shadowMapType: 'medium',
    shadowBias: 0.0001,
    shadowRadius: 0,
    antialiasing: true,
    pixelRatio: 1.0,

    // Zombie Scare Effects
    zombieVignetteEnabled: true,
    zombieDesaturationEnabled: true,
    zombieVignetteIntensity: 0.7,

    // Volumetric Lighting (God Rays)
    volumetricLightingEnabled: true,
    volumetricDensity: 0.015,
    volumetricDecay: 0.98,
    volumetricWeight: 0.5,
    volumetricSamples: 8,
    volumetricExposure: 0.25,
    volumetricFogDensity: 0.1,

    // Global Illumination
    giEnabled: false,
    giIntensity: 0.5,
    giBounceIntensity: 0.3,
    giRange: 16,
    giColorBleed: 0.2,
    giSamples: 8,

    // Diffuse Lighting
    diffuseEnabled: true,
    diffuseIntensity: 1.0,
    diffuseWrap: 0.0,
    diffuseSoftness: 0.0,

    // Specular Lighting
    specularEnabled: false,
    specularIntensity: 0.5,
    specularShininess: 32,
    specularFresnel: 0.5,
    specularRoughness: 0.5,

    // Atmospheric Effects
    particlesEnabled: true,
    starsEnabled: true,
    cloudsEnabled: true,
    waterRipplesEnabled: true,
    waterSplashParticlesEnabled: true,
    waterWadingRipplesEnabled: true,
    waterWakeEnabled: true,
    waterBubblesEnabled: true,

    // Ripple Defaults
    waterRippleColor: 0xaaddff,
    waterRippleInitialScale: 0.1,
    waterRippleVelocityScale: 0.08,
    waterRippleExpansionRate: 2.0,
    waterRippleLifespan: 1.2,
    waterRippleOpacity: 0.4,
    waterRippleSegments: 4,

    // Wading/Wake Defaults
    waterWadeMinSpeed: 1.5,
    waterWadeCooldownBase: 500,
    waterWadeScale: 0.5,
    waterWadeExpansionRate: 1.5,
    waterWadeLifespan: 0.8,
    waterWadeOpacity: 0.35,
    waterWadeAngle: 70,

    // Splash Particle Defaults
    waterSplashMinParticles: 2,
    waterSplashMaxParticles: 10,
    waterSplashVelocityScale: 0.3,
    waterSplashSize: 0.15,
    waterSplashGravity: 10,
    waterSplashColumnThreshold: 12,

    // Bubble Defaults
    waterBubbleRate: 0.3,
    waterBubbleSize: 0.1,
    waterBubbleRiseSpeed: 2.5,
    waterBreathBubbleInterval: 4.0,

    colorGradingEnabled: true,
    biomeFogEnabled: true,

    // Star Defaults
    starLayerCount: 3,
    starLayer1Color: 0xffffff,
    starLayer1ColorVariation: 0.1,
    starLayer1Size: 1.0,
    starLayer1Twinkle: 0.3,
    starLayer1Brightness: 0.6,
    starLayer1Count: 400,
    starLayer2Color: 0xffffee,
    starLayer2ColorVariation: 0.15,
    starLayer2Size: 1.5,
    starLayer2Twinkle: 0.5,
    starLayer2Brightness: 0.8,
    starLayer2Count: 200,
    starLayer3Color: 0xffeedd,
    starLayer3ColorVariation: 0.2,
    starLayer3Size: 2.5,
    starLayer3Twinkle: 0.7,
    starLayer3Brightness: 1.0,
    starLayer3Count: 100,

    // Cloud Defaults
    cloudHeight: 240,
    cloudHeightRange: 24,
    cloudSpeed: 0.2,
    cloudDensity: 10,
    cloudParticleSize: 16,
    cloudClumping: 1,

    // Torch Particle Defaults
    torchParticlesEnabled: true,
    torchSmokeColor: 0x4b4b4b,
    torchSmokeSize: 0.25,
    torchSmokeSpawnRate: 0.5,
    torchSmokeDecay: 1.4,
    torchFlameColor: 0xff6600,
    torchFlameSize: 0.15,
    torchFlameSpawnRate: 0.8,
    torchFlameDecay: 0.25,

    // Block break particle settings
    blockBreakEnabled: true,
    blockBreakSize: 0.2,
    blockBreakCount: 10,
    blockBreakDecay: 0.75,

    // Footstep particle settings
    footstepEnabled: true,
    footstepSize: 0.1,
    footstepDecay: 0.5,
};

/**
 * Settings Profiles - predefined configurations
 * @type {Object<string, Object>}
 */
export const SETTINGS_PROFILES = {
    performance: {
        renderDistance: 6,
        dynamicRenderDistance: true,
        buildQueueLimit: 1,
        maxCachedChunks: 200,
        AO: false,
        shadows: false,
        textureResolution: 16,
        pixelRatio: 0.75,
        enableFrustumCulling: true,
        volumetricLightingEnabled: false,
        waterRefractionEnabled: false,
        giEnabled: false,
        antialiasing: false,
        shadowQuality: 1024,
        volumetricSamples: 4,
    },
    balanced: {
        renderDistance: 8,
        dynamicRenderDistance: true,
        buildQueueLimit: 2,
        maxCachedChunks: 350,
        AO: true,
        shadows: true,
        textureResolution: 16,
        pixelRatio: 1.0,
        enableFrustumCulling: true,
        volumetricLightingEnabled: true,
        waterRefractionEnabled: true,
        giEnabled: false,
        antialiasing: true,
        shadowQuality: 2048,
        volumetricSamples: 8,
    },
    quality: {
        renderDistance: 12,
        dynamicRenderDistance: false,
        buildQueueLimit: 4,
        maxCachedChunks: 500,
        AO: true,
        shadows: true,
        textureResolution: 32,
        pixelRatio: 1.0,
        enableFrustumCulling: true,
        volumetricLightingEnabled: true,
        waterRefractionEnabled: true,
        giEnabled: true,
        antialiasing: true,
        shadowQuality: 4096,
        volumetricSamples: 16,
    },
};

/**
 * Create a default settings object
 * @returns {Object} Copy of default settings
 */
export function createDefaultSettings() {
    return { ...DEFAULTS };
}

/**
 * Apply a settings profile
 * @param {Object} settings - Current settings object to modify
 * @param {string} profileName - Name of profile to apply
 * @returns {Object} Modified settings
 */
export function applyProfile(settings, profileName) {
    const profile = SETTINGS_PROFILES[profileName];
    if (profile) {
        return { ...settings, ...profile };
    }
    return settings;
}

/**
 * Get profile names
 * @returns {string[]} Array of profile names
 */
export function getProfileNames() {
    return Object.keys(SETTINGS_PROFILES);
}

/**
 * Load settings from localStorage, merging with defaults.
 * Creates a runtime SETTINGS object matching the source voxEx.html behavior.
 * @returns {Object} Settings object with saved values and defaults
 */
export function loadSettings() {
    // Load saved settings from localStorage (browser-only)
    let savedSettings = {};
    if (typeof localStorage !== 'undefined') {
        try {
            savedSettings = JSON.parse(localStorage.getItem('voxex_settings')) || {};
        } catch (e) {
            savedSettings = {};
        }
    }
    const savedLighting = savedSettings.lighting || {};

    // Build runtime SETTINGS object matching source voxEx.html
    return {
        // Runtime-only constants (not persisted)
        ...RUNTIME_CONSTANTS,

        // Performance
        renderDistance: savedSettings.renderDistance || DEFAULTS.renderDistance,
        buildQueueLimit: savedSettings.buildQueueLimit || DEFAULTS.buildQueueLimit,
        maxCachedChunks: savedSettings.maxCachedChunks || DEFAULTS.maxCachedChunks,
        preGenRenderDistance: savedSettings.preGenRenderDistance || DEFAULTS.preGenRenderDistance,
        dynamicRenderDistance: savedSettings.dynamicRenderDistance !== undefined ? savedSettings.dynamicRenderDistance : DEFAULTS.dynamicRenderDistance,
        lowerBoundFPS: savedSettings.lowerBoundFPS || DEFAULTS.lowerBoundFPS,
        upperBoundFPS: savedSettings.upperBoundFPS || DEFAULTS.upperBoundFPS,
        enableFrustumCulling: savedSettings.enableFrustumCulling !== undefined ? savedSettings.enableFrustumCulling : DEFAULTS.enableFrustumCulling,

        // Graphics - Basic
        AO: savedSettings.AO !== undefined ? savedSettings.AO : DEFAULTS.AO,
        shadows: savedSettings.shadows !== undefined ? savedSettings.shadows : DEFAULTS.shadows,
        textureResolution: savedSettings.textureResolution || DEFAULTS.textureResolution,

        // Graphics - Lighting
        sunColor: savedSettings.sunColor || DEFAULTS.sunColor,
        sunIntensity: savedSettings.sunIntensity !== undefined ? savedSettings.sunIntensity : DEFAULTS.sunIntensity,
        moonColor: savedSettings.moonColor || DEFAULTS.moonColor,
        moonIntensity: savedSettings.moonIntensity !== undefined ? savedSettings.moonIntensity : DEFAULTS.moonIntensity,
        ambientIntensity: savedSettings.ambientIntensity !== undefined ? savedSettings.ambientIntensity : DEFAULTS.ambientIntensity,
        lighting: savedLighting,
        torchColor: savedSettings.torchColor || DEFAULTS.torchColor,
        torchIntensity: savedSettings.torchIntensity !== undefined ? savedSettings.torchIntensity : DEFAULTS.torchIntensity,
        torchRange: savedSettings.torchRange || DEFAULTS.torchRange,

        // Graphics - Sky & Fog
        daySkyTop: savedSettings.daySkyTop || DEFAULTS.daySkyTop,
        daySkyBottom: savedSettings.daySkyBottom || DEFAULTS.daySkyBottom,
        nightSkyTop: savedSettings.nightSkyTop || DEFAULTS.nightSkyTop,
        nightSkyBottom: savedSettings.nightSkyBottom || DEFAULTS.nightSkyBottom,

        // Graphics - Water
        waterFastMode: savedSettings.waterFastMode !== undefined ? savedSettings.waterFastMode : DEFAULTS.waterFastMode,
        waterColor: savedSettings.waterColor || DEFAULTS.waterColor,
        waterOpacity: savedSettings.waterOpacity !== undefined ? savedSettings.waterOpacity : DEFAULTS.waterOpacity,
        waterFogDensity: savedSettings.waterFogDensity !== undefined ? savedSettings.waterFogDensity : DEFAULTS.waterFogDensity,
        waterAbsorptionR: savedSettings.waterAbsorptionR !== undefined ? savedSettings.waterAbsorptionR : DEFAULTS.waterAbsorptionR,
        waterAbsorptionG: savedSettings.waterAbsorptionG !== undefined ? savedSettings.waterAbsorptionG : DEFAULTS.waterAbsorptionG,
        waterAbsorptionB: savedSettings.waterAbsorptionB !== undefined ? savedSettings.waterAbsorptionB : DEFAULTS.waterAbsorptionB,
        waterRefractionEnabled: savedSettings.waterRefractionEnabled !== undefined ? savedSettings.waterRefractionEnabled : DEFAULTS.waterRefractionEnabled,
        waterRefractionStrength: savedSettings.waterRefractionStrength !== undefined ? savedSettings.waterRefractionStrength : DEFAULTS.waterRefractionStrength,

        // Gameplay - Movement
        playerSpeed: savedSettings.playerSpeed || DEFAULTS.playerSpeed,
        sprintMultiplier: savedSettings.sprintMultiplier || DEFAULTS.sprintMultiplier,
        crouchMultiplier: savedSettings.crouchMultiplier || DEFAULTS.crouchMultiplier,
        flySpeedMultiplier: savedSettings.flySpeedMultiplier || DEFAULTS.flySpeedMultiplier,
        jumpForce: savedSettings.jumpForce || DEFAULTS.jumpForce,
        gravity: savedSettings.gravity || DEFAULTS.gravity,
        blockReach: savedSettings.blockReach || DEFAULTS.blockReach,

        // Gameplay - Camera
        normalFOV: savedSettings.normalFOV || DEFAULTS.normalFOV,
        sprintFOV: savedSettings.sprintFOV || DEFAULTS.sprintFOV,

        // World
        dayLength: savedSettings.dayLength || 360, // Note: runtime default is 360, DEFAULTS is 1200

        // Shader
        shadowQuality: savedSettings.shadowQuality || DEFAULTS.shadowQuality,
        shadowBias: savedSettings.shadowBias !== undefined ? savedSettings.shadowBias : DEFAULTS.shadowBias,
        shadowRadius: savedSettings.shadowRadius !== undefined ? savedSettings.shadowRadius : DEFAULTS.shadowRadius,
        antialiasing: savedSettings.antialiasing !== undefined ? savedSettings.antialiasing : DEFAULTS.antialiasing,
        pixelRatio: savedSettings.pixelRatio !== undefined ? savedSettings.pixelRatio : DEFAULTS.pixelRatio,

        // Zombie Scare Effects
        zombieVignetteEnabled: savedSettings.zombieVignetteEnabled !== undefined ? savedSettings.zombieVignetteEnabled : DEFAULTS.zombieVignetteEnabled,
        zombieDesaturationEnabled: savedSettings.zombieDesaturationEnabled !== undefined ? savedSettings.zombieDesaturationEnabled : DEFAULTS.zombieDesaturationEnabled,
        zombieVignetteIntensity: savedSettings.zombieVignetteIntensity !== undefined ? savedSettings.zombieVignetteIntensity : DEFAULTS.zombieVignetteIntensity,

        // Volumetric Lighting
        volumetricLightingEnabled: savedSettings.volumetricLightingEnabled !== undefined ? savedSettings.volumetricLightingEnabled : DEFAULTS.volumetricLightingEnabled,
        volumetricDensity: savedSettings.volumetricDensity !== undefined ? savedSettings.volumetricDensity : DEFAULTS.volumetricDensity,
        volumetricDecay: savedSettings.volumetricDecay !== undefined ? savedSettings.volumetricDecay : DEFAULTS.volumetricDecay,
        volumetricWeight: savedSettings.volumetricWeight !== undefined ? savedSettings.volumetricWeight : DEFAULTS.volumetricWeight,
        volumetricSamples: savedSettings.volumetricSamples !== undefined ? savedSettings.volumetricSamples : DEFAULTS.volumetricSamples,
        volumetricExposure: savedSettings.volumetricExposure !== undefined ? savedSettings.volumetricExposure : DEFAULTS.volumetricExposure,
        volumetricFogDensity: savedSettings.volumetricFogDensity !== undefined ? savedSettings.volumetricFogDensity : DEFAULTS.volumetricFogDensity,

        // Global Illumination
        giEnabled: savedSettings.giEnabled !== undefined ? savedSettings.giEnabled : DEFAULTS.giEnabled,
        giIntensity: savedSettings.giIntensity !== undefined ? savedSettings.giIntensity : DEFAULTS.giIntensity,
        giBounceIntensity: savedSettings.giBounceIntensity !== undefined ? savedSettings.giBounceIntensity : DEFAULTS.giBounceIntensity,
        giRange: savedSettings.giRange !== undefined ? savedSettings.giRange : DEFAULTS.giRange,
        giColorBleed: savedSettings.giColorBleed !== undefined ? savedSettings.giColorBleed : DEFAULTS.giColorBleed,
        giSamples: savedSettings.giSamples !== undefined ? savedSettings.giSamples : DEFAULTS.giSamples,

        // Diffuse Lighting
        diffuseEnabled: savedSettings.diffuseEnabled !== undefined ? savedSettings.diffuseEnabled : DEFAULTS.diffuseEnabled,
        diffuseIntensity: savedSettings.diffuseIntensity !== undefined ? savedSettings.diffuseIntensity : DEFAULTS.diffuseIntensity,
        diffuseWrap: savedSettings.diffuseWrap !== undefined ? savedSettings.diffuseWrap : DEFAULTS.diffuseWrap,
        diffuseSoftness: savedSettings.diffuseSoftness !== undefined ? savedSettings.diffuseSoftness : DEFAULTS.diffuseSoftness,

        // Specular Lighting
        specularEnabled: savedSettings.specularEnabled !== undefined ? savedSettings.specularEnabled : DEFAULTS.specularEnabled,
        specularIntensity: savedSettings.specularIntensity !== undefined ? savedSettings.specularIntensity : DEFAULTS.specularIntensity,
        specularShininess: savedSettings.specularShininess !== undefined ? savedSettings.specularShininess : DEFAULTS.specularShininess,
        specularFresnel: savedSettings.specularFresnel !== undefined ? savedSettings.specularFresnel : DEFAULTS.specularFresnel,
        specularRoughness: savedSettings.specularRoughness !== undefined ? savedSettings.specularRoughness : DEFAULTS.specularRoughness,

        // Atmospheric Effects
        particlesEnabled: savedSettings.particlesEnabled !== undefined ? savedSettings.particlesEnabled : DEFAULTS.particlesEnabled,
        starsEnabled: savedSettings.starsEnabled !== undefined ? savedSettings.starsEnabled : DEFAULTS.starsEnabled,
        cloudsEnabled: savedSettings.cloudsEnabled !== undefined ? savedSettings.cloudsEnabled : DEFAULTS.cloudsEnabled,
        waterRipplesEnabled: savedSettings.waterRipplesEnabled !== undefined ? savedSettings.waterRipplesEnabled : DEFAULTS.waterRipplesEnabled,
        waterSplashParticlesEnabled: savedSettings.waterSplashParticlesEnabled !== undefined ? savedSettings.waterSplashParticlesEnabled : DEFAULTS.waterSplashParticlesEnabled,
        waterWadingRipplesEnabled: savedSettings.waterWadingRipplesEnabled !== undefined ? savedSettings.waterWadingRipplesEnabled : DEFAULTS.waterWadingRipplesEnabled,
        waterWakeEnabled: savedSettings.waterWakeEnabled !== undefined ? savedSettings.waterWakeEnabled : DEFAULTS.waterWakeEnabled,
        waterBubblesEnabled: savedSettings.waterBubblesEnabled !== undefined ? savedSettings.waterBubblesEnabled : DEFAULTS.waterBubblesEnabled,

        // Ripple Settings
        waterRippleColor: savedSettings.waterRippleColor ?? DEFAULTS.waterRippleColor,
        waterRippleInitialScale: savedSettings.waterRippleInitialScale ?? DEFAULTS.waterRippleInitialScale,
        waterRippleVelocityScale: savedSettings.waterRippleVelocityScale ?? DEFAULTS.waterRippleVelocityScale,
        waterRippleExpansionRate: savedSettings.waterRippleExpansionRate ?? DEFAULTS.waterRippleExpansionRate,
        waterRippleLifespan: savedSettings.waterRippleLifespan ?? DEFAULTS.waterRippleLifespan,
        waterRippleOpacity: savedSettings.waterRippleOpacity ?? DEFAULTS.waterRippleOpacity,
        waterRippleSegments: savedSettings.waterRippleSegments ?? DEFAULTS.waterRippleSegments,

        // Wading/Wake Settings
        waterWadeMinSpeed: savedSettings.waterWadeMinSpeed ?? DEFAULTS.waterWadeMinSpeed,
        waterWadeCooldownBase: savedSettings.waterWadeCooldownBase ?? DEFAULTS.waterWadeCooldownBase,
        waterWadeScale: savedSettings.waterWadeScale ?? DEFAULTS.waterWadeScale,
        waterWadeExpansionRate: savedSettings.waterWadeExpansionRate ?? DEFAULTS.waterWadeExpansionRate,
        waterWadeLifespan: savedSettings.waterWadeLifespan ?? DEFAULTS.waterWadeLifespan,
        waterWadeOpacity: savedSettings.waterWadeOpacity ?? DEFAULTS.waterWadeOpacity,
        waterWadeAngle: savedSettings.waterWadeAngle ?? DEFAULTS.waterWadeAngle,

        // Splash Particle Settings
        waterSplashMinParticles: savedSettings.waterSplashMinParticles ?? DEFAULTS.waterSplashMinParticles,
        waterSplashMaxParticles: savedSettings.waterSplashMaxParticles ?? DEFAULTS.waterSplashMaxParticles,
        waterSplashVelocityScale: savedSettings.waterSplashVelocityScale ?? DEFAULTS.waterSplashVelocityScale,
        waterSplashSize: savedSettings.waterSplashSize ?? DEFAULTS.waterSplashSize,
        waterSplashGravity: savedSettings.waterSplashGravity ?? DEFAULTS.waterSplashGravity,
        waterSplashColumnThreshold: savedSettings.waterSplashColumnThreshold ?? DEFAULTS.waterSplashColumnThreshold,

        // Bubble Settings
        waterBubbleRate: savedSettings.waterBubbleRate ?? DEFAULTS.waterBubbleRate,
        waterBubbleSize: savedSettings.waterBubbleSize ?? DEFAULTS.waterBubbleSize,
        waterBubbleRiseSpeed: savedSettings.waterBubbleRiseSpeed ?? DEFAULTS.waterBubbleRiseSpeed,
        waterBreathBubbleInterval: savedSettings.waterBreathBubbleInterval ?? DEFAULTS.waterBreathBubbleInterval,

        colorGradingEnabled: savedSettings.colorGradingEnabled !== undefined ? savedSettings.colorGradingEnabled : DEFAULTS.colorGradingEnabled,
        biomeFogEnabled: savedSettings.biomeFogEnabled !== undefined ? savedSettings.biomeFogEnabled : DEFAULTS.biomeFogEnabled,

        // Star Settings
        starLayerCount: savedSettings.starLayerCount !== undefined ? savedSettings.starLayerCount : DEFAULTS.starLayerCount,
        starLayer1Color: savedSettings.starLayer1Color !== undefined ? savedSettings.starLayer1Color : DEFAULTS.starLayer1Color,
        starLayer1ColorVariation: savedSettings.starLayer1ColorVariation !== undefined ? savedSettings.starLayer1ColorVariation : DEFAULTS.starLayer1ColorVariation,
        starLayer1Size: savedSettings.starLayer1Size !== undefined ? savedSettings.starLayer1Size : DEFAULTS.starLayer1Size,
        starLayer1Twinkle: savedSettings.starLayer1Twinkle !== undefined ? savedSettings.starLayer1Twinkle : DEFAULTS.starLayer1Twinkle,
        starLayer1Brightness: savedSettings.starLayer1Brightness !== undefined ? savedSettings.starLayer1Brightness : DEFAULTS.starLayer1Brightness,
        starLayer1Count: savedSettings.starLayer1Count !== undefined ? savedSettings.starLayer1Count : DEFAULTS.starLayer1Count,
        starLayer2Color: savedSettings.starLayer2Color !== undefined ? savedSettings.starLayer2Color : DEFAULTS.starLayer2Color,
        starLayer2ColorVariation: savedSettings.starLayer2ColorVariation !== undefined ? savedSettings.starLayer2ColorVariation : DEFAULTS.starLayer2ColorVariation,
        starLayer2Size: savedSettings.starLayer2Size !== undefined ? savedSettings.starLayer2Size : DEFAULTS.starLayer2Size,
        starLayer2Twinkle: savedSettings.starLayer2Twinkle !== undefined ? savedSettings.starLayer2Twinkle : DEFAULTS.starLayer2Twinkle,
        starLayer2Brightness: savedSettings.starLayer2Brightness !== undefined ? savedSettings.starLayer2Brightness : DEFAULTS.starLayer2Brightness,
        starLayer2Count: savedSettings.starLayer2Count !== undefined ? savedSettings.starLayer2Count : DEFAULTS.starLayer2Count,
        starLayer3Color: savedSettings.starLayer3Color !== undefined ? savedSettings.starLayer3Color : DEFAULTS.starLayer3Color,
        starLayer3ColorVariation: savedSettings.starLayer3ColorVariation !== undefined ? savedSettings.starLayer3ColorVariation : DEFAULTS.starLayer3ColorVariation,
        starLayer3Size: savedSettings.starLayer3Size !== undefined ? savedSettings.starLayer3Size : DEFAULTS.starLayer3Size,
        starLayer3Twinkle: savedSettings.starLayer3Twinkle !== undefined ? savedSettings.starLayer3Twinkle : DEFAULTS.starLayer3Twinkle,
        starLayer3Brightness: savedSettings.starLayer3Brightness !== undefined ? savedSettings.starLayer3Brightness : DEFAULTS.starLayer3Brightness,
        starLayer3Count: savedSettings.starLayer3Count !== undefined ? savedSettings.starLayer3Count : DEFAULTS.starLayer3Count,

        // Cloud Settings
        cloudHeight: savedSettings.cloudHeight !== undefined ? savedSettings.cloudHeight : DEFAULTS.cloudHeight,
        cloudHeightRange: savedSettings.cloudHeightRange !== undefined ? savedSettings.cloudHeightRange : DEFAULTS.cloudHeightRange,
        cloudSpeed: savedSettings.cloudSpeed !== undefined ? savedSettings.cloudSpeed : DEFAULTS.cloudSpeed,
        cloudDensity: savedSettings.cloudDensity !== undefined ? savedSettings.cloudDensity : DEFAULTS.cloudDensity,
        cloudParticleSize: savedSettings.cloudParticleSize !== undefined ? savedSettings.cloudParticleSize : DEFAULTS.cloudParticleSize,
        cloudClumping: savedSettings.cloudClumping !== undefined ? savedSettings.cloudClumping : DEFAULTS.cloudClumping,

        // Torch Particle Settings
        torchParticlesEnabled: savedSettings.torchParticlesEnabled ?? DEFAULTS.torchParticlesEnabled,
        torchSmokeColor: savedSettings.torchSmokeColor ?? savedSettings.torchParticleColor ?? DEFAULTS.torchSmokeColor,
        torchSmokeSize: savedSettings.torchSmokeSize ?? savedSettings.torchParticleSize ?? DEFAULTS.torchSmokeSize,
        torchSmokeSpawnRate: savedSettings.torchSmokeSpawnRate ?? savedSettings.torchParticleFrequency ?? DEFAULTS.torchSmokeSpawnRate,
        torchSmokeDecay: savedSettings.torchSmokeDecay ?? DEFAULTS.torchSmokeDecay,
        torchFlameColor: savedSettings.torchFlameColor ?? DEFAULTS.torchFlameColor,
        torchFlameSize: savedSettings.torchFlameSize ?? DEFAULTS.torchFlameSize,
        torchFlameSpawnRate: savedSettings.torchFlameSpawnRate ?? DEFAULTS.torchFlameSpawnRate,
        torchFlameDecay: savedSettings.torchFlameDecay ?? DEFAULTS.torchFlameDecay,

        // Block break settings
        blockBreakEnabled: savedSettings.blockBreakEnabled ?? DEFAULTS.blockBreakEnabled,
        blockBreakSize: savedSettings.blockBreakSize ?? DEFAULTS.blockBreakSize,
        blockBreakCount: savedSettings.blockBreakCount ?? DEFAULTS.blockBreakCount,
        blockBreakDecay: savedSettings.blockBreakDecay ?? DEFAULTS.blockBreakDecay,

        // Footstep settings
        footstepEnabled: savedSettings.footstepEnabled ?? DEFAULTS.footstepEnabled,
        footstepSize: savedSettings.footstepSize ?? DEFAULTS.footstepSize,
        footstepDecay: savedSettings.footstepDecay ?? DEFAULTS.footstepDecay,
    };
}

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings object to save
 */
export function saveSettings(settings) {
    if (typeof localStorage !== 'undefined') {
        try {
            // Create a copy without runtime-only constants
            const toSave = { ...settings };
            Object.keys(RUNTIME_CONSTANTS).forEach(key => delete toSave[key]);
            localStorage.setItem('voxex_settings', JSON.stringify(toSave));
        } catch (e) {
            console.warn('[Settings] Failed to save settings:', e);
        }
    }
}

// =====================================================
// SETTINGS - Live mutable settings object
// =====================================================

/**
 * Live settings object - initialized with loaded settings.
 * This is the global mutable settings state used throughout the game.
 * @type {Object}
 */
export let SETTINGS = loadSettings();

/**
 * Reinitialize SETTINGS from localStorage.
 * Call this to reload settings after external changes.
 * @returns {void}
 */
export function reloadSettings() {
    SETTINGS = loadSettings();
}

// =====================================================
// CUSTOM PROFILE SUPPORT
// =====================================================

/**
 * Custom profile - saved by user, stored in localStorage
 * @type {Object}
 */
export let CUSTOM_PROFILE = (() => {
    if (typeof localStorage !== 'undefined') {
        try {
            return JSON.parse(localStorage.getItem('voxex_custom_profile') || 'null') || { ...DEFAULTS };
        } catch (e) {
            return { ...DEFAULTS };
        }
    }
    return { ...DEFAULTS };
})();

/**
 * Save custom profile to localStorage
 * @param {Object} profile - Profile settings to save
 */
export function saveCustomProfile(profile) {
    CUSTOM_PROFILE = { ...profile };
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem('voxex_custom_profile', JSON.stringify(CUSTOM_PROFILE));
        } catch (e) {
            console.warn('[Settings] Failed to save custom profile:', e);
        }
    }
}

/**
 * Current active profile name
 * @type {string|null}
 */
export let activeProfileName = (() => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('voxex_active_profile') || null;
    }
    return null;
})();

/**
 * Set the active profile name
 * @param {string|null} name - Profile name or null for custom
 */
export function setActiveProfileName(name) {
    activeProfileName = name;
    if (typeof localStorage !== 'undefined') {
        if (name) {
            localStorage.setItem('voxex_active_profile', name);
        } else {
            localStorage.removeItem('voxex_active_profile');
        }
    }
}

// =====================================================
// SETTINGS MANAGER CLASS
// =====================================================
// OPTIMIZATION AUDIT (2025-12-15):
// - NOT a hot path: Only called at init and on user settings changes
// - The main animate loop uses the plain SETTINGS object directly
// - All methods are O(1) or O(n) where n = number of settings keys (small)
// - No allocations in loops, no GC pressure concerns
// - Status: All methods marked "no-op" - already optimal for their use case

/**
 * SettingsManager - handles game settings with localStorage persistence.
 * Supports listeners for reactive setting changes.
 */
export class SettingsManager {
    /**
     * Create a new SettingsManager.
     * @param {Object} defaults - Default settings object.
     * @param {Object} [options] - Optional configuration.
     * @param {boolean} [options.debug=false] - Enable debug call counting.
     */
    constructor(defaults, options = {}) {
        this.defaults = { ...defaults };
        this.values = { ...defaults };
        this.listeners = new Map();
        this._debug = options.debug || false;
        // DEBUG: Call counters for hot-path verification (only in debug mode)
        this._callCounts = { get: 0, set: 0, save: 0, load: 0 };
    }

    /**
     * Load settings from localStorage.
     * @returns {void}
     */
    loadFromStorage() {
        if (this._debug) this._callCounts.load++;
        if (typeof localStorage === 'undefined') return;
        try {
            const saved = JSON.parse(localStorage.getItem('voxex_settings')) || {};
            for (const key of Object.keys(this.defaults)) {
                if (saved[key] !== undefined) {
                    this.values[key] = saved[key];
                }
            }
        } catch (e) {
            console.warn('[SettingsManager] Failed to load settings from storage:', e);
        }
    }

    /**
     * Save settings to localStorage.
     * @returns {void}
     */
    saveToStorage() {
        if (this._debug) this._callCounts.save++;
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('voxex_settings', JSON.stringify(this.values));
        } catch (e) {
            console.warn('[SettingsManager] Failed to save settings to storage:', e);
        }
    }

    /**
     * Get a setting value.
     * @param {string} key - Setting key.
     * @returns {unknown} Setting value or default.
     */
    get(key) {
        if (this._debug) this._callCounts.get++;
        return this.values[key] !== undefined ? this.values[key] : this.defaults[key];
    }

    /**
     * Set a setting value and notify listeners.
     * @param {string} key - Setting key.
     * @param {unknown} value - New value.
     * @returns {void}
     */
    set(key, value) {
        if (this._debug) this._callCounts.set++;
        const oldValue = this.values[key];
        this.values[key] = value;
        // Notify listeners
        if (this.listeners.has(key)) {
            for (const callback of this.listeners.get(key)) {
                callback(value, oldValue, key);
            }
        }
        this.saveToStorage();
    }

    /**
     * Register a callback for setting changes.
     * @param {string} key - Setting key to watch.
     * @param {Function} callback - Callback(value, oldValue, key).
     * @returns {void}
     */
    onChange(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
    }

    /**
     * Unregister a callback for setting changes.
     * @param {string} key - Setting key.
     * @param {Function} callback - Callback to remove.
     * @returns {boolean} True if callback was found and removed.
     */
    offChange(key, callback) {
        if (!this.listeners.has(key)) return false;
        const callbacks = this.listeners.get(key);
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Reset a setting or all settings to defaults.
     * @param {string} [key] - Setting key to reset (omit for all).
     * @returns {void}
     */
    reset(key) {
        if (key) {
            this.set(key, this.defaults[key]);
        } else {
            this.values = { ...this.defaults };
            this.saveToStorage();
        }
    }

    /**
     * Apply settings to the render engine.
     * @param {Object|null} renderEngine - Render engine instance with scene and renderer.
     * @returns {void}
     */
    applyToRender(renderEngine) {
        if (!renderEngine) return;
        // Apply fog settings
        if (renderEngine.scene?.fog) {
            renderEngine.scene.fog.far = this.get('renderDistance') * WORLD_DIMS.chunkSize;
        }
        // Apply shadow settings
        if (renderEngine.renderer) {
            renderEngine.renderer.shadowMap.enabled = this.get('shadows');
        }
    }

    /**
     * Get debug call statistics.
     * @returns {{get: number, set: number, save: number, load: number}} Copy of call counts.
     */
    getCallStats() {
        return { ...this._callCounts };
    }

    /**
     * Reset debug call counters.
     * @returns {void}
     */
    resetCallStats() {
        this._callCounts.get = 0;
        this._callCounts.set = 0;
        this._callCounts.save = 0;
        this._callCounts.load = 0;
    }

    /**
     * Get all current values as a plain object.
     * @returns {Object} Copy of all current settings.
     */
    getAll() {
        return { ...this.values };
    }

    /**
     * Set multiple values at once.
     * @param {Object} values - Object with key-value pairs to set.
     * @param {boolean} [notify=true] - Whether to notify listeners.
     * @returns {void}
     */
    setMany(values, notify = true) {
        for (const [key, value] of Object.entries(values)) {
            if (notify) {
                this.set(key, value);
            } else {
                this.values[key] = value;
            }
        }
        if (!notify) {
            this.saveToStorage();
        }
    }

    /**
     * Apply a settings profile.
     * @param {string} profileName - Name of the profile to apply.
     * @returns {boolean} True if profile was found and applied.
     */
    applyProfile(profileName) {
        const profile = SETTINGS_PROFILES[profileName];
        if (profile) {
            this.setMany(profile);
            return true;
        }
        return false;
    }
}
