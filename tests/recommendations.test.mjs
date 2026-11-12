import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecommendationClient,RECOMMENDATION_TYPES,validateRecommendationTypes,
  recommendationCategoryUrls,normalizeOliveYoungProductUrl,oliveYoungSearchUrl,normalizeOliveYoungImageUrl,matchesRecommendationType,selectRecommendedProducts} from '../BeautyAI/recommendation-client.js';
import {prepareRecommendations} from '../BeautyAI/report-model.js';
import {RETAIL_LISTINGS} from '../BeautyAI/ai-assets.js';

const key='synthetic-free-project-key-for-offline-tests';
const input={skinType:'잘 모르겠음',concerns:['건조함','여드름']};
function item(type,index=0){return {brand:'검사브랜드',name:`신규검사 ${index} ${type}`,type,
  productUrl:`https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A${900000000000+index}`,
  sourceListUrl:recommendationCategoryUrls('cosmetic',[type])[0],matchedConcerns:['건조함'],
  categoryPath:`스킨케어 > ${['스킨','토너'].includes(type)?'스킨/토너':['에센스','세럼','앰플'].includes(type)?'에센스/세럼/앰플':type}`,
  typeEvidence:`신규검사 ${index} ${type}`,productEvidence:'수분 관리용 제품',reason:'확인한 수분 관리 정보와 건조함을 연결한 참고 후보입니다.',
  cautions:['실제 라벨과 사용법을 확인해 주세요.'],pageStatus:'available'};}
function body(products,urls,options={}){
  return {status:'completed',output_text:JSON.stringify({products}),steps:[
    {type:'url_context_result',result:urls.map(url=>({url,status:options.fetchStatus||'success'}))},
    {type:'model_output',content:[{type:'text',text:JSON.stringify({products}),annotations:options.noCitations?[]:urls.map(url=>({type:'url_citation',url}))}]}]};
}
function setup(products=[item('토너',0),item('세럼',1),item('앰플',2)],overrides={}){
  const calls=[];
  const client=createRecommendationClient({listings:{products:[]},now:()=>Date.parse('2026-11-12T04:00:00Z'),fetcher:async(url,init)=>{
    const payload=JSON.parse(init.body);calls.push({url,init,payload});
    if(overrides.fetcher)return overrides.fetcher(calls.length,url,init,payload);
    const stage=calls.length===1?'list':'product';
    const listed=stage==='list'?products:overrides.verified||products;
    const urls=[...new Set(listed.map(p=>p.sourceListUrl))];
    return Response.json(body(listed,urls,stage==='list'?overrides.listProof:overrides.productProof));
  },...overrides.client});
  return {client,calls,run:(types=[],kind='cosmetic',request={})=>client.recommend({kind,types,input,ingredients:['글리세린'],...request},key)};
}


test('optional types accept all 64 cosmetic combinations and four pack choices',()=>{
  let count=0;const all=RECOMMENDATION_TYPES.cosmetic;
  for(let mask=0;mask<128;mask++){
    const types=all.filter((_,i)=>mask&(1<<i));
    if(types.length<=3){assert.deepEqual(validateRecommendationTypes('cosmetic',types),types);count++;}
    else assert.throws(()=>validateRecommendationTypes('cosmetic',types));
  }
  assert.equal(count,64);
  for(const types of [[],['에센스'],['세럼'],['앰플']])assert.deepEqual(validateRecommendationTypes('pack',types),types);
  for(const [kind,types] of [['pack',['토너']],['pack',['앰플','세럼']],['cosmetic',['토너','토너']],['__proto__',[]]])
    assert.throws(()=>validateRecommendationTypes(kind,types));
});

test('one current-list response produces names without requiring a detail lookup',async()=>{
  const products=[item('스킨',0),item('토너',1),item('앰플',2)];
  const {run,calls}=setup(products);const result=await run(['스킨','토너','앰플']);
  assert.equal(result.status,'complete');assert.deepEqual(result.products.map(p=>p.type),['스킨','토너','앰플']);
  assert.equal(calls.length,1);
  const call=calls[0];assert.equal(call.payload.model,'gemini-3.5-flash-lite');
  assert.deepEqual(call.payload.tools,[{type:'url_context'}]);assert.equal(call.payload.store,false);
  assert.equal(call.payload.response_format.mime_type,'application/json');
  assert.deepEqual(Object.keys(call.init.headers).sort(),['Content-Type','x-goog-api-key']);
  assert.ok(!call.init.body.includes(key));assert.equal(call.init.credentials,'omit');
});

test('every allowed choice retains requested types and unique names',async()=>{
  const all=RECOMMENDATION_TYPES.cosmetic;
  for(let mask=0;mask<128;mask++){
    const types=all.filter((_,i)=>mask&(1<<i));if(types.length>3)continue;
    const result=await setup((types.length?types:all).map((t,i)=>item(t,i))).run(types);
    assert.equal(result.products.length,types.length||3);
    if(types.length)assert.deepEqual(result.products.map(p=>p.type),types);
  }
  for(const types of [[],['에센스'],['세럼'],['앰플']]){
    const result=await setup(['에센스','세럼','앰플'].map((t,i)=>item(t,i))).run(types,'pack');
    assert.equal(result.products.length,types.length||3);assert.ok(result.products.every(p=>p.mixingStatus==='unknown'));
  }
});

test('absent or broken links, photos and optional explanation fields never erase a sourced product name',async()=>{
  const p={...item('토너',0),productUrl:'https://wrong.example/item',imageUrl:'javascript:alert(1)'};
  delete p.reason;delete p.productEvidence;delete p.cautions;delete p.matchedConcerns;
  const result=await setup([p]).run(['토너']);assert.equal(result.products.length,1);
  assert.equal(result.products[0].name,p.name);assert.equal(result.products[0].productUrl,null);
  assert.equal(result.products[0].imageUrl,null);assert.ok(result.products[0].reason);
  const report=prepareRecommendations('cosmetic',{...input,recommendationTypes:['토너']},true,false,result);
  assert.equal(report.products.length,1);assert.match(report.copyLines.join('\n'),/신규검사/u);
});

test('JSON fenced or surrounded by explanation and citations is read without dropping names',async()=>{
  const p=item('토너',0),urls=[p.sourceListUrl];
  for(const text of ['```json\n'+JSON.stringify({products:[p]})+'\n```',
    '현재 조회 결과입니다.\n'+JSON.stringify({products:[{...p,reason:'문자열의 {중괄호}와 \\"인용\\"'}]})+'\n[출처 1]']){
    const {run}=setup([p],{fetcher:()=>Response.json({...body([p],urls),output_text:text})});
    assert.equal((await run(['토너'])).products.length,1);
  }
});

test('confirmed names survive alternate-list format, HTTP, timeout and connection failures',async()=>{
  const p=item('토너',0),skin={...item('스킨',1),id:'A900000000001',checkedAt:'2026-11-12T00:00:00Z'};
  for(const failure of ['malformed','http','network']){
    const {run,calls}=setup([p],{client:{listings:{products:[skin]}},fetcher:(n)=>{
      if(n===1)return Response.json(body([p],[p.sourceListUrl]));
      if(failure==='network')throw Error(key);
      return failure==='http'?new Response(key,{status:503}):Response.json({status:'completed',output_text:'broken'});
    }});
    const result=await run(['스킨','토너']);assert.equal(result.status,'complete');assert.equal(result.products.find(p=>p.type==='토너').name,p.name);
    assert.deepEqual(result.missingTypes,[]);assert.equal(calls.length,2);assert.ok(!JSON.stringify(result).includes(key));
  }
});

test('missing types use API-selected IDs from actual inventory without accepting invented names',async()=>{
  const toner=item('토너',0),skin={...item('스킨',1),id:'A900000000001',checkedAt:'2026-11-12T00:00:00Z'};
  const {run,calls}=setup([],{client:{listings:{products:[skin]}},fetcher:n=>Response.json(n===1?body([toner],[toner.sourceListUrl]):body([{id:skin.id,reason:'보습 비교',matchedConcerns:['건조함']}],[]))});
  const result=await run(['스킨','토너']);assert.equal(result.status,'complete');
  assert.deepEqual(result.products.map(p=>p.type),['스킨','토너']);assert.equal(calls.length,2);
  assert.deepEqual(calls[1].payload.tools,[]);
  assert.equal(result.products[0].verificationScope,'catalog_snapshot');
  assert.equal(result.products[0].productUrl,skin.productUrl);assert.equal(result.products[0].selectionMethod,'api_listing_selection');
  const report=prepareRecommendations('cosmetic',{...input,recommendationTypes:['스킨','토너']},true,false,result);
  assert.equal(report.products.length,2);assert.doesNotMatch(report.copyLines.join('\n'),/수집 시각|조회 시각|2026-11-12T/u);
});

test('official inventory covers all seven types with dated provenance and real photo/item paths',()=>{
  assert.ok(RETAIL_LISTINGS.products.length>50);
  assert.equal(new Set(RETAIL_LISTINGS.products.map(p=>p.id)).size,RETAIL_LISTINGS.products.length);
  for(const type of RECOMMENDATION_TYPES.cosmetic)assert.ok(RETAIL_LISTINGS.products.some(p=>p.type===type),type);
  for(const p of RETAIL_LISTINGS.products){
    assert.equal(normalizeOliveYoungProductUrl(p.productUrl),p.productUrl);
    assert.equal(new URL(p.productUrl).searchParams.get('goodsNo'),p.id);
    assert.ok(Number.isFinite(Date.parse(p.checkedAt)));assert.ok(p.sourceListUrl.startsWith('https://www.oliveyoung.co.kr/'));
    if(p.imageUrl)assert.equal(normalizeOliveYoungImageUrl(p.imageUrl),p.imageUrl);
    assert.equal(matchesRecommendationType(p.name,p.brand,p.type),true);
  }
});

test('even quota/connection failure leaves real inventory names, explicitly marked as list comparison',async()=>{
  for(const types of [[],['스킨','토너','앰플'],['크림','로션','에센스']]){
    let calls=0;const client=createRecommendationClient({fetcher:async()=>{calls++;return new Response('private echo '+key,{status:429});}});
    const result=await client.recommend({kind:'cosmetic',types,input},key);
    assert.equal(result.status,'complete');assert.equal(result.products.length,types.length||3);assert.equal(calls,1);
    assert.ok(result.products.every(p=>p.selectionMethod==='listing_comparison'&&RETAIL_LISTINGS.products.some(row=>row.id===p.id)));
    assert.ok(!JSON.stringify(result).includes(key));
  }
});

test('cream skin and essence toner follow the final main type; gifts, brands and mixed sets do not',()=>{
  assert.equal(matchesRecommendationType('크림 스킨 세라펩타이드 리파이너','라네즈','스킨'),true);
  assert.equal(matchesRecommendationType('시카플라스트 로션 B5 시카에센스 토너','라로슈포제','토너'),true);
  assert.equal(matchesRecommendationType('스킨 부스터 세럼','브랜드','세럼'),true);
  for(const [name,brand,type] of [['스킨1004 수분 세럼','스킨1004','스킨'],['세럼 (+토너 증정)','브랜드','토너'],
    ['스킨 + 로션 세트','브랜드','로션'],['리프팅 스킨케어 2종 세트','브랜드','스킨'],['토너 패드','브랜드','토너'],['에센스 마스크','브랜드','에센스'],['샴푸 세럼','브랜드','세럼']])
    assert.equal(matchesRecommendationType(name,brand,type),false,name);
});

test('failed or unrelated official sources and discontinued items cannot become retailer-confirmed names',async()=>{
  const p=item('토너',0);
  for(const override of [{listProof:{fetchStatus:'error'}},{fetcher:()=>Response.json({status:'completed',output_text:JSON.stringify({products:[p]}),steps:[]})}])
    assert.equal((await setup([p],override).run(['토너'])).products.length,0);
  const wrong={...p,sourceListUrl:recommendationCategoryUrls('cosmetic',['세럼'])[0]};
  assert.equal((await setup([wrong]).run(['토너'])).products.length,0);
  assert.equal((await setup([{...p,pageStatus:'discontinued'}]).run(['토너'])).products.length,0);
});

test('link and image URLs stay on allowed hosts and never construct a photo from an item ID',async()=>{
  const image='https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/400/A99999999999901ko.jpg';
  assert.equal(normalizeOliveYoungImageUrl(image+'?l=ko'),image);
  for(const bad of [image.replace('https:','http:'),image.replace('.co.kr/','.co.kr.evil/'),image.replace('.jpg','.svg'),'data:image/png;base64,x'])
    assert.equal(normalizeOliveYoungImageUrl(bad),null);
  const p={...item('토너',0),imageUrl:image};assert.equal((await setup([p]).run(['토너'])).products[0].imageUrl,image);
  assert.equal((await setup([item('토너',0)]).run(['토너'])).products[0].imageUrl,null);
  const valid=p.productUrl;assert.equal(normalizeOliveYoungProductUrl(valid+'&tracking=x'),valid);
  assert.equal(normalizeOliveYoungProductUrl(valid+'&goodsNo=A999999999999'),null);
  assert.match(oliveYoungSearchUrl('토너 & 세럼'),/%26/u);
});

test('quota/auth/network failures stop without an automatic retry or a fabricated product',async()=>{
  for(const failure of [new Response(key,{status:429}),new Response(key,{status:403}),new Error(key)]){
    const {run,calls}=setup([],{fetcher:()=>{if(failure instanceof Error)throw failure;return failure;}});
    const result=await run();assert.equal(result.status,'unavailable');assert.equal(calls.length,1);
    assert.ok(!JSON.stringify(result).includes(key));
  }
  const {run}=setup([],{client:{timeoutMs:5},fetcher:(_n,_u,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error(key))))});
  assert.equal((await run()).code,'TIMEOUT');
});

test('invalid inputs and concurrent jobs cannot start additional Google calls',async()=>{
  const {client,calls}=setup();
  assert.equal((await client.recommend({kind:'pack',types:['토너'],input},key)).code,'INVALID_INPUT');
  assert.equal((await client.recommend({kind:'cosmetic',input},'short')).code,'KEY_REQUIRED');assert.equal(calls.length,0);
  let release;const pending=setup([],{fetcher:()=>new Promise(resolve=>{release=resolve;})});
  const first=pending.run(['토너']);assert.equal((await pending.run()).code,'BUSY');
  release(new Response('',{status:429}));await first;
});

test('current report, incomplete labels and mock output do not invent old preset products',async()=>{
  const p={...item('토너',0),checkedAt:'2026-11-12T00:00:00Z'};
  for(const [complete,mock] of [[false,false],[true,true]])assert.equal(prepareRecommendations('cosmetic',input,complete,mock,{status:'complete',products:[p]}).products.length,0);
  assert.equal(prepareRecommendations('cosmetic',input,true,false).products.length,0);
  const source=await readFile(new URL('../BeautyAI/ai-assets.js',import.meta.url),'utf8');assert.doesNotMatch(source,/export const RECOMMENDATIONS/u);
  const client=await readFile(new URL('../BeautyAI/recommendation-client.js',import.meta.url),'utf8');
  assert.doesNotMatch(client,/A\d{12}|localStorage|sessionStorage|google_search/u);
});

test('all 64 cosmetic selections and four pack selections still have names when the API is unavailable',async()=>{
  const all=RECOMMENDATION_TYPES.cosmetic;
  const choices=[];for(let mask=0;mask<128;mask++){const types=all.filter((_,i)=>mask&(1<<i));if(types.length<=3)choices.push(['cosmetic',types]);}
  choices.push(...[[],['에센스'],['세럼'],['앰플']].map(types=>['pack',types]));
  for(const [kind,types] of choices){
    const client=createRecommendationClient({fetcher:async()=>new Response('unavailable',{status:429})});
    const result=await client.recommend({kind,types,input},key);
    assert.equal(result.status,'complete',kind+types.join(','));assert.equal(result.products.length,types.length||3);
    if(types.length)assert.deepEqual(result.products.map(p=>p.type),types);
    if(kind==='pack')assert.ok(result.products.every(p=>p.mixingStatus==='unknown'));
  }
});
