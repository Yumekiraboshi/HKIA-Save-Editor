<script lang="ts">
 import art from '../data/inventory-decorator-art-v3.0.1.json';
 let {type}:{type:number}=$props();
 const root=import.meta.env.BASE_URL+'inventory-decorators/';
 const rgba=(c:number[])=>'rgba('+c.slice(0,3).map(v=>Math.round(v*255)).join(',')+','+c[3]+')';
 let row=$derived(art.rows.find(r=>r.type===type));
</script>
{#if row?.sprite}
 <span class="native-inventory-decorator" data-native-decorator={type} aria-hidden="true"
  style:--plate={'url("'+root+art.plate.file+'")'}
  style:--primary={rgba(row.primary)} style:--accent={rgba(row.accent)}
  style:width={art.geometry.outer+'px'} style:height={art.geometry.outer+'px'}>
  <span class="plate-inner" style:width={art.geometry.inner+'px'} style:height={art.geometry.inner+'px'}></span>
  <img src={root+row.sprite.file} alt="" width={art.geometry.inner} height={art.geometry.inner}/>
 </span>
{/if}
<style>
 .native-inventory-decorator{position:absolute;left:50%;top:0;transform:translateX(-50%);display:grid;place-items:center;isolation:isolate;pointer-events:none;z-index:1}
 .native-inventory-decorator::before{content:'';position:absolute;inset:0;background:var(--accent);mask-image:var(--plate);mask-size:100% 100%;mask-repeat:no-repeat;z-index:-2}
 .plate-inner{position:absolute;background:var(--primary);mask-image:var(--plate);mask-size:100% 100%;mask-repeat:no-repeat;z-index:-1}
 img{display:block;object-fit:contain}
</style>
