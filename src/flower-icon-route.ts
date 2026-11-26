import source from '../data/flower-creation-icon-source-v3.0.1.json';
/** Display routing only: original definition UiIcon, dynamic flag false. */
const staticIcons=new Set(source.map(row=>Number(row[0])));
export function isStaticFlowerCreationIcon(itemId:number):boolean{return staticIcons.has(itemId);}
