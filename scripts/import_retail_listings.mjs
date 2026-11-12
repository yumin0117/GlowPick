// Import every eligible row from captured official pages; never hand-pick recommendations.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {RECOMMENDATION_TYPES,matchesRecommendationType,normalizeOliveYoungProductUrl,normalizeOliveYoungImageUrl} from '../BeautyAI/recommendation-client.js';
const input=JSON.parse(await readFile(resolve(process.argv[2]),'utf8'));
const products=new Map();
for(const snapshot of input.snapshots||[]){
  const source=new URL(snapshot.sourceUrl);
  if(source.origin!=='https://www.oliveyoung.co.kr'||!['/store/main/getBestList.do','/store/display/getMCategoryList.do'].includes(source.pathname))throw Error('Unapproved source');
  // Keep category/pagination provenance, discard analytics and all unknown query values.
  const safe=new URL(source.origin+source.pathname);
  for(const key of ['dispCatNo','fltDispCatNo','pageIdx','rowsPerPage'])if(source.searchParams.get(key))safe.searchParams.set(key,source.searchParams.get(key));
  for(const item of snapshot.products||[]){
    const groups={'100000100010013':'스킨/토너','1000001000100140001':'에센스/세럼/앰플','1000001000100150001':'크림','100000100010016':'로션'};
    const pageGroup=groups[source.searchParams.get('dispCatNo')];
    const categoryPath=item.categoryPath||(pageGroup?'01 > 스킨케어 > '+pageGroup:'');
    if(item.soldOut||!categoryPath.includes('스킨케어')||!item.brand||!item.name)continue;
    const productUrl=normalizeOliveYoungProductUrl(item.productUrl);if(!productUrl)continue;
    const type=RECOMMENDATION_TYPES.cosmetic.find(type=>matchesRecommendationType(item.name,item.brand,type));if(!type)continue;
    const id=new URL(productUrl).searchParams.get('goodsNo');
    if(!products.has(id))products.set(id,{id,name:item.name,brand:item.brand,type,productUrl,
      imageUrl:normalizeOliveYoungImageUrl(item.imageUrl),categoryPath,
      sourceListUrl:safe.href,checkedAt:snapshot.checkedAt});
  }
}
const counts=Object.fromEntries(RECOMMENDATION_TYPES.cosmetic.map(type=>[type,[...products.values()].filter(p=>p.type===type).length]));
if(Object.values(counts).some(n=>n<1))throw Error('Every requested type needs official inventory rows');
const output={version:1,checkedAt:input.collectedAt,scope:'captured_public_lists_not_full_inventory',products:[...products.values()]};
await writeFile(new URL('../data/retail_listings.json',import.meta.url),JSON.stringify(output,null,2)+'\n','utf8');
console.log(JSON.stringify({total:products.size,counts}));
