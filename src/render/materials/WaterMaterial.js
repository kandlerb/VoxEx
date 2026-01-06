/**
 * Water material with transparency and optional refraction
 * @module render/materials/WaterMaterial
 */

import * as THREE from 'three';

/**
 * @typedef {Object} WaterMaterialOptions
 * @property {number} [opacity=0.7] - Water opacity (0-1)
 * @property {number} [roughness=0.3] - Surface roughness for PBR
 * @property {number} [metalness=0.1] - Surface metalness for PBR
 * @property {boolean} [doubleSided=true] - Render both sides
 */

/**
 * Create standard water material with transparency
 * @param {THREE.Texture} atlasTexture - The block texture atlas
 * @param {WaterMaterialOptions} [options={}] - Material options
 * @returns {THREE.MeshStandardMaterial}
 */
export function createWaterMaterial(atlasTexture, options = {}) {
    const {
        opacity = 0.7,
        roughness = 0.3,
        metalness = 0.1,
        doubleSided = true,
    } = options;

    return new THREE.MeshStandardMaterial({
        map: atlasTexture,
        vertexColors: true,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        transparent: true,
        opacity,
        color: 0xffffff,
        alphaTest: 0.1,
        depthWrite: false,
        depthTest: true,
        roughness,
        metalness,
    });
}

/**
 * Create fast water material using Lambert shading
 * @param {THREE.Texture} atlasTexture - The block texture atlas
 * @param {number} [opacity=0.7] - Water opacity
 * @returns {THREE.MeshLambertMaterial}
 */
export function createFastWaterMaterial(atlasTexture, opacity = 0.7) {
    return new THREE.MeshLambertMaterial({
        map: atlasTexture,
        vertexColors: true,
        side: THREE.FrontSide,
        transparent: true,
        opacity,
        color: 0xffffff,
        alphaTest: 0.1,
        depthWrite: false,
        depthTest: true,
    });
}

/**
 * Create refraction water shader material
 * @param {THREE.Texture} atlasTexture - The block texture atlas
 * @param {Object} [options={}] - Shader options
 * @returns {THREE.ShaderMaterial}
 */
export function createRefractionWaterMaterial(atlasTexture, options = {}) {
    const {
        opacity = 0.7,
        refractionStrength = 0.02,
        waterColor = new THREE.Color(0x3399ff),
        absorptionR = 0.3,
        absorptionG = 0.15,
        absorptionB = 0.05,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            tRefraction: { value: null },
            tWater: { value: atlasTexture },
            time: { value: 0.0 },
            opacity: { value: opacity },
            refractionStrength: { value: refractionStrength },
            waterColor: { value: waterColor },
            fogColor: { value: new THREE.Color(0xb3d9ff) },
            fogNear: { value: 1.0 },
            fogFar: { value: 400.0 },
            absorptionR: { value: absorptionR },
            absorptionG: { value: absorptionG },
            absorptionB: { value: absorptionB },
            waterDepthScale: { value: 0.15 },
        },
        vertexShader: `
            attribute float shoreDist;
            attribute float waterThickness;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            varying vec4 vScreenPos;
            varying vec3 vColor;
            varying float vShoreDist;
            varying float vWaterThickness;

            void main() {
                vUv = uv;
                vColor = color;
                vShoreDist = shoreDist;
                vWaterThickness = waterThickness;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vScreenPos = projectionMatrix * mvPosition;
                gl_Position = vScreenPos;
            }
        `,
        fragmentShader: `
            uniform sampler2D tRefraction;
            uniform sampler2D tWater;
            uniform float time;
            uniform float opacity;
            uniform float refractionStrength;
            uniform vec3 waterColor;
            uniform vec3 fogColor;
            uniform float fogNear;
            uniform float fogFar;
            uniform float absorptionR;
            uniform float absorptionG;
            uniform float absorptionB;
            uniform float waterDepthScale;

            varying vec2 vUv;
            varying vec3 vWorldPosition;
            varying vec4 vScreenPos;
            varying vec3 vColor;
            varying float vShoreDist;
            varying float vWaterThickness;

            void main() {
                vec2 screenUV = vScreenPos.xy / vScreenPos.w * 0.5 + 0.5;

                // Distort UVs based on world position for wave effect
                float wave = sin(vWorldPosition.x * 0.5 + time) * 0.5 +
                            sin(vWorldPosition.z * 0.7 + time * 1.2) * 0.5;
                vec2 distortedUV = screenUV + vec2(wave * refractionStrength, wave * refractionStrength * 0.5);

                // Sample refraction texture
                vec4 refractionColor = texture2D(tRefraction, distortedUV);

                // Sample water texture
                vec4 waterTexture = texture2D(tWater, vUv);

                // Apply Beer-Lambert absorption
                float depth = vWaterThickness * waterDepthScale;
                vec3 absorption = vec3(
                    exp(-absorptionR * depth),
                    exp(-absorptionG * depth),
                    exp(-absorptionB * depth)
                );

                // Blend colors
                vec3 finalColor = mix(refractionColor.rgb * absorption, waterColor, opacity * 0.5);
                finalColor *= vColor;

                // Shore foam effect
                float foam = smoothstep(0.0, 0.3, vShoreDist);
                finalColor = mix(vec3(1.0), finalColor, foam);

                gl_FragColor = vec4(finalColor, opacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        vertexColors: true,
        fog: false,
    });
}

/**
 * Update water material time uniform for animation
 * @param {THREE.ShaderMaterial} material - Water shader material
 * @param {number} time - Current time in seconds
 */
export function updateWaterTime(material, time) {
    if (material.uniforms && material.uniforms.time) {
        material.uniforms.time.value = time;
    }
}

/**
 * Update water material opacity
 * @param {THREE.Material} material - Water material
 * @param {number} opacity - New opacity value
 */
export function updateWaterOpacity(material, opacity) {
    if (material.uniforms && material.uniforms.opacity) {
        material.uniforms.opacity.value = opacity;
    } else if ('opacity' in material) {
        material.opacity = opacity;
    }
}

export default createWaterMaterial;
