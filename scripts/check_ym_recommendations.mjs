import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
execFileSync(process.execPath,[fileURLToPath(new URL('./build-ym.mjs',import.meta.url)),process.argv[2],'--check'],{stdio:'inherit'});
