import {spawnSync} from 'node:child_process';
import {mkdirSync,copyFileSync} from 'node:fs';
const r=spawnSync('cargo',['build','--release','--target','wasm32-unknown-unknown','-p','hkia-web-editor'],{stdio:'inherit',shell:process.platform==='win32'});
if(r.status!==0)process.exit(r.status??1);
mkdirSync('public',{recursive:true});
copyFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm','public/editor.wasm');
