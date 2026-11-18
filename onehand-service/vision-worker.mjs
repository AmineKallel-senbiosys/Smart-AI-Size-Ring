import {VisionProcess} from './vision-process.mjs';
const primary=new VisionProcess({maxPending:6,label:'Measurement'});
const inspection=new VisionProcess({timeoutMs:15000,maxPending:2,label:'Live camera check'});
export const measure=(image,mode='measure')=>(mode==='inspect'?inspection:primary).request(image,mode);
export function close(){primary.close();inspection.close();}
process.on('exit',close);
