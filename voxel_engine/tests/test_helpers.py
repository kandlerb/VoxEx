"""Test helpers for loading modules without triggering package __init__.

The engine/__init__.py imports state modules which require numpy.
These helpers allow loading UI and settings modules directly for testing
without requiring numpy to be installed.
"""

import importlib.util
import os
import sys
import types

# Get directory paths
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PACKAGE_DIR = os.path.dirname(TESTS_DIR)  # voxel_engine/
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)  # VoxEx/

# Ensure paths are set up
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)


def _ensure_package(package_name):
    """
    Ensure a package exists in sys.modules.

    Creates stub packages if needed to support relative imports.
    """
    parts = package_name.split('.')
    for i in range(len(parts)):
        pkg_name = '.'.join(parts[:i+1])
        if pkg_name not in sys.modules:
            pkg = types.ModuleType(pkg_name)
            pkg.__path__ = []
            pkg.__package__ = pkg_name
            sys.modules[pkg_name] = pkg


def load_module(module_path, module_name=None, package=None):
    """
    Load a Python module directly from file path.

    This bypasses package __init__.py files, allowing us to load
    individual modules without triggering imports of numpy-dependent code.

    Args:
        module_path: Relative path to module file (from PACKAGE_DIR).
        module_name: Optional fully qualified module name.
        package: Optional package name for relative imports.

    Returns:
        The loaded module.
    """
    full_path = os.path.join(PACKAGE_DIR, module_path)

    if module_name is None:
        # Convert path to module name
        # e.g., 'engine/ui/text_input.py' -> 'engine.ui.text_input'
        rel_path = module_path.replace('.py', '').replace('/', '.').replace('\\', '.')
        module_name = rel_path

    # Ensure parent packages exist
    if '.' in module_name:
        parent_pkg = '.'.join(module_name.split('.')[:-1])
        _ensure_package(parent_pkg)
        package = parent_pkg

    # Check if already loaded
    if module_name in sys.modules:
        return sys.modules[module_name]

    spec = importlib.util.spec_from_file_location(
        module_name,
        full_path,
        submodule_search_locations=[]
    )
    module = importlib.util.module_from_spec(spec)

    # Set package for relative imports
    if package:
        module.__package__ = package

    # Register in sys.modules BEFORE executing (for circular imports)
    sys.modules[module_name] = module

    try:
        spec.loader.exec_module(module)
    except Exception:
        # Remove from sys.modules if loading failed
        if module_name in sys.modules:
            del sys.modules[module_name]
        raise

    return module


# Pre-load commonly used modules for easy access
# These are loaded lazily to avoid import errors if files are missing

_cached_modules = {}


def get_text_input():
    """Get TextInput class."""
    if 'TextInput' not in _cached_modules:
        mod = load_module('engine/ui/text_input.py')
        _cached_modules['TextInput'] = mod.TextInput
    return _cached_modules['TextInput']


def get_checkbox():
    """Get Checkbox class."""
    if 'Checkbox' not in _cached_modules:
        mod = load_module('engine/ui/checkbox.py')
        _cached_modules['Checkbox'] = mod.Checkbox
    return _cached_modules['Checkbox']


def get_slider():
    """Get Slider class."""
    if 'Slider' not in _cached_modules:
        mod = load_module('engine/ui/slider.py')
        _cached_modules['Slider'] = mod.Slider
    return _cached_modules['Slider']


def get_dropdown():
    """Get Dropdown class."""
    if 'Dropdown' not in _cached_modules:
        mod = load_module('engine/ui/dropdown.py')
        _cached_modules['Dropdown'] = mod.Dropdown
    return _cached_modules['Dropdown']


def get_collapsible():
    """Get CollapsibleSection class."""
    if 'CollapsibleSection' not in _cached_modules:
        mod = load_module('engine/ui/collapsible.py')
        _cached_modules['CollapsibleSection'] = mod.CollapsibleSection
    return _cached_modules['CollapsibleSection']


def get_modal():
    """Get Modal, ConfirmDialog, ModalResult classes."""
    if 'Modal' not in _cached_modules:
        mod = load_module('engine/ui/modal.py')
        _cached_modules['Modal'] = mod.Modal
        _cached_modules['ConfirmDialog'] = mod.ConfirmDialog
        _cached_modules['ModalResult'] = mod.ModalResult
    return _cached_modules['Modal'], _cached_modules['ConfirmDialog'], _cached_modules['ModalResult']


def get_progress_bar():
    """Get ProgressBar class."""
    if 'ProgressBar' not in _cached_modules:
        mod = load_module('engine/ui/progress_bar.py')
        _cached_modules['ProgressBar'] = mod.ProgressBar
    return _cached_modules['ProgressBar']


def get_profiles():
    """Get settings profiles and definitions.

    Must be loaded BEFORE game_settings due to relative import dependencies.
    """
    if 'SETTINGS_PROFILES' not in _cached_modules:
        mod = load_module('engine/settings/profiles.py')
        _cached_modules['profiles_module'] = mod
        _cached_modules['SETTINGS_PROFILES'] = mod.SETTINGS_PROFILES
        _cached_modules['TIME_PRESETS'] = mod.TIME_PRESETS
        _cached_modules['SETTING_DEFINITIONS'] = mod.SETTING_DEFINITIONS
        _cached_modules['CATEGORY_INFO'] = mod.CATEGORY_INFO
        _cached_modules['SettingType'] = mod.SettingType
        _cached_modules['SettingDefinition'] = mod.SettingDefinition
        _cached_modules['get_definition'] = mod.get_definition
        _cached_modules['get_all_definitions'] = mod.get_all_definitions
        _cached_modules['search_settings'] = mod.search_settings
    return _cached_modules


def get_game_settings():
    """Get GameSettings and related classes.

    Automatically loads profiles first to resolve dependencies.
    """
    if 'GameSettings' not in _cached_modules:
        # Load profiles first (game_settings depends on it)
        get_profiles()
        mod = load_module('engine/settings/game_settings.py')
        _cached_modules['GameSettings'] = mod.GameSettings
        _cached_modules['PerformanceSettings'] = mod.PerformanceSettings
        _cached_modules['GraphicsSettings'] = mod.GraphicsSettings
        _cached_modules['GameplaySettings'] = mod.GameplaySettings
        _cached_modules['WorldSettings'] = mod.WorldSettings
        _cached_modules['AudioSettings'] = mod.AudioSettings
    return _cached_modules['GameSettings']


def get_settings_manager():
    """Get SettingsManager class.

    Automatically loads game_settings first to resolve dependencies.
    """
    if 'SettingsManager' not in _cached_modules:
        # Load dependencies first
        get_game_settings()
        mod = load_module('engine/settings/settings_manager.py')
        _cached_modules['SettingsManager'] = mod.SettingsManager
    return _cached_modules['SettingsManager']


def get_save_manager():
    """Get SaveManager class.

    Loads all persistence dependencies first to resolve imports.

    Note: SaveManager requires numpy (via compression.py).
    Returns None if numpy is not available.
    """
    if 'SaveManager' not in _cached_modules:
        try:
            # Load all dependencies in order
            # save_manager imports: constants, compression, save_data, chunk_tracker
            load_module('engine/persistence/constants.py')
            load_module('engine/persistence/compression.py')
            load_module('engine/persistence/save_data.py')
            load_module('engine/persistence/chunk_tracker.py')
            mod = load_module('engine/persistence/save_manager.py')
            _cached_modules['SaveManager'] = mod.SaveManager
        except ModuleNotFoundError as e:
            if 'numpy' in str(e):
                _cached_modules['SaveManager'] = None
            else:
                raise
    return _cached_modules['SaveManager']


def is_numpy_available():
    """Check if numpy is available."""
    try:
        import numpy
        return True
    except ImportError:
        return False
