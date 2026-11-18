import {coverCrop} from './camera-guidance.mjs';
function explain(status,text){
 const ngrok=text.match(/ERR_NGROK_\d+/);
 if(ngrok)return `ngrok blocked this request (${ngrok[0]}). Open https://dashboard.ngrok.com/error-codes/${ngrok[0].toLowerCase()} to see why; ERR_NGROK_727 means the free request limit is used up.`;
 if(/ngrok/i.test(text))return 'ngrok showed its own page instead of the app. Reload the page and accept the ngrok notice, then try again.';
 if(status===404||status===405)return `The server on your computer is an old version (it answered HTTP ${status}). Close its "Ring size server" window and run start-public.bat again.`;
 return `The server returned an unexpected reply (HTTP ${status}${text?': '+text.replace(/\s+/g,' ').slice(0,80):''}).`;
}
export async function fetchJSON(url,init,{timeoutMs=600000,signal,timeoutMessage='The request took too long. Please retry.'}={}){
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{const response=await fetch(url,{...init,headers:{'ngrok-skip-browser-warning':'1',...(init?.headers||{})},signal:controller.signal,cache:'no-store'});let data,text='';try{text=await response.clone().text();data=JSON.parse(text);}catch(e){if(controller.signal.aborted)throw e;throw new Error(explain(response.status,text));}if(!response.ok)throw new Error(data.error||'The photo could not be measured.');return data;}
 catch(e){if(timedOut)throw new Error(timeoutMessage);throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
async function encode(image,limit){
 const w=image.videoWidth||image.width,h=image.videoHeight||image.height;if(!w||!h)throw new Error('The photo could not be read.');
 const box=image.videoWidth?image.getBoundingClientRect():{width:w,height:h},crop=coverCrop(w,h,box.width,box.height),ratio=Math.min(1,limit/Math.max(crop.width,crop.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(crop.width*ratio);canvas.height=Math.round(crop.height*ratio);canvas.getContext('2d').drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)throw new Error('The camera frame could not be encoded. Please restart the camera.');
 return {blob,crop,ratio};
}
export async function measurePhoto(images,sessionId){
 const list=Array.isArray(images)?images:[images],blobs=[];
 for(const image of list)blobs.push((await encode(image,2400)).blob);
 const url=`/api/session/${sessionId}/measure`,timeoutMessage='Measurement timed out. Please retry with a clear photo.';
 try{
  const frames=[];for(const blob of blobs)frames.push(await blobToBase64(blob));
  return await fetchJSON(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frames})},{timeoutMs:300000,timeoutMessage});
 }catch(e){
  // An older server (started before the 3-frame update) only accepts one raw JPEG: send the middle frame.
  if(!/JPEG/.test(e.message))throw e;
  return fetchJSON(url,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blobs[blobs.length>>1]},{timeoutMs:300000,timeoutMessage});
 }
}
const blobToBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('The photo could not be read.'));r.readAsDataURL(blob);});
export async function inspectFrame(image,options={}){
 const {blob,crop,ratio}=await encode(image,options.maxSide||960);
 const data=await fetchJSON('/api/inspect',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob},{timeoutMs:15000,signal:options.signal,timeoutMessage:'The camera check took too long. Retrying automatically; hold the phone steady.'});
 if(data.pixelScale)data.resolutionOK=data.pixelScale*Math.min(1,2400/Math.max(crop.width,crop.height))/ratio>=3;
 return data;
}
export const createSession=profile=>fetchJSON('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile||{})},{timeoutMs:15000});
export const getSession=id=>fetchJSON('/api/session/'+id,{},{timeoutMs:15000});
export const resetSession=id=>fetchJSON(`/api/session/${id}/reset`,{method:'POST'},{timeoutMs:15000});
export const publishActivity=(id,phase)=>fetchJSON(`/api/session/${id}/activity`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase})},{timeoutMs:8000});
export const getPublicUrl=()=>fetchJSON('/api/public-url',{},{timeoutMs:5000});

export const validateSizes=(id,answers)=>fetchJSON(`/api/session/${id}/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers})},{timeoutMs:60000});
export const skipValidation=id=>fetchJSON(`/api/session/${id}/skip`,{method:'POST'},{timeoutMs:15000});
