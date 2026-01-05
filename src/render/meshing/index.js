/**
 * Meshing barrel export
 * @module render/meshing
 */

export {
    shouldRenderFace,
    isTransparent,
    isSolid,
    isOpaque,
    getFaceOffset,
    getVisibleFaces,
    countVisibleFaces,
    getIsTransparentArray,
    FACE_DIRECTIONS,
    FACE,
    IS_TRANSPARENT,
    default as FaceCullingDefault
} from './FaceCulling.js';

export {
    buildChunkMesh,
    disposeChunkGeometry,
    getBlockUV,
    addIndexedFace,
    addFace,
    addFaceWater,
    addFaceSimplified,
    addFaceIndexedFull,
    addFaceWaterIndexed,
    addFaceSimplifiedIndexed,
    initAOCache,
    clearAOCache,
    ChunkMesher,
    default as ChunkMesherDefault
} from './ChunkMesher.js';

export {
    AO_LOOKUP,
    AO_FACE_CONFIGS,
    getAOConfig,
    calculateVertexAO,
    calculateFaceAO,
    getSimplifiedLight,
    default as AmbientOcclusionDefault
} from './AmbientOcclusion.js';

export {
    writeFaceVertices,
    writeFaceVerticesIndexed,
    writeFaceColors,
    writeFaceColorsIndexed,
    writeFaceColorsWater,
    writeFaceColorsWaterIndexed,
    writeFaceUVs,
    writeFaceUVsIndexed,
    writeFaceIndices,
    waterHash,
    default as FaceWritersDefault
} from './FaceWriters.js';
