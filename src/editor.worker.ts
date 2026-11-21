type Action = 'open'|'snapshot'|'change'|'achievement'|'achievement-pair'|'batch'|'undo'|'redo'|'reset'|'export'|'clear';
type AchievementValue = {complete:boolean;current:number;completed:[bigint,number]|null};
type AchievementPatch = {guid:number[];before:AchievementValue;after:AchievementValue};
type Request = { id:number; action:Action; file?:Uint8Array; itemId?:number; expected?:bigint|null; next?:bigint|null; patches?:Array<{id:number;before:bigint|null;after:bigint|null}>;achievementPatches?:AchievementPatch[];guid?:number[];beforeValue?:AchievementValue;afterValue?:AchievementValue };
type Transport = { postMessage(data:unknown, transfer?:Transferable[]):void; onmessage:((event:MessageEvent<Request>)=>void)|null };
type Engine = {
 memory:WebAssembly.Memory;
 hkia_stage(n:number):number; hkia_open():number;
 hkia_change(id:number,expectedPresent:number,old:bigint,nextPresent:number,value:bigint):number;
 hkia_achievement_change(g0:number,g1:number,g2:number,g3:number,bc:number,bp:number,bs:bigint,bn:number,bh:number,ac:number,ap:number,as:bigint,an:number,ah:number):number;
 hkia_achievement_pair_change(
  ...args:[number,number,number,number,number,number,bigint,number,number,number,number,bigint,number,number,
   number,number,number,number,number,number,bigint,number,number,number,number,bigint,number,number]
 ):number;
 hkia_achievement_snapshot():number;
 hkia_counter_snapshot():number;
 hkia_undo():number; hkia_redo():number; hkia_reset():number;
 hkia_snapshot():number; hkia_export():number; hkia_clear():void;
 hkia_reply_ptr():number; hkia_reply_len():number;
 hkia_output_ptr():number; hkia_output_len():number;
};
const context=self as unknown as Transport;
let engine:Promise<Engine>|null=null;
function getEngine():Promise<Engine>{
 if(!engine){
  engine=(async()=>{
   const response=await fetch(import.meta.env.BASE_URL+'editor.wasm',{cache:'no-cache'});
   if(!response.ok)throw Error('WASMファイルを取得できません。');
   const result=await WebAssembly.instantiate(await response.arrayBuffer(),{});
   return result.instance.exports as unknown as Engine;
  })();
 }
 return engine;
}
function readBytes(e:Engine,p:number,n:number):Uint8Array{
 if(n<0||n>60*1024*1024||p<=0||p+n>e.memory.buffer.byteLength)throw Error('WASM応答が不正です。');
 return new Uint8Array(e.memory.buffer,p,n).slice();
}
function snapshot(e:Engine){
 if(e.hkia_snapshot()!==0)throw Error('先にセーブを読み込んでください。');
 const b=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.byteLength<17)throw Error('セーブ一覧の応答が不正です。');
 const version=b[0]===1?'3.0.0':b[0]===2?'3.0.1':null;
 const count=v.getUint32(13,true);
 if(!version||count>1_000_000||b.length!==17+count*12)throw Error('セーブ一覧の形式が不正です。');
 const entries:Array<[number,bigint]>=[];
 for(let i=0;i<count;i++){const p=17+i*12;entries.push([v.getInt32(p,true),v.getBigInt64(p+4,true)]);}
 if(e.hkia_achievement_snapshot()!==0)throw Error('実績の取得に失敗しました。');
 const a=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(a.byteLength<4)throw Error('実績データの形式が不正です。');
 const d=new DataView(a.buffer,a.byteOffset,a.byteLength);
 const total=d.getUint32(0,true);
 if(total>100000||a.length!==4+total*34)throw Error('実績データの形式が不正です。');
 const achievements:Array<{guid:[number,number,number,number];value:AchievementValue}>=[];
 for(let i=0;i<total;i++){
  const p=4+i*34;
  const guid:[number,number,number,number]=[d.getUint32(p,true),d.getUint32(p+4,true),d.getUint32(p+8,true),d.getUint32(p+12,true)];
  const complete=a[p+16]===1;
  const current=d.getFloat32(p+17,true);
  const hasDate=a[p+21];
  if(a[p+16]>1||hasDate>1)throw Error('実績データの形式が不正です。');
  const completed=hasDate===1?[d.getBigInt64(p+22,true),d.getUint32(p+30,true)] as [bigint,number]:null;
  achievements.push({guid,value:{complete,current,completed}});
 }
 if(e.hkia_counter_snapshot()!==0)throw Error('COUNTER_SNAPSHOT_FAILED');
 const raw=readBytes(e,e.hkia_reply_ptr(),e.hkia_reply_len());
 if(raw.length<4)throw Error('COUNTER_SNAPSHOT_INVALID');
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
 const counterCount=view.getUint32(0,true);
 if(counterCount>100000||raw.length!==4+counterCount*28)throw Error('COUNTER_SNAPSHOT_INVALID');
 const counters:Array<{guid:[number,number,number,number];current:number;countedValues:number|null;countedGuids:number}>=[];
 for(let i=0;i<counterCount;i++){
  const offset=4+i*28;
  const guid:[number,number,number,number]=[view.getUint32(offset,true),view.getUint32(offset+4,true),view.getUint32(offset+8,true),view.getUint32(offset+12,true)];
  const current=view.getFloat32(offset+16,true),countedValues=view.getInt32(offset+20,true),countedGuids=view.getUint32(offset+24,true);
  if(!Number.isFinite(current)||countedValues< -1||countedGuids>1000000)throw Error('COUNTER_SNAPSHOT_INVALID');
  counters.push({guid,current,countedValues:countedValues===-1?null:countedValues,countedGuids});
 }
 return {version,zip:(b[1]&1)!==0,membershipEdit:(b[1]&2)!==0,dirty:b[2]===1,canUndo:b[3]===1,canRedo:b[4]===1,revision:v.getUint32(5,true),bytes:v.getUint32(9,true),entries,achievements,counters};
}
function validAchievement(v:AchievementValue):boolean{
 return !!v&&typeof v.complete==='boolean'&&typeof v.current==='number'&&Number.isFinite(v.current)&&v.current>=0&&
 (v.completed===null||(Array.isArray(v.completed)&&v.completed.length===2&&typeof v.completed[0]==='bigint'&&
 v.completed[0]>=0n&&v.completed[0]<=253402300799n&&Number.isInteger(v.completed[1])&&v.completed[1]>=0&&v.completed[1]<1_000_000_000&&v.completed[1]%100===0));
}
function changeAchievement(e:Engine,guid:number[]|undefined,before:AchievementValue|undefined,after:AchievementValue|undefined):boolean{
 if(!Array.isArray(guid)||guid.length!==4||guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||!before||!after||!validAchievement(before)||!validAchievement(after))return false;
 return e.hkia_achievement_change(...guid as [number,number,number,number],Number(before.complete),before.current,before.completed?.[0]??0n,before.completed?.[1]??0,Number(before.completed!==null),Number(after.complete),after.current,after.completed?.[0]??0n,after.completed?.[1]??0,Number(after.completed!==null))===0;
}
type ChangeArgs=[number,number,number,number,number,number,bigint,number,number,number,number,bigint,number,number];
function patchArgs(p:AchievementPatch):ChangeArgs{
 const {guid,before,after}=p;
 if(!Array.isArray(guid)||guid.length!==4||guid.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)||
  !validAchievement(before)||!validAchievement(after))
  throw Error('ACH_PAIR_INVALID');
 return [guid[0],guid[1],guid[2],guid[3],
  Number(before.complete),before.current,before.completed?.[0]??0n,before.completed?.[1]??0,Number(before.completed!==null),
  Number(after.complete),after.current,after.completed?.[0]??0n,after.completed?.[1]??0,Number(after.completed!==null)];
}
async function execute(r:Request):Promise<unknown>{
 const e=await getEngine();
 switch(r.action){
  case 'open':{
   const b=r.file;
   if(!(b instanceof Uint8Array)||b.length<1||b.length>60*1024*1024)throw Error('対応するセーブファイルを選択してください（最大60MB）。');
   e.hkia_clear();
   const p=e.hkia_stage(b.length);
   if(p===0||p+b.length>e.memory.buffer.byteLength)throw Error('セーブ読み込み用の領域を確保できません。');
   new Uint8Array(e.memory.buffer,p,b.length).set(b);
   if(e.hkia_open()!==0)throw Error('対応セーブではありません。形式、ゲームバージョン、破損の有無を確認してください。');
   return snapshot(e);
  }
  case 'snapshot':return snapshot(e);
  case 'change':{
   if(typeof r.itemId!=='number'||!Number.isInteger(r.itemId)||r.itemId<=0||r.itemId>2147483647)throw Error('ItemIdが不正です。');
   const a=r.expected??null,b=r.next??null;
   if(e.hkia_change(r.itemId,a===null?0:1,a??0n,b===null?0:1,b??0n)!==0)throw Error('変更できませんでした。元の値か編集条件が一致しません。');
   return snapshot(e);
  }
  case 'achievement':{
   if(!changeAchievement(e,r.guid,r.beforeValue,r.afterValue))throw Error('実績を変更できませんでした。編集条件を確認してください。');
   return snapshot(e);
  }
  case 'achievement-pair':{
   const patches=r.achievementPatches;
   if(!Array.isArray(patches)||patches.length!==2)throw Error('ACH_PAIR_INVALID');
   const a=patchArgs(patches[0]),b=patchArgs(patches[1]);
   if(e.hkia_achievement_pair_change(...a,...b)!==0)
    throw Error('ACH_PAIR_CONFLICT');
   return snapshot(e);
  }
  case 'batch':{
   const patches=r.patches;
   const achievements=r.achievementPatches??[];
   if(!Array.isArray(patches)||patches.length>20000||!Array.isArray(achievements)||achievements.length>10000)throw Error('DRAFT_INVALID');
   for(const p of patches){
    if(!Number.isInteger(p.id)||p.id<=0||p.id>2147483647){
     e.hkia_reset();throw Error('DRAFT_INVALID');
    }
    const before=p.before??null,after=p.after??null;
    if(e.hkia_change(p.id,before===null?0:1,before??0n,after===null?0:1,after??0n)!==0){
     e.hkia_reset();throw Error('DRAFT_CONFLICT');
    }
   }
   for(const p of achievements){
    if(!changeAchievement(e,p.guid,p.before,p.after)){e.hkia_reset();throw Error('DRAFT_CONFLICT');}
   }
   return snapshot(e);
  }
  case 'undo':if(e.hkia_undo()!==0)throw Error('戻せる変更がありません。');return snapshot(e);
  case 'redo':if(e.hkia_redo()!==0)throw Error('やり直せる変更がありません。');return snapshot(e);
  case 'reset':if(e.hkia_reset()!==0)throw Error('セーブが読み込まれていません。');return snapshot(e);
  case 'export':{
   if(e.hkia_export()!==0)throw Error('書き出し後の再検証に失敗しました。データは出力していません。');
   const b=readBytes(e,e.hkia_output_ptr(),e.hkia_output_len());
   return b;
  }
  case 'clear':e.hkia_clear();return null;
 }
}
context.onmessage=async({data:r})=>{
 try{
  const value=await execute(r);
  if(value instanceof Uint8Array)context.postMessage({id:r.id,ok:true,value},[value.buffer]);
  else context.postMessage({id:r.id,ok:true,value});
 }catch(e){
  context.postMessage({id:r.id,ok:false,error:e instanceof Error?e.message:'不明なエラー'});
 }
};
