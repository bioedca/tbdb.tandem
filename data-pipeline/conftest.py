"""Make the modules in ``data-pipeline/`` importable by the test suite no matter
which directory pytest is invoked from (CI runs from the repo root; locally the
suite is run from here -- see CLAUDE.md section 2). Inserting this directory on
``sys.path`` lets the tests ``import wuss`` (and later ``import build_json``)
without packaging the pipeline.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
