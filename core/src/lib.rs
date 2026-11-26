//! HKIA bounded slot core and explicit private minimum Writer. No authentication or live activation.
#![forbid(unsafe_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error { Budget, Truncated, InvalidDistance, LengthMismatch, Overflow, InvalidToken, Schema, Version, Marker, Duplicate, Trailing }

/// Current JS-compatible safety ceiling, not the future design target.
pub const MAX_INPUT: usize = 25 * 1024 * 1024;
pub const MAX_DECODED: usize = 45 * 1024 * 1024;
pub const MAX_BLOCK: usize = 65_536;
pub const MAX_BLOCKS: usize = 4096;

fn byte(src: &[u8], at: &mut usize) -> Result<u8, Error> {
    let b = *src.get(*at).ok_or(Error::Truncated)?;
    *at += 1;
    Ok(b)
}
fn length(src: &[u8], at: &mut usize, initial: usize) -> Result<usize, Error> {
    let mut n = initial;
    if initial == 15 {
        loop {
            let b = byte(src, at)?;
            n = n.checked_add(b as usize).ok_or(Error::Overflow)?;
            if b != 255 { break; }
        }
    }
    Ok(n)
}
/// Decode a single bounded raw LZ4 block, with overlap-safe match expansion.
/// The caller must separately validate the SaveGameV2 envelope, schema and total budget.
pub fn decode_block(src: &[u8], expected: usize) -> Result<Vec<u8>, Error> {
    if src.len() > MAX_INPUT || expected == 0 || expected > MAX_BLOCK { return Err(Error::Budget); }
    let mut out = Vec::with_capacity(expected);
    decode_block_append(src, expected, &mut out)?;
    Ok(out)
}

/// Append one *independent* LZ4 block into a caller-owned, pre-budgeted buffer.
/// Distance is relative to this block's start, never to earlier decoded blocks.
/// On every failure the prior prefix remains byte-for-byte intact; the caller
/// must still discard a failed envelope rather than exporting partial output.
pub(crate) fn decode_block_append(src: &[u8], expected: usize, out: &mut Vec<u8>) -> Result<(), Error> {
    if src.len() > MAX_INPUT || expected == 0 || expected > MAX_BLOCK { return Err(Error::Budget); }
    let base = out.len();
    let end = base.checked_add(expected).ok_or(Error::Overflow)?;
    if end > MAX_DECODED { return Err(Error::Budget); }
    let result = (|| {
        let mut at = 0;
        while at < src.len() {
            let token = byte(src, &mut at)?;
            let literals = length(src, &mut at, (token >> 4) as usize)?;
            let next = (out.len() - base).checked_add(literals).ok_or(Error::Overflow)?;
            if next > expected { return Err(Error::LengthMismatch); }
            let end = at.checked_add(literals).ok_or(Error::Overflow)?;
            out.extend_from_slice(src.get(at..end).ok_or(Error::Truncated)?);
            at = end;
            if at == src.len() { break; }
            let lo = byte(src, &mut at)? as usize;
            let hi = byte(src, &mut at)? as usize;
            let distance = lo | (hi << 8);
            if distance == 0 || distance > out.len() - base { return Err(Error::InvalidDistance); }
            let count = length(src, &mut at, (token & 15) as usize)?
                .checked_add(4).ok_or(Error::Overflow)?;
            let next = (out.len() - base).checked_add(count).ok_or(Error::Overflow)?;
            if next > expected { return Err(Error::LengthMismatch); }
            if distance == 1 {
                // The only possible match byte is already validated inside
                // this block; a bounded repeated fill avoids count serial
                // read/push operations on the aggregate decoded buffer.
                let repeated = out[out.len()-1];
                let end = out.len().checked_add(count).ok_or(Error::Overflow)?;
                out.resize(end, repeated);
            } else {
                // LZ4 overlapping matches repeat the preceding distance-byte
                // window. Copy its available prefix once, then double the
                // already copied match prefix in bounded chunks. This is
                // equivalent to sequential byte pushes even for distance 2,
                // without one indexing/push operation per output byte.
                // The block-local distance and exact expected-size checks
                // above remain mandatory and unchanged.
                let first = count.min(distance);
                let from = out.len() - distance;
                out.extend_from_within(from..from + first);
                let mut copied = first;
                while copied < count {
                    let chunk = copied.min(count - copied);
                    let from = out.len() - copied;
                    out.extend_from_within(from..from + chunk);
                    copied += chunk;
                }
            }
        }
        if out.len() - base != expected { return Err(Error::LengthMismatch); }
        Ok(())
    })();
    if result.is_err() { out.truncate(base); }
    result
}
/// Reject an oversized aggregate before allocation, while keeping block spans external.
pub fn check_block_budget(lengths: &[usize]) -> Result<usize, Error> {
    if lengths.is_empty() || lengths.len() > MAX_BLOCKS { return Err(Error::Budget); }
    let mut total: usize = 0;
    for &n in lengths {
        if n == 0 || n > MAX_BLOCK { return Err(Error::Budget); }
        total = total.checked_add(n).ok_or(Error::Overflow)?;
        if total > MAX_DECODED { return Err(Error::Budget); }
    }
    Ok(total)
}

mod wire;
pub mod envelope;
pub mod native;
mod schema;
pub mod archive;
mod deflate;
pub mod digest;
pub mod collection;
pub mod achievement;
mod document_membership;
mod catalog;
mod inventory_source;
pub mod inventory_palette_source;
mod inventory_source_data;
mod inventory_furniture_reference_data;
mod inventory_clothing_reference_data;
mod inventory_gathered_data;
mod achievement_keys;
#[derive(Debug)]
pub struct ReadSlot { pub envelope: envelope::Envelope, pub index: native::NativeIndex }
pub fn read_slot(raw:&[u8])->Result<ReadSlot,Error>{
 let envelope=envelope::decode_envelope(raw)?;
 let index=native::index_native(&envelope.decoded,envelope.version)?;
 Ok(ReadSlot{envelope,index})
}

/// Source-verified furniture material choices, independent of save edits.
pub mod furniture_source;
