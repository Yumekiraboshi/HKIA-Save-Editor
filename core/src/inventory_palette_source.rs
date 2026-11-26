//! Original BYOB custom palette output colors. No acquisition/ownership inference.
mod data { include!("inventory_palette_source_data.rs"); }
/// Output definition for a flower color index and a recipe slot:
/// 0 = base, 1/2 = black additive count, 3/4 = white additive count.
/// This is a lookup, not permission to create or edit an inventory item.
pub fn palette_output_color(color_index:i32,recipe_slot:usize)->Option<[u32;4]>{
 let i=usize::try_from(color_index.checked_sub(1)?).ok()?;
 data::PALETTE_COLORS.get(i)?.get(recipe_slot).copied()
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn exact_source_outputs_and_bounds(){
  let rows=&data::PALETTE_COLORS;
  let raw:Vec<u8>=rows.iter().flatten().flatten().flat_map(|w|w.to_le_bytes()).collect();
  let digest:String=crate::digest::sha256(&raw).iter().map(|b|format!("{b:02x}")).collect();
  assert_eq!(digest,"76304a597cd7328c8696e580aa4644f0b638e8c9ff3e5be3f9ab8b6c85501937");
  assert_eq!(raw.len(),2320);
  assert_eq!(rows.iter().flatten().copied().collect::<std::collections::HashSet<_>>().len(),144);
  assert!(rows.iter().flatten().all(|c|c[3]==0x3f800000&&c.iter().all(|&w|(0.0..=1.0).contains(&f32::from_bits(w)))));
  assert_eq!(palette_output_color(1,0),Some([0x3f41c1c2,0x3e24a4a5,0x3e74f4f5,0x3f800000]));
  assert_eq!(palette_output_color(14,2),Some([0,0,0,0x3f800000]));
  assert_eq!(palette_output_color(16,4),palette_output_color(17,4));
  for i in [i32::MIN,-1,0,30,i32::MAX]{assert!(palette_output_color(i,0).is_none());}
  assert!(palette_output_color(1,5).is_none());
 }
}
