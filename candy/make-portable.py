"""Zip the built program into a folder that runs as it is.

Two things this does that the obvious tools do not.

The interface is added from build\\html rather than picked up inside build\\Cef. That
one is a junction to the other, and os.walk does not descend into junctions - walking
build\\Cef on its own quietly produces an archive with no interface in it.

And it is written from Python rather than PowerShell's Compress-Archive, which stores
non-ASCII entry names without the UTF-8 flag. The readme inside is called 使用说明.txt,
so that flag is the difference between a name and a row of question marks.

Run it from the repository root, after the frontend and the host have been built:

    python candy/make-portable.py
"""

import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'build' / 'Cef'
HTML = ROOT / 'build' / 'html'
README = ROOT / 'candy' / 'portable-readme.txt'

SKIP_DIRS = {'html'}
SKIP_SUFFIXES = {'.pdb', '.log'}


def add_tree(archive, source, prefix=''):
    """
    @type archive: zipfile.ZipFile
    @type source: Path
    @type prefix: str
    @rtype: int
    """
    count = 0
    for root, dirs, files in os.walk(source):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            full = Path(root) / name
            if full.suffix.lower() in SKIP_SUFFIXES:
                continue
            rel = full.relative_to(source)
            archive.write(full, str(Path(prefix) / rel) if prefix else str(rel))
            count += 1
    return count


def main():
    """ @rtype: int """
    if not (SOURCE / 'VRCX-Candy.exe').exists():
        print(f'no VRCX-Candy.exe in {SOURCE} - build the host first', file=sys.stderr)
        return 1
    if not (HTML / 'index.html').exists():
        print(f'no index.html in {HTML} - build the frontend first', file=sys.stderr)
        return 1

    version = (ROOT / 'Version').read_text(encoding='utf-8').strip()
    target = ROOT / f'VRCX-Candy-{version}-portable.zip'

    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        host = add_tree(archive, SOURCE)
        pages = add_tree(archive, HTML, 'html')
        archive.write(README, '使用说明.txt')

    size = target.stat().st_size / 1024 / 1024
    print(f'{target.name}: {host} program files + {pages} interface files, {size:.0f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
