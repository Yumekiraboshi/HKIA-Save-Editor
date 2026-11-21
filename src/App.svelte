<script lang="ts">
 import {onMount} from 'svelte';
 import {openSave,changeCollection,undo,redo,reset,exportSave,type SaveSnapshot} from './worker-client';
 type Item=[number,string,string,string,number];
 type Catalog={version:string;groups:Array<[string,number]>;items:Item[]};
 const EPOCH=621355968000000000n;
 const MAX_TICKS=3155378975999999999n;
 const PAGE=80;
 let catalog:Catalog|null=$state(null);
 let snapshot:SaveSnapshot|null=$state(null);
 let history:Record<string,bigint>=$state({});
 let filename=$state('');
 let busy=$state(false);
 let error=$state('');
 let notice=$state('');
 let search=$state('');
 let group=$state('all');
 let status=$state('all');
 let page=$state(0);
 let editId:number|null=$state(null);
 let editTime=$state('');

 onMount(()=>{
  fetch(import.meta.env.BASE_URL+'catalog.json')
   .then(r=>r.ok?r.json():Promise.reject(Error('アイテム定義を読み込めませんでした。')))
   .then((v:Catalog)=>{if(!Array.isArray(v.items)||!Array.isArray(v.groups))throw Error('アイテム定義が不正です。');catalog=v})
   .catch(e=>error=e instanceof Error?e.message:String(e));
 });
 const rows=$derived.by(()=>{
  const source=catalog?.items??[];
  const ids=new Set(source.map(x=>x[0]));
  const missing:Item[]=[];
  for(const id of Object.keys(history)){
   const n=Number(id);
   if(!ids.has(n))missing.push([n,'unknown_item_'+id,'unmapped','unmapped',4]);
  }
  const query=search.trim().toLocaleLowerCase();
  const filtered=[...source,...missing].filter(x=>{
   if(group!=='all'&&x[3]!==group)return false;
   const has=history[String(x[0])]!==undefined;
   if(status==='owned'&&!has||status==='missing'&&has)return false;
   return query.length===0||x[1].toLocaleLowerCase().includes(query)||String(x[0]).includes(query)||x[2].toLocaleLowerCase().includes(query);
  });
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE));
  const safe=Math.min(page,pages-1);
  return {total:filtered.length,pages,page:safe,items:filtered.slice(safe*PAGE,(safe+1)*PAGE)};
 });
 const ownedCount=$derived(Object.keys(history).length);
 const canGrant=$derived(Boolean((snapshot as SaveSnapshot | null)?.version && (snapshot as SaveSnapshot | null)?.version===(catalog as Catalog | null)?.version));
 function humanize(s:string){
  return s.replace(/^(collections_group_|collection_group_|collection_|item_)/,'').replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2');
 }
 function glyph(s:string){
  if(/fish/.test(s))return '🐟';
  if(/food|recipe|cook/.test(s))return '🍓';
  if(/flower|plant/.test(s))return '🌸';
  if(/clothing|hat/.test(s))return '🎀';
  if(/furniture|floorplan|home/.test(s))return '🪑';
  if(/music/.test(s))return '🎼';
  if(/event|birthday/.test(s))return '⭐';
  if(/trinket|weather/.test(s))return '✨';
  return '🌷';
 }
 function tickLabel(t:bigint){
  const millis=(t-EPOCH)/10000n;
  if(millis < -8640000000000000n||millis > 8640000000000000n)return '日時不明 · '+String(t);
  const date=new Date(Number(millis));
  return Number.isNaN(date.getTime())?'日時不明 · '+String(t):new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short'}).format(date);
 }
 function inputDate(t:bigint){
  const ms=(t-EPOCH)/10000n;
  if(ms< -8640000000000000n||ms>8640000000000000n)return '';
  const d=new Date(Number(ms));
  if(Number.isNaN(d.valueOf())||d.getFullYear()<1||d.getFullYear()>9999)return '';
  const pad=(n:number,size=2)=>String(n).padStart(size,'0');
  return [pad(d.getFullYear(),4),pad(d.getMonth()+1),pad(d.getDate())].join('-')+'T'+[pad(d.getHours()),pad(d.getMinutes())].join(':');
 }
 function parsedDate(s:string):bigint{
  const t=new Date(s).getTime();
  if(!s||!Number.isFinite(t))throw Error('有効な日時を入力してください。');
  const ticks=EPOCH+BigInt(t)*10000n;
  if(ticks<1n||ticks>MAX_TICKS)throw Error('日時が保存可能な範囲を超えています。');
  return ticks;
 }
 function refresh(s:SaveSnapshot){
  snapshot=s;
  history=Object.fromEntries(s.entries.map(([id,t])=>[String(id),t]));
 }
 async function load(file:File){
  if(busy)return;
  busy=true;error='';notice='';snapshot=null;history={};editId=null;
  try{
   if(file.size>60*1024*1024)throw Error('ファイルは60MB以下にしてください。');
   const result=await openSave(file);
   filename=file.name;refresh(result);page=0;
   notice='読み込みました。編集しても元のファイルは変更されません。';
  }catch(e){error=e instanceof Error?e.message:String(e)}
  finally{busy=false}
 }
 async function change(id:number,before:bigint|null,after:bigint|null){
  if(busy||!snapshot)return;
  busy=true;error='';notice='';
  try{
   refresh(await changeCollection(id,before,after));editId=null;
   notice='変更内容を一時保存しました。ファイルへ反映するには「編集済みを保存」を選んでください。';
  }catch(e){error=e instanceof Error?e.message:String(e)}
  finally{busy=false}
 }
 async function historyAction(action:'undo'|'redo'|'reset'){
  if(busy||!snapshot)return;
  busy=true;error='';
  try{refresh(await (action==='undo'?undo():action==='redo'?redo():reset()));notice='変更履歴を更新しました。';editId=null;}
  catch(e){error=e instanceof Error?e.message:String(e)}
  finally{busy=false}
 }
 async function download(){
  if(busy||!snapshot?.dirty)return;
  busy=true;error='';notice='';
  try{
   const bytes=await exportSave();
   const array=new Uint8Array(bytes.length);array.set(bytes);
   const blob=new Blob([array.buffer],{type:snapshot.zip?'application/zip':'application/octet-stream'});
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');
   a.href=url;a.download=filename.replace(/\.(zip|save)$/i,'').replace(/[^a-zA-Z0-9_.-]/g,'_')+'-edited.'+(snapshot.zip?'zip':'save');
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   notice='新しいセーブを出力しました。元ファイルはそのまま残っています。';
  }catch(e){error=e instanceof Error?e.message:String(e)}
  finally{busy=false}
 }
</script>

<svelte:head>
 <meta name="description" content="夢綺羅星のHello Kitty Island Adventure用ローカルセーブエディター。"/>
</svelte:head>

<div class="shell">
 <header class="header">
  <div class="identity"><div class="emblem">✦</div><div><div class="eyebrow">YUMEKIRABOSHI</div><h1>HKIA Save Editor</h1><p>夢のコレクションを、あなたの手で。</p></div></div>
  <span class="privacy"><span class="dot"></span> ローカル処理のみ</span>
 </header>
 <main>
  <section class="hero">
   <div><span class="section-kicker">COLLECTION EDITOR</span><h2>コレクション編集</h2>
   <p>ゲーム内のコレクション履歴（Key1）の取得・未取得・記録日時を編集します。ファイルの解析と書き出しはRust/WASMのWeb Workerで実行します。</p></div>
   <div class="hero-icon" aria-hidden="true">🦋</div>
  </section>
  <section class="card upload">
   <div class="upload-copy"><span class="card-label">01 · セーブを読み込む</span>
   <h3>セーブファイルを選択</h3>
   <p>対応形式：HKIA 3.0.0 / 3.0.1 のZIPまたは単体セーブ。ファイルは端末から送信されません。</p></div>
   <label class="upload-button">
    <input type="file" accept=".zip,.save,.dat,application/zip" disabled={busy} onchange={e=>{const input=e.currentTarget;if(input.files?.[0])void load(input.files[0]);input.value=''}}/>
    <span>{busy?'処理中…':snapshot?'別のセーブを開く':'ファイルを選択'}</span>
   </label>
   {#if snapshot}
   <div class="file-info"><strong>✓ {filename}</strong><span>v{snapshot.version} · {snapshot.zip?'ZIP':'単体セーブ'} · {ownedCount.toLocaleString()}件取得 · 変更{snapshot.dirty?'あり':'なし'}</span></div>
   {/if}
  </section>
  {#if error}<div class="message error" role="alert">{error}</div>{/if}
  {#if notice}<div class="message success" role="status">{notice}</div>{/if}
  {#if snapshot}
   <section class="toolbar card">
    <div><span class="card-label">02 · 編集</span><h3>収集アイテムを探す</h3><p>定義データはv{catalog?.version??'…'}。ゲーム内の所有や実績は自動変更しません。</p></div>
    <div class="tools">
     <button class="plain" disabled={busy||!snapshot.canUndo} onclick={()=>void historyAction('undo')}>↶ 元に戻す</button>
     <button class="plain" disabled={busy||!snapshot.canRedo} onclick={()=>void historyAction('redo')}>↷ やり直す</button>
     <button class="plain" disabled={busy||!snapshot.dirty} onclick={()=>void historyAction('reset')}>変更を破棄</button>
     <button class="primary" disabled={busy||!snapshot.dirty} onclick={()=>void download()}>編集済みを保存</button>
    </div>
   </section>
   <section class="card browser">
    <div class="filters">
     <label>検索<input type="search" placeholder="アイテム名・ID・カテゴリ" bind:value={search} oninput={()=>page=0}/></label>
     <label>グループ<select bind:value={group} onchange={()=>page=0}><option value="all">すべてのグループ</option>
      {#each catalog?.groups??[] as g (g[0])}<option value={g[0]}>{humanize(g[0])}</option>{/each}
      <option value="unmapped">定義未登録（保存済み）</option>
     </select></label>
     <label>状態<select bind:value={status} onchange={()=>page=0}><option value="all">すべて</option><option value="owned">取得済み</option><option value="missing">未取得</option></select></label>
    </div>
    <div class="result-top"><span>{rows.total.toLocaleString()}件</span><span>{rows.page+1} / {rows.pages} ページ</span></div>
    <div class="item-list">
     {#each rows.items as item (item[0])}
      {@const ticks=history[String(item[0])]}
      {@const obtained=ticks!==undefined}
      {@const restricted=Boolean(item[4]&3)}
      <article class="item" class:obtained>
       <div class="item-symbol" aria-hidden="true">{glyph(item[3])}</div>
       <div class="item-body"><strong>{humanize(item[1])}</strong><span class="item-sub">ID {item[0]} · {humanize(item[2])}</span>
        <span class="item-meta">{obtained?tickLabel(ticks):'未取得'}{restricted?' · DLC/イベント条件あり':''}</span>
        {#if editId===item[0] && obtained}
         <div class="date-edit"><label>記録日時<input type="datetime-local" bind:value={editTime}/></label>
         <button class="small primary" disabled={busy||!editTime} onclick={()=>{try{void change(item[0],ticks,parsedDate(editTime))}catch(e){error=e instanceof Error?e.message:String(e)}}}>日時を更新</button>
         <button class="small plain" onclick={()=>editId=null}>キャンセル</button></div>
        {/if}
       </div>
       <div class="item-actions">
        {#if obtained}
         <span class="state-pill yes">取得済み</span>
         <button class="small" disabled={busy} onclick={()=>{editId=item[0];editTime=inputDate(ticks)}}>日時</button>
         <button class="small danger" disabled={busy} onclick={()=>void change(item[0],ticks,null)}>未取得にする</button>
        {:else}
         <span class="state-pill">未取得</span>
         <button class="small primary" disabled={busy||!canGrant||restricted||Boolean(item[4]&4)} title={!canGrant?'定義とセーブのバージョンが異なります。':restricted?'DLC/イベント条件が未検証です。':''} onclick={()=>void change(item[0],null,EPOCH+BigInt(Date.now())*10000n)}>取得にする</button>
        {/if}
       </div>
      </article>
     {/each}
    </div>
    {#if rows.items.length===0}<div class="empty">{catalog?'条件に一致するアイテムはありません。':'アイテム定義を読み込み中…'}</div>{/if}
    <div class="pages"><button class="plain" disabled={rows.page===0} onclick={()=>page=Math.max(0,rows.page-1)}>前へ</button><span>{rows.page+1} / {rows.pages}</span><button class="plain" disabled={rows.page>=rows.pages-1} onclick={()=>page=rows.page+1}>次へ</button></div>
   </section>
   <p class="fine-print">編集するのはコレクション履歴だけです。アイテムの所有権、DLC、実績、報酬、クエストなどは変更しません。セーブのバックアップを残し、ゲーム内での動作は自己責任で確認してください。</p>
  {:else}
   <div class="empty-start"><div>✧</div><p>セーブを読み込むと、ここにコレクション一覧が表示されます。</p></div>
  {/if}
 </main>
 <footer>夢綺羅星 · Yumekiraboshi <span>非公式ツール / Sunblink・SANRIOとは提携していません。</span></footer>
</div>
