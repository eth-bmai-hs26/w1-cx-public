"""Everything the universal-approximation notebook needs, in one statement.

The notebook has a single setup cell, and all it does is run this file. That is deliberate:
the notebook's cells should be about neural networks, not about bootstrapping one. This
module

  1. installs NumPy, pandas and matplotlib if they are missing (on Colab they are not),
  2. writes out `universal_approximation_utils.py` and `universal_approximation_ui.py`
     from the copy embedded in the notebook, if they are not already alongside it,
  3. imports both of them, plus NumPy, pandas and matplotlib, and
  4. applies the shared house style.

It is run two ways, and works both:

  * From the notebook, as `exec(<this source>)` inside the setup cell. Executed at cell
    level, the star-imports below land directly in the notebook's namespace, and the
    embedded bundle is read from the `_FILES` variable the cell defines.
  * Locally, as `from universal_approximation_setup import *`, with the other two modules
    sitting next to it. There is no bundle then, and step 2 is skipped.
"""

import warnings

warnings.filterwarnings('ignore')

_REQUIRED_PACKAGES = ('numpy', 'pandas', 'matplotlib')
_ENGINE_MODULES = ('universal_approximation_utils', 'universal_approximation_ui')


def _install_missing_packages():
    """Install the third-party packages this notebook needs, if any are absent.

    Colab ships all of them, so this is normally a no-op. There is nothing else to
    install: the whole point of the notebook is that a neural network needs only NumPy.

    Returns:
        List of package names that had to be installed.
    """
    import importlib.util
    import subprocess
    import sys

    missing = [name for name in _REQUIRED_PACKAGES
               if importlib.util.find_spec(name) is None]
    if missing:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', *missing],
                       check=True)
    return missing


def _importable(name):
    """Whether a module can be found on disk right now, ignoring what is already loaded.

    Args:
        name: Module name to look for.

    Returns:
        True if an import would succeed.
    """
    import importlib.util
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def _drop_stale_imports():
    """Forget any copy of the engine modules this kernel has already imported.

    A notebook kernel outlives the files it imported from. Without this, re-running the
    setup cell after the modules changed, whether by a `git pull`, an edit or a fresh
    build, keeps handing back the version imported the first time, and the notebook fails
    further down with an ImportError about a name that is plainly there in the file.
    Dropping them makes this cell mean "give me the current code", which is what a setup
    cell should mean.

    Returns:
        List of module names that were dropped.
    """
    import sys
    dropped = [name for name in _ENGINE_MODULES if name in sys.modules]
    for name in dropped:
        del sys.modules[name]
    return dropped


def _unpack_modules(bundle):
    """Write the engine and display modules to disk when they cannot be imported.

    Args:
        bundle: Base64 text of a gzipped JSON mapping of filename to source, as embedded
            in the notebook's setup cell, or ``None`` when running from a checkout.

    Returns:
        True if any file was written.

    Raises:
        ImportError: If the modules are missing and no bundle was supplied.
    """
    import importlib
    import os

    if all(_importable(name) for name in _ENGINE_MODULES):
        return False
    if not bundle:
        raise ImportError(
            'universal_approximation_utils.py and universal_approximation_ui.py are not '
            'importable, and no embedded copy was supplied. Clone the course repo, or '
            'run this from the notebook, whose setup cell carries both files.')

    import base64
    import json
    import zlib

    written = False
    for name, source in json.loads(zlib.decompress(base64.b64decode(bundle))).items():
        if not os.path.exists(name):
            with open(name, 'w', encoding='utf-8') as handle:
                handle.write(source)
            written = True
    if written:
        # Python caches the directory listing it uses to resolve imports, so a module
        # created after that scan is invisible without this.
        importlib.invalidate_caches()
    return written


_installed = _install_missing_packages()
if _installed:
    print(f'📦 Installed {", ".join(_installed)}.')
_drop_stale_imports()
if _unpack_modules(globals().get('_FILES')):
    print('🛟 Unpacked the offline copies of the engine and the display layer.')

import matplotlib.pyplot as plt                                          # noqa: E402
import numpy as np                                                       # noqa: E402
import pandas as pd                                                      # noqa: E402

import universal_approximation_ui as _ui                                 # noqa: E402
import universal_approximation_utils as _engine                          # noqa: E402
from universal_approximation_ui import *                                 # noqa: E402,F403
from universal_approximation_utils import *                              # noqa: E402,F403

house_style()                                                            # noqa: F405
np.set_printoptions(precision=1, suppress=True)

__all__ = ['np', 'pd', 'plt'] + list(_engine.__all__) + list(_ui.__all__)

print(f'✅ Setup complete · NumPy {np.__version__} · '
      f'RANDOM_STATE = {_engine.RANDOM_STATE} · no deep-learning framework in sight.')
