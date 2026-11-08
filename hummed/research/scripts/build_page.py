"""Assemble the listening page: index.html (template + inline data), report.html (the research
report in the same typography) and audio/*.mp3, in site/."""
import json, os, re, shutil, sys
import markdown

SITE = 'site'
os.makedirs(f'{SITE}/audio', exist_ok=True)

data = json.load(open('page_data.json'))
tpl = open('page_template.html', encoding='utf-8').read()
blob = json.dumps(data, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
import html as _html
vm_path = '../work_rec/performance_hummed.mpm'
excerpt = ''
if os.path.exists(vm_path):
    mt = open(vm_path, encoding='utf-8').read()
    st = re.search(r'\s*<vocalStyles>.*?</vocalStyles>', mt, re.S).group(0).strip('\n')
    st_lines = [l if len(l) < 170 else l[:160] + ' …' for l in st.splitlines()]
    st_lines = [l for i, l in enumerate(st_lines) if 'postureDef' not in l or i < 6]
    vmap = re.search(r'\s*<vocalMap.*?</vocalMap>', mt, re.S).group(0).strip('\n').splitlines()
    excerpt = '\n'.join(['    <header>', '      …'] + st_lines + ['    </header>', '    <dated>', '      …  (tempoMap, dynamicsMap, articulationMap, ornamentationMap …)']
                        + vmap[:34] + ['          …', vmap[-1]] + ['    </dated>'])
tpl = tpl.replace('/*VOCALMAP*/', _html.escape(excerpt))
open(f'{SITE}/index.html', 'w', encoding='utf-8').write(tpl.replace('/*DATA*/', blob))
for v in data['versions']:
    shutil.copy(f'mp3/{v["id"]}.mp3', f'{SITE}/audio/{v["id"]}.mp3')

report_md = sys.argv[1] if len(sys.argv) > 1 else None
if report_md and os.path.exists(report_md):
    md = open(report_md, encoding='utf-8').read()
    title = re.search(r'^#\s+(.+)$', md, re.M)
    body = markdown.markdown(md, extensions=['tables', 'fenced_code', 'sane_lists'])
    style = tpl[tpl.index('<style>'):tpl.index('</style>') + 8]
    # keep the tokens and base rules, add the report's reading styles
    extra = """<style>
.report { max-width: 44rem; margin: 0 auto; padding-block: 2.5rem 4rem; display: grid; gap: 1rem; }
.report h1 { font-size: var(--step-3); margin-top: 0.5rem; }
.report h2 { font-size: var(--step-2); margin-top: 1.6rem; }
.report h3 { font-size: var(--step-1); font-family: var(--font-body); font-weight: 600; margin-top: 1rem; }
.report ul, .report ol { margin: 0; padding-left: 1.3rem; display: grid; gap: 0.35rem; }
.report table { border-collapse: collapse; font-size: 0.9rem; width: 100%; }
.report .tw { overflow-x: auto; }
.report th, .report td { border-bottom: 1px solid var(--rule); padding: 0.35rem 0.6rem 0.35rem 0; text-align: left; vertical-align: top; }
.report th { font-family: var(--font-data); font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-2); font-weight: 500; }
.report blockquote { margin: 0; padding-left: 1rem; border-left: 2px solid var(--rule); color: var(--ink-2); }
.report hr { border: 0; border-top: 1px solid var(--rule); width: 100%; }
.back { font-family: var(--font-data); font-size: var(--step--1); }
</style>"""
    body = re.sub(r'<table>', '<div class="tw"><table>', body).replace('</table>', '</table></div>')
    page = (f'<title>{(title.group(1) if title else "Research report")}</title>\n'
            '<meta name="claude:viewport-fit-sides" content="cover">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&display=swap">\n'
            f'{style}\n{extra}\n<div class="report"><p class="back"><a href="index.html">← Träumerei, hummed: the listening page</a></p>\n{body}\n'
            '<p class="back"><a href="index.html">← Back to the listening page</a></p></div>')
    # a standalone page served next to index.html needs its own document skeleton
    doc = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
           '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
           'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
           f'{page}</head><body></body></html>')
    # move the content div into the body
    head, content = doc.split('<div class="report">', 1)
    content = '<div class="report">' + content.replace('</head><body></body></html>', '')
    doc = head + '</head><body>' + content + '</body></html>'
    open(f'{SITE}/report.html', 'w', encoding='utf-8').write(doc)

total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(SITE) for f in fs)
print('site', round(total / 1e6, 1), 'MB,', len(data['versions']), 'versions')
