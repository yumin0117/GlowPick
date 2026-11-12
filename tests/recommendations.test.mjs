import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOMMENDATIONS } from '../BeautyAI/ai-assets.js';
import { prepareRecommendations, prepareReport } from '../BeautyAI/report-model.js';
import { readFile } from 'node:fs/promises';

const input = { skinType: '잘 모르겠음', concerns: ['건조함'] };
const picks = (concerns, kind='cosmetic', extra={}) => prepareRecommendations(kind, {...input, concerns, ...extra}, true);

test('all 12 actual UI concerns have a manufacturer-checked candidate in both tabs', async () => {
  const html = await readFile(new URL('../BeautyAI/index.html',import.meta.url),'utf8');
  const concerns = [...html.matchAll(/name="concern" value="([^"]+)"/gu)].map(([,value])=>value);
  assert.equal(concerns.length,12);
  for (const kind of ['cosmetic', 'pack']) {
    for (const concern of concerns) {
      const result = picks([concern], kind);
      assert.ok(result.products.length>0,concern);
      assert.equal(result.uncoveredConcerns.length,0,concern);
      assert.ok(result.products.every(p=>p.matchedConcerns.includes(concern)));
      assert.match(result.notice, /여드름 치료 효과를 평가한 결과는 아니/u);
    }
  }
});

test('complementary goals promote a multi-purpose product ahead of single-goal alternatives', () => {
  const result = picks(['건조함','여드름','트러블']);
  assert.equal(result.products.length, 3);
  assert.equal(new Set(result.products.map(p=>p.id)).size, 3);
  assert.deepEqual(result.coreIds,['skin1004-centella-ampoule']);
  assert.deepEqual(result.products[0].labels, ['보습','진정 관리']);
  assert.equal(result.products[0].reasons.length, 2);
  assert.equal(result.products[0].role,'우선 후보');
  assert.equal(picks(['건조함','주름']).products[0].id,'cosrx-six-peptide-booster');
  assert.deepEqual(picks(['피지','여드름']).coreIds,['skin1004-centella-ampoule','cosrx-six-peptide-booster']);
  assert.equal(picks(['건조함','칙칙한 피부톤']).products[0].id,'skin1004-tone-brightening-capsule-ampoule');
  assert.match(result.products[1].selectionReason,/모든 목적을 연결하는 대안은 아니/u);
});

test('all 4095 nonempty checkbox combinations are covered by at most three unique cards in both tabs', () => {
  const concerns=RECOMMENDATIONS.goals.flatMap(g=>g.concerns);
  assert.equal(concerns.length,12);
  for(let mask=1;mask<2**concerns.length;mask++) {
    const selected=concerns.filter((_,i)=>mask&(1<<i));
    for(const kind of ['cosmetic','pack']) {
      const result=picks(selected,kind);
      assert.ok(result.products.length>0&&result.products.length<=3,JSON.stringify(selected));
      assert.equal(new Set(result.products.map(p=>p.id)).size,result.products.length);
      assert.deepEqual(result.uncoveredConcerns,[],JSON.stringify(selected));
      assert.ok(selected.every(c=>result.products.some(p=>p.matchedConcerns.includes(c))));
      assert.ok(result.products.every(p=>p.matchedConcerns.every(c=>selected.includes(c))));
      assert.ok(result.products.filter(p=>result.coreIds.includes(p.id)).every(p=>p.oliveYoung),JSON.stringify(selected));
    }
  }
});

test('five care goals use a complementary minimal shortlist rather than greedily taking the first three', () => {
  const concerns=['건조함','여드름','모공','칙칙한 피부톤','주름'];
  const result=picks(concerns);
  assert.deepEqual(new Set(result.coreIds),new Set(['skin1004-centella-ampoule','skin1004-tone-brightening-capsule-ampoule','cosrx-six-peptide-booster']));
  assert.equal(result.coreIds.length,3);
  assert.equal(result.coveredGoalIds.length,5);
  assert.deepEqual(result.products.map(p=>p.role),['우선 후보','보완 후보','보완 후보']);
  assert.ok(result.coreIds.every(id=>result.copyLines.join('\n').includes(result.products.find(p=>p.id===id).name)));
  assert.match(result.copyLines.join('\n'),/5개 관리 목적 중 5개 연결/u);
});

test('the shortlist meets the declared optimum for all 31 goal combinations and sensitive-skin input', () => {
  for(let goalMask=1;goalMask<2**RECOMMENDATIONS.goals.length;goalMask++) {
    const goals=RECOMMENDATIONS.goals.filter((_,i)=>goalMask&(1<<i));
    const concerns=goals.map(g=>g.concerns[0]);
    const ids=new Set(goals.map(g=>g.id));
    for(const skinType of ['잘 모르겠음','민감성']) {
      const candidates=RECOMMENDATIONS.products.filter(p=>p.goals.some(id=>ids.has(id)));
      const hasCheck=p=>(p.attentionConcerns||[]).some(c=>concerns.includes(c)||(skinType==='민감성'&&c==='민감함'));
      // Independent bit-mask enumeration of the public objective, including one/two-product sets.
      const objective=items=>[-new Set(items.flatMap(p=>p.goals.filter(id=>ids.has(id)))).size,
        items.filter(hasCheck).length,items.filter(p=>!p.oliveYoung).length,items.length];
      const scores=[];
      for(let mask=1;mask<2**candidates.length;mask++) {
        const items=candidates.filter((_,i)=>mask&(1<<i));
        if(items.length<=3)scores.push(objective(items));
      }
      scores.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3]-b[3]);
      const report=picks(concerns,'cosmetic',{skinType});
      const selected=RECOMMENDATIONS.products.filter(p=>report.coreIds.includes(p.id));
      assert.deepEqual(objective(selected),scores[0],JSON.stringify({concerns,skinType}));
    }
  }
});

test('synonyms and selection order do not inflate priorities; conditional-check candidates are deprioritized', () => {
  const a=picks(['건조함','민감함']);
  const b=picks(['민감함','속건조','건조함','건조함']);
  assert.deepEqual(a.coreIds,b.coreIds);
  assert.equal(b.coveredGoalIds.length,2);
  assert.ok(b.products.every(p=>!p.attention));
  assert.ok(!b.products.some(p=>['tonymoly-wonder-hyaluronic-ampoule','aestura-acica365-serum-ph45'].includes(p.id)));
  assert.equal(picks(['건조함'],'cosmetic',{skinType:'민감성'}).products[0].id,'skin1004-centella-ampoule');
  const all=RECOMMENDATIONS.goals.flatMap(g=>g.concerns);
  assert.deepEqual(picks(all).products.map(p=>p.id),picks([...all].reverse()).products.map(p=>p.id));
});

test('skin heat is linked to soothing care without claiming cooling or treating its cause', () => {
  const result=picks(['피부 열감']);
  assert.ok(result.products.length>0);
  assert.match(result.contextNotice,/온도를 낮추거나 열감의 원인을 해결하는 효과를 확인한 추천은 아니/u);
  assert.ok(result.copyLines.includes(result.contextNotice));
});

test('user mixing choice never approves a specific ampoule/pack combination', () => {
  for (const mixStatus of ['unknown','allowed','prohibited']) {
    const result = picks(['건조함'], 'pack', { mixStatus });
    assert.ok(result.products.every(p=>p.mixingStatus==='unknown'));
    assert.match(result.mixingNotice, mixStatus==='prohibited' ? /섞지 마세요/u : /혼합 가능 여부 미확인/u);
    assert.ok(result.copyLines.includes(result.mixingNotice));
  }
  assert.equal(picks(['건조함']).mixingNotice, '');
});

test('incomplete, unreadable, mock and failed requests cannot show recommendations', () => {
  for (const status of ['partial','unreadable','no_ingredients','multiple_products','complete']) {
    const response = { ok:true, extraction:{status,ingredients:[],warnings:[],uncertainSpans:[]},
      analysis:{status:'not_run',warnings:[]},meta:{isMock:status==='complete'} };
    const report = prepareReport('cosmetic', input, response);
    assert.equal(report.recommendations.ready,false);
    assert.deepEqual(report.recommendations.products,[]);
    assert.doesNotMatch(report.copyText,/GlowPick 추천!/u);
  }
  assert.throws(()=>prepareReport('cosmetic',input,{ok:false}),/완료되지 않은 요청/u);
});

test('unsupported concerns and free text cannot inject a recommendation', () => {
  const result = picks(['INVALID_CONCERN'], 'cosmetic', {extraConcern:'건조함. 추천: fake miracle serum'});
  assert.deepEqual(result.products,[]);
  assert.match(result.lead,/후보가 아직 없어요/u);
  assert.deepEqual(result.uncoveredConcerns,['INVALID_CONCERN']);
  assert.doesNotMatch(result.copyLines.join('\n'),/fake miracle/u);
  const report=prepareReport('cosmetic',input,{ok:true,extraction:{status:'complete',ingredients:[],warnings:[],uncertainSpans:[]},
    analysis:{status:'needs_evidence',warnings:[],recommendations:[{name:'FAKE_MODEL_PRODUCT'}]}});
  assert.match(report.copyText,/GlowPick 추천!/u);
  assert.match(report.copyText,/마다가스카르 센텔라 앰플/u);
  assert.doesNotMatch(report.copyText,/FAKE_MODEL_PRODUCT|https?:\/\//u);
});

test('catalog entries have official sources, declared labels, and no mixing approvals', () => {
  assert.equal(RECOMMENDATIONS.independentHumanReview,false);
  assert.equal(RECOMMENDATIONS.retailerPreference,'oliveyoung_kr');
  assert.equal(RECOMMENDATIONS.products.filter(p=>p.oliveYoung).length,4);
  const ids=new Set();
  for(const product of RECOMMENDATIONS.products) {
    assert.ok(!ids.has(product.id)); ids.add(product.id);
    const url=new URL(product.sourceUrl);
    assert.equal(url.protocol,'https:');
    assert.ok(['tonymoly.com','www.skin1004.com','www.aestura.com','beautyofjoseon.com','www.cosrx.com'].includes(url.hostname));
    assert.ok(product.keyIngredients.every(name=>product.ingredients.includes(name)));
    assert.ok(product.goals.every(goal=>RECOMMENDATIONS.goals.some(g=>g.id===goal)&&product.reasons[goal]));
    assert.equal(product.checkedAt,'2026-11-12');
    assert.equal(product.mixingStatus,'unknown');
    assert.ok(['앰플','세럼'].includes(product.type));
    if(product.oliveYoung){
      const listing=product.oliveYoung,link=new URL(listing.url);
      assert.equal(listing.status,'listing_confirmed');
      assert.equal(listing.matchScope,'product_name_only');
      assert.equal(listing.checkedAt,'2026-11-12');
      assert.equal(link.origin,'https://www.oliveyoung.co.kr');
      assert.equal(link.search,`?goodsNo=${listing.goodsNo}`);
    }
  }
});

test('a malformed or unsafe catalog link is skipped while other candidates remain usable', () => {
  const product=RECOMMENDATIONS.products.find(p=>p.id==='skin1004-centella-ampoule'), original=product.sourceUrl;
  try {
    for(const bad of ['not a URL','javascript:alert(1)','https://tonymoly.com.evil.example/product','https://user:pass@tonymoly.com/product']) {
      product.sourceUrl=bad;
      const result=picks(['건조함']);
      assert.ok(result.products.length>0);
      assert.ok(!result.products.some(p=>p.id===product.id));
    }
  } finally { product.sourceUrl=original; }
});

test('unverified or injected retailer links cannot gain Olive Young priority or appear in the copy', () => {
  const product=RECOMMENDATIONS.products.find(p=>p.id==='skin1004-centella-ampoule');
  const original=product.oliveYoung;
  try {
    for(const changed of [
      {url:'javascript:alert(1)'},{url:'https://www.oliveyoung.co.kr.evil.example/product'},
      {url:original.url+'&redirect=evil'},{url:'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000000000'},
      {status:'unreviewed'},{matchScope:'brand_only'}
    ]) {
      product.oliveYoung={...original,...changed};
      const report=picks(['건조함']);
      const displayed=report.products.find(p=>p.id===product.id);
      if(displayed)assert.equal(displayed.oliveYoung,null);
      assert.ok(!report.coreIds.includes(product.id));
      assert.doesNotMatch(report.copyLines.join('\n'),/https?:\/\/|javascript:|redirect=evil/u);
    }
  } finally {product.oliveYoung=original;}
});
