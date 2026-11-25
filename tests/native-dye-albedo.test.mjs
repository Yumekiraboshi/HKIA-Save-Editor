import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('native dye albedo supports all five native palette channels and base alpha',()=>{
 const dir=fileURLToPath(new URL('../scripts/',import.meta.url));
 assert.match(execFileSync('python3',['-c',`
from native_dye_albedo import dye_albedo
p=[(1,0,0),(0,1,0),(0,0,1),(1,1,0),(1,0,1)]
b=(.5,.5,.5)
for mask,i in [((0,0,0,1),0),((1,0,0,1),1),((0,1,0,1),2),((0,0,1,1),3),((1,1,1,0),4)]:
 assert dye_albedo(b,mask,1,p)==tuple(.5*x for x in p[i])
 assert dye_albedo(b,mask,0,p)==b
assert dye_albedo(b,(.5,0,0,1),1,p)==(.25,.25,0)
assert dye_albedo(b,(0,0,0,.5),1,p)==(.5,0,.25)
try: dye_albedo(b,(0,0,0,1),1,p[:4])
except ValueError: pass
else: raise AssertionError('missing palette accepted')
print('NATIVE_DYE_ALBEDO_OK')
`],{cwd:dir,encoding:'utf8'}),/NATIVE_DYE_ALBEDO_OK/);
});
