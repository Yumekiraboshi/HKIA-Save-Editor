<script lang="ts">
 import art from '../data/inventory-decorator-art-v3.0.1.json';
 let {type,primaryColor,secondaryColor,patternUrl,iconColor}:{type:number;primaryColor?:string;secondaryColor?:string;patternUrl?:string;iconColor?:string}=$props();
 const base=import.meta.env.BASE_URL;
 const root=base+'inventory-decorators/';
 const rgba=(c:number[])=>'rgba('+c.slice(0,3).map(v=>Math.round(v*255)).join(',')+','+c[3]+')';
 let row=$derived(art.rows.find(r=>r.type===type));
 const hex=/^#[0-9a-f]{6}$/;
 let dyeTint=$derived(type===14&&!!primaryColor&&hex.test(primaryColor)&&!!iconColor&&hex.test(iconColor));
 let icon=$derived(type===11&&patternUrl&&/^pattern-(?:[1-9]|1[0-6])\.webp$/.test(patternUrl)?base+'inventory-ui/'+patternUrl:row?.sprite?root+row.sprite.file:undefined);
</script>
{#if row&&icon&&(type!==14||dyeTint)}
 <span class="native-inventory-decorator" data-native-decorator={type} aria-hidden="true"
  style:--plate={'url("'+root+art.plate.file+'")'}
  style:--primary={(type===12||dyeTint)&&primaryColor?primaryColor:rgba(row.primary)} style:--accent={rgba(row.accent)}
  style:width={art.geometry.outer+'px'} style:height={art.geometry.outer+'px'}>
  <span class="plate-inner" data-flower-two-tone={type===12&&primaryColor&&secondaryColor?'true':undefined}
   style:background-image={type===12&&primaryColor&&secondaryColor?'linear-gradient(135deg, '+primaryColor+' 0 50%, '+secondaryColor+' 50% 100%)':undefined}
   style:width={art.geometry.inner+'px'} style:height={art.geometry.inner+'px'}></span>
  <span class="native-decorator-icon-clip" class:native-dye-icon-clip={dyeTint} style:width={art.geometry.inner+'px'} style:height={art.geometry.inner+'px'}>
   {#if dyeTint}
    <span class="native-dye-icon-tint" style:background-color={iconColor} style:mask-image={'url("'+icon+'")' }></span>
   {:else}
    <img src={icon} alt="" width={art.geometry.inner} height={art.geometry.inner}/>
   {/if}
  </span>
 </span>
{/if}
<style>
 .native-inventory-decorator{position:relative;flex:none;display:grid;place-items:center;isolation:isolate;pointer-events:none}
 .native-inventory-decorator::before{content:'';position:absolute;inset:0;background:var(--accent);mask-image:var(--plate);mask-size:100% 100%;mask-repeat:no-repeat;z-index:-2}
 /* All foreground artwork shares the primary plate silhouette. Neither
    the diagonal dye Sprite nor the square flower pattern/effect Sprite
    may cover the rim or protrude beyond the circular inner area. */
 .plate-inner,.native-decorator-icon-clip{position:absolute;mask-image:var(--plate);mask-size:100% 100%;mask-position:center;mask-repeat:no-repeat;mask-mode:alpha}
 .plate-inner{background:var(--primary);z-index:-1}
 .native-dye-icon-tint{display:block;width:100%;height:100%;mask-size:100% 100%;mask-position:center;mask-repeat:no-repeat;mask-mode:alpha}
 img{display:block;object-fit:contain}
</style>
