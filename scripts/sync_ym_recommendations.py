"""Apply only the recommendation feature to ym's three-file standalone UI.

Use a separate worktree checked out on ym. Existing API code is preserved.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def between(text, start, end):
    return text.split(start, 1)[1].split(end, 1)[0].strip()

def sync(target):
    branch = subprocess.check_output(['git','branch','--show-current'],cwd=target,text=True).strip()
    if branch != 'ym':
        raise SystemExit('Target must be a worktree on ym; no other branch is modified.')
    ui = target/'BeautyAI'
    html = (ui/'index.html').read_text(encoding='utf-8')
    css = (ui/'style.css').read_text(encoding='utf-8')
    script = (ui/'script.js').read_text(encoding='utf-8')
    original_script = script
    section = re.search(r'          <section class="glowpick-recommendations.*?</section>',
                        (ROOT/'BeautyAI/index.html').read_text(encoding='utf-8'),re.S).group()
    if 'id="recommendationBox"' in html:
        html = re.sub(r'          <section class="glowpick-recommendations.*?</section>',lambda _:section,html,flags=re.S)
    else:
        anchor = '          <div class="report-heading">'
        if html.count(anchor) != 1: raise SystemExit('Unexpected ym HTML; inspect before applying.')
        html = html.replace(anchor,section+'\n'+anchor,1)
    css_start, css_end = '/* BEGIN GLOWPICK RECOMMENDATIONS */','/* END GLOWPICK RECOMMENDATIONS */'
    styles = css_start+'\n'+between((ROOT/'BeautyAI/style.css').read_text(encoding='utf-8'),css_start,css_end)+'\n'+css_end
    if css_start in css:
        css = re.sub(re.escape(css_start)+'.*?'+re.escape(css_end),lambda _:styles,css,flags=re.S)
    else: css = css.rstrip()+'\n'+styles+'\n'
    catalog = json.loads((ROOT/'data/recommendation_catalog.json').read_text(encoding='utf-8'))
    model = between((ROOT/'BeautyAI/report-model.js').read_text(encoding='utf-8'),
                    '// BEGIN SHARED PRODUCT RECOMMENDATIONS (also embedded in ym\'s standalone script)',
                    '// END SHARED PRODUCT RECOMMENDATIONS').replace('export function','function',1)
    view = between((ROOT/'BeautyAI/script.js').read_text(encoding='utf-8'),
                   '// BEGIN SHARED RECOMMENDATION VIEW (also embedded in ym\'s standalone script)',
                   '// END SHARED RECOMMENDATION VIEW')
    start, end = '// BEGIN YM GLOWPICK RECOMMENDATIONS','// END YM GLOWPICK RECOMMENDATIONS'
    bundle = start+'\nconst RECOMMENDATIONS = '+json.dumps(catalog,ensure_ascii=False,indent=2)+';\n'+model+'\n'+view+'\n'+end
    if start in script:
        script = re.sub(re.escape(start)+'.*?'+re.escape(end),lambda _:bundle,script,flags=re.S)
    else:
        if script.count('function renderReport(data){') != 1: raise SystemExit('Unexpected ym renderer')
        script = script.replace('function renderReport(data){',bundle+'\nfunction renderReport(data){',1)
    call = "  const recommendations=prepareRecommendations(kind,input,complete,data.meta?.isMock===true);\n  renderRecommendations(recommendations);"
    signature = "  const {kind,input,extraction,analysis}=data;const complete=extraction.status==='complete';"
    if call not in script:
        if script.count(signature) != 1: raise SystemExit('Unexpected ym report context')
        script = script.replace(signature,signature+'\n'+call,1)
    old_copy, new_copy = "  lastReportText=textLines.join('\\n');", "  lastReportText=[...textLines,...recommendations.copyLines].join('\\n');"
    if new_copy not in script:
        if script.count(old_copy) != 1: raise SystemExit('Unexpected ym report copy path')
        script = script.replace(old_copy,new_copy,1)
    # First application must leave every unrelated character of the existing client intact.
    if start not in original_script:
        restored = re.sub(re.escape(start)+'.*?'+re.escape(end)+'\n','',script,flags=re.S)
        restored = restored.replace(signature+'\n'+call,signature,1).replace(new_copy,old_copy,1)
        assert restored == original_script, 'Unrelated ym JS changed'
    for name, text in [('index.html',html),('style.css',css),('script.js',script)]:
        (ui/name).write_text(text,encoding='utf-8',newline='\n')
    print('Updated only BeautyAI/index.html, style.css, script.js on ym; original API code preserved.')

if __name__=='__main__':
    sync(Path(sys.argv[1]).resolve())
