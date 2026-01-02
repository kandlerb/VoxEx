/**
 * VoxEx Settings Configuration
 * Game settings and profiles.
 * @module config/Settings
 */

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
