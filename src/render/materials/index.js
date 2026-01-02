/**
 * Materials barrel export
 * @module render/materials
 */

export {
    createTerrainMaterial,
    createFastTerrainMaterial,
    injectCylindricalFog,
    updateMaterialFog,
    default as createTerrainMaterialDefault
} from './TerrainMaterial.js';

export {
    createWaterMaterial,
    createFastWaterMaterial,
    createRefractionWaterMaterial,
    updateWaterTime,
    updateWaterOpacity,
    default as createWaterMaterialDefault
} from './WaterMaterial.js';
