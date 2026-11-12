// Optional compatibility check: node scripts/check_ym_recommendations.mjs ../GlowPick-ym
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {prepareRecommendations} from '../BeautyAI/report-model.js';

const target=resolve(process.argv[2]);
const script=await readFile(resolve(target,'BeautyAI/script.js'),'utf8');
const html=await readFile(resolve(target,'BeautyAI/index.html'),'utf8');
assert.doesNotMatch(script,/^import /mu,'ym remains standalone');
const original=execFileSync('git',['show','fc9c36b:BeautyAI/script.js'],{cwd:target,encoding:'utf8'}).replace(/\r\n/gu,'\n');
const restored=script.replace(/\/\/ BEGIN YM GLOWPICK RECOMMENDATIONS[\s\S]*?\/\/ END YM GLOWPICK RECOMMENDATIONS\n/u,'')
  .replace('  const recommendations=prepareRecommendations(kind,input,complete,data.meta?.isMock===true);\n  renderRecommendations(recommendations);\n','')
  .replace("lastReportText=[...textLines,...recommendations.copyLines].join('\\n');","lastReportText=textLines.join('\\n');");
assert.equal(restored,original,'all unrelated ym API/UI code must be preserved');
class Element {
  constructor(){this.value='';this.dataset={};this.children=[];this.textContent='';const classes=new Set();
    this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n),contains:n=>classes.has(n)};}
  addEventListener(){} setAttribute(){} removeAttribute(){} focus(){} scrollIntoView(){}
  append(...nodes){this.children.push(...nodes);} appendChild(node){this.children.push(node);}
  replaceChildren(...nodes){this.children=nodes;}
}
const elements=new Map([...html.matchAll(/\bid="([^"]+)"/gu)].map(([,id])=>[id,new Element()]));
const context=vm.createContext({URL,console,setTimeout,clearTimeout,document:{getElementById:id=>elements.get(id),
  createElement:()=>new Element(),querySelectorAll:()=>[],querySelector:()=>null},window:{addEventListener(){}}});
vm.runInContext(script,context);
for(const kind of ['cosmetic','pack'])for(const concerns of [['건조함'],['여드름'],['건조함','여드름'],['모공']]){
  const input={skinType:'잘 모르겠음',concerns,mixStatus:'unknown'};
  context.fixture={kind,input,extraction:{status:'complete',ingredients:['글리세린'],warnings:[],uncertainSpans:[],nextAction:'',rawText:'글리세린'},
    analysis:{status:'needs_evidence',summary:'UI fixture',ingredientNotes:[],warnings:[]}};
  vm.runInContext('renderReport(fixture)',context);
  const expected=prepareRecommendations(kind,input,true);
  assert.equal(elements.get('recommendationList').children.length,expected.products.length);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(prepareRecommendations(fixture.kind,fixture.input,true))',context)),expected);
  assert.match(vm.runInContext('lastReportText',context),/GlowPick 추천!/u);
  context.fixture.extraction.status='partial';
  vm.runInContext('renderReport(fixture)',context);
  assert.ok(elements.get('recommendationBox').classList.contains('hidden'));
  assert.equal(elements.get('recommendationList').children.length,0);
}
console.log('ym: standalone syntax, unchanged original API code, 8 recommendation scenarios and partial-state clearing passed.');
