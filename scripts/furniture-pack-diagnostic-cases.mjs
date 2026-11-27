/** Enumerate default and independent native slot choices without creating
 * the Cartesian product of all slots. This is a diagnostic test schedule,
 * not a save edit rule, a production icon index, or a completeness claim. */
export function furniturePackDiagnosticCases(catalog,modelIds,itemId,defaultsOnly=false){
 if(typeof defaultsOnly!=='boolean')throw Error('FURNITURE_PACK_CASE_MODE');
 const ids=new Set(modelIds),sets=new Map(catalog.sets.map(s=>[s[0],s[2]]));
 if(ids.size!==modelIds.length||sets.size!==catalog.sets.length)throw Error('FURNITURE_PACK_CASE_DUPLICATE');
 if(itemId!==undefined&&(!Number.isSafeInteger(itemId)||itemId<=0||!ids.has(itemId)))throw Error('FURNITURE_PACK_CASE_ITEM');
 const seen=new Set(),rows=[];
 for(const item of catalog.items){
  const id=item[0];if(!ids.has(id))continue;
  if(seen.has(id))throw Error('FURNITURE_PACK_CASE_DUPLICATE');seen.add(id);
  if(itemId!==undefined&&id!==itemId)continue;
  rows.push({itemId:id,indices:[0,0,0]});
  const slots=new Set();
  for(const slot of [...item[4]].sort((a,b)=>a[0]-b[0])){
   const [i,,sourceDefault,keys]=slot;
   if(![0,1,2].includes(i)||slots.has(i)||!Number.isSafeInteger(sourceDefault)||sourceDefault<=0)throw Error('FURNITURE_PACK_CASE_SLOT');
   slots.add(i);
   const allowed=new Set([sourceDefault]);
   for(const key of keys){
    const choices=sets.get(key);if(!choices)throw Error('FURNITURE_PACK_CASE_SET');
    for(const choice of choices){
     if(!Number.isSafeInteger(choice)||choice<=0)throw Error('FURNITURE_PACK_CASE_MATERIAL');
     allowed.add(choice);
    }
   }
   for(const choice of [...allowed].sort((a,b)=>a-b)){
    if(defaultsOnly||choice===sourceDefault)continue;
    const indices=[0,0,0];indices[i]=choice;rows.push({itemId:id,indices});
   }
  }
 }
 if(seen.size!==ids.size||!rows.length)throw Error('FURNITURE_PACK_CASE_COVERAGE');
 return rows.sort((a,b)=>a.itemId-b.itemId);
}
export function furniturePackDiagnosticWindow(rows,offset,limit){
 if(!Number.isSafeInteger(offset)||offset<0||offset>=rows.length||!Number.isSafeInteger(limit)||limit<1||limit>256)throw Error('FURNITURE_PACK_CASE_WINDOW');
 return {total:rows.length,offset,cases:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};
}
