"""Pytest configuration for VoxEx tests.

Sets up the Python path so imports work correctly.
"""

import sys
import os

# Get directory paths
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PACKAGE_DIR = os.path.dirname(TESTS_DIR)  # voxel_engine/
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)  # VoxEx/

# Add both paths to allow different import styles
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)
