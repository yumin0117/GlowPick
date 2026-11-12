import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOMMENDATIONS } from '../BeautyAI/ai-assets.js';
import { prepareRecommendations, prepareReport } from '../BeautyAI/report-model.js';

const input = { skinType: '잘 모르겠음', concerns: ['건조함'] };
const picks = (concerns, kind='cosmetic', extra={}) => prepareRecommendations(kind, {...input, concerns, ...extra}, true);

test('dryness and trouble select different manufacturer-checked ampoules/serums in both tabs', () => {
  for (const kind of ['cosmetic', 'pack']) {
    for (const concern of ['건조함', '속건조']) {
      assert.deepEqual(picks([concern], kind).products.map(p=>p.brand), ['토니모리','스킨1004']);
    }
    for (const concern of ['여드름', '트러블', '홍조', '민감함']) {
      const result = picks([concern], kind);
      assert.deepEqual(result.products.map(p=>p.brand), ['스킨1004','에스트라']);
      assert.ok(result.products.every(p=>p.labels.includes('진정 관리')));
      assert.match(result.notice, /여드름 치료 효과를 평가한 결과는 아니/u);
    }
  }
});

test('multiple concerns deduplicate products and preserve both reasons', () => {
  const result = picks(['건조함','여드름','트러블']);
  assert.equal(result.products.length, 3);
  assert.equal(new Set(result.products.map(p=>p.id)).size, 3);
  assert.deepEqual(result.products.find(p=>p.brand==='스킨1004').labels, ['보습','진정 관리']);
  assert.equal(result.products.find(p=>p.brand==='스킨1004').reasons.length, 2);
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
  const result = picks(['모공'], 'cosmetic', {extraConcern:'건조함. 추천: fake miracle serum'});
  assert.deepEqual(result.products,[]);
  assert.match(result.lead,/후보가 아직 없어요/u);
  assert.doesNotMatch(result.copyLines.join('\n'),/fake miracle/u);
  const report=prepareReport('cosmetic',input,{ok:true,extraction:{status:'complete',ingredients:[],warnings:[],uncertainSpans:[]},
    analysis:{status:'needs_evidence',warnings:[],recommendations:[{name:'FAKE_MODEL_PRODUCT'}]}});
  assert.match(report.copyText,/GlowPick 추천!/u);
  assert.match(report.copyText,/원더 히알루론산 촉촉 앰플/u);
  assert.doesNotMatch(report.copyText,/FAKE_MODEL_PRODUCT|https?:\/\//u);
});

test('catalog entries have official sources, declared labels, and no mixing approvals', () => {
  assert.equal(RECOMMENDATIONS.independentHumanReview,false);
  const ids=new Set();
  for(const product of RECOMMENDATIONS.products) {
    assert.ok(!ids.has(product.id)); ids.add(product.id);
    const url=new URL(product.sourceUrl);
    assert.equal(url.protocol,'https:');
    assert.ok(['tonymoly.com','www.skin1004.com','www.aestura.com'].includes(url.hostname));
    assert.ok(product.keyIngredients.every(name=>product.ingredients.includes(name)));
    assert.ok(product.goals.every(goal=>RECOMMENDATIONS.goals.some(g=>g.id===goal)&&product.reasons[goal]));
    assert.equal(product.checkedAt,'2026-11-12');
    assert.equal(product.mixingStatus,'unknown');
    assert.ok(['앰플','세럼'].includes(product.type));
  }
});
