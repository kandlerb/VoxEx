/**
 * Post-processing effects management
 * @module render/effects/PostProcessing
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const MAX_POINT_LIGHTS = 4;
const MAX_VOLUMETRIC_SAMPLES = 32;

/**
 * @typedef {Object} PostProcessingOptions
 * @property {boolean} [enabled=true] - Whether post-processing is enabled
 * @property {Object} [settings] - Game settings for shader defaults
 */

const ZombieScareShader = {
    uniforms: {
        tDiffuse: { value: null },
        zombieProximity: { value: 0.0 },
        vignetteIntensity: { value: 0.7 },
        enableVignette: { value: true },
        enableDesaturation: { value: true },
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
        uniform float zombieProximity;
        uniform float vignetteIntensity;
        uniform bool enableVignette;
        uniform bool enableDesaturation;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 color = texel.rgb;

            if (enableDesaturation && zombieProximity > 0.0) {
                float gray = dot(color, vec3(0.299, 0.587, 0.114));
                color = mix(color, vec3(gray), zombieProximity * 0.6);
            }

            if (enableVignette && zombieProximity > 0.0) {
                vec2 centerUV = vUv - 0.5;
                float distFromCenter = length(centerUV);
                float vignette = smoothstep(0.5, 1.5, distFromCenter);
                vec3 redTint = vec3(0.8, 0.1, 0.1);
                float vignetteAmount = vignette * zombieProximity * vignetteIntensity;
                color = mix(color, color * (1.0 - vignetteAmount) + redTint * vignetteAmount, vignetteAmount);
            }

            gl_FragColor = vec4(color, texel.a);
        }
    `,
};

const UnderwaterShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        isUnderwater: { value: false },
        underwaterDepth: { value: 0.0 },
        waterColor: { value: new THREE.Color(0x4488ff) },
        absorptionR: { value: 0.25 },
        absorptionG: { value: 0.06 },
        absorptionB: { value: 0.01 },
        tintStrength: { value: 0.25 },
        causticStrength: { value: 0.15 },
        distortionStrength: { value: 0.002 },
        vignetteStrength: { value: 0.4 },
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
        uniform float time;
        uniform bool isUnderwater;
        uniform float underwaterDepth;
        uniform vec3 waterColor;
        uniform float absorptionR;
        uniform float absorptionG;
        uniform float absorptionB;
        uniform float tintStrength;
        uniform float causticStrength;
        uniform float distortionStrength;
        uniform float vignetteStrength;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float caustic(vec2 uv, float t) {
            float c = 0.0;
            c += noise(uv * 8.0 + vec2(t * 0.5, t * 0.3)) * 0.5;
            c += noise(uv * 12.0 - vec2(t * 0.4, t * 0.6)) * 0.3;
            c += noise(uv * 20.0 + vec2(t * 0.7, -t * 0.2)) * 0.2;
            return c;
        }

        void main() {
            if (!isUnderwater) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }

            vec2 distortedUV = vUv;
            float waveX = sin(vUv.y * 10.0 + time * 0.0005) * distortionStrength;
            float waveY = cos(vUv.x * 8.0 + time * 0.0003) * distortionStrength * 0.7;
            distortedUV += vec2(waveX, waveY);

            vec4 texel = texture2D(tDiffuse, distortedUV);
            vec3 color = texel.rgb;

            float fibDarkness = 0.5;
            if (underwaterDepth >= 2.0) fibDarkness = 0.7;
            if (underwaterDepth >= 3.0) fibDarkness = 0.9;
            if (underwaterDepth >= 5.0) fibDarkness = 1.1;
            if (underwaterDepth >= 8.0) fibDarkness = 1.3;
            if (underwaterDepth >= 13.0) fibDarkness = 1.5;
            if (underwaterDepth >= 21.0) fibDarkness = 1.7;
            if (underwaterDepth >= 34.0) fibDarkness = 1.9;
            if (underwaterDepth >= 55.0) fibDarkness = 2.1;

            vec3 absorption = vec3(absorptionR, absorptionG, absorptionB);
            vec3 transmittance = exp(-absorption * fibDarkness);
            color *= transmittance;

            float depthFactor = clamp(fibDarkness / 1.9, 0.0, 1.0);

            float causticPattern = caustic(vUv, time * 0.001);
            float causticMask = smoothstep(0.8, 0.2, vUv.y);
            float causticEffect = causticPattern * causticMask * causticStrength * (1.0 - depthFactor * 0.7);
            color += vec3(causticEffect * 0.8, causticEffect * 0.9, causticEffect);

            float tint = tintStrength * 0.5 * (1.0 + depthFactor * 0.3);
            color = mix(color, color * waterColor * 1.5, tint);

            float gray = dot(color, vec3(0.299, 0.587, 0.114));
            color = mix(color, vec3(gray) * waterColor * 1.2, depthFactor * 0.15);

            vec2 centerUV = vUv - 0.5;
            float distFromCenter = length(centerUV);
            float vignette = smoothstep(0.3, 0.9, distFromCenter);
            color *= 1.0 - (vignette * vignetteStrength * (1.0 + depthFactor * 0.5));

            gl_FragColor = vec4(color, texel.a);
        }
    `,
};

const VolumetricLightShader = {
    uniforms: {
        tDiffuse: { value: null },
        enabled: { value: true },
        sunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
        sunVisible: { value: 1.0 },
        sunColor: { value: new THREE.Color(0xfce7bb) },
        moonScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
        moonVisible: { value: 0.0 },
        moonColor: { value: new THREE.Color(0x8899ff) },
        pointLightCount: { value: 0 },
        pointLightPositions: { value: new Array(MAX_POINT_LIGHTS).fill(null).map(() => new THREE.Vector2()) },
        pointLightColors: { value: new Array(MAX_POINT_LIGHTS).fill(null).map(() => new THREE.Color(0x000000)) },
        pointLightIntensities: { value: new Float32Array(MAX_POINT_LIGHTS) },
        density: { value: 0.015 },
        decay: { value: 0.98 },
        weight: { value: 0.5 },
        samples: { value: 8 },
        exposure: { value: 0.25 },
        fogDensity: { value: 0.1 },
        nightFactor: { value: 0.0 },
        aspectRatio: { value: 1.0 },
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
        uniform bool enabled;
        uniform vec2 sunScreenPos;
        uniform float sunVisible;
        uniform vec3 sunColor;
        uniform vec2 moonScreenPos;
        uniform float moonVisible;
        uniform vec3 moonColor;
        uniform int pointLightCount;
        uniform vec2 pointLightPositions[${MAX_POINT_LIGHTS}];
        uniform vec3 pointLightColors[${MAX_POINT_LIGHTS}];
        uniform float pointLightIntensities[${MAX_POINT_LIGHTS}];
        uniform float density;
        uniform float decay;
        uniform float weight;
        uniform int samples;
        uniform float exposure;
        uniform float fogDensity;
        uniform float nightFactor;
        uniform float aspectRatio;
        varying vec2 vUv;

        vec3 calculateGodRay(vec2 lightPos, vec3 lightColor, float intensity) {
            vec2 deltaTexCoord = vUv - lightPos;
            float dist = length(deltaTexCoord);

            if (dist > 1.2 || intensity <= 0.0) return vec3(0.0);

            deltaTexCoord *= density / float(${MAX_VOLUMETRIC_SAMPLES});
            vec2 texCoord = vUv;
            float illuminationDecay = 1.0;
            vec3 godRay = vec3(0.0);

            for (int i = 0; i < ${MAX_VOLUMETRIC_SAMPLES}; i++) {
                if (i >= samples) break;
                texCoord -= deltaTexCoord;
                vec2 sampleCoord = clamp(texCoord, 0.001, 0.999);
                vec3 sampleColor = textureLod(tDiffuse, sampleCoord, 0.0).rgb;
                float brightness = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));
                sampleColor *= illuminationDecay * weight * brightness;
                godRay += sampleColor;
                illuminationDecay *= decay;
            }

            float falloff = 1.0 - smoothstep(0.0, 1.0, dist);
            return godRay * lightColor * intensity * exposure * falloff;
        }

        vec3 calculateSkyAtmosphericFog(vec3 color, vec2 sunPos, float sunVis, vec2 moonPos, float moonVis) {
            float lightVis = max(sunVis, moonVis);
            if (lightVis <= 0.0) {
                return color;
            }

            vec2 lightPos = sunVis > moonVis ? sunPos : moonPos;
            vec3 lightColor = sunVis > moonVis ? sunColor : moonColor;

            vec2 diff = vUv - lightPos;
            diff.x *= aspectRatio;
            float dist = length(diff);

            float nightMultiplier = 1.0 + nightFactor;

            float radialGlow = exp(-dist * dist * 1.5) * fogDensity * nightMultiplier * lightVis;
            float globalHaze = fogDensity * 0.15 * nightMultiplier * lightVis;

            float fogAmount = radialGlow + globalHaze;
            vec3 fogColor = lightColor * 0.6 + vec3(0.9, 0.92, 0.95) * 0.4;

            return color + fogColor * fogAmount;
        }

        vec3 addPointLightFog(vec3 color, vec2 lightPos, vec3 lightColor, float intensity) {
            if (intensity <= 0.0) return color;
            if (lightPos.x < -0.5 || lightPos.x > 1.5 || lightPos.y < -0.5 || lightPos.y > 1.5) {
                return color;
            }

            vec2 diff = vUv - lightPos;
            diff.x *= aspectRatio;
            float dist = length(diff);

            float radialGlow = exp(-dist * dist * 3.0) * fogDensity * 0.6 * intensity;
            float localHaze = exp(-dist * dist * 1.5) * fogDensity * 0.15 * intensity;

            float fogAmount = radialGlow + localHaze;
            vec3 fogColor = lightColor * 0.8 + vec3(0.9, 0.85, 0.8) * 0.2;

            return color + fogColor * fogAmount;
        }

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 color = texel.rgb;

            if (!enabled) {
                gl_FragColor = vec4(color, texel.a);
                return;
            }

            if (sunVisible <= 0.0 && moonVisible <= 0.0 && pointLightCount == 0) {
                gl_FragColor = vec4(color, texel.a);
                return;
            }

            vec2 safeSunPos = sunScreenPos;
            if (safeSunPos.x != safeSunPos.x || safeSunPos.y != safeSunPos.y) {
                safeSunPos = vec2(-10.0, -10.0);
            }
            safeSunPos = clamp(safeSunPos, vec2(-2.0), vec2(3.0));

            vec2 safeMoonPos = moonScreenPos;
            if (safeMoonPos.x != safeMoonPos.x || safeMoonPos.y != safeMoonPos.y) {
                safeMoonPos = vec2(-10.0, -10.0);
            }
            safeMoonPos = clamp(safeMoonPos, vec2(-2.0), vec2(3.0));

            vec3 totalGodRays = vec3(0.0);

            if (sunVisible > 0.0) {
                totalGodRays += calculateGodRay(safeSunPos, sunColor, sunVisible * 1.2);
            }

            if (moonVisible > 0.0) {
                totalGodRays += calculateGodRay(safeMoonPos, moonColor, moonVisible * 0.6);
            }

            for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
                float intensity = pointLightIntensities[i];
                if (intensity > 0.0) {
                    vec2 lightPos = pointLightPositions[i];
                    if (lightPos.x >= -0.3 && lightPos.x <= 1.3 && lightPos.y >= -0.3 && lightPos.y <= 1.3) {
                        color = addPointLightFog(color, lightPos, pointLightColors[i], intensity);
                    }
                }
            }

            color = calculateSkyAtmosphericFog(color, safeSunPos, sunVisible, safeMoonPos, moonVisible);
            color += totalGodRays;

            gl_FragColor = vec4(color, texel.a);
        }
    `,
};

const ColorGradingShader = {
    uniforms: {
        tDiffuse: { value: null },
        enabled: { value: true },
        sunriseInfluence: { value: 0.0 },
        sunsetInfluence: { value: 0.0 },
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
        uniform bool enabled;
        uniform float sunriseInfluence;
        uniform float sunsetInfluence;
        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            if (!enabled) {
                gl_FragColor = color;
                return;
            }

            vec3 sunriseTint = vec3(1.1, 0.9, 0.7);
            color.rgb = mix(color.rgb, color.rgb * sunriseTint, sunriseInfluence * 0.3);

            vec3 sunsetTint = vec3(1.2, 0.8, 0.6);
            color.rgb = mix(color.rgb, color.rgb * sunsetTint, sunsetInfluence * 0.4);

            gl_FragColor = color;
        }
    `,
};

/**
 * Post-processing manager
 */
export class PostProcessingManager {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {PostProcessingOptions} [options={}] - Initial options
     */
    constructor(renderer, scene, camera, options = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.enabled = options.enabled ?? true;
        this.settings = options.settings ?? {};

        this.composer = new EffectComposer(renderer);
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);

        this.zombiePass = new ShaderPass(ZombieScareShader);
        this.underwaterPass = new ShaderPass(UnderwaterShader);
        this.volumetricPass = new ShaderPass(VolumetricLightShader);
        this.colorGradingPass = new ShaderPass(ColorGradingShader);

        this.zombiePass.enabled = true;
        this.underwaterPass.enabled = true;
        this.volumetricPass.enabled = true;
        this.colorGradingPass.enabled = true;

        this.composer.addPass(this.zombiePass);
        this.composer.addPass(this.underwaterPass);
        this.composer.addPass(this.volumetricPass);
        this.composer.addPass(this.colorGradingPass);

        this._tmpVec3 = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector2();
        this._isUnderwater = false;

        this.applySettings(this.settings);
    }

    applySettings(settings = {}) {
        this.settings = settings;

        if (this.zombiePass) {
            this.zombiePass.uniforms.vignetteIntensity.value = settings.zombieVignetteIntensity ?? 0.7;
            this.zombiePass.uniforms.enableVignette.value = settings.zombieVignetteEnabled ?? true;
            this.zombiePass.uniforms.enableDesaturation.value = settings.zombieDesaturationEnabled ?? true;
        }

        if (this.underwaterPass) {
            if (settings.waterColor !== undefined) {
                this.underwaterPass.uniforms.waterColor.value.setHex(settings.waterColor);
            }
            if (settings.waterAbsorptionR !== undefined) {
                this.underwaterPass.uniforms.absorptionR.value = settings.waterAbsorptionR;
            }
            if (settings.waterAbsorptionG !== undefined) {
                this.underwaterPass.uniforms.absorptionG.value = settings.waterAbsorptionG;
            }
            if (settings.waterAbsorptionB !== undefined) {
                this.underwaterPass.uniforms.absorptionB.value = settings.waterAbsorptionB;
            }
        }

        if (this.volumetricPass) {
            this.volumetricPass.uniforms.enabled.value = settings.volumetricLightingEnabled ?? true;
            this.volumetricPass.uniforms.density.value = settings.volumetricDensity ?? 0.015;
            this.volumetricPass.uniforms.decay.value = settings.volumetricDecay ?? 0.98;
            this.volumetricPass.uniforms.weight.value = settings.volumetricWeight ?? 0.5;
            this.volumetricPass.uniforms.samples.value = settings.volumetricSamples ?? 8;
            this.volumetricPass.uniforms.exposure.value = settings.volumetricExposure ?? 0.25;
            this.volumetricPass.uniforms.fogDensity.value = settings.volumetricFogDensity ?? 0.1;
            if (settings.sunColor !== undefined) {
                this.volumetricPass.uniforms.sunColor.value.setHex(settings.sunColor);
            }
            if (settings.moonColor !== undefined) {
                this.volumetricPass.uniforms.moonColor.value.setHex(settings.moonColor);
            }
        }

        if (this.colorGradingPass) {
            this.colorGradingPass.uniforms.enabled.value = settings.colorGradingEnabled ?? true;
        }
    }

    updateZombieEffects(proximity = 0) {
        if (!this.zombiePass) return;
        this.zombiePass.uniforms.zombieProximity.value = Math.max(0, Math.min(1, proximity));
    }

    updateUnderwater({ isUnderwater, depth, time, waterColor, absorptionR, absorptionG, absorptionB }) {
        if (!this.underwaterPass) return;
        this._isUnderwater = !!isUnderwater;
        this.underwaterPass.uniforms.isUnderwater.value = this._isUnderwater;
        this.underwaterPass.uniforms.underwaterDepth.value = depth ?? 0;
        this.underwaterPass.uniforms.time.value = time ?? 0;
        if (waterColor !== undefined) {
            this.underwaterPass.uniforms.waterColor.value.setHex(waterColor);
        }
        if (absorptionR !== undefined) this.underwaterPass.uniforms.absorptionR.value = absorptionR;
        if (absorptionG !== undefined) this.underwaterPass.uniforms.absorptionG.value = absorptionG;
        if (absorptionB !== undefined) this.underwaterPass.uniforms.absorptionB.value = absorptionB;
    }

    updateVolumetric({ dayNightCycle, camera, pointLights = [], aspectRatio }) {
        if (!this.volumetricPass || !dayNightCycle || !camera) return;

        const uniforms = this.volumetricPass.uniforms;
        const sunPos = dayNightCycle.sunPosition ?? this._tmpVec3.set(0, 100, 0);
        const moonPos = dayNightCycle.moonPosition ?? this._tmpVec3.set(0, -100, 0);

        uniforms.sunScreenPos.value.copy(this._worldToScreen(sunPos, camera));
        uniforms.moonScreenPos.value.copy(this._worldToScreen(moonPos, camera));
        uniforms.sunVisible.value = dayNightCycle.sunIntensity ?? 0;
        uniforms.moonVisible.value = dayNightCycle.moonIntensity ?? 0;
        uniforms.nightFactor.value = dayNightCycle.isNight ? (dayNightCycle.isNight() ? 1 : 0) : 0;
        uniforms.aspectRatio.value = aspectRatio ?? camera.aspect ?? 1;

        const count = Math.min(pointLights.length, MAX_POINT_LIGHTS);
        uniforms.pointLightCount.value = count;
        for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
            const entry = pointLights[i];
            if (entry) {
                uniforms.pointLightPositions.value[i].copy(entry.screenPos ?? entry.position ?? this._tmpVec2.set(-10, -10));
                if (entry.color !== undefined) {
                    uniforms.pointLightColors.value[i].set(entry.color);
                }
                uniforms.pointLightIntensities.value[i] = entry.intensity ?? 0;
            } else {
                uniforms.pointLightIntensities.value[i] = 0;
            }
        }
    }

    updateColorGrading(timeOfDay = 0) {
        if (!this.colorGradingPass) return;

        let sunriseInfluence = 0;
        let sunsetInfluence = 0;

        if (timeOfDay > 0.15 && timeOfDay < 0.35) {
            sunriseInfluence = 1.0 - Math.abs(timeOfDay - 0.25) / 0.1;
            sunriseInfluence = Math.max(0, Math.min(1, sunriseInfluence));
        }

        if (timeOfDay > 0.65 && timeOfDay < 0.85) {
            sunsetInfluence = 1.0 - Math.abs(timeOfDay - 0.75) / 0.1;
            sunsetInfluence = Math.max(0, Math.min(1, sunsetInfluence));
        }

        this.colorGradingPass.uniforms.sunriseInfluence.value = sunriseInfluence;
        this.colorGradingPass.uniforms.sunsetInfluence.value = sunsetInfluence;
    }

    hasActiveEffects() {
        if (!this.enabled) return false;
        const settings = this.settings;
        return Boolean(
            settings.volumetricLightingEnabled ||
            settings.colorGradingEnabled ||
            settings.zombieVignetteEnabled ||
            settings.zombieDesaturationEnabled ||
            this._isUnderwater
        );
    }

    render() {
        if (!this.enabled) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.composer.render();
    }

    resize(width, height) {
        this.composer.setSize(width, height);
    }

    dispose() {
        this.composer?.dispose();
    }

    _worldToScreen(worldPos, camera) {
        this._tmpVec3.copy(worldPos).project(camera);
        if (this._tmpVec3.z > 1) {
            return this._tmpVec2.set(-10, -10);
        }
        return this._tmpVec2.set(
            this._tmpVec3.x * 0.5 + 0.5,
            -this._tmpVec3.y * 0.5 + 0.5
        );
    }
}

export default PostProcessingManager;
