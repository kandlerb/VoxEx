"""
Tests for rendering system.

Tests camera matrices, frustum culling, texture atlas generation,
and WorldRenderSystem configuration.

Run with: python -m pytest voxel_engine/tools/test_rendering.py -v
"""

import math
import numpy as np
import pytest


class TestPerspectiveMatrix:
    """Tests for perspective projection matrix."""

    def test_shape(self):
        """Perspective matrix is 4x4."""
        from voxel_engine.engine.rendering import perspective_matrix
        mat = perspective_matrix(math.radians(75), 16 / 9, 0.1, 1000)
        assert mat.shape == (4, 4)
        assert mat.dtype == np.float32

    def test_near_far_planes(self):
        """Verify near/far values affect matrix correctly."""
        from voxel_engine.engine.rendering import perspective_matrix
        mat1 = perspective_matrix(math.radians(75), 1.0, 0.1, 100)
        mat2 = perspective_matrix(math.radians(75), 1.0, 0.1, 1000)
        # Different far planes should give different matrices
        assert not np.allclose(mat1, mat2)

    def test_fov_affects_matrix(self):
        """Different FOV values produce different matrices."""
        from voxel_engine.engine.rendering import perspective_matrix
        mat1 = perspective_matrix(math.radians(60), 1.0, 0.1, 100)
        mat2 = perspective_matrix(math.radians(90), 1.0, 0.1, 100)
        assert not np.allclose(mat1, mat2)


class TestFPSViewMatrix:
    """Tests for FPS-style view matrix."""

    def test_shape(self):
        """FPS view matrix is 4x4."""
        from voxel_engine.engine.rendering import fps_view_matrix
        pos = np.array([0, 64, 0], dtype=np.float32)
        view = fps_view_matrix(pos, yaw=0, pitch=0)
        assert view.shape == (4, 4)
        assert view.dtype == np.float32

    def test_different_positions(self):
        """Different positions produce different matrices."""
        from voxel_engine.engine.rendering import fps_view_matrix
        pos1 = np.array([0, 64, 0], dtype=np.float32)
        pos2 = np.array([100, 64, 100], dtype=np.float32)
        view1 = fps_view_matrix(pos1, 0, 0)
        view2 = fps_view_matrix(pos2, 0, 0)
        assert not np.allclose(view1, view2)

    def test_rotation_affects_matrix(self):
        """Rotation changes the view matrix."""
        from voxel_engine.engine.rendering import fps_view_matrix
        pos = np.array([0, 64, 0], dtype=np.float32)
        view1 = fps_view_matrix(pos, yaw=0, pitch=0)
        view2 = fps_view_matrix(pos, yaw=math.pi / 2, pitch=0)
        assert not np.allclose(view1, view2)


class TestCamera:
    """Tests for Camera class."""

    def test_default_initialization(self):
        """Camera initializes with sensible defaults."""
        from voxel_engine.engine.rendering import Camera
        cam = Camera()
        assert cam.aspect == 16 / 9
        assert abs(cam.fov - math.radians(75)) < 0.01
        assert cam.near == 0.1
        assert cam.far == 1000.0

    def test_projection_shape(self):
        """Projection matrix has correct shape."""
        from voxel_engine.engine.rendering import Camera
        cam = Camera()
        proj = cam.projection
        assert proj.shape == (4, 4)
        assert proj.dtype == np.float32

    def test_aspect_update(self):
        """Aspect ratio updates correctly."""
        from voxel_engine.engine.rendering import Camera
        cam = Camera()
        cam.set_aspect(1920, 1080)
        assert abs(cam.aspect - 16 / 9) < 0.01

    def test_view_update(self):
        """View matrix updates when position/rotation changes."""
        from voxel_engine.engine.rendering import Camera
        cam = Camera()
        pos = np.array([0, 64, 0], dtype=np.float32)
        view = cam.update_view(pos, 0, 0)
        assert view.shape == (4, 4)
        assert cam.view is not None

    def test_view_projection(self):
        """Combined view-projection matrix is computed correctly."""
        from voxel_engine.engine.rendering import Camera
        cam = Camera()
        pos = np.array([0, 64, 0], dtype=np.float32)
        cam.update_view(pos, 0, 0)
        vp = cam.get_view_projection()
        assert vp.shape == (4, 4)


class TestFrustum:
    """Tests for Frustum culling."""

    def test_contains_point_in_front(self):
        """Point directly in front of camera is visible."""
        from voxel_engine.engine.rendering import (
            Frustum, perspective_matrix, fps_view_matrix
        )

        frustum = Frustum()
        proj = perspective_matrix(math.radians(90), 1.0, 0.1, 100)
        pos = np.array([0, 0, 0], dtype=np.float32)
        view = fps_view_matrix(pos, 0, 0)
        vp = proj @ view
        frustum.update(vp)

        # Point in front (negative Z in OpenGL camera space)
        front_point = np.array([0, 0, -10], dtype=np.float32)
        assert frustum.contains_point(front_point)

    def test_point_behind_not_visible(self):
        """Point behind camera is not visible."""
        from voxel_engine.engine.rendering import (
            Frustum, perspective_matrix, fps_view_matrix
        )

        frustum = Frustum()
        proj = perspective_matrix(math.radians(90), 1.0, 0.1, 100)
        pos = np.array([0, 0, 0], dtype=np.float32)
        view = fps_view_matrix(pos, 0, 0)
        vp = proj @ view
        frustum.update(vp)

        # Point behind (positive Z)
        back_point = np.array([0, 0, 10], dtype=np.float32)
        assert not frustum.contains_point(back_point)

    def test_chunk_at_origin_visible(self):
        """Chunk at origin visible with wide frustum."""
        from voxel_engine.engine.rendering import Frustum

        frustum = Frustum()
        # Set up a very wide frustum that includes origin
        frustum._planes[:] = 0
        frustum._planes[:, 3] = 1000  # All planes far away

        assert frustum.is_chunk_visible(0, 0)

    def test_get_visible_chunks(self):
        """Can get list of visible chunks."""
        from voxel_engine.engine.rendering import Frustum

        frustum = Frustum()
        frustum._planes[:] = 0
        frustum._planes[:, 3] = 10000  # Very wide frustum

        visible = frustum.get_visible_chunks(0, 0, 2)
        assert len(visible) > 0
        assert (0, 0) in visible


class TestTextureAtlas:
    """Tests for texture atlas generation."""

    def test_atlas_dimensions(self):
        """Atlas has correct dimensions."""
        from voxel_engine.engine.rendering import generate_texture_atlas
        from voxel_engine.engine.meshing import (
            NUM_TILES, TILE_SIZE, ATLAS_WIDTH
        )

        atlas = generate_texture_atlas()
        assert atlas.shape == (TILE_SIZE, ATLAS_WIDTH, 4)
        assert atlas.dtype == np.uint8

    def test_atlas_not_empty(self):
        """Atlas contains non-zero data."""
        from voxel_engine.engine.rendering import generate_texture_atlas

        atlas = generate_texture_atlas()
        assert atlas.max() > 0

    def test_atlas_deterministic(self):
        """Atlas generation is deterministic."""
        from voxel_engine.engine.rendering import generate_texture_atlas

        atlas1 = generate_texture_atlas()
        atlas2 = generate_texture_atlas()
        assert np.array_equal(atlas1, atlas2)

    def test_atlas_has_alpha(self):
        """Atlas has alpha channel."""
        from voxel_engine.engine.rendering import generate_texture_atlas

        atlas = generate_texture_atlas()
        # Alpha channel should have some opaque pixels
        assert atlas[:, :, 3].max() == 255


class TestWorldRenderSystem:
    """Tests for WorldRenderSystem."""

    def test_priority(self):
        """WorldRenderSystem has correct priority."""
        from voxel_engine.engine.systems import WorldRenderSystem
        system = WorldRenderSystem(window=None)
        assert system.priority == 100

    def test_default_render_distance(self):
        """Default render distance is reasonable."""
        from voxel_engine.engine.systems import WorldRenderSystem
        system = WorldRenderSystem(window=None)
        assert system.render_distance == 8

    def test_custom_render_distance(self):
        """Custom render distance is accepted."""
        from voxel_engine.engine.systems import WorldRenderSystem
        system = WorldRenderSystem(window=None, render_distance=12)
        assert system.render_distance == 12

    def test_not_initialized_without_window(self):
        """System not initialized without proper window."""
        from voxel_engine.engine.systems import WorldRenderSystem
        system = WorldRenderSystem(window=None)
        assert not system._initialized


class TestShaders:
    """Tests for shader source strings."""

    def test_voxel_vertex_shader_exists(self):
        """Voxel vertex shader is defined."""
        from voxel_engine.engine.rendering import VOXEL_VERTEX_SHADER
        assert isinstance(VOXEL_VERTEX_SHADER, str)
        assert '#version 330' in VOXEL_VERTEX_SHADER
        assert 'void main()' in VOXEL_VERTEX_SHADER

    def test_voxel_fragment_shader_exists(self):
        """Voxel fragment shader is defined."""
        from voxel_engine.engine.rendering import VOXEL_FRAGMENT_SHADER
        assert isinstance(VOXEL_FRAGMENT_SHADER, str)
        assert '#version 330' in VOXEL_FRAGMENT_SHADER
        assert 'void main()' in VOXEL_FRAGMENT_SHADER

    def test_sky_shaders_exist(self):
        """Sky shaders are defined."""
        from voxel_engine.engine.rendering import (
            SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER
        )
        assert isinstance(SKY_VERTEX_SHADER, str)
        assert isinstance(SKY_FRAGMENT_SHADER, str)
        assert 'void main()' in SKY_VERTEX_SHADER
        assert 'void main()' in SKY_FRAGMENT_SHADER

    def test_shaders_have_uniforms(self):
        """Shaders reference expected uniforms."""
        from voxel_engine.engine.rendering import (
            VOXEL_VERTEX_SHADER, VOXEL_FRAGMENT_SHADER
        )
        assert 'u_model' in VOXEL_VERTEX_SHADER
        assert 'u_view' in VOXEL_VERTEX_SHADER
        assert 'u_projection' in VOXEL_VERTEX_SHADER
        assert 'u_texture' in VOXEL_FRAGMENT_SHADER
        assert 'u_fog_color' in VOXEL_FRAGMENT_SHADER


class TestRotationOnlyView:
    """Tests for rotation-only view matrix (skybox)."""

    def test_shape(self):
        """Rotation-only view matrix is 4x4."""
        from voxel_engine.engine.rendering import rotation_only_view
        view = rotation_only_view(0, 0)
        assert view.shape == (4, 4)
        assert view.dtype == np.float32

    def test_no_translation(self):
        """Rotation-only view has no translation."""
        from voxel_engine.engine.rendering import rotation_only_view
        view = rotation_only_view(0, 0)
        # Translation components should be zero
        assert view[0, 3] == 0
        assert view[1, 3] == 0
        assert view[2, 3] == 0

    def test_is_rotation_matrix(self):
        """The 3x3 portion is a valid rotation matrix."""
        from voxel_engine.engine.rendering import rotation_only_view
        view = rotation_only_view(math.pi / 4, math.pi / 6)
        rotation_part = view[:3, :3]
        # Rotation matrices are orthogonal: R^T @ R = I
        identity = rotation_part.T @ rotation_part
        assert np.allclose(identity, np.eye(3), atol=1e-6)


class TestImports:
    """Tests for module imports."""

    def test_rendering_module_imports(self):
        """All rendering module exports import correctly."""
        from voxel_engine.engine.rendering import (
            Camera,
            perspective_matrix,
            fps_view_matrix,
            look_at_matrix,
            rotation_only_view,
            Frustum,
            TextureAtlas,
            generate_texture_atlas,
            create_texture,
            ChunkRenderer,
            ChunkVAO,
            SkyRenderer,
            VOXEL_VERTEX_SHADER,
            VOXEL_FRAGMENT_SHADER,
            SKY_VERTEX_SHADER,
            SKY_FRAGMENT_SHADER,
        )
        # If we get here, all imports succeeded
        assert True

    def test_systems_module_imports(self):
        """All systems module exports import correctly."""
        from voxel_engine.engine.systems import (
            System,
            TickSystem,
            FrameSystem,
            InputSystem,
            PhysicsSystem,
            RenderSystem,
            WorldRenderSystem,
        )
        assert True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
