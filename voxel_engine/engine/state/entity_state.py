"""
Entity state container for VoxEx.

Manages collections of entities (mobs, items) with pooling support.
Uses Set for active entities, deque for object pools.

Usage:
    from voxel_engine.engine.state import EntityState

    entities = EntityState()
    zombie = entities.spawn_mob("zombie", position)
    entities.remove(zombie)
"""

from typing import Dict, Set, Optional, List, Iterator
from collections import deque
import numpy as np


class Entity:
    """
    Base entity with position, velocity, and type info.

    Subclassed by Mob, ItemEntity, etc.
    """

    __slots__ = [
        "entity_id", "entity_type", "position", "velocity",
        "prev_position", "active", "age"
    ]

    _next_id: int = 0

    def __init__(self, entity_type: str = "entity"):
        """
        Initialize a new entity.

        Args:
            entity_type: Type identifier (e.g., "zombie", "item").
        """
        self.entity_id = Entity._next_id
        Entity._next_id += 1

        self.entity_type = entity_type
        self.position = np.array([0.0, 0.0, 0.0], dtype=np.float64)
        self.velocity = np.array([0.0, 0.0, 0.0], dtype=np.float64)
        self.prev_position = np.array([0.0, 0.0, 0.0], dtype=np.float64)
        self.active = True
        self.age = 0.0  # Time alive in seconds

    def store_previous_position(self) -> None:
        """Copy current position for interpolation."""
        np.copyto(self.prev_position, self.position)

    def reset(self) -> None:
        """Reset entity for reuse from pool."""
        self.position.fill(0.0)
        self.velocity.fill(0.0)
        self.prev_position.fill(0.0)
        self.active = True
        self.age = 0.0


class EntityState:
    """
    Container for all entity collections.

    Provides:
    - Active entity tracking (Set)
    - Object pooling per entity type (deque)
    - Spatial queries (entities near position)
    """

    __slots__ = [
        "entities", "entities_by_type", "pools", "max_entities"
    ]

    def __init__(self, max_entities: int = 100):
        """
        Initialize entity state.

        Args:
            max_entities: Maximum active entities (for performance).
        """
        self.max_entities = max_entities

        # All active entities by ID
        self.entities: Dict[int, Entity] = {}

        # Entities grouped by type for efficient iteration
        self.entities_by_type: Dict[str, Set[int]] = {}

        # Object pools per entity type
        self.pools: Dict[str, deque] = {}

    def add(self, entity: Entity) -> bool:
        """
        Add an entity to active tracking.

        Args:
            entity: Entity to add.

        Returns:
            bool: True if added, False if at capacity.
        """
        if len(self.entities) >= self.max_entities:
            return False

        self.entities[entity.entity_id] = entity

        # Add to type group
        if entity.entity_type not in self.entities_by_type:
            self.entities_by_type[entity.entity_type] = set()
        self.entities_by_type[entity.entity_type].add(entity.entity_id)

        return True

    def remove(self, entity: Entity) -> None:
        """
        Remove entity from active tracking and return to pool.

        Args:
            entity: Entity to remove.
        """
        entity_id = entity.entity_id

        if entity_id not in self.entities:
            return

        # Remove from main dict
        del self.entities[entity_id]

        # Remove from type group
        type_set = self.entities_by_type.get(entity.entity_type)
        if type_set:
            type_set.discard(entity_id)

        # Return to pool
        entity.active = False
        self._return_to_pool(entity)

    def get(self, entity_id: int) -> Optional[Entity]:
        """Get entity by ID."""
        return self.entities.get(entity_id)

    def get_by_type(self, entity_type: str) -> Iterator[Entity]:
        """
        Iterate over entities of a specific type.

        Args:
            entity_type: Type to filter by.

        Yields:
            Entity instances of the given type.
        """
        ids = self.entities_by_type.get(entity_type, set())
        for entity_id in ids:
            entity = self.entities.get(entity_id)
            if entity:
                yield entity

    def iter_all(self) -> Iterator[Entity]:
        """Iterate over all active entities."""
        return iter(self.entities.values())

    def count(self, entity_type: Optional[str] = None) -> int:
        """
        Get entity count.

        Args:
            entity_type: Optional type filter.

        Returns:
            int: Number of entities.
        """
        if entity_type is None:
            return len(self.entities)
        return len(self.entities_by_type.get(entity_type, set()))

    # =========================================================================
    # POOLING
    # =========================================================================

    def _return_to_pool(self, entity: Entity) -> None:
        """Return entity to its type pool."""
        if entity.entity_type not in self.pools:
            self.pools[entity.entity_type] = deque(maxlen=50)
        self.pools[entity.entity_type].append(entity)

    def acquire_from_pool(self, entity_type: str) -> Optional[Entity]:
        """
        Get a recycled entity from pool.

        Args:
            entity_type: Type of entity to acquire.

        Returns:
            Recycled Entity or None if pool empty.
        """
        pool = self.pools.get(entity_type)
        if pool:
            try:
                entity = pool.pop()
                entity.reset()
                return entity
            except IndexError:
                pass
        return None

    # =========================================================================
    # SPATIAL QUERIES
    # =========================================================================

    def get_near(
        self,
        position: np.ndarray,
        radius: float,
        entity_type: Optional[str] = None
    ) -> List[Entity]:
        """
        Get entities within radius of position.

        Uses squared distance to avoid sqrt.

        Args:
            position: Center position (NumPy array).
            radius: Search radius.
            entity_type: Optional type filter.

        Returns:
            List of entities within radius.
        """
        radius_sq = radius * radius
        results = []

        if entity_type:
            entities = self.get_by_type(entity_type)
        else:
            entities = self.iter_all()

        for entity in entities:
            dx = entity.position[0] - position[0]
            dy = entity.position[1] - position[1]
            dz = entity.position[2] - position[2]
            dist_sq = dx * dx + dy * dy + dz * dz

            if dist_sq <= radius_sq:
                results.append(entity)

        return results

    def get_closest(
        self,
        position: np.ndarray,
        entity_type: Optional[str] = None,
        max_distance: float = float('inf')
    ) -> Optional[Entity]:
        """
        Get closest entity to position.

        Args:
            position: Center position.
            entity_type: Optional type filter.
            max_distance: Maximum search distance.

        Returns:
            Closest Entity or None.
        """
        closest = None
        closest_dist_sq = max_distance * max_distance

        if entity_type:
            entities = self.get_by_type(entity_type)
        else:
            entities = self.iter_all()

        for entity in entities:
            dx = entity.position[0] - position[0]
            dy = entity.position[1] - position[1]
            dz = entity.position[2] - position[2]
            dist_sq = dx * dx + dy * dy + dz * dz

            if dist_sq < closest_dist_sq:
                closest_dist_sq = dist_sq
                closest = entity

        return closest

    def clear(self) -> None:
        """Remove all entities."""
        self.entities.clear()
        self.entities_by_type.clear()
        # Keep pools for reuse
