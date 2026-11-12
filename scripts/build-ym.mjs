// Preserve the three-file ym delivery contract by bundling the tested integration UI.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(process.argv[2]||resolve(root,'../GlowPick-ym'));
const check=process.argv.includes('--check');
if(execFileSync('git',['branch','--show-current'],{cwd:target,encoding:'utf8'}).trim()!=='ym')
  throw Error('Target must be a worktree on ym; other branches are never written.');
const result=await build({entryPoints:[resolve(root,'BeautyAI/script.js')],bundle:true,write:false,
  platform:'browser',format:'iife',target:'es2022',charset:'utf8',legalComments:'none',
  banner:{js:'// Generated from integration/hf-static-final with scripts/build-ym.mjs. Edit integration sources and rebuild.'}});
const files={
  'index.html':(await readFile(resolve(root,'BeautyAI/index.html'),'utf8')).replace('<script type="module" src="script.js"></script>','<script defer src="script.js"></script>'),
  'style.css':await readFile(resolve(root,'BeautyAI/style.css'),'utf8'),
  'script.js':result.outputFiles[0].text
};
for(const [name,content] of Object.entries(files)){
  const path=resolve(target,'BeautyAI',name);
  if(check){if((await readFile(path,'utf8')).replace(/\r\n/gu,'\n')!==content.replace(/\r\n/gu,'\n'))throw Error('ym build differs: '+name);}
  else await writeFile(path,content,'utf8');
}
console.log(check?'ym: three generated files match the tested integration sources.':'ym: updated only BeautyAI/index.html, style.css, script.js.');
