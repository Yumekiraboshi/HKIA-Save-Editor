/** Local-only diagnostic cases and atomic PNG export. Not production art. */
import assert from 'node:assert/strict';
import {writeFileSync,existsSync,realpathSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute,basename} from 'node:path';
import {createHash} from 'node:crypto';
export function furnitureDiagnosticCases(item,authored=false){
 assert.ok(['chair','rug'].includes(item),'--item must be chair or rug');
 return {itemId:item==='rug'?32709745:90163601,useAuthored:authored||item==='rug',
  cases:item==='rug'?Array.from({length:6},(_,i)=>[207+i,0,0]):[[364,532,0],[366,532,0],[18,532,0],[234,532,0],[235,532,0],[232,532,0],[518,532,0],[518,519,0],[518,520,0],[520,519,0]]};
}
export function diagnosticOutputPath(out,roots){
 const absolute=resolve(out),target=join(realpathSync(dirname(absolute)),basename(absolute));
 assert.ok(!existsSync(target),'output already exists');
 for(const path of roots){
  const rel=relative(realpathSync(path),target);
  assert.ok(rel!==''&&(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')),'output must be outside repo and source directories');
 }
 return target;
}
export function exportFurnitureDiagnostic(target,report,result){
 assert.ok(!existsSync(target),'output already exists');
 assert.ok(Number.isSafeInteger(report.itemId)&&report.itemId>0&&report.renderFidelity==='unverified'&&report.result.length===result.length,'diagnostic report');
 const temp=mkdtempSync(join(dirname(target),'.furniture-diagnostic-'));
 try{
  const rows=result.map((row,i)=>{
   assert.ok(Array.isArray(row.indices)&&row.indices.length===3&&row.indices.every(x=>Number.isSafeInteger(x)&&x>=0)&&JSON.stringify(row.indices)===JSON.stringify(report.result[i].indices),'diagnostic indices');
   assert.ok(typeof row.png==='string'&&row.png.length>0&&row.png.length<4*1024*1024,'PNG bytes');
   const bytes=Buffer.from(row.png,'base64');
   assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
   const file=report.itemId+'-'+row.indices.join('-')+'.png';
   writeFileSync(join(temp,file),bytes,{flag:'wx'});
   return {...report.result[i],file,pngSha256:createHash('sha256').update(bytes).digest('hex')};
  });
  const output={...report,result:rows};
  writeFileSync(join(temp,'report.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  assert.ok(!existsSync(target),'output appeared');
  renameSync(temp,target);
  return output;
 }finally{rmSync(temp,{recursive:true,force:true});}
}
