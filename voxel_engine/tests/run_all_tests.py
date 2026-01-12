#!/usr/bin/env python3
"""Run all VoxEx start menu tests.

This script runs all unit tests, integration tests, and reports results.

Usage:
    python -m tests.run_all_tests
    # or
    python tests/run_all_tests.py
"""

import sys
import os
import time

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def run_test_module(name, test_func):
    """
    Run a test function and capture results.

    Args:
        name: Display name for the test module.
        test_func: Function that runs tests and returns True/False.

    Returns:
        Tuple of (name, status, duration).
    """
    start_time = time.perf_counter()
    try:
        result = test_func()
        duration = time.perf_counter() - start_time
        status = "PASSED" if result else "FAILED"
    except Exception as e:
        duration = time.perf_counter() - start_time
        status = f"ERROR: {e}"
        import traceback
        traceback.print_exc()

    return (name, status, duration)


def main():
    """Run all test suites."""
    print("=" * 60)
    print("VoxEx Start Menu Test Suite")
    print("=" * 60)
    print()

    results = []
    all_passed = True

    # Import test modules
    test_modules = []

    try:
        from tests.test_ui_components import run_all_component_tests
        test_modules.append(("UI Components", run_all_component_tests))
    except ImportError as e:
        print(f"Could not import test_ui_components: {e}")

    try:
        from tests.test_settings import run_all_settings_tests
        test_modules.append(("Settings System", run_all_settings_tests))
    except ImportError as e:
        print(f"Could not import test_settings: {e}")

    try:
        from tests.test_save_manager import run_all_save_manager_tests
        test_modules.append(("Save Manager", run_all_save_manager_tests))
    except ImportError as e:
        print(f"Could not import test_save_manager: {e}")

    # Run each test module
    for name, test_func in test_modules:
        print(f"\n{'─' * 40}")
        print(f"Running: {name}")
        print('─' * 40)

        module_result = run_test_module(name, test_func)
        results.append(module_result)

        if module_result[1] != "PASSED":
            all_passed = False

    # Print summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    total_time = sum(r[2] for r in results)

    for name, status, duration in results:
        icon = "PASS" if status == "PASSED" else "FAIL"
        print(f"  [{icon}] {name}: {status} ({duration:.2f}s)")

    print(f"\nTotal time: {total_time:.2f}s")
    print("─" * 60)

    if all_passed:
        print("ALL TESTS PASSED")
        return 0
    else:
        print("SOME TESTS FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
