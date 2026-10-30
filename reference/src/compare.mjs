import fs from 'node:fs';
import {compareIngredients} from './ingredient-validation.mjs';
const [goldFile,outputFile]=process.argv.slice(2);
if(!goldFile||!outputFile){console.error('사용법: node src/compare.mjs 정답.json 출력.json\n두 파일은 성분 문자열 배열입니다.');process.exit(2);}
try{
 const a=JSON.parse(fs.readFileSync(goldFile,'utf8').replace(/^\uFEFF/,''));
 const b=JSON.parse(fs.readFileSync(outputFile,'utf8').replace(/^\uFEFF/,''));
 const result=compareIngredients(a,b);console.log(JSON.stringify(result,null,2));process.exitCode=result.pass?0:1;
}catch(error){console.error(error.message);process.exitCode=2;}
