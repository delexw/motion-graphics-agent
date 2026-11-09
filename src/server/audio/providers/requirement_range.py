"""Checks an installed package against the range its provider's requirements file declares."""
import importlib.metadata
from pathlib import Path

from packaging.requirements import Requirement


def installed_version_within(requirements_file, package):
    lines = Path(requirements_file).read_text(encoding="utf-8").splitlines()
    requirement = next(Requirement(line) for line in lines if Requirement(line).name == package)
    version = importlib.metadata.version(package)
    if not requirement.specifier.contains(version, prereleases=True):
        raise RuntimeError(f"{package} {version} is outside {requirement}; rerun the setup command")
    return version
