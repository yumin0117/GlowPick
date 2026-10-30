"""외부 패키지 없이 정답과 추출 JSON을 비교합니다."""
import json, unicodedata, re
from collections import Counter

STATUSES = {'complete','partial','unreadable','no_ingredients','multiple_products'}

def normalize(s):
    if not isinstance(s, str) or not s.strip():
        raise ValueError('성분은 빈 문자열이 아닌 글자여야 합니다.')
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', s)).strip().rstrip('.').strip().lower()

def distance(a, b):
    row = list(range(len(b)+1))
    for i, x in enumerate(a, 1):
        nxt = [i]
        for j, y in enumerate(b, 1):
            nxt.append(min(nxt[-1]+1, row[j]+1, row[j-1]+(x != y)))
        row = nxt
    return row[-1]

def validate(r):
    if not isinstance(r, dict):
        raise ValueError('JSON 객체가 필요합니다.')
    if r.get('status') not in STATUSES:
        raise ValueError('알 수 없는 status')
    for k in ['ingredients','uncertainSpans','warnings']:
        if not isinstance(r.get(k), list) or any(not isinstance(x,str) or not x.strip() for x in r[k]):
            raise ValueError(k+' 문자열 배열 필요')
    if not isinstance(r.get('rawText'),str):
        raise ValueError('rawText 문자열 필요')
    if r['status']=='complete' and (not r['rawText'].strip() or not r['ingredients'] or r['uncertainSpans']):
        raise ValueError('불완전한 응답을 complete로 표시했습니다.')
    if r['status'] in {'unreadable','no_ingredients','multiple_products'} and r['ingredients']:
        raise ValueError('확정할 수 없는 목록은 비워야 합니다.')
    if r['status']!='complete' and (not isinstance(r.get('nextAction'),str) or not r['nextAction'].strip()):
        raise ValueError('재촬영 또는 대상 선택 안내 필요')
    return r

def compare(gold, response):
    validate(response)
    expected = gold['ingredients']
    if not expected:
        raise ValueError('정답 없는 사례의 성분 점수는 계산하지 않습니다.')
    a, b = list(map(normalize,expected)), list(map(normalize,response['ingredients']))
    ca, cb = Counter(a), Counter(b)
    matched = sum((ca & cb).values())
    # 공통 성분의 순서 비교. 단순 누락 자체를 순서 오류로 세지 않습니다.
    row = [0]*(len(b)+1)
    for x in a:
        nxt = [0]
        for j,y in enumerate(b,1):
            nxt.append(row[j-1]+1 if x==y else max(row[j],nxt[-1]))
        row=nxt
    raw_gold = normalize(gold['raw_text'])
    raw_out = normalize(response['rawText']) if response['rawText'].strip() else ''
    return dict(missing=list((ca-cb).elements()), extra=list((cb-ca).elements()),
                precision=matched/len(b) if b else None, recall=matched/len(a),
                cer=distance(raw_gold,raw_out)/len(raw_gold), order_error=row[-1]<matched,
                exact_sequence=a==b, status_match=response['status']=='complete',
                pass_all=a==b and response['status']=='complete')

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('pair_id');p.add_argument('response');args=p.parse_args()
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    gold=next(x for x in json.loads((root/'data/pairs.json').read_text(encoding='utf-8')) if x['pair_id']==args.pair_id)
    response=json.loads(Path(args.response).read_text(encoding='utf-8-sig'))
    print(json.dumps(compare(gold,response),ensure_ascii=False,indent=2))
