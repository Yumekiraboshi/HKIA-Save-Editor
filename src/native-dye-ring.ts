import type {NativeDyePalette} from './native-dye-palettes';

/** An exact native five-channel palette rendered as an identification ring.
 * Segments are visual swatches, NOT pixels from a game-rendered/colored icon.
 * Unused native channels remain absent; no replacement colors are invented.
 */
export function nativeDyeRing(palette:NativeDyePalette|undefined):string|undefined{
 if(!palette)return undefined;
 const colors=palette.colors.filter((value):value is string=>typeof value==='string'&&/^#[0-9a-f]{6}$/.test(value));
 if(colors.length<2)return undefined;
 const width=360/colors.length;
 const segments=colors.map((color,index)=>
  color+' '+(index*width).toFixed(4)+'deg '+((index+1)*width).toFixed(4)+'deg'
 );
 return 'conic-gradient(from -90deg, '+segments.join(', ')+')';
}
