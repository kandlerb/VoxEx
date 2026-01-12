"""Settings system tests for VoxEx.

Tests GameSettings, SettingsManager, and SettingDefinitions.
"""

import sys
import os
import tempfile

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_game_settings():
    """Test GameSettings serialization and profiles."""
    from engine.settings.game_settings import (
        GameSettings, PerformanceSettings, GraphicsSettings,
        GameplaySettings, WorldSettings, AudioSettings
    )
    from engine.settings.profiles import SETTINGS_PROFILES

    # Test default initialization
    settings = GameSettings()
    assert settings.performance.render_distance == 8
    assert settings.graphics.enable_ao is True
    assert settings.gameplay.walk_speed == 4.0
    assert settings.world.enable_day_night_cycle is True

    # Test to_dict / from_dict round-trip
    data = settings.to_dict()
    restored = GameSettings.from_dict(data)
    assert restored.performance.render_distance == settings.performance.render_distance
    assert restored.graphics.enable_shadows == settings.graphics.enable_shadows
    assert restored.gameplay.fov == settings.gameplay.fov

    # Test profile application
    settings.apply_profile('performance')
    assert settings.performance.render_distance == 4
    assert settings.graphics.enable_ao is False
    assert settings.current_profile == 'performance'

    settings.apply_profile('quality')
    assert settings.performance.render_distance == 12
    assert settings.graphics.enable_ao is True
    assert settings.current_profile == 'quality'

    # Test file save/load
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        temp_path = f.name

    try:
        from pathlib import Path
        settings.performance.render_distance = 10
        settings.save(Path(temp_path))

        loaded = GameSettings.load(Path(temp_path))
        assert loaded is not None
        assert loaded.performance.render_distance == 10
    finally:
        os.unlink(temp_path)

    # Test load non-existent file returns None
    from pathlib import Path
    result = GameSettings.load(Path("/nonexistent/path/settings.json"))
    assert result is None

    # Test get_value and set_value
    settings2 = GameSettings()
    val = settings2.get_value('performance', 'render_distance')
    assert val == 8

    settings2.set_value('performance', 'render_distance', 12)
    assert settings2.performance.render_distance == 12
    assert settings2.current_profile is None  # Custom after manual change

    # Test reset_to_defaults
    settings2.apply_profile('ultra')
    settings2.reset_to_defaults()
    assert settings2.performance.render_distance == 8
    assert settings2.current_profile is None

    print("  GameSettings tests passed")


def test_settings_manager():
    """Test SettingsManager persistence and listeners."""
    from engine.settings.settings_manager import SettingsManager
    from pathlib import Path
    import tempfile
    import os

    # Create temporary settings file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        temp_path = Path(f.name)

    try:
        # Test initialization
        sm = SettingsManager(settings_path=temp_path)
        sm.load()  # Load or create defaults
        assert sm.settings is not None
        assert sm.is_loaded is True

        # Test get/set
        original = sm.get_value('performance', 'render_distance')
        sm.set_value('performance', 'render_distance', 12)
        assert sm.get_value('performance', 'render_distance') == 12

        # Test profile clears on manual change
        sm.apply_profile('balanced')
        assert sm.settings.current_profile == 'balanced'
        sm.set_value('performance', 'render_distance', 6)
        assert sm.settings.current_profile is None  # Custom

        # Test listener notification
        listener_called = {'category': None, 'key': None, 'value': None}

        def on_change(category, key, value):
            listener_called['category'] = category
            listener_called['key'] = key
            listener_called['value'] = value

        sm.add_change_callback(on_change)
        sm.set_value('performance', 'render_distance', 14)
        assert listener_called['value'] == 14
        assert listener_called['key'] == 'render_distance'

        # Test remove callback
        sm.remove_change_callback(on_change)
        listener_called['value'] = None
        sm.set_value('performance', 'render_distance', 10)
        # Should not be called since we removed it
        assert listener_called['value'] is None

        # Test persistence
        sm.save()
        sm2 = SettingsManager(settings_path=temp_path)
        sm2.load()
        assert sm2.get_value('performance', 'render_distance') == 10

        # Test reset to defaults
        sm.reset_to_defaults()
        assert sm.get_value('performance', 'render_distance') == 8

        # Test convenience properties
        sm.render_distance = 15
        assert sm.render_distance == 15

        sm.enable_ao = False
        assert sm.enable_ao is False

        sm.fov = 90
        assert sm.fov == 90

        # Test profile names
        names = sm.get_profile_names()
        assert 'performance' in names
        assert 'balanced' in names
        assert 'quality' in names
        assert 'ultra' in names

    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    print("  SettingsManager tests passed")


def test_setting_definitions():
    """Test setting definitions and category lookup."""
    from engine.settings.profiles import (
        SETTING_DEFINITIONS, SETTINGS_PROFILES, CATEGORY_INFO,
        SettingType, get_definition, get_all_definitions, search_settings
    )

    # Test definitions exist
    assert len(SETTING_DEFINITIONS) > 0

    # Test all categories have definitions
    for category in ['performance', 'graphics', 'gameplay', 'world', 'audio']:
        assert category in SETTING_DEFINITIONS
        assert len(SETTING_DEFINITIONS[category]) > 0

    # Test all definitions have required fields
    all_defs = get_all_definitions()
    for defn in all_defs:
        assert defn.key, f"Definition missing key"
        assert defn.display_name, f"Definition {defn.key} missing display_name"
        assert defn.setting_type, f"Definition {defn.key} missing type"
        assert defn.category, f"Definition {defn.key} missing category"

    # Test specific definition lookup
    render_dist_def = get_definition('performance', 'render_distance')
    assert render_dist_def is not None
    assert render_dist_def.display_name == "Render Distance"
    assert render_dist_def.setting_type == SettingType.SLIDER
    assert render_dist_def.min_value is not None
    assert render_dist_def.max_value is not None

    # Test slider definitions have valid ranges
    for defn in all_defs:
        if defn.setting_type == SettingType.SLIDER:
            assert defn.min_value is not None, f"{defn.key}: missing min_value"
            assert defn.max_value is not None, f"{defn.key}: missing max_value"
            assert defn.min_value < defn.max_value, f"{defn.key}: min >= max"

    # Test dropdown definitions have options
    for defn in all_defs:
        if defn.setting_type == SettingType.DROPDOWN:
            assert defn.options is not None and len(defn.options) > 0, \
                f"{defn.key}: no options"

    # Test search functionality
    results = search_settings("render")
    assert len(results) > 0
    assert any(d.key == 'render_distance' for d in results)

    results = search_settings("shadow")
    assert len(results) > 0

    # Test profiles exist
    assert 'performance' in SETTINGS_PROFILES
    assert 'balanced' in SETTINGS_PROFILES
    assert 'quality' in SETTINGS_PROFILES
    assert 'ultra' in SETTINGS_PROFILES

    # Test category info
    assert 'performance' in CATEGORY_INFO
    assert 'display_name' in CATEGORY_INFO['performance']
    assert 'icon' in CATEGORY_INFO['performance']

    # Test SettingDefinition validate method
    render_dist_def = get_definition('performance', 'render_distance')
    assert render_dist_def.validate(8) is True
    assert render_dist_def.validate(1) is False  # Below min
    assert render_dist_def.validate(100) is False  # Above max

    ao_def = get_definition('graphics', 'enable_ao')
    assert ao_def.validate(True) is True
    assert ao_def.validate(False) is True
    assert ao_def.validate("string") is False

    print("  SettingDefinition tests passed")


def test_time_presets():
    """Test time of day presets."""
    from engine.settings.profiles import TIME_PRESETS

    # Test presets exist
    assert 'dawn' in TIME_PRESETS
    assert 'sunrise' in TIME_PRESETS
    assert 'noon' in TIME_PRESETS
    assert 'sunset' in TIME_PRESETS
    assert 'night' in TIME_PRESETS

    # Test preset structure
    for name, preset in TIME_PRESETS.items():
        assert 'display_name' in preset, f"{name} missing display_name"
        assert 'time' in preset, f"{name} missing time"
        assert 0.0 <= preset['time'] <= 1.0, f"{name} time out of range"

    # Test specific values
    assert TIME_PRESETS['noon']['time'] == 0.5
    assert TIME_PRESETS['night']['time'] == 0.0

    print("  Time presets tests passed")


def run_all_settings_tests():
    """Run all settings tests."""
    print("Running settings tests...\n")

    passed = 0
    failed = 0
    errors = []

    tests = [
        ("GameSettings", test_game_settings),
        ("SettingsManager", test_settings_manager),
        ("SettingDefinitions", test_setting_definitions),
        ("TimePresets", test_time_presets),
    ]

    for name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((name, f"Assertion failed: {e}"))
        except Exception as e:
            failed += 1
            errors.append((name, f"Error: {e}"))
            import traceback
            traceback.print_exc()

    print(f"\nResults: {passed} passed, {failed} failed")

    if errors:
        print("\nFailures:")
        for name, error in errors:
            print(f"  {name}: {error}")
        return False

    print("\nAll settings tests passed!")
    return True


if __name__ == "__main__":
    success = run_all_settings_tests()
    sys.exit(0 if success else 1)
