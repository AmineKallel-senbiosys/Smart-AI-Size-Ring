import {readFileSync} from 'node:fs';
export const DEFAULTS=JSON.parse(readFileSync(new URL('./sizing.json',import.meta.url),'utf8'));
export const CONFIG=JSON.parse(JSON.stringify(DEFAULTS));
// The active table can be changed while the server runs (from the dashboard editor). Only the tunable parts are replaced.
export function validateTable(next){
 const fail=m=>{throw new Error(m);},num=v=>typeof v==='number'&&Number.isFinite(v);
 const out={};
 for(const k of['both','single']){
  const t=next?.[k];if(!t)fail(`Missing table: ${k}`);
  const offsets={};for(const f of['thumb','index','middle','ring','little']){if(!num(t.offsets?.[f])||Math.abs(t.offsets[f])>30)fail(`Bad offset: ${k} ${f}`);offsets[f]=t.offsets[f];}
  const {u6,u8,u10,u12}=t;if(![u6,u8,u10,u12].every(num)||!(u6<u8&&u8<u10&&u10<u12)||u12>120||u6<10)fail(`The size limits of ${k} must grow from US 6 to US 12.`);
  out[k]={offsets,u6,u8,u10,u12};
 }
 const bands={};for(const z of DEFAULTS.sizes){const b=next?.fit?.bands?.[z]??next?.fit?.[z];if(!b)fail(`Missing fit row: US ${z}`);const row={};let tot=0;for(const k of DEFAULTS.fit.order){const v=b[k];if(!num(v)||v<0||v>1000)fail(`Bad fit value: US ${z} ${k}`);row[k]=v;tot+=v;}if(!(tot>0))fail(`Fit row US ${z} adds up to 0.`);bands[z]=row;}
 const bl=next?.borderlineMm??DEFAULTS.borderlineMm;if(!num(bl)||bl<0||bl>5)fail('Borderline distance must be between 0 and 5 mm.');
 return {...out,borderlineMm:bl,fit:{...DEFAULTS.fit,bands}};
}
export function setTable(next){const t=validateTable(next);CONFIG.both=t.both;CONFIG.single=t.single;CONFIG.fit=t.fit;CONFIG.borderlineMm=t.borderlineMm;return CONFIG;}
export const resetTable=()=>setTable(DEFAULTS);
export const isEdited=()=>JSON.stringify(tunable(CONFIG))!==JSON.stringify(tunable(DEFAULTS));
export const tunable=c=>({both:c.both,single:c.single,borderlineMm:c.borderlineMm,fit:{bands:c.fit.bands}});
export const FINGERS=['little','ring','middle','index','thumb'];
// Boundaries: size 6 = [2*u6-u8, u6), 8 = [u6, u8), 10 = [u8, u10), 12 = [u10, u12). Outside = no size.
export function sizeForCircumference(c,p){
 if(!Number.isFinite(c))return null;
 const edges=[2*p.u6-p.u8,p.u6,p.u8,p.u10,p.u12];
 for(let i=0;i<4;i++)if(c>=edges[i]&&c<edges[i+1])return CONFIG.sizes[i];
 return null;
}
// Fit inside a size band: the band is split by percentage, in CONFIG.fit.order, from smallest to largest circumference.
export function fitForCircumference(c,size,p,fit=CONFIG.fit){
 const i=CONFIG.sizes.indexOf(size),edges=[2*p.u6-p.u8,p.u6,p.u8,p.u10,p.u12];if(i<0||!fit?.bands?.[size])return null;
 const band=fit.bands[size],total=fit.order.reduce((a,k)=>a+(band[k]||0),0);if(!(total>0))return null;
 const t=(c-edges[i])/(edges[i+1]-edges[i]),used=fit.order.filter(k=>(band[k]||0)>0);
 // Just outside the band (a borderline neighbour): the nearest end of the band, Loose below it and Tight above it.
 if(t<0)return used[0];if(t>=1)return used.at(-1);
 let cumulative=0;
 for(const k of fit.order){cumulative+=(band[k]||0)/total;if(t<cumulative||k===fit.order.at(-1))return k;}
}
// A finger closer than borderlineMm to a limit between two sizes is also reported as the neighbouring size.
export function alsoSize(c,size,p,mm=CONFIG.borderlineMm){
 const i=CONFIG.sizes.indexOf(size),E=[2*p.u6-p.u8,p.u6,p.u8,p.u10,p.u12];if(i<0||!(mm>0))return null;
 if(i>0&&c-E[i]<mm)return CONFIG.sizes[i-1];
 if(i<3&&E[i+1]-c<mm)return CONFIG.sizes[i+1];
 return null;
}
// Borderline finger: the neighbouring size is shown first, with the band the finger sits in as the alternative ("US 12 Loose (or 10)").
function borderlineFirst(c,size,params,mm=CONFIG.borderlineMm){
 const other=alsoSize(c,size,params,mm);
 if(other)return {size:other,status:'ok',fit:fitForCircumference(c,other,params),also:size};
 return {size,status:'ok',fit:fitForCircumference(c,size,params),also:null};
}
const valid=w=>Number.isFinite(w)&&w>0;
// views: {palm:{finger:widthMm|null}, back:{...}} -> {finger:{size,status}}
export function sizesFromViews(views,forced=null){
 const used=Object.values(views).filter(v=>v&&FINGERS.some(f=>valid(v[f])));
 const params=forced||(used.length>=2?CONFIG.both:CONFIG.single);
 const result={};
 for(const f of FINGERS){
  const widths=used.map(v=>v[f]).filter(valid);
  if(!widths.length){result[f]={size:null,status:'not-measured'};continue;}
  const width=widths.reduce((a,b)=>a+b,0)/widths.length,c=Math.PI*width-params.offsets[f],size=sizeForCircumference(c,params);
  result[f]=size?borderlineFirst(c,size,params,forced?.borderlineMm):{size:null,status:c<params.u6-(params.u8-params.u6)?'below-range':'above-range'};
 }
 return result;
}

// Separate settings for the one-hand test (/onehand): its own offsets, limits and borderline distance. The main tables are untouched.
// Fixed defaults per gender: these are what "Reset" returns to.
export const ONEHAND_DEFAULTS={
 male:{offsets:{thumb:2.85,index:2.4,middle:0.4,ring:1.95,little:2.6},u6:52.64,u8:57.62,u10:63.86,u12:69.23,borderlineMm:0.9},
 female:{offsets:{thumb:3.2,index:3.85,middle:0.21,ring:2.35,little:1.65},u6:52.64,u8:57.62,u10:63.867,u12:69.23,borderlineMm:1}};
export const ONEHAND={male:JSON.parse(JSON.stringify(ONEHAND_DEFAULTS.male)),female:JSON.parse(JSON.stringify(ONEHAND_DEFAULTS.female))};
export function validateOneHand(n){
 const fail=m=>{throw new Error(m);},num=v=>typeof v==='number'&&Number.isFinite(v);
 const offsets={};for(const f of FINGERS){if(!num(n?.offsets?.[f])||Math.abs(n.offsets[f])>30)fail(`Bad offset: ${f}`);offsets[f]=n.offsets[f];}
 const {u6,u8,u10,u12}=n||{};if(![u6,u8,u10,u12].every(num)||!(u6<u8&&u8<u10&&u10<u12)||u12>120||u6<10)fail('The size limits must grow from US 6 to US 12.');
 const bl=n.borderlineMm;if(!num(bl)||bl<0||bl>5)fail('Borderline distance must be between 0 and 5 mm.');
 return {offsets,u6,u8,u10,u12,borderlineMm:bl};
}
// {male:{...},female:{...}} sets each one present; a flat {offsets,u6,...} (the old format) applies to both.
export function setOneHand(n){
 if(n&&(n.male||n.female)){const m=n.male?validateOneHand(n.male):null,f=n.female?validateOneHand(n.female):null;if(m)Object.assign(ONEHAND.male,m);if(f)Object.assign(ONEHAND.female,f);}
 else{const v=validateOneHand(n);Object.assign(ONEHAND.male,JSON.parse(JSON.stringify(v)));Object.assign(ONEHAND.female,JSON.parse(JSON.stringify(v)));}
 return ONEHAND;
}
// resetOneHand('male' | 'female') resets only that one; with no argument both go back to their defaults.
export const resetOneHand=g=>{const list=g==='male'||g==='female'?[g]:['male','female'];for(const k of list)Object.assign(ONEHAND[k],JSON.parse(JSON.stringify(ONEHAND_DEFAULTS[k])));return ONEHAND;};
const ohKey=c=>JSON.stringify([...FINGERS.map(f=>c.offsets[f]),c.u6,c.u8,c.u10,c.u12,c.borderlineMm]);
export const oneHandEditedBy=()=>({male:ohKey(ONEHAND.male)!==ohKey(ONEHAND_DEFAULTS.male),female:ohKey(ONEHAND.female)!==ohKey(ONEHAND_DEFAULTS.female)});
export const oneHandEdited=()=>{const e=oneHandEditedBy();return e.male||e.female;};
// /onehand never sends the user to a smaller ring. A finger keeps the size it really falls in; only near the TOP of that size does it also show the next larger one
// ("6 or 8", "8 or 10", "10 or 12"). Near the bottom of a size nothing smaller is mentioned.
export const sizesForOneHand=(back,gender)=>{
 const r=sizesFromViews({back},ONEHAND[gender]||ONEHAND.male);
 for(const f of FINGERS){const x=r[f];if(!x||x.size==null)continue;
  if(x.also!=null){const band=x.also,neighbour=x.size;x.size=band;x.also=neighbour>band?neighbour:null;x.fit=null;}}
 return r;
};
