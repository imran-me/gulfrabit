r"""
Which module depends on which, and whether any two depend on each other.

SCANS BOTH LAYERS. It used to read only PHP `use Modules\X` statements, which
missed the entire browser half of the build — modules/admin/categories-page.js
importing modules/media/media-picker.js is exactly the kind of edge that
creates a cycle, and it was invisible here.

A cycle is not a style complaint. The locked architecture is that deleting a
module folder cuts off that one feature; two modules importing each other means
deleting either breaks both.

STATIC vs DYNAMIC IMPORTS ARE REPORTED SEPARATELY, because they are not the
same promise. A static `import` at the top of a file makes the importer fail to
load when the target is missing. A dynamic `await import(...).catch(...)` is
explicitly prepared for it. So a dynamic edge is listed but never counted as a
cycle — it is the sanctioned way for a screen to use an optional module.
"""
import collections
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

BS = chr(92)                       # avoids shell/heredoc backslash mangling
PHP_USE = re.compile('use' + r'\s+' + 'Modules' + re.escape(BS) + r'(\w+)')

# import … from '/modules/x/…'  |  import('/modules/x/…')  |  '../x/…'
JS_STATIC = re.compile(r"""(?:^|\n)\s*import\s
                           (?:[^'"\n]*?\sfrom\s)?          # skip the binding list
                           ['"]([^'"]+)['"]""", re.X)
JS_DYNAMIC = re.compile(r"""import\s*\(\s*['"]([^'"]+)['"]""")

ROOT = pathlib.Path('modules')

static = collections.defaultdict(set)
dynamic = collections.defaultdict(set)


def target_of(spec: str, source: pathlib.Path) -> str | None:
    """The module a JS import specifier points at, or None if not a module."""
    if spec.startswith('/modules/'):
        return spec.split('/')[2].lower()

    if spec.startswith('.'):
        resolved = (source.parent / spec).resolve()
        try:
            parts = resolved.relative_to(ROOT.resolve()).parts
        except ValueError:
            return None
        return parts[0].lower() if parts else None

    return None                    # bare specifier or a URL — not ours


for f in ROOT.rglob('*.php'):
    mod = f.parts[1].lower()
    for m in PHP_USE.finditer(f.read_text(encoding='utf-8')):
        if (t := m.group(1).lower()) != mod:
            static[mod].add(t)

for f in ROOT.rglob('*.js'):
    mod = f.parts[1].lower()
    text = f.read_text(encoding='utf-8')

    for m in JS_STATIC.finditer(text):
        if (t := target_of(m.group(1), f)) and t != mod:
            static[mod].add(t)

    for m in JS_DYNAMIC.finditer(text):
        if (t := target_of(m.group(1), f)) and t != mod:
            dynamic[mod].add(t)

for k in sorted(set(static) | set(dynamic)):
    hard = sorted(static.get(k, ()))
    soft = sorted(dynamic.get(k, set()) - static.get(k, set()))
    line = f'  {k:<10} depends on -> {hard}'
    if soft:
        line += f'  (optional: {soft})'
    print(line)

cycles = sorted({
    tuple(sorted((a, b)))
    for a in static for b in static[a]
    if a in static.get(b, set())
})

print()

if cycles:
    print('  CYCLES — each of these pairs cannot be removed independently:')
    for a, b in cycles:
        print(f'    {a} <-> {b}')
    print()
    print('  Fix by making one direction a dynamic import with a fallback,')
    print('  the way modules/admin/categories-page.js loads media.')
    sys.exit(1)

print('  cycles: none - dependency graph is one-way')
