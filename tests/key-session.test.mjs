import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { prepareReport } from "../BeautyAI/report-model.js";

// Exercise the real UI event handlers without a network connection or credential.
class Element {
  constructor(id = "") {
    Object.assign(this, { id, value: "", type: "", textContent: "", disabled: false,
      dataset: {}, children: [], handlers: new Map(), attrs: new Map() });
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    };
  }
  addEventListener(name, handler) {
    this.handlers.set(name, [...(this.handlers.get(name) || []), handler]);
  }
  async fire(name) { for (const handler of this.handlers.get(name) || []) await handler({}); }
  setAttribute(name, value) { this.attrs.set(name, value); }
  getAttribute(name) { return this.attrs.get(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  focus() {}
  scrollIntoView() {}
}

async function setup(answer, concerns = ['건조함'], recAnswer = null) {
  const html = await readFile(new URL("../BeautyAI/index.html", import.meta.url), "utf8");
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/gu)].map(([, id]) => [id, new Element(id)]));
  const get = id => elements.get(id);
  const tabs = ["cosmetic", "pack"].map(kind => {
    const element = get("tab-" + kind); element.dataset.tab = kind; return element;
  });
  const skin = new Element(); skin.value = "잘 모르겠음";
  const selectedConcerns = concerns.map(value => Object.assign(new Element(), {value}));
  const typeChoices = {cosmetic:[],pack:[]};
  for(const [,kind,value,id] of html.matchAll(/name="(cosmetic|pack)RecommendationType" value="([^"]+)" id="([^"]+)"/gu)) {
    const choice=get(id);choice.value=value;choice.checked=false;typeChoices[kind].push(choice);
  }
  const windows = new Map(), calls = [], recCalls=[];
  get("geminiApiKey").value = "synthetic-autofilled-key";
  const document = {
    getElementById: get, createElement: () => new Element(),
    querySelector: selector => selector.includes("skinType") ? skin : null,
    querySelectorAll: selector => selector.includes('cosmeticRecommendationType') ? typeChoices.cosmetic.filter(el=>!selector.includes(':checked')||el.checked)
      : selector.includes('packRecommendationType') ? typeChoices.pack.filter(el=>!selector.includes(':checked')||el.checked)
      : selector === ".tab-button" ? tabs
      : selector === 'input[name="skinType"]' ? [skin]
      : selector.includes(":checked") ? selectedConcerns
      : selector === "button, input, textarea" ? [...elements.values()] : []
  };
  const context = vm.createContext({ document, URL, setTimeout, clearTimeout,
    window: { addEventListener: (name, handler) => windows.set(name, handler) },
    prepareReport, MAX_IMAGE_BYTES: 10 * 1024 * 1024,
    recommendProducts: async (payload,key) => {
      recCalls.push({payload,key});
      if(recAnswer)return typeof recAnswer==='function'?recAnswer(payload,key,recCalls.length):recAnswer;
      const types=payload.types.length?payload.types:payload.kind==='pack'?['에센스','세럼','앰플']:['토너','세럼','크림'];
      return {status:'complete',products:types.map((type,i)=>({brand:'UI검사',name:`신규 ${type}`,type,
        productUrl:`https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A${900000000000+i}`,
        matchedConcerns:payload.input.concerns,reason:'UI 검사 이유',productEvidence:'수분 관리',typeEvidence:type,cautions:[],
        checkedAt:'2026-11-12T00:00:00Z',mixingStatus:payload.kind==='pack'?'unknown':'not_applicable'}))};
    },
    analyze: async (...args) => {
      calls.push(args);
      return (typeof answer === 'function' ? answer() : answer) || { ok: true,
        extraction: { status: "partial", productName: null, ingredients: ["성분"],
          rawText: "성분", nextAction: "전체 라벨을 다시 촬영해 주세요.", warnings: [], uncertainSpans: [] },
        analysis: { status: "not_run", summary: "전체 판독 후 설명", ingredientNotes: [], warnings: [] },
        mixing: { status: "unknown", reason: "근거 미확인" }, meta: { isMock: false, promptStatus: "final" } };
    }
  });
  const source = (await readFile(new URL("../BeautyAI/script.js", import.meta.url), "utf8"))
    .replace(/^import [^\n]+\r?\n/gmu, "");
  vm.runInContext(source, context);
  for (const prefix of ["cosmetic", "pack"]) {
    get(prefix + "File").files = [new File(["synthetic image"], "label.png", { type: "image/png" })];
    await get(prefix + "File").fire("change");
  }
  return { get, calls, windows, recCalls };
}

test("one key is reused across successful cosmetic requests and the modeling-pack tab", async () => {
  const { get, calls } = await setup();
  assert.equal(get("geminiApiKey").value, "");
  const key = "synthetic-current-tab-key";
  get("geminiApiKey").value = key;
  await get("toggleKey").fire("click");
  assert.equal(get("geminiApiKey").type, "text");
  await get("cosmeticAnalyze").fire("click");
  assert.equal(get("geminiApiKey").value, key);
  assert.equal(get("geminiApiKey").type, "password");
  await get("cosmeticAnalyze").fire("click");
  await get("tab-pack").fire("click");
  await get("packAnalyze").fire("click");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call[0]), ["/analyze_cosmetic", "/analyze_cosmetic", "/consult_modeling_pack"]);
  assert.ok(calls.every(call => call[3] === key));
});

test('photo load failures retain the product card with an honest fallback instead of a broken image',async()=>{
  const rec={status:'complete',products:[{brand:'사진검사',name:'신규 토너',type:'토너',
    productUrl:'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A999999999999',
    imageUrl:'https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/400/A99999999999901ko.jpg',
    matchedConcerns:['건조함'],cautions:[],reason:'수분 표시 문구',productEvidence:'수분 관리',typeEvidence:'토너',checkedAt:'2026-11-12T00:00:00Z'}]};
  const answer={ok:true,extraction:{status:'complete',ingredients:['글리세린'],rawText:'글리세린',warnings:[]},
    analysis:{status:'needs_evidence',summary:'검사',warnings:[]},meta:{isMock:false}};
  const {get}=await setup(answer,['건조함'],rec);get('geminiApiKey').value='synthetic-photo-test-key';
  await get('cosmeticAnalyze').fire('click');
  const card=get('recommendationList').children[0], photo=card.children.find(el=>el.className==='pick-photo');
  assert.equal(photo.children[0].referrerPolicy,'no-referrer');assert.equal(photo.children[0].loading,'lazy');
  await photo.children[0].fire('error');
  assert.equal(photo.children[0].classList.contains('hidden'),true);
  assert.equal(photo.children[1].classList.contains('hidden'),false);
  assert.match(photo.children[1].textContent,/사진을 확인하지 못/u);assert.equal(get('recommendationList').children.length,1);
});

test('recommendation-only retry preserves the label report and never sends the photo for extraction again',async()=>{
  const answer={ok:true,extraction:{status:'complete',ingredients:['글리세린'],rawText:'글리세린',warnings:[]},
    analysis:{status:'needs_evidence',summary:'검사',warnings:[]},meta:{isMock:false}};
  const {get,calls,recCalls}=await setup(answer);get('geminiApiKey').value='synthetic-retry-current-tab-key';
  await get('cosmeticAnalyze').fire('click');assert.equal(calls.length,1);assert.equal(recCalls.length,1);
  await get('retryRecommendations').fire('click');
  assert.equal(calls.length,1);assert.equal(recCalls.length,2);assert.equal(get('results').classList.contains('hidden'),false);
  assert.ok(get('recommendationList').children.length>0);assert.equal(get('geminiApiKey').value,'synthetic-retry-current-tab-key');
});

test('helpful ingredient descriptions omit repeated personal-effect disclaimer',async()=>{
  const {GUIDANCE}=await import('../BeautyAI/ai-assets.js');
  assert.ok(GUIDANCE.helpful.length>1);
  assert.ok(GUIDANCE.helpful.every(rule=>!rule.reason.includes('개인별 효과와 제품 적합성')));
});

test('a later retry failure keeps already displayed recommendation names',async()=>{
  const answer={ok:true,extraction:{status:'complete',ingredients:['글리세린'],rawText:'글리세린',warnings:[]},
    analysis:{status:'needs_evidence',summary:'검사',warnings:[]},meta:{isMock:false}};
  const product={brand:'검사',name:'수분 토너',type:'토너',productUrl:'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A999999999999',
    matchedConcerns:['건조함'],cautions:[],reason:'수분 비교',productEvidence:'수분',typeEvidence:'토너',checkedAt:'2026-11-12T00:00:00Z'};
  const {get}=await setup(answer,['건조함'],(_p,_key,n)=>n===1?{status:'complete',products:[product]}:{status:'unavailable',products:[],message:'조회 지연'});
  get('geminiApiKey').value='synthetic-retry-key';await get('cosmeticAnalyze').fire('click');await get('retryRecommendations').fire('click');
  assert.equal(get('recommendationList').children.length,1);
  assert.match(get('recommendationContext').textContent,/앞서 확인한 추천을 유지/u);
});

test('real UI renders dynamic cards and exact selected types, then hides them on partial extraction', async () => {
  let status='complete';
  const answer=()=>({ok:true,extraction:{status,ingredients:['글리세린'],rawText:'글리세린',warnings:[],uncertainSpans:[],nextAction:''},
    analysis:{status:'needs_evidence',summary:'일반 기능 근거 부족',warnings:[]},meta:{isMock:false}});
  const {get,recCalls}=await setup(answer,['여드름']);
  get('geminiApiKey').value='synthetic-current-tab-key';
  await get('cosmeticAnalyze').fire('click');
  assert.equal(get('recommendationBox').classList.contains('hidden'),false);
  assert.equal(get('recommendationList').children.length,3);
  const cards=get('recommendationList').children;
  assert.deepEqual(cards.map(card=>card.children[0].textContent),['토너 추천','세럼 추천','크림 추천']);
  assert.match(get('recommendationCoverage').textContent,/추천 제품 3개/u);
  const link=cards[0].children.at(-1);
  assert.equal(link.target,'_blank');
  assert.equal(link.rel,'noopener noreferrer');
  assert.match(link.href,/^https:\/\/www.oliveyoung.co.kr\/store\/goods\//u);
  const shopLink=cards[0].children.find(el=>el.className==='pick-shop-link');
  assert.equal(shopLink.href,'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A900000000000');
  assert.equal(shopLink.rel,'noopener noreferrer');
  assert.equal(shopLink.target,'_blank');
  assert.match(get('recommendationShop').textContent,/가격·재고/u);
  await get('tab-pack').fire('click');
  get('packTypeAmpoule').checked=true;await get('packTypeAmpoule').fire('change');
  await get('packAnalyze').fire('click');
  assert.equal(get('recommendationList').children.length,1);
  assert.deepEqual(Array.from(recCalls[1].payload.types),['앰플']);
  assert.match(get('recommendationMixing').textContent,/혼합 가능 여부 미확인/u);
  assert.ok(get('recommendationList').children.every(card=>card.children.some(el=>el.textContent==='이 팩과의 혼합 조합 미확인')));
  status='partial';
  await get('packAnalyze').fire('click');
  assert.equal(get('recommendationBox').classList.contains('hidden'),true);
  assert.equal(get('recommendationList').children.length,0);
  assert.equal(recCalls.length,2);
});

test('optional category controls cap cosmetic at three, let pack switch or clear one choice, and send preferences separately', async()=>{
  const response={ok:true,extraction:{status:'complete',ingredients:['글리세린'],rawText:'글리세린',warnings:[],uncertainSpans:[]},
    analysis:{status:'needs_evidence',warnings:[]},meta:{isMock:false}};
  const {get,calls,recCalls}=await setup(response);
  for(const id of ['cosmeticTypeSkin','cosmeticTypeToner','cosmeticTypeAmpoule','cosmeticTypeCream']){
    get(id).checked=true;await get(id).fire('change');
  }
  assert.equal(get('cosmeticTypeCream').checked,false);
  assert.match(get('cosmeticPickHint').textContent,/최대 3종/u);
  get('geminiApiKey').value='synthetic-current-tab-key';
  await get('cosmeticAnalyze').fire('click');
  assert.deepEqual(Array.from(recCalls[0].payload.types),['스킨','토너','앰플']);
  assert.equal(Object.hasOwn(calls[0][2],'recommendationTypes'),false);
  assert.deepEqual(get('recommendationList').children.map(card=>card.children[0].textContent),['스킨 추천','토너 추천','앰플 추천']);
  get('packTypeSerum').checked=true;await get('packTypeSerum').fire('change');
  get('packTypeEssence').checked=true;await get('packTypeEssence').fire('change');
  assert.equal(get('packTypeSerum').checked,false);
  assert.equal(get('packTypeEssence').checked,true);
  get('packTypeEssence').checked=false;await get('packTypeEssence').fire('change');
  assert.match(get('packPickHint').textContent,/선택 없음/u);
});

test('failed product lookup keeps the successful ingredient report and key without fixed fallback products', async()=>{
  const response={ok:true,extraction:{status:'complete',ingredients:['글리세린'],rawText:'글리세린',warnings:[],uncertainSpans:[]},
    analysis:{status:'needs_evidence',warnings:[]},meta:{isMock:false}};
  const {get}=await setup(response,['건조함'],{status:'unavailable',products:[],message:'올리브영 페이지 접근 확인 실패'});
  get('geminiApiKey').value='synthetic-current-tab-key';await get('cosmeticAnalyze').fire('click');
  assert.equal(get('results').classList.contains('hidden'),false);
  assert.equal(get('recommendationList').children.length,0);
  assert.match(get('recommendationContext').textContent,/접근 확인 실패/u);
  assert.equal(get('geminiApiKey').value,'synthetic-current-tab-key');
});

test("an API failure retains the masked key for the user's next attempt", async () => {
  const { get, calls } = await setup({ ok: false, requestId: "synthetic-request",
    error: { code: "RATE_LIMITED", message: "무료 한도 초과" } });
  get("geminiApiKey").value = "synthetic-current-tab-key";
  await get("cosmeticAnalyze").fire("click");
  assert.match(get("cosmeticMessage").textContent, /RATE_LIMITED/u);
  assert.equal(get("geminiApiKey").value, "synthetic-current-tab-key");
  assert.equal(get("geminiApiKey").type, "password");
  await get("cosmeticAnalyze").fire("click");
  assert.equal(calls.length, 2);
});

test("navigation and page restoration clear the key; users can change or remove it", async () => {
  const { get, calls, windows } = await setup();
  get("geminiApiKey").value = "synthetic-first-key";
  await get("cosmeticAnalyze").fire("click");
  get("geminiApiKey").value = "synthetic-replacement-key";
  await get("cosmeticAnalyze").fire("click");
  assert.equal(calls[1][3], "synthetic-replacement-key");
  get("geminiApiKey").value = "";
  await get("cosmeticAnalyze").fire("click");
  assert.equal(calls.length, 2);
  get("geminiApiKey").value = "synthetic-navigation-key";
  windows.get("pagehide")();
  assert.equal(get("geminiApiKey").value, "");
  get("geminiApiKey").value = "synthetic-restored-key";
  windows.get("pageshow")();
  assert.equal(get("geminiApiKey").value, "");
  assert.equal(get("geminiApiKey").type, "password");
});

test("explanation failure shows its stage and HTTP status without presenting a completed report", async () => {
  const { get } = await setup({ ok: false, requestId: "synthetic-request", error: {
    code: "GEMINI_UNAVAILABLE", message: "Gemini 요청에 실패했습니다." }, meta: { failure: {
    stage: "explanation", httpStatus: 503, providerCode: "service_unavailable",
    reason: "overloaded", extractionCompleted: true } } });
  get("geminiApiKey").value = "synthetic-current-tab-key";
  await get("cosmeticAnalyze").fire("click");
  const message = get("cosmeticMessage");
  assert.match(message.textContent, /전성분 판독은 끝났지만 설명 생성에 실패/u);
  assert.match(message.textContent, /성분 설명 · HTTP 503 · Google 처리 용량 부족/u);
  assert.equal(message.dataset.failureStage, "explanation");
  assert.equal(message.dataset.httpStatus, "503");
  assert.equal(message.dataset.providerCode, "service_unavailable");
  assert.equal(get("results").classList.contains("hidden"), true);
  await get("cosmeticFile").fire("change");
  assert.equal(message.dataset.failureStage, undefined);
  assert.equal(message.dataset.httpStatus, undefined);
});
