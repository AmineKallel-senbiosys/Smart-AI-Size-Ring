// Combine the same view measured from several frames: median width per finger.
export const FINGER_NAMES=['thumb','index','middle','ring','little'];
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
export function mergeFrames(results){
 const widths={};let measured=0;
 for(const f of FINGER_NAMES){
  const v=results.map(r=>r?.fingers?.[f]?.widthMm).filter(x=>typeof x==='number'&&Number.isFinite(x));
  widths[f]=v.length?Math.round(median(v)*1000)/1000:null;if(v.length)measured++;
 }
 return {widths,measured};
}
