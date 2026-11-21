#!/usr/bin/env python3
"""Builds guide.js (the in-app user guide) from USER_GUIDE.md. Run from the repo root: python3 tools/build_guide.py
Same shape as rules.js: window.BSH_GUIDE = { title, html }, with a clickable contents list and ^ CONTENTS links."""
import json, re, markdown

src = open('USER_GUIDE.md', encoding='utf-8').read().replace('\r\n', '\n')
m = re.match(r'#\s+(.+)\n', src)
title = m.group(1).strip()
body = src[m.end():]

# python-markdown needs a blank line before a list
out, prev = [], ''
for line in body.split('\n'):
    is_item = re.match(r'\s*([-*]|\d+\.)\s', line)
    was_item = re.match(r'\s*([-*]|\d+\.)\s', prev) or prev.startswith('  ')
    if is_item and prev.strip() and not was_item:
        out.append('')
    out.append(line); prev = line
html = markdown.markdown('\n'.join(out), extensions=['tables'])

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', re.sub(r'<[^>]+>', '', s).lower()).strip('-')
heads = []
def head(mm):
    text = mm.group(1); sid = 'guide-' + slug(text); heads.append((sid, text))
    return ('<h2 id="%s">%s<a class="totop" href="#guide" data-goto="guide-top" aria-label="Back to contents">^ CONTENTS</a></h2>' % (sid, text))
html = re.sub(r'<h2>(.*?)</h2>', head, html)
toc = ('<nav class="rtoc" id="guide-top" aria-label="Table of contents"><h2>Contents</h2><ul>' +
       ''.join('<li><a href="#guide" data-goto="%s">%s</a></li>' % h for h in heads) + '</ul></nav>')
html = toc + html

open('guide.js', 'w', encoding='utf-8').write(
    '/* The in-app user guide, built from USER_GUIDE.md by tools/build_guide.py. Generated; do not edit by hand. */\n'
    'window.BSH_GUIDE = { title: %s, html: %s };\n' % (json.dumps(title, ensure_ascii=False), json.dumps(html, ensure_ascii=False)))
print(len(heads), 'sections,', len(html), 'chars')
