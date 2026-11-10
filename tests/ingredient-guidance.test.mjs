import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS, GUIDANCE } from '../BeautyAI/ai-assets.js';
import { prepareReport } from '../BeautyAI/report-model.js';
function report(names, concerns=['건조함'], status='complete', mock=false) {
  const sources=CLAIMS.filter(c=>names.includes(c.ingredient));
  return prepareReport('cosmetic',{skinType:'잘 모르겠음',concerns},{ok:true,
    extraction:{status,ingredients:names,rawText:names.join(', '),warnings:[],uncertainSpans:[],nextAction:''},
    analysis:{status:sources.length?'reference_only':'needs_evidence',summary:'일반 기능',sources,ingredientNotes:[],warnings:[]},meta:{isMock:mock}});
}
test('a Korean label shows several reviewed moisturizers even if the model omits notes',()=>{
  const r=report(['글리세린','부틸렌글라이콜','베타인','소듐하이알루로네이트','세라마이드엔피','알란토인','NEW']);
  assert.equal(r.notes.length,6);assert.equal(r.helpful.length,5);
  assert.deepEqual(r.unknown,['NEW']);
});
test('fragrance and ethanol are conditional guidance, not an unsafe-product verdict',()=>{
  const r=report(['향료','리모넨','에탄올','세테아릴알코올','베헤닐알코올','페녹시에탄올','1,2-헥산다이올']);
  assert.deepEqual(r.cautions.map(x=>x.ingredient),['향료','리모넨','에탄올']);
  assert.equal(report(['에탄올'],['모공']).cautions.length,0);
  assert.match(r.copyText,/향료.*민감/u);
  assert.doesNotMatch(r.copyText,/https?:\/\//u);
});
test('exact aliases do not confuse similar extracts, derivatives or fatty alcohols',()=>{
  const r=report(['Sodium Hyaluronate','Hydrolyzed Sodium Hyaluronate','Betaine Salicylate','시트릭애씨드','Cetearyl Alcohol']);
  assert.equal(r.helpful.length,1);assert.equal(r.cautions.length,0);
  assert.deepEqual(r.unknown.slice(0,2),['Hydrolyzed Sodium Hyaluronate','Betaine Salicylate']);
});
test('unreadable, partial and mock labels cannot generate ingredient classifications',()=>{
  for(const [status,mock] of [['partial',false],['unreadable',false],['complete',true]]){
    const r=report(['글리세린','향료'],['건조함'],status,mock);
    assert.equal(r.helpful.length,0);assert.equal(r.cautions.length,0);assert.equal(r.notes.length,0);
  }
});
test('all rules have reviewed sources and helpful IDs refer to bundled claims',()=>{
  const ids=new Set(CLAIMS.map(x=>x.evidenceId));
  assert.equal(ids.size,CLAIMS.length);
  for(const r of GUIDANCE.helpful)assert.ok(r.evidenceIds.every(id=>ids.has(id)));
  for(const r of GUIDANCE.cautions){assert.match(r.sourceUrl,/^https:\/\//u);assert.ok(r.aliases.length);}
  assert.equal(GUIDANCE.independentHumanReview,false);
});
