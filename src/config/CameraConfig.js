/**
 * VoxEx Camera Configuration
 * Third-person camera and orbit settings.
 * @module config/CameraConfig
 */

// =====================================================
// THIRD-PERSON CAMERA CONSTANTS
// =====================================================

/** Default distance behind player (Z offset) */
export const THIRD_PERSON_DISTANCE = 4.0;

/** Height above player feet */
export const THIRD_PERSON_HEIGHT = 2.5;

/** Look at target height (chest level) */
export const THIRD_PERSON_LOOK_HEIGHT = 1.2;

/** Buffer distance from blocks for collision */
export const THIRD_PERSON_CAM_BUFFER = 0.3;

// =====================================================
// ORBIT CAMERA LIMITS
// =====================================================

/** Minimum orbit pitch in radians (-60° look up) */
export const ORBIT_PITCH_MIN = -Math.PI / 3;

/** Maximum orbit pitch in radians (+60° look down) */
export const ORBIT_PITCH_MAX = Math.PI / 3;

// =====================================================
// ZOOM LIMITS
// =====================================================

/** Minimum zoom distance (closest to player) */
export const THIRD_PERSON_DISTANCE_MIN = 2.0;

/** Maximum zoom distance (furthest from player) */
export const THIRD_PERSON_DISTANCE_MAX = 8.0;

/** Default zoom distance */
export const THIRD_PERSON_DISTANCE_DEFAULT = 4.0;

// =====================================================
// SMOOTHING AND DEBUG
// =====================================================

/** Camera follow smoothing factor (lower = more lag) */
export const CAM_SMOOTH_FACTOR = 0.15;

/** Debug logging interval (ms) */
export const THIRD_PERSON_DEBUG_INTERVAL = 500;

// =====================================================
// FIRST-PERSON CAMERA
// =====================================================

/** Default field of view (degrees) */
export const DEFAULT_FOV = 75;

/** Sprint field of view (degrees) */
export const SPRINT_FOV = 80;

/** Near clipping plane distance */
export const CAMERA_NEAR = 0.01;

/** Far clipping plane distance */
export const CAMERA_FAR = 800;

// =====================================================
// CAMERA COLLISION
// =====================================================

/** Offset from collision point */
export const CAMERA_COLLISION_OFFSET = 0.1;

/** Raycast step size for camera collision */
export const CAMERA_COLLISION_STEP = 0.25;

/**
 * Camera configuration object for easy import.
 * @type {Object}
 */
export const CAMERA_CONFIG = {
    thirdPerson: {
        distance: THIRD_PERSON_DISTANCE,
        height: THIRD_PERSON_HEIGHT,
        lookHeight: THIRD_PERSON_LOOK_HEIGHT,
        buffer: THIRD_PERSON_CAM_BUFFER,
        distanceMin: THIRD_PERSON_DISTANCE_MIN,
        distanceMax: THIRD_PERSON_DISTANCE_MAX,
        smoothFactor: CAM_SMOOTH_FACTOR,
    },
    orbit: {
        pitchMin: ORBIT_PITCH_MIN,
        pitchMax: ORBIT_PITCH_MAX,
    },
    firstPerson: {
        fov: DEFAULT_FOV,
        sprintFov: SPRINT_FOV,
        near: CAMERA_NEAR,
        far: CAMERA_FAR,
    },
    collision: {
        offset: CAMERA_COLLISION_OFFSET,
        step: CAMERA_COLLISION_STEP,
    },
};
