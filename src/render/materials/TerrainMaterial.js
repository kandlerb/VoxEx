/**
 * Terrain chunk material with custom cylindrical fog
 * @module render/materials/TerrainMaterial
 */

import * as THREE from 'three';

/**
 * @typedef {Object} TerrainMaterialOptions
 * @property {boolean} [useStandardMaterial=true] - Use MeshStandardMaterial (true) or MeshLambertMaterial (false)
 * @property {boolean} [customFog=false] - Enable custom cylindrical fog
 * @property {THREE.Color} [fogColor] - Fog color
 * @property {number} [fogNear] - Fog start distance
 * @property {number} [fogFar] - Fog end distance
 * @property {THREE.Texture} [roughnessMap] - Optional roughness map
 * @property {number} [alphaTest=0.1] - Alpha test threshold for cutout transparency
 */

/**
 * Create terrain material for voxel chunks
 * @param {THREE.Texture} atlasTexture - The block texture atlas
 * @param {TerrainMaterialOptions} [options={}] - Material options
 * @returns {THREE.MeshStandardMaterial|THREE.MeshLambertMaterial}
 */
export function createTerrainMaterial(atlasTexture, options = {}) {
    const {
        useStandardMaterial = true,
        customFog = false,
        fogColor,
        fogNear,
        fogFar,
        roughnessMap,
        alphaTest = 0.1
    } = options;

    let material;

    if (useStandardMaterial) {
        material = new THREE.MeshStandardMaterial({
            map: atlasTexture,
            roughnessMap: roughnessMap || null,
            vertexColors: true,
            side: THREE.FrontSide,
            alphaTest,
            roughness: 1.0,
            metalness: 0.0,
        });
    } else {
        material = new THREE.MeshLambertMaterial({
            map: atlasTexture,
            vertexColors: true,
            side: THREE.FrontSide,
            alphaTest,
        });
    }

    // Inject custom fog shader if enabled
    if (customFog && fogColor && fogNear !== undefined && fogFar !== undefined) {
        material.onBeforeCompile = (shader) => {
            injectCylindricalFog(shader, fogColor, fogNear, fogFar);
        };
    }

    return material;
}

/**
 * Inject cylindrical fog into shader (horizontal distance only)
 * @param {Object} shader - Three.js shader object
 * @param {THREE.Color} fogColor - Fog color
 * @param {number} fogNear - Fog start distance
 * @param {number} fogFar - Fog end distance
 */
export function injectCylindricalFog(shader, fogColor, fogNear, fogFar) {
    // Add uniforms
    shader.uniforms.customFogColor = { value: fogColor };
    shader.uniforms.customFogNear = { value: fogNear };
    shader.uniforms.customFogFar = { value: fogFar };

    // Add uniform declarations to fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 customFogColor;
        uniform float customFogNear;
        uniform float customFogFar;`
    );

    // Replace fog fragment with cylindrical fog
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `
        // Cylindrical fog (horizontal distance only, ignores Y)
        #ifdef USE_FOG
            float fogDepth = length(vViewPosition.xz);
            float fogFactor = smoothstep(customFogNear, customFogFar, fogDepth);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, customFogColor, fogFactor);
        #endif
        `
    );
}

/**
 * Update fog uniforms on a material
 * @param {THREE.Material} material - Material with custom fog
 * @param {THREE.Color} fogColor - New fog color
 * @param {number} fogNear - New fog start distance
 * @param {number} fogFar - New fog end distance
 */
export function updateMaterialFog(material, fogColor, fogNear, fogFar) {
    if (material.userData.fogUniforms) {
        const uniforms = material.userData.fogUniforms;
        if (uniforms.customFogColor) uniforms.customFogColor.value.copy(fogColor);
        if (uniforms.customFogNear) uniforms.customFogNear.value = fogNear;
        if (uniforms.customFogFar) uniforms.customFogFar.value = fogFar;
    }
}

/**
 * Create a simple lambert terrain material (for performance mode)
 * @param {THREE.Texture} atlasTexture - The block texture atlas
 * @returns {THREE.MeshLambertMaterial}
 */
export function createFastTerrainMaterial(atlasTexture) {
    return new THREE.MeshLambertMaterial({
        map: atlasTexture,
        vertexColors: true,
        side: THREE.FrontSide,
        alphaTest: 0.1,
    });
}

export default createTerrainMaterial;
