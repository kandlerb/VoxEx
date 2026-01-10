"""
Voxel grid raycasting using DDA algorithm.

Casts rays through the voxel world to find the first solid block hit.
Used for block selection, mining, and placement targeting.

Usage:
    from voxel_engine.engine.interaction.raycast import raycast_voxels, RaycastHit

    hit = raycast_voxels(world, registry, eye_pos, look_dir, max_distance=5.0)
    if hit:
        print(f"Hit block {hit.block_id} at {hit.block_pos}")
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Tuple
from dataclasses import dataclass

from ..state import WorldState
from ..registry import Registry
from .constants import DEFAULT_REACH, MAX_RAY_STEPS


@dataclass(frozen=True)
class RaycastHit:
    """
    Result of a successful raycast.

    Contains information about the block that was hit, including
    position, block type, hit face normal, exact hit point, and distance.
    """

    # Block that was hit
    block_x: int
    block_y: int
    block_z: int
    block_id: int

    # Face normal (which face was hit)
    normal_x: int
    normal_y: int
    normal_z: int

    # Exact hit point
    hit_x: float
    hit_y: float
    hit_z: float

    # Distance from ray origin
    distance: float

    @property
    def block_pos(self) -> Tuple[int, int, int]:
        """Get block position as tuple."""
        return (self.block_x, self.block_y, self.block_z)

    @property
    def normal(self) -> Tuple[int, int, int]:
        """Get face normal as tuple."""
        return (self.normal_x, self.normal_y, self.normal_z)

    @property
    def adjacent_pos(self) -> Tuple[int, int, int]:
        """
        Position of block adjacent to hit face.

        Used for block placement - this is where a new block would go.
        """
        return (
            self.block_x + self.normal_x,
            self.block_y + self.normal_y,
            self.block_z + self.normal_z
        )

    @property
    def hit_point(self) -> Tuple[float, float, float]:
        """Get exact hit point as tuple."""
        return (self.hit_x, self.hit_y, self.hit_z)


def raycast_voxels(
    world: WorldState,
    origin: NDArray[np.float64],
    direction: NDArray[np.float64],
    max_distance: float = DEFAULT_REACH,
    hit_liquids: bool = False
) -> Optional[RaycastHit]:
    """
    Cast a ray through the voxel world using DDA algorithm.

    Digital Differential Analyzer (DDA) steps through voxels along the ray,
    checking each for solid blocks. Returns the first solid block hit.

    Args:
        world: World state to query blocks.
        origin: Ray origin (usually eye position), (3,) float64 array.
        direction: Ray direction (should be normalized), (3,) float64 array.
        max_distance: Maximum ray travel distance in blocks.
        hit_liquids: Whether to stop at liquid blocks (water, lava).

    Returns:
        RaycastHit if a block was hit, None otherwise.
    """
    # Normalize direction
    dir_len = np.linalg.norm(direction)
    if dir_len < 0.0001:
        return None
    direction = direction / dir_len

    # Current voxel position
    voxel_x = int(np.floor(origin[0]))
    voxel_y = int(np.floor(origin[1]))
    voxel_z = int(np.floor(origin[2]))

    # Step direction for each axis (+1 or -1)
    step_x = 1 if direction[0] >= 0 else -1
    step_y = 1 if direction[1] >= 0 else -1
    step_z = 1 if direction[2] >= 0 else -1

    # Calculate tMax - distance to next voxel boundary on each axis
    # and tDelta - distance to cross one voxel on each axis
    INF = float('inf')

    if abs(direction[0]) > 0.0001:
        t_delta_x = abs(1.0 / direction[0])
        if step_x > 0:
            t_max_x = ((voxel_x + 1) - origin[0]) / direction[0]
        else:
            t_max_x = (origin[0] - voxel_x) / -direction[0]
    else:
        t_delta_x = INF
        t_max_x = INF

    if abs(direction[1]) > 0.0001:
        t_delta_y = abs(1.0 / direction[1])
        if step_y > 0:
            t_max_y = ((voxel_y + 1) - origin[1]) / direction[1]
        else:
            t_max_y = (origin[1] - voxel_y) / -direction[1]
    else:
        t_delta_y = INF
        t_max_y = INF

    if abs(direction[2]) > 0.0001:
        t_delta_z = abs(1.0 / direction[2])
        if step_z > 0:
            t_max_z = ((voxel_z + 1) - origin[2]) / direction[2]
        else:
            t_max_z = (origin[2] - voxel_z) / -direction[2]
    else:
        t_delta_z = INF
        t_max_z = INF

    # Track which face we entered from
    normal_x, normal_y, normal_z = 0, 0, 0

    # DDA traversal
    distance = 0.0

    for _ in range(MAX_RAY_STEPS):
        # Check current voxel (only if within world height bounds)
        if 0 <= voxel_y < 320:
            block_id = world.get_block(voxel_x, voxel_y, voxel_z)

            if block_id is not None and block_id != 0:
                # Check if this block stops the ray
                is_solid = Registry.is_solid(block_id)
                is_liquid = Registry.is_liquid(block_id)

                if is_solid or (hit_liquids and is_liquid):
                    # Calculate exact hit point
                    hit_point = origin + direction * distance

                    return RaycastHit(
                        block_x=voxel_x,
                        block_y=voxel_y,
                        block_z=voxel_z,
                        block_id=block_id,
                        normal_x=normal_x,
                        normal_y=normal_y,
                        normal_z=normal_z,
                        hit_x=float(hit_point[0]),
                        hit_y=float(hit_point[1]),
                        hit_z=float(hit_point[2]),
                        distance=distance
                    )

        # Step to next voxel (choose smallest tMax)
        if t_max_x < t_max_y:
            if t_max_x < t_max_z:
                distance = t_max_x
                if distance > max_distance:
                    break
                voxel_x += step_x
                t_max_x += t_delta_x
                normal_x, normal_y, normal_z = -step_x, 0, 0
            else:
                distance = t_max_z
                if distance > max_distance:
                    break
                voxel_z += step_z
                t_max_z += t_delta_z
                normal_x, normal_y, normal_z = 0, 0, -step_z
        else:
            if t_max_y < t_max_z:
                distance = t_max_y
                if distance > max_distance:
                    break
                voxel_y += step_y
                t_max_y += t_delta_y
                normal_x, normal_y, normal_z = 0, -step_y, 0
            else:
                distance = t_max_z
                if distance > max_distance:
                    break
                voxel_z += step_z
                t_max_z += t_delta_z
                normal_x, normal_y, normal_z = 0, 0, -step_z

    return None


def get_look_direction(yaw: float, pitch: float) -> NDArray[np.float64]:
    """
    Calculate look direction vector from yaw and pitch angles.

    Matches PlayerState convention where positive pitch looks down.

    Args:
        yaw: Horizontal rotation in radians (0 = -Z, pi/2 = -X).
        pitch: Vertical rotation in radians (positive = looking down).

    Returns:
        Normalized (3,) direction vector.
    """
    cos_pitch = np.cos(pitch)
    return np.array([
        -np.sin(yaw) * cos_pitch,
        -np.sin(pitch),  # Negative because positive pitch = looking down
        -np.cos(yaw) * cos_pitch
    ], dtype=np.float64)
