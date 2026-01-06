/**
 * Models barrel export
 * @module render/models
 */

export {
    createTorchViewmodel,
    createWorldTorch,
    updateTorchFlicker,
    disposeTorchModel,
    disposeTorchMaterials,
    default as TorchModelDefault
} from './TorchModel.js';

export {
    generatePlayerSkinTexture,
    generatePlayerHeadMaterials,
    generatePlayerUpperArmMaterials,
    generatePlayerForearmMaterials,
    generatePlayerMaterials,
    buildArticulatedMesh,
    buildPlayerMesh,
    createThirdPersonTorch,
    createHeldBlockMesh
} from './PlayerModel.js';

export {
    buildPlayerViewmodelArms,
    ViewmodelArmsAnimator,
    animateViewmodelArms
} from './ViewmodelArms.js';

export {
    ZOMBIE_SKIN_COLORS,
    ZOMBIE_EYE_TYPES,
    ZOMBIE_MOUTH_TYPES,
    ZOMBIE_CLOTHING_THEMES,
    pickZombieSkinIndex,
    pickZombieClothingPalette,
    generateZombieTexture,
    generateZombieHeadMaterials,
    generateZombieBodyMaterial,
    generateZombieArmMaterials,
    generateZombieLegMaterials,
    generateZombieMaterials,
    buildZombieMesh,
    animateZombieLimbs,
    resetZombieMesh
} from './ZombieModel.js';
