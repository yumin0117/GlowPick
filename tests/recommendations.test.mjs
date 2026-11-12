import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecommendationClient,RECOMMENDATION_TYPES,validateRecommendationTypes,
  recommendationCategoryUrls,normalizeOliveYoungProductUrl,oliveYoungSearchUrl,normalizeOliveYoungImageUrl,matchesRecommendationType,selectRecommendedProducts} from '../BeautyAI/recommendation-client.js';
import {prepareRecommendations} from '../BeautyAI/report-model.js';

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
  const client=createRecommendationClient({now:()=>Date.parse('2026-11-12T04:00:00Z'),fetcher:async(url,init)=>{
    const payload=JSON.parse(init.body);calls.push({url,init,payload});
    if(overrides.fetcher)return overrides.fetcher(calls.length,url,init,payload);
    const stage=calls.length===1?'list':'product';
    const listed=stage==='list'?products:overrides.verified||products;
    const urls=stage==='list'?[...new Set(products.map(p=>p.sourceListUrl))]:products.map(p=>p.productUrl||p.sourceListUrl);
    return Response.json(body(listed,urls,stage==='list'?overrides.listProof:overrides.productProof));
  },...overrides.client});
  return {client,calls,run:(types=[],kind='cosmetic',request={})=>client.recommend({kind,types,input,ingredients:['글리세린'],...request},key)};
}

test('optional type selection accepts all 64 cosmetic combinations and four pack choices',()=>{
  let valid=0;
  const all=RECOMMENDATION_TYPES.cosmetic;
  for(let mask=0;mask<2**all.length;mask++){
    const types=all.filter((_,i)=>mask&(1<<i));
    if(types.length<=3){assert.deepEqual(validateRecommendationTypes('cosmetic',types),types);valid++;}
    else assert.throws(()=>validateRecommendationTypes('cosmetic',types));
  }
  assert.equal(valid,64);
  for(const types of [[],['에센스'],['세럼'],['앰플']])assert.deepEqual(validateRecommendationTypes('pack',types),types);
  for(const [kind,types] of [['pack',['토너']],['pack',['세럼','앰플']],['cosmetic',['토너','토너']],['cosmetic',['샴푸']],['__proto__',[]]])
    assert.throws(()=>validateRecommendationTypes(kind,types));
});

test('new products come from current list and product retrievals; selected types receive exactly one each',async()=>{
  const products=[item('스킨',0),item('토너',1),item('앰플',2),item('토너',3)];
  const {run,calls}=setup(products);
  const result=await run(['스킨','토너','앰플']);
  assert.equal(result.status,'complete');
  assert.deepEqual(result.products.map(p=>p.type),['스킨','토너','앰플']);
  assert.equal(new Set(result.products.map(p=>p.productUrl)).size,3);
  assert.equal(calls.length,2);
  assert.ok(calls[0].payload.input.includes('스킨')&&calls[0].payload.input.includes('여드름'));
  for(const call of calls){
    assert.equal(call.url,'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.deepEqual(call.payload.tools,[{type:'url_context'}]);
    assert.equal(call.payload.model,'gemini-3.5-flash-lite');
    assert.equal(call.payload.store,false);
    assert.equal(call.init.headers['x-goog-api-key'],key);
    assert.deepEqual(Object.keys(call.init.headers).sort(),['Content-Type','x-goog-api-key']);
    assert.ok(!call.init.body.includes(key));
    assert.equal(call.init.credentials,'omit');
    assert.equal(call.payload.response_format,undefined);
  }
  assert.ok(calls[1].payload.input.includes(products[3].productUrl));
});

test('all valid cosmetic choices and pack choices preserve exact type counts through the live client',async()=>{
  const all=RECOMMENDATION_TYPES.cosmetic;
  for(let mask=0;mask<2**all.length;mask++){
    const types=all.filter((_,i)=>mask&(1<<i));if(types.length>3)continue;
    const candidates=(types.length?types:all).map((type,i)=>item(type,i));
    const result=await setup(candidates).run(types);
    assert.equal(result.status,'complete');
    assert.equal(result.products.length,types.length||3);
    if(types.length)assert.deepEqual(result.products.map(p=>p.type),types);
  }
  for(const types of [[],['에센스'],['세럼'],['앰플']]){
    const result=await setup(['에센스','세럼','앰플'].map((t,i)=>item(t,i))).run(types,'pack');
    assert.equal(result.products.length,types.length||3);
    assert.ok(result.products.every(p=>RECOMMENDATION_TYPES.pack.includes(p.type)&&p.mixingStatus==='unknown'));
  }
});

test('failed category and product retrievals never become recommendations',async()=>{
  for(const override of [{listProof:{fetchStatus:'error'}},
    {productProof:{fetchStatus:'paywall'}},{productProof:{fetchStatus:'unsafe'}}]){
    const {run,calls}=setup(undefined,override);const result=await run();
    assert.equal(result.status,'unavailable');assert.deepEqual(result.products,[]);
    if(override.listProof)assert.equal(calls.length,1);
  }
});

test('JSON output can omit citation annotations but still needs provider retrieval proof and exact item source binding',async()=>{
  const result=await setup(undefined,{listProof:{noCitations:true},productProof:{noCitations:true}}).run();
  assert.equal(result.products.length,3);
  const {run}=setup([],{fetcher:()=>Response.json({status:'completed',output_text:JSON.stringify({products:[item('토너',0)]}),steps:[]})});
  assert.equal((await run()).products.length,0);
});

test('a missing selected type is reported instead of being filled with a different type',async()=>{
  const result=await setup([item('토너',1),item('앰플',2)]).run(['스킨','토너','앰플']);
  assert.equal(result.status,'partial');assert.deepEqual(result.missingTypes,['스킨']);
  assert.deepEqual(result.products.map(p=>p.type),['토너','앰플']);
});

test('live category names without detail links remain usable with explicit list-only scope and exact search links',async()=>{
  const listed=['토너','앰플'].map((type,i)=>({...item(type,i),productUrl:null,pageStatus:'listed'}));
  const {run,calls}=setup(listed);const result=await run(['스킨','토너','앰플']);
  assert.equal(result.status,'partial');assert.deepEqual(result.missingTypes,['스킨']);
  assert.equal(result.products.length,2);assert.equal(calls.length,2);
  for(const product of result.products){
    assert.equal(product.productUrl,null);assert.equal(product.verificationScope,'category_list');
    assert.equal(product.searchUrl,oliveYoungSearchUrl(product.name));
    assert.ok(!product.searchUrl.includes('goodsNo'));
  }
  const report=prepareRecommendations('cosmetic',{...input,recommendationTypes:['토너','앰플']},true,false,result);
  assert.equal(report.products.length,2);assert.match(report.copyLines.join('\n'),/상품 상세 정보 미확인/u);
  assert.doesNotMatch(report.copyLines.join('\n'),/https?:\/\//u);
  assert.equal(oliveYoungSearchUrl('토너 & 앰플?'), 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query='+encodeURIComponent('토너 & 앰플?'));
});

test('name-only products require successful re-reading, consistent identity and a listed status',async()=>{
  const listed={...item('앰플',0),productUrl:null,pageStatus:'listed'};
  for(const changes of [{productProof:{fetchStatus:'error'}},
    {verified:[{...listed,pageStatus:'available'}]},{verified:[{...listed,name:'다른 앰플'}]}]){
    assert.equal((await setup([listed],changes).run(['앰플'])).products.length,0);
  }
  const invalid={...listed,productUrl:'https://other.example/item'};
  assert.equal((await setup([invalid]).run(['앰플'])).products.length,0);
  const result=await setup([listed,listed]).run();assert.equal(result.products.length,1);
  const forged={...result.products[0],searchUrl:'https://other.example/search'};
  assert.equal(prepareRecommendations('cosmetic',input,true,false,{status:'complete',products:[forged]}).products.length,0);
});

test('product photos use observed Olive Young raster URLs, with two-pass agreement and no constructed filenames',async()=>{
  const image='https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/400/10/0000/0099/A99999999999901ko.jpg';
  assert.equal(normalizeOliveYoungImageUrl(image+'?l=ko'),image);
  for(const bad of [image.replace('https:','http:'),image.replace('.co.kr/','.co.kr.evil.example/'),
    image.replace('.jpg','.svg'),'data:image/png;base64,x',image.replace('/thumbnails/','/tracking/'),image.replace('https://','https://user:pass@')])
    assert.equal(normalizeOliveYoungImageUrl(bad),null);
  const original={...item('토너',0),imageUrl:image};
  assert.equal((await setup([original]).run()).products[0].imageUrl,image);
  const changed={...original,imageUrl:image.replace('01ko','02ko')};
  assert.equal((await setup([original],{verified:[changed]}).run()).products[0].imageUrl,null);
  assert.equal((await setup([item('토너',0)]).run()).products[0].imageUrl,null);
});

test('skin/toner and main product types cannot be inferred from brands, gifts or hybrid names',()=>{
  for(const type of RECOMMENDATION_TYPES.cosmetic)assert.ok(matchesRecommendationType(`수분 ${type}`,'브랜드',type));
  assert.ok(matchesRecommendationType('스킨 부스터 세럼','브랜드','세럼'));
  for(const [name,brand,type] of [['스킨1004 수분 세럼','스킨1004','스킨'],['스킨 부스터 세럼','브랜드','스킨'],
    ['진정 세럼 (+토너 20ml)','브랜드','토너'],['크림 스킨','브랜드','스킨'],['스킨 + 로션 세트','브랜드','로션'],
    ['스킨 + 로션 세트','브랜드','스킨'],['진정 토너 패드','브랜드','토너'],['에센스 마스크','브랜드','에센스'],
    ['두피 에센스','브랜드','에센스'],['선세럼','브랜드','세럼'],['바디 로션','브랜드','로션'],['아이크림','브랜드','크림']])
    assert.equal(matchesRecommendationType(name,brand,type),false,name);
});

test('discontinued, renamed, mismatched, wrong-category and unsupported products are rejected',async()=>{
  const original=item('토너',1);
  for(const changes of [{pageStatus:'discontinued'},{pageStatus:'unavailable'},{name:'다른 토너'},
    {type:'크림'},{categoryPath:'헤어케어 > 토너'},{categoryPath:'스킨케어 > 로션'},
    {typeEvidence:'확인불가'},{reason:''},{matchedConcerns:['선택하지 않은 고민']}]){
    const result=await setup([original],{verified:[{...original,...changes}]}).run(['토너']);
    assert.equal(result.status,'unavailable',JSON.stringify(changes));
    assert.equal(result.products.length,0);
  }
});

test('product URLs are limited to Olive Young items; duplicate identities are not reused',async()=>{
  const valid=item('토너',1).productUrl;
  assert.equal(normalizeOliveYoungProductUrl(valid+'&trackingCd=ignore'),valid);
  for(const url of ['javascript:alert(1)','https://www.oliveyoung.co.kr.evil.example/store/goods/getGoodsDetail.do?goodsNo=A999999999999',
    'https://user:pass@www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A999999999999',
    valid+'&goodsNo=A999999999999','https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=토너'])
    assert.equal(normalizeOliveYoungProductUrl(url),null);
  const p=item('토너',1);const result=await setup([p,p,p]).run();assert.equal(result.products.length,1);
});

test('a product claimed from the wrong list cannot enter verification',async()=>{
  const toner=item('토너',1);toner.sourceListUrl=recommendationCategoryUrls('cosmetic',['세럼'])[0];
  const {run,calls}=setup([toner]);assert.equal((await run()).products.length,0);assert.equal(calls.length,1);
});

test('compound concerns influence the selected subset without overriding requested types',()=>{
  const a=item('토너',0),b=item('세럼',1),c=item('크림',2),d=item('앰플',3);
  a.matchedConcerns=['건조함'];b.matchedConcerns=['여드름'];c.matchedConcerns=['탄력'];d.matchedConcerns=['피지'];
  assert.equal(selectRecommendedProducts([a,b,c,d]).length,3);
  assert.deepEqual(selectRecommendedProducts([a,b,c,d],['앰플','토너']).map(p=>p.type),['앰플','토너']);
});

test('HTTP, network, timeout and malformed output are isolated, sanitized and never retried',async()=>{
  for(const answer of [new Response('private echo '+key,{status:429}),new Response('private echo '+key,{status:400}),
    new Error('private echo '+key),Response.json({status:'completed',output_text:'not JSON'})]){
    const {run,calls}=setup([],{fetcher:()=>{if(answer instanceof Error)throw answer;return answer;}});
    const result=await run();assert.equal(result.status,'unavailable');assert.equal(calls.length,1);
    assert.ok(!JSON.stringify(result).includes(key));assert.ok(!JSON.stringify(result).includes('private echo'));
  }
  const {run}=setup([],{client:{timeoutMs:5},fetcher:(_n,_u,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error(key))))});
  assert.equal((await run()).code,'TIMEOUT');
});

test('invalid inputs never call Google, and concurrent calls cannot start another discovery',async()=>{
  const {client,calls}=setup();
  assert.equal((await client.recommend({kind:'pack',types:['토너'],input},key)).status,'unavailable');
  assert.equal((await client.recommend({kind:'cosmetic',input},'short')).code,'KEY_REQUIRED');
  assert.equal((await client.recommend({kind:'cosmetic',input:{concerns:[]}},key)).code,'INVALID_INPUT');
  assert.equal(calls.length,0);
  let release;const pending=setup([],{fetcher:()=>new Promise(resolve=>{release=resolve;})});
  const first=pending.run();assert.equal((await pending.run()).code,'BUSY');
  release(Response.json(body([],[])));await first;
});

test('report shows loading/unavailable distinctly and never revives the old fixed catalog',async()=>{
  const p={...item('토너',1),checkedAt:'2026-11-12T04:00:00Z'};
  const selected={...input,recommendationTypes:['스킨','토너']};
  const report=prepareRecommendations('cosmetic',selected,true,false,{status:'partial',products:[p]});
  assert.equal(report.products.length,1);assert.match(report.missingNotice,/스킨/u);
  assert.match(report.copyLines.join('\n'),/토너 추천/u);assert.doesNotMatch(report.copyLines.join('\n'),/https?:\/\//u);
  assert.equal(prepareRecommendations('cosmetic',input,true,false).products.length,0);
  for(const [complete,mock] of [[false,false],[true,true]])
    assert.equal(prepareRecommendations('pack',input,complete,mock,{status:'complete',products:[p]}).ready,false);
  const source=await readFile(new URL('../BeautyAI/ai-assets.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/export const RECOMMENDATIONS/u);
  const client=await readFile(new URL('../BeautyAI/recommendation-client.js',import.meta.url),'utf8');
  assert.doesNotMatch(client,/A\d{12}|localStorage|sessionStorage|google_search/u);
});
