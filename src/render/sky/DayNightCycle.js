/**
 * Day/night cycle management
 * @module render/sky/DayNightCycle
 */

import * as THREE from 'three';

/**
 * @typedef {Object} DayNightColors
 * @property {THREE.Color} sky - Sky background color
 * @property {THREE.Color} ambient - Ambient light color
 * @property {THREE.Color} fog - Fog color
 */

/**
 * @typedef {Object} TimePreset
 * @property {string} name - Preset name
 * @property {number} time - Time value (0-1)
 */

/**
 * Time presets
 * @type {Object<string, number>}
 */
export const TIME_PRESETS = {
    MIDNIGHT: 0,
    DAWN: 0.25,
    NOON: 0.5,
    DUSK: 0.75,
};

/**
 * Day/night cycle controller
 */
export class DayNightCycle {
    /**
     * @param {Object} [options={}] - Configuration options
     * @param {number} [options.dayLengthSeconds=600] - Full day length in seconds
     * @param {number} [options.startTime=0.25] - Starting time (0-1, default dawn)
     */
    constructor(options = {}) {
        const {
            dayLengthSeconds = 600,
            startTime = 0.25,
        } = options;

        /**
         * Current time (0-1)
         * 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
         * @type {number}
         */
        this.time = startTime;

        /**
         * Day length in seconds
         * @type {number}
         */
        this.dayLengthSeconds = dayLengthSeconds;

        /**
         * Whether the cycle is paused
         * @type {boolean}
         */
        this.paused = false;

        /**
         * Colors at different times
         * @type {Object}
         */
        this.colorStops = {
            midnight: {
                sky: new THREE.Color(0x000011),
                ambient: new THREE.Color(0x111133),
                fog: new THREE.Color(0x000011),
            },
            sunrise: {
                sky: new THREE.Color(0xff7744),
                ambient: new THREE.Color(0xffaa77),
                fog: new THREE.Color(0xffccaa),
            },
            noon: {
                sky: new THREE.Color(0x87ceeb),
                ambient: new THREE.Color(0xffffff),
                fog: new THREE.Color(0xaaccff),
            },
            sunset: {
                sky: new THREE.Color(0xff5533),
                ambient: new THREE.Color(0xff8866),
                fog: new THREE.Color(0xffaa88),
            },
        };

        /**
         * Current interpolated colors
         * @type {DayNightColors}
         */
        this.currentColors = {
            sky: new THREE.Color(),
            ambient: new THREE.Color(),
            fog: new THREE.Color(),
        };

        /**
         * Sun intensity (0-1)
         * @type {number}
         */
        this.sunIntensity = 1;

        /**
         * Moon intensity (0-1)
         * @type {number}
         */
        this.moonIntensity = 0.1;

        /**
         * Sun angle in radians
         * @type {number}
         */
        this.sunAngle = 0;

        /**
         * Sun position (for directional light)
         * @type {THREE.Vector3}
         */
        this.sunPosition = new THREE.Vector3();

        /**
         * Moon position (for directional light)
         * @type {THREE.Vector3}
         */
        this.moonPosition = new THREE.Vector3();

        // Initialize colors
        this.interpolateColors();
        this.calculatePositions();
    }

    /**
     * Update the cycle
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (this.paused) return;

        // Advance time
        this.time += dt / this.dayLengthSeconds;
        if (this.time >= 1) this.time -= 1;
        if (this.time < 0) this.time += 1;

        // Update derived values
        this.interpolateColors();
        this.calculateIntensities();
        this.calculatePositions();
    }

    /**
     * Interpolate colors based on current time
     */
    interpolateColors() {
        let t, colorA, colorB;

        if (this.time < 0.25) {
            // Midnight to sunrise
            t = this.time / 0.25;
            colorA = this.colorStops.midnight;
            colorB = this.colorStops.sunrise;
        } else if (this.time < 0.5) {
            // Sunrise to noon
            t = (this.time - 0.25) / 0.25;
            colorA = this.colorStops.sunrise;
            colorB = this.colorStops.noon;
        } else if (this.time < 0.75) {
            // Noon to sunset
            t = (this.time - 0.5) / 0.25;
            colorA = this.colorStops.noon;
            colorB = this.colorStops.sunset;
        } else {
            // Sunset to midnight
            t = (this.time - 0.75) / 0.25;
            colorA = this.colorStops.sunset;
            colorB = this.colorStops.midnight;
        }

        this.currentColors.sky.lerpColors(colorA.sky, colorB.sky, t);
        this.currentColors.ambient.lerpColors(colorA.ambient, colorB.ambient, t);
        this.currentColors.fog.lerpColors(colorA.fog, colorB.fog, t);
    }

    /**
     * Calculate sun/moon intensities
     */
    calculateIntensities() {
        // Sun is up from 0.25 to 0.75 (sunrise to sunset)
        if (this.time >= 0.25 && this.time <= 0.75) {
            const sunProgress = (this.time - 0.25) / 0.5;
            this.sunIntensity = Math.sin(sunProgress * Math.PI);
            this.moonIntensity = 0;
        } else {
            this.sunIntensity = 0;
            const moonProgress = this.time < 0.25
                ? (this.time + 0.25) / 0.5
                : (this.time - 0.75) / 0.5;
            this.moonIntensity = 0.1 + Math.sin(moonProgress * Math.PI) * 0.1;
        }
    }

    /**
     * Calculate sun/moon positions
     */
    calculatePositions() {
        // Sun angle: 0 at midnight, PI at noon
        this.sunAngle = this.time * Math.PI * 2;

        // Sun position (east to west arc)
        const sunY = Math.sin(this.sunAngle);
        const sunXZ = Math.cos(this.sunAngle);
        this.sunPosition.set(sunXZ * 100, sunY * 100, 50);

        // Moon is opposite the sun
        this.moonPosition.set(-sunXZ * 100, -sunY * 100, -50);
    }

    /**
     * Check if it's currently night
     * @returns {boolean}
     */
    isNight() {
        return this.time < 0.25 || this.time > 0.75;
    }

    /**
     * Check if it's currently day
     * @returns {boolean}
     */
    isDay() {
        return !this.isNight();
    }

    /**
     * Check if sun is visible above horizon
     * @returns {boolean}
     */
    isSunUp() {
        return this.time >= 0.2 && this.time <= 0.8;
    }

    /**
     * Get the current hour (0-23)
     * @returns {number}
     */
    getHour() {
        return Math.floor(this.time * 24);
    }

    /**
     * Get time as formatted string (HH:MM)
     * @returns {string}
     */
    getTimeString() {
        const totalMinutes = Math.floor(this.time * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Set time of day
     * @param {number} time - Time value (0-1, 0=midnight, 0.5=noon)
     */
    setTime(time) {
        this.time = ((time % 1) + 1) % 1; // Normalize to 0-1
        this.interpolateColors();
        this.calculateIntensities();
        this.calculatePositions();
    }

    /**
     * Set time to a preset
     * @param {'midnight'|'dawn'|'noon'|'dusk'} preset - Time preset name
     */
    setPreset(preset) {
        const presetValues = {
            midnight: 0,
            dawn: 0.25,
            noon: 0.5,
            dusk: 0.75,
        };
        this.setTime(presetValues[preset] ?? 0.5);
    }

    /**
     * Set day length
     * @param {number} seconds - Day length in seconds
     */
    setDayLength(seconds) {
        this.dayLengthSeconds = Math.max(60, seconds);
    }

    /**
     * Pause the cycle
     */
    pause() {
        this.paused = true;
    }

    /**
     * Resume the cycle
     */
    resume() {
        this.paused = false;
    }

    /**
     * Toggle pause state
     */
    toggle() {
        this.paused = !this.paused;
    }

    /**
     * Get current colors
     * @returns {DayNightColors}
     */
    getColors() {
        return this.currentColors;
    }

    /**
     * Get ambient intensity for lighting
     * @returns {number}
     */
    getAmbientIntensity() {
        // Base ambient + sun contribution
        return 0.4 + this.sunIntensity * 0.4;
    }

    /**
     * Get sky light level (0-15 for block lighting)
     * @returns {number}
     */
    getSkyLightLevel() {
        // Full light during day, reduced at night
        if (this.isDay()) {
            return 15;
        }
        // Gradual transition
        if (this.time < 0.25) {
            // Before dawn
            return Math.floor(4 + (this.time / 0.25) * 11);
        }
        // After dusk
        return Math.floor(4 + ((1 - this.time) / 0.25) * 11);
    }

    /**
     * Apply colors to a Three.js scene
     * @param {THREE.Scene} scene - Scene to update
     * @param {THREE.AmbientLight} [ambientLight] - Ambient light to update
     * @param {THREE.DirectionalLight} [sunLight] - Sun light to update
     * @param {THREE.DirectionalLight} [moonLight] - Moon light to update
     */
    applyToScene(scene, ambientLight, sunLight, moonLight) {
        // Update scene background
        scene.background = this.currentColors.sky;

        // Update fog if present
        if (scene.fog) {
            scene.fog.color.copy(this.currentColors.fog);
        }

        // Update ambient light
        if (ambientLight) {
            ambientLight.color.copy(this.currentColors.ambient);
            ambientLight.intensity = this.getAmbientIntensity();
        }

        // Update sun light
        if (sunLight) {
            sunLight.position.copy(this.sunPosition);
            sunLight.intensity = this.sunIntensity;
        }

        // Update moon light
        if (moonLight) {
            moonLight.position.copy(this.moonPosition);
            moonLight.intensity = this.moonIntensity;
        }
    }
}

export { TIME_PRESETS as TimePresets };
export default DayNightCycle;
