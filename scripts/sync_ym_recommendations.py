"""Compatibility entry point for the current three-file ym bundle."""
import subprocess
import sys
from pathlib import Path

if __name__ == '__main__':
    subprocess.run(['node', str(Path(__file__).with_name('build-ym.mjs')), sys.argv[1]], check=True)
