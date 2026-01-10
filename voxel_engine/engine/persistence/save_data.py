"""
Save data structures for VoxEx.

Defines serializable data classes for player state, world metadata,
and save file structure.
"""

import json
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Tuple, Optional

from .constants import SAVE_VERSION


@dataclass
class PlayerSaveData:
    """Serializable player state."""

    position: List[float] = field(default_factory=lambda: [0.0, 64.0, 0.0])
    velocity: List[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    yaw: float = 0.0
    pitch: float = 0.0
    is_flying: bool = False
    selected_slot: int = 0
    torch_active: bool = False

    def to_dict(self) -> dict:
        """
        Convert to dictionary for JSON serialization.

        Returns:
            dict: Serializable dictionary.
        """
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'PlayerSaveData':
        """
        Create from dictionary.

        Args:
            data: Dictionary with player data.

        Returns:
            PlayerSaveData: Deserialized instance.
        """
        # Handle missing fields gracefully
        return cls(
            position=data.get('position', [0.0, 64.0, 0.0]),
            velocity=data.get('velocity', [0.0, 0.0, 0.0]),
            yaw=data.get('yaw', 0.0),
            pitch=data.get('pitch', 0.0),
            is_flying=data.get('is_flying', False),
            selected_slot=data.get('selected_slot', 0),
            torch_active=data.get('torch_active', False),
        )


@dataclass
class WorldSaveData:
    """Serializable world metadata."""

    seed: int = 0
    world_time: float = 0.0
    day_length: float = 1200.0
    tick_count: int = 0

    def to_dict(self) -> dict:
        """
        Convert to dictionary for JSON serialization.

        Returns:
            dict: Serializable dictionary.
        """
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'WorldSaveData':
        """
        Create from dictionary.

        Args:
            data: Dictionary with world data.

        Returns:
            WorldSaveData: Deserialized instance.
        """
        return cls(
            seed=data.get('seed', 0),
            world_time=data.get('world_time', 0.0),
            day_length=data.get('day_length', 1200.0),
            tick_count=data.get('tick_count', 0),
        )


@dataclass
class SaveMetadata:
    """Save file metadata."""

    name: str = "Unnamed World"
    version: int = SAVE_VERSION
    created_at: float = field(default_factory=time.time)
    modified_at: float = field(default_factory=time.time)
    playtime_seconds: float = 0.0

    # Counts for UI display
    chunk_count: int = 0

    def to_dict(self) -> dict:
        """
        Convert to dictionary for JSON serialization.

        Returns:
            dict: Serializable dictionary.
        """
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'SaveMetadata':
        """
        Create from dictionary.

        Args:
            data: Dictionary with metadata.

        Returns:
            SaveMetadata: Deserialized instance.
        """
        return cls(
            name=data.get('name', 'Unnamed World'),
            version=data.get('version', SAVE_VERSION),
            created_at=data.get('created_at', time.time()),
            modified_at=data.get('modified_at', time.time()),
            playtime_seconds=data.get('playtime_seconds', 0.0),
            chunk_count=data.get('chunk_count', 0),
        )

    def get_formatted_playtime(self) -> str:
        """
        Get human-readable playtime string.

        Returns:
            str: Formatted playtime (e.g., "2h 15m").
        """
        total_minutes = int(self.playtime_seconds / 60)
        hours = total_minutes // 60
        minutes = total_minutes % 60

        if hours > 0:
            return f"{hours}h {minutes}m"
        else:
            return f"{minutes}m"


@dataclass
class SaveFile:
    """Complete save file structure."""

    metadata: SaveMetadata = field(default_factory=SaveMetadata)
    player: PlayerSaveData = field(default_factory=PlayerSaveData)
    world: WorldSaveData = field(default_factory=WorldSaveData)

    # Modified chunk coordinates (actual data stored separately)
    modified_chunks: List[Tuple[int, int]] = field(default_factory=list)

    def to_json(self) -> str:
        """
        Serialize to JSON string.

        Returns:
            str: JSON-formatted string.
        """
        data = {
            'metadata': self.metadata.to_dict(),
            'player': self.player.to_dict(),
            'world': self.world.to_dict(),
            'modified_chunks': self.modified_chunks,
        }
        return json.dumps(data, indent=2)

    @classmethod
    def from_json(cls, json_str: str) -> 'SaveFile':
        """
        Deserialize from JSON string.

        Args:
            json_str: JSON-formatted string.

        Returns:
            SaveFile: Deserialized instance.
        """
        data = json.loads(json_str)

        return cls(
            metadata=SaveMetadata.from_dict(data.get('metadata', {})),
            player=PlayerSaveData.from_dict(data.get('player', {})),
            world=WorldSaveData.from_dict(data.get('world', {})),
            modified_chunks=[tuple(c) for c in data.get('modified_chunks', [])],
        )

    def update_modified_time(self) -> None:
        """Update modification timestamp."""
        self.metadata.modified_at = time.time()
