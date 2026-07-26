"""Structural sanity check for the module PHP.

There is no php binary on this machine, so this is not a parser — it catches the
classes of mistake that are cheap to make and expensive to discover later:
missing opener, unbalanced delimiters, a namespace that does not match its PSR-4
path, and imports that nothing uses.
"""
import pathlib, re, sys

sys.stdout.reconfigure(encoding='utf-8')
BS = chr(92)

USE_RE = re.compile('^use' + r'\s+' + '([A-Za-z0-9_' + re.escape(BS) + ']+)' + ';', re.M)
NS_RE = re.compile('^namespace' + r'\s+' + '([^;]+);', re.M)

issues = []
count = 0

for f in sorted(pathlib.Path('.').rglob('*.php')):
    if '.git' in f.parts or 'vendor' in f.parts:
        continue
    count += 1
    src = f.read_text(encoding='utf-8')
    rel = str(f).replace(BS, '/')

    if not src.startswith('<?php'):
        issues.append(f'{rel}: missing <?php opener')
    if src.count('{') != src.count('}'):
        issues.append(f'{rel}: brace mismatch {src.count("{")}/{src.count("}")}')
    if src.count('(') != src.count(')'):
        issues.append(f'{rel}: paren mismatch')

    ns = NS_RE.search(src)
    if ns and 'modules' in f.parts:
        module = f.parts[f.parts.index('modules') + 1]
        expected = 'Modules' + BS + module.capitalize()
        if not ns.group(1).strip().startswith(expected):
            issues.append(f'{rel}: namespace {ns.group(1).strip()} does not match {expected}')

    # unused imports — noise that misleads the next reader
    for m in USE_RE.finditer(src):
        fqcn = m.group(1)
        short = fqcn.split(BS)[-1]
        body = src[m.end():]
        if not re.search(r'\b' + re.escape(short) + r'\b', body):
            issues.append(f'{rel}: unused import {fqcn}')

print(f'  {count} PHP files checked')
print(f'  issues: {len(issues)}')
for i in issues:
    print('   !', i)
sys.exit(1 if issues else 0)
