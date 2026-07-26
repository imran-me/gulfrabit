import pathlib, re, sys, collections
sys.stdout.reconfigure(encoding='utf-8')

BS = chr(92)                       # avoids shell/heredoc backslash mangling
PATTERN = re.compile('use' + r'\s+' + 'Modules' + re.escape(BS) + r'(\w+)')

deps = collections.defaultdict(set)
for f in pathlib.Path('modules').rglob('*.php'):
    mod = f.parts[1].lower()
    for m in PATTERN.finditer(f.read_text(encoding='utf-8')):
        target = m.group(1).lower()
        if target != mod:
            deps[mod].add(target)

for k in sorted(deps):
    print(f'  {k:<10} depends on -> {sorted(deps[k])}')

cycles = sorted({tuple(sorted((a, b))) for a in deps for b in deps[a] if a in deps.get(b, set())})
print()
print('  cycles:', cycles if cycles else 'none - dependency graph is one-way')
