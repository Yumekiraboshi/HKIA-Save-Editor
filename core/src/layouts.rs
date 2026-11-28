//! Local-only Cabin source snapshots. Source correlation is NOT ownership or
//! restore authorization. Reuse the single existing NativeIndex and its typed
//! spans; never decode native values in the UI or write to the slot here.
use crate::{digest::sha256,envelope::Version,Error,ReadSlot,MAX_DECODED};
use std::{collections::{BTreeMap,HashSet},ops::Range};

const MAGIC:&[u8;8]=b"HKIALS01";
const LIMIT:usize=4096;
const MAX_NAME:usize=256;
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum Scope { Room([u32;4]), Cabin([u32;4]), AllCabinSources }
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct LayoutRoom {
    pub cabin:[u32;4],
    pub home:[u32;4],
    pub apartment:u8,
}
struct Source {
    room:LayoutRoom,
    cabin:Range<usize>,
    key:Range<usize>,
    home:Range<usize>,
}
fn checked<'a>(bytes:&'a [u8],range:&Range<usize>)->Result<&'a [u8],Error>{
    if range.start>=range.end{return Err(Error::Schema)}
    bytes.get(range.clone()).ok_or(Error::Schema)
}
fn inside(outer:&Range<usize>,inner:&Range<usize>)->bool{
    outer.start<=inner.start&&inner.start<inner.end&&inner.end<=outer.end
}
fn sources(slot:&ReadSlot)->Result<Vec<Source>,Error>{
    if !matches!(slot.envelope.version,Version::V300|Version::V301){return Err(Error::Version)}
    let i=&slot.index;
    let bytes=&slot.envelope.decoded;
    if bytes.is_empty()||bytes.len()>MAX_DECODED{return Err(Error::Budget)}
    if i.home_incomplete_or_overflow||i.home_duplicate_hash128||
       i.cabin_incomplete_or_overflow||i.cabin_duplicate_hash128||
       i.cabin_apartment_ambiguous||i.home_cabin_source_suppressed||
       i.visitor_manager_incomplete_or_overflow||i.visitor_manager_scoped_suppressed||
       i.home_cabin_source_unresolved!=0||i.visitor_manager_scoped_unresolved!=0||
       i.home_models_seen!=i.home_sources.len()||
       i.cabin_models_seen!=i.cabin_sources.len()||
       i.visitor_managers_seen!=i.visitor_manager_sources.len(){
        return Err(Error::Schema)
    }
    let links=&i.visitor_manager_scoped_links;
    if links.len()>LIMIT||i.home_sources.len()>LIMIT||i.cabin_sources.len()>LIMIT||
       i.visitor_manager_sources.len()>LIMIT||i.visitor_home_map_sources.len()>LIMIT{
        return Err(Error::Budget)
    }
    // Only the verified structural manager route; other HomeModel routes are
    // not silently treated as Cabin records or as owned rooms.
    if links.len()!=i.visitor_home_map_sources.len(){return Err(Error::Schema)}
    let mut rows=Vec::with_capacity(links.len());
    let mut homes=HashSet::new();
    let mut apartments=HashSet::new();
    for link in links{
        if link.home_hash128==[0;4]||link.cabin_hash128==[0;4]||
           !homes.insert(link.home_hash128)||!apartments.insert((link.cabin_hash128,link.apartment)){
            return Err(Error::Duplicate)
        }
        let manager=i.visitor_manager_sources.iter().find(|x|x.whole==link.manager).ok_or(Error::Schema)?;
        let cabin=i.cabin_sources.iter().find(|x|x.hash128==link.cabin_hash128&&x.whole==link.cabin).ok_or(Error::Schema)?;
        let home=i.home_sources.iter().find(|x|x.hash128==link.home_hash128&&x.whole==link.home).ok_or(Error::Schema)?;
        let pair=cabin.apartments.iter().find(|x|x.apartment==link.apartment&&x.home_hash128==link.home_hash128&&x.pair==link.apartment_pair).ok_or(Error::Schema)?;
        let entry=i.visitor_home_map_sources.iter().find(|x|x.home_hash128==link.home_hash128&&x.home==link.home&&x.key==link.homes_key).ok_or(Error::Schema)?;
        if !inside(&manager.whole,&manager.fields[0])||!inside(&manager.whole,&manager.fields[4])||
           !inside(&manager.fields[0],&cabin.whole)||!inside(&cabin.whole,&cabin.fields[6])||
           !inside(&cabin.fields[6],&pair.pair)||!inside(&manager.fields[4],&entry.pair)||
           !inside(&entry.pair,&entry.key)||!inside(&entry.pair,&home.whole)||
           entry.key.end!=home.whole.start{return Err(Error::Schema)}
        for span in [&cabin.whole,&entry.key,&home.whole]{checked(bytes,span)?;}
        rows.push(Source{room:LayoutRoom{cabin:cabin.hash128,home:home.hash128,apartment:pair.apartment},
                         cabin:cabin.whole.clone(),key:entry.key.clone(),home:home.whole.clone()});
    }
    // Refuse partial manager closure, including extra or unindexed apartment
    // references; a group must never masquerade as the complete building.
    let mut total=0usize;
    for cabin in &i.cabin_sources {
        if !i.visitor_manager_sources.iter().any(|m|inside(&m.fields[0],&cabin.whole)){continue}
        total=total.checked_add(cabin.apartments.len()).ok_or(Error::Budget)?;
        if total>LIMIT{return Err(Error::Budget)}
        for pair in &cabin.apartments {
            if !apartments.contains(&(cabin.hash128,pair.apartment)){return Err(Error::Schema)}
        }
    }
    if total!=rows.len(){return Err(Error::Schema)}
    rows.sort_by_key(|r|(r.room.cabin,r.room.apartment,r.room.home));
    Ok(rows)
}
pub fn catalog(slot:&ReadSlot)->Result<Vec<LayoutRoom>,Error>{
    Ok(sources(slot)?.into_iter().map(|s|s.room).collect())
}
fn append(out:&mut Vec<u8>,bytes:&[u8])->Result<(),Error>{
    let n=out.len().checked_add(bytes.len()).ok_or(Error::Budget)?;
    if n>MAX_DECODED{return Err(Error::Budget)}
    out.extend_from_slice(bytes);Ok(())
}
fn frame(out:&mut Vec<u8>,bytes:&[u8])->Result<(),Error>{
    let len=u32::try_from(bytes.len()).map_err(|_|Error::Budget)?;
    append(out,&len.to_le_bytes())?;append(out,bytes)
}
/// Source envelope, not a game Layout/Kit or authorized restore file.
/// Raw Home and Cabin tokens can contain private data: local file only.
/// Keep entire native frames (including unknown values, precision and
/// legacy/pocket fields); the source digest is provenance, not authentication.
pub fn capture(slot:&ReadSlot,scope:Scope,name:&str,created_ms:i64)->Result<Vec<u8>,Error>{
    if name.trim().is_empty()||name.len()>MAX_NAME||created_ms<=0{return Err(Error::Schema)}
    let mut groups:BTreeMap<[u32;4],Vec<Source>>=BTreeMap::new();
    for source in sources(slot)? {
        let selected=match scope {Scope::Room(id)=>source.room.home==id,
            Scope::Cabin(id)=>source.room.cabin==id,Scope::AllCabinSources=>true};
        if selected{groups.entry(source.room.cabin).or_default().push(source)}
    }
    if groups.is_empty(){return Err(Error::Schema)}
    let mut out=MAGIC.to_vec();
    let scope_tag=match scope{Scope::Room(_)=>0,Scope::Cabin(_)=>1,Scope::AllCabinSources=>2};
    append(&mut out,&[scope_tag])?;
    frame(&mut out,slot.envelope.version.as_str().as_bytes())?;
    append(&mut out,&created_ms.to_le_bytes())?;
    frame(&mut out,name.as_bytes())?;
    let bytes=&slot.envelope.decoded;
    append(&mut out,&sha256(bytes))?;
    append(&mut out,&(groups.len() as u32).to_le_bytes())?;
    for (id,rows) in groups{
        let first_cabin=rows[0].cabin.clone();
        for word in id{append(&mut out,&word.to_le_bytes())?;}
        frame(&mut out,checked(bytes,&first_cabin)?)?;
        append(&mut out,&(rows.len() as u32).to_le_bytes())?;
        for row in rows{
            if row.cabin!=first_cabin{return Err(Error::Schema)}
            append(&mut out,&[row.room.apartment])?;
            for word in row.room.home{append(&mut out,&word.to_le_bytes())?;}
            frame(&mut out,checked(bytes,&row.key)?)?;
            frame(&mut out,checked(bytes,&row.home)?)?;
        }
    }
    let digest=sha256(&out);
    append(&mut out,&digest)?;
    Ok(out)
}
#[cfg(test)]
mod tests{
    use super::*;
    use crate::{envelope::Envelope,native::{NativeIndex,HomeSourceRow,CabinSourceRow,CabinApartmentSourcePair,VisitorManagerSourceRow,VisitorHomeMapSourceEntry,VisitorManagerScopedSourceLink}};
    // Synthetic spans, not a real save or game acceptance test.
    fn sample()->ReadSlot{
        let c=[1,2,3,4];let h=[5,6,7,8];
        let mut index=NativeIndex::default();
        let mut cf=std::array::from_fn(|_|0..1);cf[6]=3..5;
        let mut mf=std::array::from_fn(|_|0..1);mf[0]=1..7;mf[4]=8..16;
        index.cabin_sources.push(CabinSourceRow{hash128:c,whole:2..6,fields:cf,
            apartments:vec![CabinApartmentSourcePair{apartment:2,home_hash128:h,key:3..4,value:4..5,pair:3..5}]});
        index.home_sources.push(HomeSourceRow{hash128:h,whole:10..15,fields:std::array::from_fn(|_|10..11)});
        index.visitor_manager_sources.push(VisitorManagerSourceRow{whole:0..16,fields:mf});
        index.visitor_home_map_sources.push(VisitorHomeMapSourceEntry{home_hash128:h,key:8..10,home:10..15,pair:8..15});
        index.visitor_manager_scoped_links.push(VisitorManagerScopedSourceLink{manager:0..16,cabin:2..6,apartment_pair:3..5,homes_key:8..10,home:10..15,cabin_hash128:c,apartment:2,home_hash128:h});
        index.home_models_seen=1;index.cabin_models_seen=1;index.visitor_managers_seen=1;
        ReadSlot{envelope:Envelope{version:Version::V301,marker:0,blocks:vec![],decoded:(0..16).collect()},index}
    }
    #[test]fn exact_frames_and_digest(){
        let slot=sample();let original=slot.envelope.decoded.clone();
        let rows=catalog(&slot).unwrap();assert_eq!(rows.len(),1);
        let out=capture(&slot,Scope::Room(rows[0].home),"room",1).unwrap();
        assert_eq!(&out[..8],MAGIC);
        assert_eq!(&out[out.len()-32..],&sha256(&out[..out.len()-32]));
        assert_eq!(&out[out.len()-37..out.len()-32],&original[10..15]);
        assert_eq!(slot.envelope.decoded,original);
        assert!(capture(&slot,Scope::Cabin(rows[0].cabin),"building",2).is_ok());
        assert!(capture(&slot,Scope::AllCabinSources,"all",3).is_ok());
    }
    #[test]fn denies_incomplete_unknown_and_missing(){
        let mut slot=sample();
        assert!(capture(&slot,Scope::Room([99;4]),"missing",1).is_err());
        assert!(capture(&slot,Scope::AllCabinSources," ",1).is_err());
        slot.index.visitor_manager_scoped_suppressed=true;assert!(catalog(&slot).is_err());
        slot.index.visitor_manager_scoped_suppressed=false;
        slot.index.visitor_home_map_sources.clear();assert!(catalog(&slot).is_err());
        let mut slot=sample();slot.envelope.version=Version::Forward{major:3,minor:0,patch:2};
        assert_eq!(catalog(&slot),Err(Error::Version));
    }
}
