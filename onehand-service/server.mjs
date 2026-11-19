import http from 'node:http';
import {readFile,appendFile,mkdir,writeFile,unlink,readdir,rm,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {measure,close} from './vision-worker.mjs';
import {mergeFrames} from './aggregate.mjs';
import {sizesFromViews,FINGERS,CONFIG,DEFAULTS,setTable,resetTable,isEdited,tunable,ONEHAND,ONEHAND_DEFAULTS,setOneHand,resetOneHand,oneHandEdited,oneHandEditedBy,sizesForOneHand} from './sizing.mjs';
const root=path.resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const reply=(res,status,value)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));
async function read(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
const MIN_FINGERS=4;
// The four photos, in order. Everything is kept in memory only, and forgotten after an hour.
const SCANS=[{key:'left-palm',side:'left',surface:'palm'},{key:'left-back',side:'left',surface:'back'},{key:'right-palm',side:'right',surface:'palm'},{key:'right-back',side:'right',surface:'back'}];
const sessions=new Map();
const dataDir=path.resolve(fileURLToPath(new URL('./data/',import.meta.url)));
const csvCell=v=>{v=String(v??'');return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const overrideFile=path.join(dataDir,'sizing-override.json');
try{setTable(JSON.parse(await readFile(overrideFile,'utf8')));console.log('Using the edited sizing table from data/sizing-override.json');}catch{}
const oneHandFile=path.join(dataDir,'onehand-config.json');
try{setOneHand(JSON.parse(await readFile(oneHandFile,'utf8')));console.log('Using the one-hand settings from data/onehand-config.json');}catch{}
const pinOk=req=>!ADMIN_PIN||adminOk(req);
const SIZE_LIST=[6,8,10,12],FIT_LIST=['loose','ok','tight','nofit'];
function cleanAnswers(a,sizes){
 const out={left:{},right:{}};
 for(const h of['left','right'])for(const f of FINGERS){
  const x=a?.[h]?.[f],app=sizes[h][f];if(!x)throw new Error(`Please check every finger (${h} ${f}).`);
  const size=x.size==='none'?'none':Number(x.size);if(size!=='none'&&!SIZE_LIST.includes(size))throw new Error(`Please choose the size of the ${h} ${f}.`);
  const fit=size==='none'?null:x.fit;if(size!=='none'&&!FIT_LIST.includes(fit))throw new Error(`Please choose the fit of the ${h} ${f}.`);
  const same=app.size?(size===app.size&&fit===(app.fit||null)):size==='none';
  out[h][f]={verdict:same?'right':'wrong',size,fit,touched:!!x.touched};
 }
 return out;
}
// ---- One-hand test (/onehand): saved anonymously (no name) in data/onehand/, separate from data/validated/.
function cleanOneHand(a){
 const out={};
 for(const f of FINGERS){const x=a?.[f];if(!x)throw new Error(`Please check every finger (${f}).`);
  const size=x.size==='none'?'none':Number(x.size);if(size!=='none'&&!SIZE_LIST.includes(size))throw new Error(`Please choose the size of the ${f}.`);
  out[f]={size,touched:!!x.touched};}
 return out;
}
async function saveOneHand(s,answers){
 const now=new Date(),stamp=now.toISOString().slice(0,16).replace(/[-:]/g,'').replace('T','-');
 const folder=`${stamp}_${s.hand}_${s.id.slice(0,6)}`,dir=path.join(dataDir,'onehand',folder),w=s.widths[s.hand+'-back'],r=sizesForOneHand(w,s.gender);
 await mkdir(dir,{recursive:true});
 const photo=s.photos?.[s.hand+'-back'];if(photo)await writeFile(path.join(dir,'back.jpg'),photo);
 const fingers={};
 for(const f of FINGERS){const a=r[f],u=answers[f];fingers[f]={widthMm:typeof w?.[f]==='number'?w[f]:null,app:{size:a.size,also:a.also??null,status:a.status},user:{size:u.size,touched:u.touched},sizeMatch:u.size==='none'?a.size==null:(u.size===a.size||u.size===a.also)};}
 await writeFile(path.join(dir,'record.json'),JSON.stringify({date:now.toISOString(),id:s.id,folder,hand:s.hand,gender:s.gender,config:ONEHAND[s.gender]||ONEHAND.male,fingers},null,1));
}
// Participants switched off for the dashboard are listed in data/onehand-disabled.json (record.json files are never touched). Default: everyone enabled.
const ohOffFile=path.join(dataDir,'onehand-disabled.json');
async function ohOff(){try{const a=JSON.parse(await readFile(ohOffFile,'utf8'));return new Set(Array.isArray(a)?a:[]);}catch{return new Set();}}
async function ohOffSave(set){await mkdir(dataDir,{recursive:true});await writeFile(ohOffFile,JSON.stringify([...set].sort(),null,1));}
async function oneHandRows(){
 const rows=[];let names=[];try{names=await readdir(path.join(dataDir,'onehand'));}catch{}
 const off=await ohOff();
 for(const n of names.sort()){if(off.has(n))continue;let r;try{r=JSON.parse(await readFile(path.join(dataDir,'onehand',n,'record.json'),'utf8'));}catch{continue;}
  let g=r.gender||null;if(!g)try{const t=(await readFile(path.join(dataDir,'onehand',n,'gender.txt'),'utf8')).trim().toLowerCase();if(t==='male'||t==='female')g=t;}catch{}   // gender.txt: added later for tests saved before gender was asked; record.json is never changed
  for(const f of FINGERS){const x=r.fingers?.[f];if(!x||typeof x.widthMm!=='number')continue;rows.push({hand:r.hand,finger:f,g,src:'new',pid:String(r.id).slice(0,8),kit_size:x.user.size==='none'?'NO FIT':String(x.user.size),w:x.widthMm});}}
 return rows;
}
const slug=t=>String(t||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'person';
// After the user validates: the four photos, name, gender, measured widths, the app answer and the user's answer are kept on disk.
async function saveValidated(s,sizes,answers){
 const now=new Date(),stamp=now.toISOString().slice(0,16).replace(/[-:]/g,'').replace('T','-');
 const folder=`${stamp}_${slug(s.name)}_${s.gender}_${s.id.slice(0,6)}`,dir=path.join(dataDir,'validated',folder);
 await mkdir(dir,{recursive:true});
 for(const k of Object.keys(s.photos||{}))await writeFile(path.join(dir,k+'.jpg'),s.photos[k]);
 const fingers={};
 for(const h of['left','right']){fingers[h]={};for(const f of FINGERS){const a=sizes[h][f],u=answers[h][f];
  fingers[h][f]={app:{size:a.size,fit:a.fit??null,also:a.also??null,status:a.status},user:{size:u.size,fit:u.fit,verdict:u.verdict,touched:u.touched},
   sizeMatch:u.size==='none'?a.size==null:(u.size===a.size||u.size===a.also),fitMatch:u.size===a.size&&u.fit===a.fit};}}
 const record={date:now.toISOString(),id:s.id,folder,name:s.name,gender:s.gender,editedTable:isEdited(),borderlineMm:CONFIG.borderlineMm,widthsMm:s.widths,fingers};
 await writeFile(path.join(dir,'record.json'),JSON.stringify(record,null,1));
 await rebuildCsv();
}
// The folders in data/validated are the single source of truth: delete a folder and that person disappears from the dashboard and from validated.csv.
async function loadRecords(){
 let names=[];try{names=await readdir(path.join(dataDir,'validated'));}catch{return [];}
 const records=[];
 for(const n of names){try{records.push(JSON.parse(await readFile(path.join(dataDir,'validated',n,'record.json'),'utf8')));}catch{}}
 return records.sort((x,y)=>String(x.date).localeCompare(String(y.date)));
}
async function rebuildCsv(records){
 records??=await loadRecords();
 const cols=['left','right'].flatMap(h=>FINGERS.flatMap(f=>[`${h}_${f}_app`,`${h}_${f}_you`]));
 const cell=x=>x.size==null||x.size==='none'?'No size':`${x.size} · ${({loose:'Loose',ok:'OK',tight:'Tight',nofit:'No fit'}[x.fit]||'')}`;
 const lines=['\ufeff'+['date','name','gender','folder',...cols].join(',')];
 for(const r of records)lines.push([r.date,r.name,r.gender,r.folder,...['left','right'].flatMap(h=>FINGERS.flatMap(f=>{const e=r.fingers?.[h]?.[f];return e?[cell(e.app)+(e.app.also?` (or ${e.app.also})`:''),cell(e.user)]:['','']}))].map(csvCell).join(','));
 await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'validated.csv'),lines.join('\n')+'\n');
}

// ---- Participant manager (/participants). Holds names and photos, so it is never open on the public link:
// with ADMIN_PIN set it needs the PIN; without it, only requests made directly on this computer are accepted.
let ADMIN_PIN=process.env.ADMIN_PIN||'';
if(!ADMIN_PIN){try{ADMIN_PIN=(await readFile(path.join(dataDir,'admin-pin.txt'),'utf8')).trim();}catch{}}
const pinFails=new Map();   // wrong-PIN attempts per address: 8 mistakes lock that address for 10 minutes
const clientId=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim();   // last entry: the one the tunnel added, not one a visitor typed
let globalFails={n:0,at:0};
const adminOk=req=>{
 if(ADMIN_PIN){
  const id=clientId(req),f=pinFails.get(id);if(f&&f.n>=8&&Date.now()-f.at<600000)return false;
  if(globalFails.n>=40&&Date.now()-globalFails.at<600000)return false;   // too many mistakes from anywhere: pause for everyone
  const given=Buffer.from(String(req.headers['x-admin-pin']||'')),want=Buffer.from(ADMIN_PIN);
  const ok=given.length===want.length&&timingSafeEqual(given,want);
  if(ok){pinFails.delete(id);return true;}
  if(req.headers['x-admin-pin']){globalFails={n:(Date.now()-globalFails.at<600000?globalFails.n:0)+1,at:Date.now()};const x=pinFails.get(id)||{n:0,at:0};pinFails.set(id,{n:(Date.now()-x.at<600000?x.n:0)+1,at:Date.now()});}
  return false;
 }
 return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&!req.headers['x-forwarded-for']&&!req.headers['x-forwarded-host'];
};
const PHOTO_KEYS=['left-palm','left-back','right-palm','right-back'];
async function folderNames(){try{return await readdir(path.join(dataDir,'validated'));}catch{return [];}}
async function readRecord(folder){return JSON.parse(await readFile(path.join(dataDir,'validated',folder,'record.json'),'utf8'));}

// ---- /onehand/participants: the anonymous one-hand tests (photo, gender, what the user confirmed)
const ohDir=f=>path.join(dataDir,'onehand',f);
async function ohFolders(){try{return await readdir(path.join(dataDir,'onehand'));}catch{return [];}}
async function ohRead(folder){
 const r=JSON.parse(await readFile(path.join(ohDir(folder),'record.json'),'utf8'));
 if(!r.gender)try{const t=(await readFile(path.join(ohDir(folder),'gender.txt'),'utf8')).trim().toLowerCase();if(t==='male'||t==='female')r.gender=t;}catch{}
 return r;
}
const ohState=(a,u)=>{const same=a.size?u.size===a.size:u.size==='none';return same?'ok':(a.also&&u.size===a.also?'alt':'size');};
async function oneHandAdmin(req,res,p){
 if(p==='/api/admin/onehand'&&req.method==='GET'){
  const out=[],off=await ohOff();for(const folder of await ohFolders()){try{const r=await ohRead(folder),summary={ok:0,alt:0,size:0};
   for(const f of FINGERS){const e=r.fingers?.[f];if(e)summary[ohState(e.app,e.user)]++;}
   out.push({folder,hand:r.hand,gender:r.gender||null,date:r.date,edited:!!r.editedByAdmin,enabled:!off.has(folder),summary});}catch{}}
  return reply(res,200,{tests:out.sort((a,b)=>String(b.date).localeCompare(String(a.date)))});
 }
 const m=p.match(/^\/api\/admin\/onehand\/([^/]+)(\/photo|\/enabled)?$/);if(!m)return reply(res,404,{error:'Not found'});
 const folder=decodeURIComponent(m[1]);if(!(await ohFolders()).includes(folder))return reply(res,404,{error:'This test no longer exists.'});
 if(m[2]==='/enabled'){if(req.method!=='PUT')return reply(res,405,{error:'Method not allowed'});let b;try{b=JSON.parse((await read(req,1000)).toString('utf8'));}catch{return reply(res,400,{error:'Bad data.'});}
  const off=await ohOff();if(b.enabled===false)off.add(folder);else off.delete(folder);await ohOffSave(off);return reply(res,200,{folder,enabled:!off.has(folder)});}
 if(m[2]){try{const img=await readFile(path.join(ohDir(folder),'back.jpg'));res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'}).end(img);}catch{reply(res,404,{error:'No photo'});}return;}
 if(req.method==='GET')return reply(res,200,await ohRead(folder));
 if(req.method==='DELETE'){await rm(ohDir(folder),{recursive:true,force:true});{const off=await ohOff();if(off.delete(folder))await ohOffSave(off);}return reply(res,200,{deleted:folder});}
 if(req.method==='PUT'){
  let b;try{b=JSON.parse((await read(req,10000)).toString('utf8'));}catch{return reply(res,400,{error:'Bad data.'});}
  if(b.gender!=='male'&&b.gender!=='female')return reply(res,422,{error:'Gender must be male or female.'});
  const r=await ohRead(folder);
  for(const f of FINGERS){const e=r.fingers?.[f];if(!e)continue;const x=b.fingers?.[f];if(!x)return reply(res,422,{error:`Missing answer for ${f}.`});
   const size=x.size==='none'?'none':Number(x.size);if(size!=='none'&&!SIZE_LIST.includes(size))return reply(res,422,{error:`Bad size for ${f}.`});
   e.user={size,touched:e.user.touched||e.user.size!==size};e.sizeMatch=size==='none'?e.app.size==null:(size===e.app.size||size===e.app.also);}
  r.gender=b.gender;r.editedByAdmin=true;r.editedAt=new Date().toISOString();
  await writeFile(path.join(ohDir(folder),'record.json'),JSON.stringify(r,null,1));return reply(res,200,{folder});
 }
 return reply(res,405,{error:'Method not allowed'});
}
async function adminRoute(req,res,p){
 if(p==='/api/admin/status')return reply(res,200,{pinRequired:!!ADMIN_PIN,ok:adminOk(req),hint:ADMIN_PIN?'Enter the admin PIN.':'To open this page through the public link, set a PIN first: create the file data\\admin-pin.txt with your PIN inside (or start the app with ADMIN_PIN), then restart the app. Without a PIN it only opens on the computer that runs the app (http://localhost:PORT/participants).'});
 if(!adminOk(req))return reply(res,401,{error:ADMIN_PIN?'Wrong or missing admin PIN (too many mistakes lock you out for 10 minutes).':'This page only opens on the computer that runs the app, or with an ADMIN_PIN.'});
 if(p.startsWith('/api/admin/onehand'))return await oneHandAdmin(req,res,p);
 if(p==='/api/admin/participants'&&req.method==='GET'){
  const out=[];for(const folder of await folderNames()){try{const r=await readRecord(folder);const summary={ok:0,fit:0,size:0,alt:0};
   for(const h of['left','right'])for(const f of FINGERS){const e=r.fingers?.[h]?.[f];if(!e)continue;const a=e.app,u=e.user,same=a.size?u.size===a.size:u.size==='none';
    summary[same?((u.size==='none'||u.fit===(a.fit||null))?'ok':'fit'):(a.also&&u.size===a.also?'alt':'size')]++;}
   out.push({folder,name:r.name,gender:r.gender,date:r.date,edited:!!r.editedByAdmin,summary});}catch{}}
  return reply(res,200,{participants:out.sort((a,b)=>String(b.date).localeCompare(String(a.date)))});
 }
 const m=p.match(/^\/api\/admin\/participants\/([^/]+)(?:\/photo\/([a-z-]+))?$/);
 if(!m)return reply(res,404,{error:'Not found'});
 const folder=decodeURIComponent(m[1]);if(!(await folderNames()).includes(folder))return reply(res,404,{error:'This participant no longer exists.'});
 const dir=path.join(dataDir,'validated',folder);
 if(m[2]){
  if(!PHOTO_KEYS.includes(m[2]))return reply(res,404,{error:'No such photo'});
  try{const img=await readFile(path.join(dir,m[2]+'.jpg'));res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'}).end(img);}catch{reply(res,404,{error:'No such photo'});}return;
 }
 if(req.method==='GET'){const r=await readRecord(folder);return reply(res,200,{...r,photos:PHOTO_KEYS.filter(k=>true)});}
 if(req.method==='DELETE'){await rm(dir,{recursive:true,force:true});await rebuildCsv();return reply(res,200,{deleted:folder});}
 if(req.method==='PUT'){
  let b;try{b=JSON.parse((await read(req,30000)).toString('utf8'));}catch{return reply(res,400,{error:'Bad data.'});}
  const name=String(b.name||'').replace(/\s+/g,' ').trim().slice(0,80);if(name.length<2)return reply(res,422,{error:'Please enter a name.'});
  if(b.gender!=='male'&&b.gender!=='female')return reply(res,422,{error:'Gender must be male or female.'});
  const r=await readRecord(folder);
  for(const h of['left','right'])for(const f of FINGERS){
   const x=b.fingers?.[h]?.[f],e=r.fingers?.[h]?.[f];if(!e)continue;if(!x)return reply(res,422,{error:`Missing answer for ${h} ${f}.`});
   const size=x.size==='none'?'none':Number(x.size);if(size!=='none'&&!SIZE_LIST.includes(size))return reply(res,422,{error:`Bad size for ${h} ${f}.`});
   const fit=size==='none'?null:x.fit;if(size!=='none'&&!FIT_LIST.includes(fit))return reply(res,422,{error:`Choose the fit for ${h} ${f}.`});
   const a=e.app,changed=e.user.size!==size||e.user.fit!==fit;
   e.user={size,fit,verdict:(a.size?(size===a.size&&fit===(a.fit||null)):size==='none')?'right':'wrong',touched:e.user.touched||changed};
   e.sizeMatch=size==='none'?a.size==null:(size===a.size||size===a.also);e.fitMatch=size===a.size&&fit===a.fit;
  }
  r.name=name;r.gender=b.gender;r.editedByAdmin=true;r.editedAt=new Date().toISOString();
  const parts=folder.split('_'),stamp=parts[0],id6=parts.at(-1);let newName=`${stamp}_${slug(name)}_${b.gender}_${id6}`,n=2;
  while(newName!==folder&&(await folderNames()).includes(newName))newName=`${stamp}_${slug(name)}_${b.gender}_${id6}-${n++}`;
  r.folder=newName;await writeFile(path.join(dir,'record.json'),JSON.stringify(r,null,1));
  if(newName!==folder)await rename(dir,path.join(dataDir,'validated',newName));
  await rebuildCsv();return reply(res,200,{folder:newName});
 }
 return reply(res,405,{error:'Method not allowed'});
}
// Anonymous rows (no name, no photos) for the dashboard.
async function validatedRows(){
 const records=await loadRecords();rebuildCsv(records).catch(()=>{});
 const rows=[];
 for(const r of records)for(const h of['left','right'])for(const f of FINGERS){const u=r.fingers?.[h]?.[f]?.user;if(!u)continue;
  const w=k=>{const x=r.widthsMm?.[k]?.[f];return typeof x==='number'?x:null;};
  rows.push({hand:h,finger:f,g:r.gender,src:'new',pid:r.id.slice(0,8),kit_size:u.size==='none'?'NO FIT':String(u.size),kit_fit:u.size==='none'?'no-fit':u.fit,pw:w(h+'-palm'),bw:w(h+'-back')});}
 return rows;
}
setInterval(()=>{const cutoff=Date.now()-3600000;for(const [id,s] of sessions)if(s.touched<cutoff)sessions.delete(id);},60000).unref();
function view(s){
 const scans=s.scans||SCANS,completed=scans.filter(x=>s.widths[x.key]).map(x=>x.key),next=scans.find(x=>!s.widths[x.key])||null;
 let sizes=null;
 if(!next&&s.hand){   // /onehand: the back of one hand, sizes only (no fit, no second size)
  const r=sizesForOneHand(s.widths[s.hand+'-back'],s.gender),plain={};for(const f of FINGERS)plain[f]={size:r[f].size,status:r[f].status,also:r[f].also??null};
  sizes={left:null,right:null,[s.hand]:plain};
 }else if(!next)sizes={left:sizesFromViews({palm:s.widths['left-palm'],back:s.widths['left-back']}),right:sizesFromViews({palm:s.widths['right-palm'],back:s.widths['right-back']})};
 return {id:s.id,name:s.name,validated:!!s.validated,skipped:!!s.skipped,completed,next,complete:!next,sizes,processing:s.busy,error:s.error,activity:s.activity};
}
// When the app is opened on localhost, the QR code must point to the public ngrok address instead.
async function publicUrl(){
 if(process.env.PUBLIC_URL)return process.env.PUBLIC_URL.replace(/\/$/,'');
 for(const port of [4040,4041,4042,4043,4044,4045,4046,4047,4048,4049])try{const data=await (await fetch(`http://127.0.0.1:${port}/api/tunnels`,{signal:AbortSignal.timeout(800)})).json();const t=data.tunnels?.find(x=>x.proto==='https'&&String(x.config?.addr).includes(String(serverPort)));if(t)return t.public_url;}catch{}
 return null;
}
rebuildCsv().catch(()=>{});
const serverPort=Number(process.env.PORT||4185);
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(req.method==='POST'&&p==='/api/inspect'){
  const image=await read(req,4*1024*1024);if(image[0]!==255||image[1]!==216)return reply(res,415,{error:'Please capture a JPEG photo.'});
  const data=await measure(image,'inspect'),safe={};for(const key of ['hand','card','spread','flat','framed','pixelScale','cardQuad'])if(data[key]!==undefined)safe[key]=data[key];return reply(res,200,safe);}
 if(p==='/api/public-url'&&req.method==='GET')return reply(res,200,{url:await publicUrl()});
 if(p==='/api/session'&&req.method==='POST'){let b={};try{b=JSON.parse((await read(req,2000)).toString('utf8')||'{}');}catch{}
  if(b.mode==='onehand'){if(b.hand!=='left'&&b.hand!=='right')return reply(res,400,{error:'Please choose the left or the right hand.'});if(b.gender!=='male'&&b.gender!=='female')return reply(res,400,{error:'Please choose male or female.'});const s={id:randomUUID(),mode:'onehand',hand:b.hand,scans:[{key:b.hand+'-back',side:b.hand,surface:'back'}],name:'',gender:b.gender,widths:{},photos:{},validated:false,busy:false,error:null,activity:null,touched:Date.now()};sessions.set(s.id,s);return reply(res,201,view(s));}const name=String(b.name||'').replace(/\s+/g,' ').trim().slice(0,80),gender=b.gender;if(name.length<2)return reply(res,400,{error:'Please enter your name.'});if(gender!=='male'&&gender!=='female')return reply(res,400,{error:'Please choose male or female.'});const s={id:randomUUID(),name,gender,widths:{},photos:{},validated:false,busy:false,error:null,activity:null,touched:Date.now()};sessions.set(s.id,s);return reply(res,201,view(s));}
 const m=p.match(/^\/api\/session\/([a-f0-9-]+)(\/measure|\/activity|\/reset|\/validate|\/skip)?$/i);
 if(m){
  const s=sessions.get(m[1]);if(!s)return reply(res,404,{error:'This session has expired. Please start again.'});s.touched=Date.now();
  if(!m[2]&&req.method==='GET')return reply(res,200,view(s));
  if(m[2]==='/activity'&&req.method==='PATCH'){const b=JSON.parse((await read(req,500)).toString('utf8'));s.activity={phase:String(b.phase||'').slice(0,20),at:Date.now()};return reply(res,200,view(s));}
  if(m[2]==='/reset'&&req.method==='POST'){s.widths={};s.photos={};s.saved=false;s.validated=false;s.skipped=false;s.error=null;return reply(res,200,view(s));}
  if(m[2]==='/skip'&&req.method==='POST'){
   if(!s.validated){s.skipped=true;s.photos={};}   // nothing is written to disk
   return reply(res,200,view(s));
  }
  if(m[2]==='/validate'&&req.method==='POST'){
   if(s.hand){
    const v1=view(s);if(!v1.complete)return reply(res,409,{error:'Measure the photo first.'});
    if(s.skipped)return reply(res,409,{error:'This measurement was skipped, so nothing can be saved.'});
    if(s.validated)return reply(res,200,v1);
    let ans;try{ans=cleanOneHand(JSON.parse((await read(req,5000)).toString('utf8')).answers);}catch(e){return reply(res,422,{error:e.message});}
    try{await saveOneHand(s,ans);}catch(e){console.error('Could not save the one-hand validation:',e.message);return reply(res,500,{error:'The validation could not be saved. Please try again.'});}
    s.validated=true;s.photos={};return reply(res,200,view(s));
   }
   const v0=view(s);if(!v0.complete)return reply(res,409,{error:'Measure all four photos first.'});
   if(s.skipped)return reply(res,409,{error:'This measurement was skipped, so nothing can be saved.'});
   if(s.validated)return reply(res,200,v0);
   let answers;try{answers=cleanAnswers(JSON.parse((await read(req,20000)).toString('utf8')).answers,v0.sizes);}catch(e){return reply(res,422,{error:e.message});}
   try{await saveValidated(s,v0.sizes,answers);}catch(e){console.error('Could not save the validation:',e.message);return reply(res,500,{error:'The validation could not be saved. Please try again.'});}
   s.validated=true;return reply(res,200,view(s));
  }
  if(m[2]==='/measure'&&req.method==='POST'){
   const next=(s.scans||SCANS).find(x=>!s.widths[x.key]);if(!next)return reply(res,409,{error:'All four photos are already measured.'});
   if(s.busy)return reply(res,409,{error:'A photo is already being measured. Please wait.'});
   const raw=await read(req,24*1024*1024);let frames;
   if((req.headers['content-type']||'').includes('json')){try{frames=(JSON.parse(raw.toString('utf8')).frames||[]).slice(0,5).map(x=>Buffer.from(String(x),'base64'));}catch{return reply(res,400,{error:'The photos could not be read.'});}}else frames=[raw];
   if(!frames.length||frames.some(f=>f[0]!==255||f[1]!==216))return reply(res,415,{error:'Please capture or choose a JPEG photo.'});
   s.busy=true;s.error=null;
   try{
    const results=[];let lastError=null;
    for(const frame of frames){try{results.push(await measure(frame,'measure'));}catch(e){lastError=e;}}
    if(!results.length)throw lastError||new Error('The photo could not be measured.');
    const merged=mergeFrames(results);
    if(merged.measured<MIN_FINGERS)throw new Error(`Only ${merged.measured} of 5 fingers could be measured. Keep the whole hand and card in view, separate the fingers gently, use a plain contrasting surface and retake the photo.`);
    s.widths[next.key]=merged.widths;s.photos[next.key]=frames[frames.length>>1];   // kept in memory only; /onehand writes it to disk only if the user validates
    return reply(res,200,view(s));
   }catch(e){s.error=e.message;return reply(res,422,{error:e.message});}
   finally{s.busy=false;}
  }
  return reply(res,405,{error:'Method not allowed'});
 }
 if(p.startsWith('/api/admin/'))return await adminRoute(req,res,p);
 if(p==='/api/onehand-validated'&&req.method==='GET')return reply(res,200,{rows:await oneHandRows()});
 if(p==='/api/validated'&&req.method==='GET')return reply(res,200,{rows:await validatedRows()});
 if(p==='/api/onehand-config'||p==='/api/onehand-config/reset'){
  if(req.method==='GET')return reply(res,200,{active:ONEHAND,defaults:ONEHAND_DEFAULTS,edited:oneHandEdited(),editedBy:oneHandEditedBy()});
  if(!adminOk(req))return reply(res,401,{error:ADMIN_PIN?'Wrong or missing admin PIN.':'Changing the one-hand settings only works on the computer that runs the app, or with an ADMIN_PIN.'});
  if(p==='/api/onehand-config/reset'&&req.method==='POST'){let g;try{g=JSON.parse((await read(req,500)).toString('utf8')||'{}').gender;}catch{}
   resetOneHand(g);if(oneHandEdited()){await mkdir(dataDir,{recursive:true});await writeFile(oneHandFile,JSON.stringify(ONEHAND,null,1));}else{try{await unlink(oneHandFile);}catch{}}
   return reply(res,200,{active:ONEHAND,edited:oneHandEdited(),editedBy:oneHandEditedBy()});}
  if(p==='/api/onehand-config'&&req.method==='PUT'){try{setOneHand(JSON.parse((await read(req,5000)).toString('utf8')));}catch(e){return reply(res,422,{error:e.message});}await mkdir(dataDir,{recursive:true});await writeFile(oneHandFile,JSON.stringify(ONEHAND,null,1));return reply(res,200,{active:ONEHAND,edited:oneHandEdited(),editedBy:oneHandEditedBy()});}
  return reply(res,405,{error:'Method not allowed'});
 }
 if(p==='/api/sizing'||p==='/api/sizing/reset'){
  if(req.method==='GET')return reply(res,200,{active:tunable(CONFIG),defaults:tunable(DEFAULTS),edited:isEdited(),pinRequired:!!ADMIN_PIN});
  if(!pinOk(req))return reply(res,401,{error:'Wrong or missing admin PIN.'});
  if(p==='/api/sizing/reset'&&req.method==='POST'){resetTable();try{await unlink(overrideFile);}catch{}return reply(res,200,{active:tunable(CONFIG),edited:false});}
  if(p==='/api/sizing'&&req.method==='PUT'){let b;try{b=JSON.parse((await read(req,20000)).toString('utf8'));setTable(b);}catch(e){return reply(res,422,{error:e.message});}await mkdir(dataDir,{recursive:true});await writeFile(overrideFile,JSON.stringify(tunable(CONFIG),null,1));return reply(res,200,{active:tunable(CONFIG),edited:isEdited()});}
  return reply(res,405,{error:'Method not allowed'});
 }
 if(p==='/healthz')return reply(res,200,{status:'ok'});
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
 const file=path.resolve(root,'.'+decodeURIComponent(p==='/'?'/index.html':/^\/dashboard\/?$/.test(p)?'/dashboard.html':/^\/participants?\/?$/.test(p)?'/participants.html':/^\/onehand\/?$/.test(p)?'/onehand.html':/^\/onehand\/config\/?$/.test(p)?'/onehand-config.html':/^\/onehand\/dashboard\/?$/.test(p)?'/onehand-dashboard.html':/^\/onehand\/participants?\/?$/.test(p)?'/onehand-participants.html':p));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:data);
}catch(e){if(e.code==='ENOENT'){res.writeHead(404).end('Not found');return;}reply(res,e.status||400,{error:e.message||'Request failed'});}});
server.listen(serverPort,'0.0.0.0',()=>console.log('Ring size finder: http://127.0.0.1:'+serverPort));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{close();server.close(()=>process.exit(0));});
