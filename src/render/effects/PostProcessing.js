/**
 * Post-processing effects management
 * @module render/effects/PostProcessing
 */

import * as THREE from 'three';

/**
 * @typedef {Object} PostProcessingOptions
 * @property {boolean} [enabled=true] - Whether post-processing is enabled
 * @property {boolean} [vignette=false] - Enable vignette effect
 * @property {number} [vignetteIntensity=0] - Vignette intensity (0-1)
 * @property {boolean} [desaturation=false] - Enable desaturation effect
 * @property {number} [desaturationAmount=0] - Desaturation amount (0-1)
 */

/**
 * Vignette shader definition
 * @type {Object}
 */
export const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.0 },
        color: { value: new THREE.Color(0x000000) },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform vec3 color;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);

            // Calculate vignette factor based on distance from center
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(vUv, center);
            float vignette = smoothstep(0.3, 0.9, dist) * intensity;

            // Apply vignette
            vec3 finalColor = mix(texel.rgb, color, vignette);
            gl_FragColor = vec4(finalColor, texel.a);
        }
    `,
};

/**
 * Desaturation shader definition
 * @type {Object}
 */
export const DesaturationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);

            // Calculate grayscale using luminance weights
            float gray = dot(texel.rgb, vec3(0.299, 0.587, 0.114));

            // Mix between color and grayscale
            vec3 desaturated = mix(texel.rgb, vec3(gray), amount);
            gl_FragColor = vec4(desaturated, texel.a);
        }
    `,
};

/**
 * Color grading shader for day/night transitions
 * @type {Object}
 */
export const ColorGradingShader = {
    uniforms: {
        tDiffuse: { value: null },
        brightness: { value: 1.0 },
        contrast: { value: 1.0 },
        saturation: { value: 1.0 },
        tint: { value: new THREE.Color(0xffffff) },
        tintStrength: { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        uniform vec3 tint;
        uniform float tintStrength;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);

            // Apply brightness
            vec3 color = texel.rgb * brightness;

            // Apply contrast
            color = (color - 0.5) * contrast + 0.5;

            // Apply saturation
            float gray = dot(color, vec3(0.299, 0.587, 0.114));
            color = mix(vec3(gray), color, saturation);

            // Apply tint
            color = mix(color, color * tint, tintStrength);

            gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
        }
    `,
};

/**
 * Post-processing manager
 * Manages post-processing effects without requiring full EffectComposer
 */
export class PostProcessingManager {
    /**
     * @param {THREE.WebGLRenderer} renderer - WebGL renderer
     * @param {THREE.Scene} scene - Scene to render
     * @param {THREE.Camera} camera - Camera to render from
     * @param {PostProcessingOptions} [options={}] - Initial options
     */
    constructor(renderer, scene, camera, options = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        /**
         * Whether post-processing is enabled
         * @type {boolean}
         */
        this.enabled = options.enabled ?? true;

        /**
         * Vignette settings
         * @type {{enabled: boolean, intensity: number, color: THREE.Color}}
         */
        this.vignette = {
            enabled: options.vignette ?? false,
            intensity: options.vignetteIntensity ?? 0,
            color: new THREE.Color(0x000000),
        };

        /**
         * Desaturation settings
         * @type {{enabled: boolean, amount: number}}
         */
        this.desaturation = {
            enabled: options.desaturation ?? false,
            amount: options.desaturationAmount ?? 0,
        };

        /**
         * Color grading settings
         * @type {{enabled: boolean, brightness: number, contrast: number, saturation: number, tint: THREE.Color, tintStrength: number}}
         */
        this.colorGrading = {
            enabled: false,
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            tint: new THREE.Color(0xffffff),
            tintStrength: 0.0,
        };

        // Render targets (created on demand)
        this._renderTarget = null;
        this._shaderMaterials = {};
    }

    /**
     * Create render target for post-processing
     * @private
     */
    _createRenderTarget() {
        if (this._renderTarget) return;

        const size = this.renderer.getSize(new THREE.Vector2());
        this._renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });
    }

    /**
     * Set vignette effect
     * @param {number} intensity - Intensity (0-1, 0=off)
     * @param {THREE.Color|number} [color=0x000000] - Vignette color
     */
    setVignette(intensity, color = 0x000000) {
        this.vignette.enabled = intensity > 0;
        this.vignette.intensity = Math.max(0, Math.min(1, intensity));
        if (typeof color === 'number') {
            this.vignette.color.set(color);
        } else {
            this.vignette.color.copy(color);
        }
    }

    /**
     * Set desaturation effect
     * @param {number} amount - Amount (0-1, 0=full color, 1=grayscale)
     */
    setDesaturation(amount) {
        this.desaturation.enabled = amount > 0;
        this.desaturation.amount = Math.max(0, Math.min(1, amount));
    }

    /**
     * Set color grading
     * @param {Object} settings - Color grading settings
     * @param {number} [settings.brightness=1] - Brightness multiplier
     * @param {number} [settings.contrast=1] - Contrast multiplier
     * @param {number} [settings.saturation=1] - Saturation multiplier
     * @param {THREE.Color|number} [settings.tint] - Color tint
     * @param {number} [settings.tintStrength=0] - Tint strength (0-1)
     */
    setColorGrading(settings) {
        this.colorGrading.enabled = true;
        if (settings.brightness !== undefined) this.colorGrading.brightness = settings.brightness;
        if (settings.contrast !== undefined) this.colorGrading.contrast = settings.contrast;
        if (settings.saturation !== undefined) this.colorGrading.saturation = settings.saturation;
        if (settings.tint !== undefined) {
            if (typeof settings.tint === 'number') {
                this.colorGrading.tint.set(settings.tint);
            } else {
                this.colorGrading.tint.copy(settings.tint);
            }
        }
        if (settings.tintStrength !== undefined) this.colorGrading.tintStrength = settings.tintStrength;
    }

    /**
     * Reset all effects to default
     */
    reset() {
        this.vignette.enabled = false;
        this.vignette.intensity = 0;
        this.desaturation.enabled = false;
        this.desaturation.amount = 0;
        this.colorGrading.enabled = false;
        this.colorGrading.brightness = 1.0;
        this.colorGrading.contrast = 1.0;
        this.colorGrading.saturation = 1.0;
        this.colorGrading.tintStrength = 0;
    }

    /**
     * Check if any effects are active
     * @returns {boolean}
     */
    hasActiveEffects() {
        return this.enabled && (
            this.vignette.enabled ||
            this.desaturation.enabled ||
            this.colorGrading.enabled
        );
    }

    /**
     * Render the scene with post-processing
     * Note: For full post-processing pipeline, use Three.js EffectComposer directly
     */
    render() {
        // If no effects, render normally
        if (!this.hasActiveEffects()) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // For now, render normally - full post-processing would use EffectComposer
        // This is a simplified version that doesn't require importing addons
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handle window resize
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        if (this._renderTarget) {
            this._renderTarget.setSize(width, height);
        }
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this._renderTarget) {
            this._renderTarget.dispose();
            this._renderTarget = null;
        }

        for (const material of Object.values(this._shaderMaterials)) {
            material.dispose();
        }
        this._shaderMaterials = {};
    }
}

export default PostProcessingManager;
