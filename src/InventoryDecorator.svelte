<script lang="ts">
 import art from '../data/inventory-decorator-art-v3.0.1.json';
 let {type,primaryColor,patternUrl,iconColor}:{type:number;primaryColor?:string;patternUrl?:string;iconColor?:string}=$props();
 const base=import.meta.env.BASE_URL;
 const root=base+'inventory-decorators/';
 const rgba=(c:number[])=>'rgba('+c.slice(0,3).map(v=>Math.round(v*255)).join(',')+','+c[3]+')';
 let row=$derived(art.rows.find(r=>r.type===type));
 const hex=/^#[0-9a-f]{6}$/;
 let dyeTint=$derived(type===14&&!!primaryColor&&hex.test(primaryColor)&&!!iconColor&&hex.test(iconColor));
 const patternBadge=$derived(type===11);
 const innerSize=$derived(patternBadge?art.geometry.outer:art.geometry.inner);
 let icon=$derived(type===11&&patternUrl&&/^pattern-(?:[1-9]|1[0-6])\.webp$/.test(patternUrl)?base+'inventory-ui/'+patternUrl:row?.sprite?root+row.sprite.file:undefined);
</script>
{#if row&&icon&&(type!==14||dyeTint)}
 <span class="native-inventory-decorator" class:full-bleed-pattern={patternBadge} data-native-decorator={type} aria-hidden="true"
  style:--plate={'url("'+root+art.plate.file+'")'}
  style:--primary={(type===12||dyeTint)&&primaryColor?primaryColor:rgba(row.primary)} style:--accent={rgba(row.accent)}
  style:width={art.geometry.outer+'px'} style:height={art.geometry.outer+'px'}>
  <span class="plate-inner" style:width={innerSize+'px'} style:height={innerSize+'px'}></span>
  <span class="native-decorator-icon-clip" class:native-dye-icon-clip={dyeTint} style:width={innerSize+'px'} style:height={innerSize+'px'}>
   {#if dyeTint}
    <span class="native-dye-icon-tint" style:background-color={iconColor} style:mask-image={'url("'+icon+'")' }></span>
   {:else}
    <img class:flower-pattern={type===11} src={icon} alt="" width={innerSize} height={innerSize}/>
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
 /* Flower Effect/Pattern is a circular crop of the square image itself.
    Do not inset it into a second circle or retain the 2px accent rim. */
 .full-bleed-pattern{clip-path:circle(50% at 50% 50%)}
 .full-bleed-pattern::before{display:none}
 .full-bleed-pattern .plate-inner,.full-bleed-pattern .native-decorator-icon-clip{mask-image:none}
 .full-bleed-pattern img{object-fit:cover}
 /* Source 54px pattern tiles have a 2px border in these ten cases.
    Remove that border from the sampling footprint, not from the asset.
    Keep the central pivot and preserve native intentional transparency
    (especially Alternate/Ombre). Glow and Trim are small by design. */
 img.flower-pattern:is([src$="/pattern-1.webp"],[src$="/pattern-2.webp"],[src$="/pattern-5.webp"],[src$="/pattern-8.webp"],[src$="/pattern-9.webp"],[src$="/pattern-10.webp"],[src$="/pattern-11.webp"],[src$="/pattern-12.webp"],[src$="/pattern-13.webp"],[src$="/pattern-14.webp"]){
  transform:scale(1.08);transform-origin:center;
 }
</style>
