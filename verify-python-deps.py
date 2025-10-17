#!/usr/bin/env python3
"""
Verify Python dependencies for GBR + LSTM Ensemble System
"""

import sys

def check_package(package_name, import_name=None):
    """Check if a package is installed and importable"""
    if import_name is None:
        import_name = package_name

    try:
        __import__(import_name)
        print(f"✅ {package_name}: OK")
        return True
    except ImportError as e:
        print(f"❌ {package_name}: NOT INSTALLED ({e})")
        return False

def main():
    print("🔍 Verifying Python Dependencies for GBR Ensemble System")
    print("=" * 60)

    packages = [
        ("Python", None),  # Python version check
        ("pandas", "pandas"),
        ("numpy", "numpy"),
        ("scikit-learn", "sklearn"),
        ("xgboost", "xgboost"),
        ("lightgbm", "lightgbm"),
        ("joblib", "joblib")
    ]

    # Check Python version
    print(f"\n📌 Python Version: {sys.version}")
    if sys.version_info >= (3, 8):
        print("✅ Python 3.8+ requirement met")
    else:
        print("❌ Python 3.8+ required")
        return False

    print("\n📦 Checking Required Packages:")
    print("-" * 60)

    all_ok = True
    for package_name, import_name in packages[1:]:  # Skip Python itself
        if not check_package(package_name, import_name):
            all_ok = False

    print("\n" + "=" * 60)
    if all_ok:
        print("✅ ALL DEPENDENCIES INSTALLED SUCCESSFULLY!")
        print("\nYou can now run: node test-gbr-ensemble.js")
        return True
    else:
        print("❌ SOME DEPENDENCIES MISSING")
        print("\nInstall missing packages with:")
        print("  pip install pandas numpy scikit-learn xgboost lightgbm joblib")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
