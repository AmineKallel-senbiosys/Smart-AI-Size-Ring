import {mountStudyCameraControls} from './study-camera-view.mjs';
import {cameraCaptureAllowed,liveCheckMessage} from './camera-recovery.mjs';
import {inspectFrame,measurePhoto,createSession,getSession,publishActivity,getPublicUrl,validateSizes,skipValidation} from './hand-engine.js';
import {captureMarkup,drawCameraLevel} from './camera-view.js';
import {phoneLevel,captureAngleAllowed,coverCrop} from './camera-guidance.mjs';
import {freezeFrame} from './capture-frame.mjs';
import {AutoCaptureGate,preFrameDue} from './auto-capture.mjs';
const app=document.querySelector('#app'),params=new URLSearchParams(location.search);
const handPath='M19 81 15 27Q14 20 18 20Q21 20 22 27L26 46Q28 49 29 44L26 12Q25 6 29 6Q33 6 33 12L36 43Q38 46 40 41L40 7Q40 1 44 1Q48 1 48 7L47 43Q49 48 52 43L56 15Q57 9 61 10Q64 11 63 17L60 52Q60 63 65 58L72 44Q75 39 79 42Q82 45 77 53L66 71 59 82';
const fingers=['little','ring','middle','index','thumb'],labels={little:'Little',ring:'Ring',middle:'Middle',index:'Index',thumb:'Thumb'};
const scans=[{key:'left-palm',side:'left',surface:'palm'},{key:'left-back',side:'left',surface:'back'},{key:'right-palm',side:'right',surface:'palm'},{key:'right-back',side:'right',surface:'back'}];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const guides=[['Soft, even light','Avoid direct sunlight, strong shadows and very dark rooms.'],['Relax your fingers','Separate them gently. Do not stretch them as far as possible.'],['No pressure on the table','Rest your hand lightly without pressing or flattening the fingers.'],['Show the little finger and thumb','Keep both visible to the camera, without twisting your wrist or forcing your hand.'],['Make the card stand out','The card and background must have different colours. All four card edges must be visible.'],['Remove every ring','Take off rings before photographing either side of your hand.'],['Card directly above the hand','Place a standard sized card, such as a credit card or driving licence, just above your fingertips on the same flat surface. A blank card is best; cover private details without covering the edges.'],['Choose a balanced background','Place your hand and card on a plain, matte surface with a medium tone, neither very light nor very dark so their edges remain clear.']];
const isTouch=matchMedia('(pointer:coarse)').matches;const isPhone=params.get('scan')==='1',autoGate=new AutoCaptureGate();
let preFrames=[],answers=null,openFinger=null,saving=false,thanked=false;
let session=null,page='intro',consent=false,pName='',pGender='',error='',captureClient=isPhone,publicBase=null,polling=null;
let stream=null,level=null,observedAt=-Infinity,reading=null,inspecting=false,capturing=false,activeCapture=null,countdownActive=false;
let cameraEpoch=0,inspectionController=null,inspectionMaxSide=960,missedChecks=0,liveMessage='Checking the hand and card…',lastVideoTime=-1,lastFrameAt=0,restartingCamera=false,lastRecoveryAt=-Infinity,localMeasuring=false;
const title=s=>`${s.side==='left'?'Left':'Right'} hand · ${s.surface==='palm'?'Palm':'Back'}`;
const scan=()=>session.next;
function shell(content){document.body.classList.remove('camera-active');app.innerHTML=`<div class="beta-shell ${page==='guide'?'guide-page':''}"><nav class="beta-nav"><span class="beta-brand">velia</span><span class="beta-badge">RING SIZE</span></nav>${content}</div>`;}
const button=(text,id,secondary=false)=>`<button type="button" class="beta-btn ${secondary?'secondary':''}" id="${id}">${text}</button>`;
const errorMarkup=()=>error?`<div class="beta-error" role="alert">${escape(error)}</div>`:'';
function progress(){return `<div class="steps">${scans.map((s,i)=>`<span class="${session.completed.includes(s.key)?'done':session.next?.key===s.key?'active':''}">${session.completed.includes(s.key)?'✓ ':`${i+1}. `}${title(s)}</span>`).join('')}</div>`;}
function diagram(){const {side,surface}=scan(),mirror=(side==='right')!==(surface==='palm');return `<div class="view-illustration"><svg viewBox="0 0 100 125" role="img" aria-label="${title(scan())} with card above fingertips"><rect class="diagram-card" x="30" y="1" width="43" height="27" rx="3"/><g transform="translate(${mirror?'94':'5'} 37) ${mirror?'scale(-1 1)':''}"><path class="diagram-hand" d="${handPath}"/>${surface==='palm'?'<path class="palm-line" d="M27 58Q40 53 56 58M31 67Q42 60 60 65M57 58Q48 70 51 78"/>':'<rect class="nail" x="16" y="23" width="5" height="7" rx="2"/><rect class="nail" x="28" y="9" width="5" height="7" rx="2"/><rect class="nail" x="41" y="5" width="5" height="7" rx="2"/>'}</g></svg><br><span class="view-tag">${title(scan())}</span></div>`;}
const fitLabels={loose:'Loose',ok:'OK',tight:'Tight',nofit:'No fit'};
function initAnswers(){
 answers={left:{},right:{}};
 for(const side of['left','right'])for(const f of fingers){const r=session.sizes[side][f];answers[side][f]=r.size?{size:r.size,fit:r.fit||null,touched:false}:{size:null,fit:null,touched:false};}
 openFinger=null;
}
const answered=x=>x&&(x.size==='none'||(x.size&&x.fit));
const remaining=()=>['left','right'].reduce((n,s)=>n+fingers.filter(f=>!answered(answers[s][f])).length,0);
function handResult(side){
 const order=side==='left'?fingers:[...fingers].reverse(),r=session.sizes[side];
 const tile=f=>{const x=answers[side][f],open=openFinger&&openFinger.side===side&&openFinger.f===f,done=answered(x);
  const sizeText=r[f].size?`<strong>${r[f].size}</strong>${r[f].fit?`<small class="fit fit-${r[f].fit}">${fitLabels[r[f].fit]}</small>`:''}${r[f].also?`<small class="also">or ${r[f].also}</small>`:''}`:`<strong>–</strong><small>${r[f].status==='not-measured'?'Not measured':'Outside sizes 6–12'}</small>`;
  const changed=done&&(x.size!==(r[f].size??null)||(x.size!=='none'&&x.fit!==(r[f].fit??null)));
  const you=done&&(changed||!r[f].size)?`<small class="you">You: ${x.size==='none'?'no size':x.size+' · '+fitLabels[x.fit]}</small>`:'';
  return `<button type="button" class="size-tile ${r[f].size?'':'none'} ${open?'sel':''} ${done?'checked':'todo'}" data-side="${side}" data-f="${f}" aria-pressed="${open}"><span>${labels[f]}</span>${sizeText}${you}</button>`;};
 return `<section class="hand-panel ${side}"><h2>${side==='left'?'Left':'Right'} hand</h2><div class="size-grid">${order.map(tile).join('')}</div></section>`;
}
function checkerMarkup(){
 if(!openFinger)return `<p class="muted checker-hint">Try the ring kit on each finger. Tap a finger below if the size is not the right one.</p>`;
 const {side,f}=openFinger,r=session.sizes[side][f],x=answers[side][f],sizes=[6,8,10,12];
 const tag=n=>r.size===n?'<em>suggested</em>':r.also===n?'<em>or</em>':'';
 const fits=['loose','ok','tight',...(x.fit==='nofit'?['nofit']:[])];
 return `<div class="checker" role="group" aria-label="Check ${side} ${labels[f]}"><h3>${side==='left'?'Left':'Right'} ${labels[f].toLowerCase()}: which size is right?</h3><div class="chips">${sizes.map(n=>`<button type="button" class="chip ${x.size===n?'on':''}" data-size="${n}">${n}${tag(n)}</button>`).join('')}<button type="button" class="chip ${x.size==='none'?'on':''}" data-size="none">No size fits</button></div>${x.size==='none'?'':`<h3>And how does it fit?</h3><div class="chips">${fits.map(k=>`<button type="button" class="chip ${x.fit===k?'on':''}" data-fit="${k}">${fitLabels[k]}</button>`).join('')}</div>`}<button type="button" class="beta-btn secondary" id="close-checker">Done with this finger</button></div>`;
}
function resultView(){
 if(session.skipped)return `<div class="result-hand"><div class="success-icon">✓</div></div><p class="eyebrow" style="text-align:center">Skipped</p><h1 style="text-align:center">Nothing was saved.</h1><p class="lead" style="margin:0 auto 8px;text-align:center">Your photos, name and answers were discarded and are not added to the results.</p><div class="actions" style="justify-content:center">${button('Measure again','again')}</div>`;
 if(session.validated)return `<div class="result-hand"><div class="success-icon">✓</div></div><p class="eyebrow" style="text-align:center">Saved</p><h1 style="text-align:center">Thank you.</h1><p class="lead" style="margin:0 auto 8px;text-align:center">Your checked sizes and photos were saved. They help us improve the sizing.</p><div class="actions" style="justify-content:center">${button('Measure again','again')}</div>`;
 const left=remaining();
 return `<div class="result-hand"><div class="success-icon">✓</div></div><p class="eyebrow" style="text-align:center">All four photos measured</p><h1 style="text-align:center">Your ring sizes.</h1><p class="lead" style="margin:0 auto 8px;text-align:center">US ring size for every finger of both hands. Check each one with your ring kit, then validate.</p><div class="hand-pair">${handResult('left')}${handResult('right')}</div><div id="checker-box">${checkerMarkup()}</div>${error?`<div class="beta-error" role="alert">${escape(error)}</div>`:''}<div class="actions" style="justify-content:center">${button(saving?'Saving…':'Validate my sizes','validate')}${button('Skip, do not save','skip',true)}${button('Measure again','again',true)}</div><p class="muted" style="text-align:center;margin-top:12px">${left?`${left} finger${left>1?'s':''} still to check`:'All ten fingers checked'}. On validate we save your four photos, your name, gender and the sizes you confirm. If you skip, nothing is saved.</p>`;
}
function wireResult(){
 document.querySelectorAll('.size-tile[data-f]').forEach(b=>b.onclick=()=>{const side=b.dataset.side,f=b.dataset.f;openFinger=openFinger&&openFinger.side===side&&openFinger.f===f?null:{side,f};refreshResult();});
 document.querySelectorAll('.chip[data-size]').forEach(b=>b.onclick=()=>{const {side,f}=openFinger,x=answers[side][f],r=session.sizes[side][f],v=b.dataset.size,n=v==='none'?'none':Number(v);if(x.size!==n){x.fit=n==='none'?null:(n===r.size?r.fit||null:null);x.size=n;}x.touched=true;refreshResult();});
 document.querySelectorAll('.chip[data-fit]').forEach(b=>b.onclick=()=>{const {side,f}=openFinger,x=answers[side][f];x.fit=b.dataset.fit;x.touched=true;refreshResult();});
 const close=document.querySelector('#close-checker');if(close)close.onclick=()=>{openFinger=null;refreshResult();};
 const skip=document.querySelector('#skip');if(skip)skip.onclick=async()=>{if(saving)return;saving=true;try{session=await skipValidation(session.id);thanked=true;}catch(e){error=e.message;}saving=false;render();};
 const val=document.querySelector('#validate');if(val){val.disabled=saving||remaining()>0;val.onclick=submitValidation;}
 document.querySelector('#again').onclick=()=>{session=null;answers=null;thanked=false;pName='';pGender='';consent=false;error='';history.replaceState(null,'',captureClient?'/?scan=1':'/');page='guide';render();};
}
function refreshResult(){const y=scrollY;shell(resultView());wireResult();scrollTo(0,y);}
async function submitValidation(){
 if(remaining()>0||saving)return;saving=true;error='';refreshResult();
 try{session=await validateSizes(session.id,answers);saving=false;thanked=true;render();}
 catch(e){saving=false;error=e.message;refreshResult();}
}
function render(){
 if(page==='camera'){renderCamera();return;}
 window.scrollTo(0,0);
 if(page==='intro'){
  shell(`<p class="eyebrow">Ring size</p><h1>Find your ring size.</h1><p class="lead">Take four photos with a standard card for scale: the palm and the back of your left hand, then of your right hand. We measure your finger knuckles and tell you your US ring size for all ten fingers. Nothing is saved: photos are measured and discarded.</p>${errorMarkup()}<div class="actions">${button('Continue','intro-next')}</div>`);
  document.querySelector('#intro-next').onclick=()=>{error='';page='guide';render();};
 }else if(page==='guide'){
  shell(`<p class="eyebrow">Important · before you begin</p><h1>A better photo. A better size.</h1><p class="lead">Follow every point for all four photos. At least four fingers must be measurable in each photo; otherwise we will ask you to try again. The camera takes the photo automatically after all positioning checks pass.</p><div class="guide-layout"><div class="guides">${guides.map(([heading,copy],i)=>`<article class="guide"><b>${String(i+1).padStart(2,'0')}</b><div><h3>${heading}</h3><p>${copy}</p></div></article>`).join('')}</div><div class="beta-card guide-consent"><h2>Your details</h2><div class="profile"><label for="pname">Full name</label><input id="pname" type="text" autocomplete="off" maxlength="80" placeholder="First and last name" value="${escape(pName)}"><span class="profile-label">Gender</span><div class="gender-row"><label><input type="radio" name="gender" value="male" ${pGender==='male'?'checked':''}><span>Male</span></label><label><input type="radio" name="gender" value="female" ${pGender==='female'?'checked':''}><span>Female</span></label></div></div><p class="muted">Your photos are sent to this app to be measured. If you validate your sizes at the end, your four photos, your name, gender and the sizes you confirm are saved.</p><div class="guide-summary" aria-label="Overview"><div><strong>4</strong><span>views</span></div><div><strong>2</strong><span>hands</span></div><div><strong>Auto</strong><span>capture</span></div></div><label class="check-label"><input id="consent" type="checkbox" ${consent?'checked':''}><span>I have read the photo guidance and agree to my photos being measured and, if I validate, my photos, name, gender and sizes being saved.</span></label></div></div>${errorMarkup()}<div class="actions">${button('Start the four scans','register')}${button('Back','back-intro',true)}</div>`);
  document.querySelector('#back-intro').onclick=()=>{page='intro';render();};document.querySelector('#register').onclick=register;
 }else if(page==='qr'||page==='monitor')renderMonitor();
 else if(page==='scan'){
  const s=scan();if(!s){page='result';render();return;}
  shell(`${progress()}<div class="scan-grid"><div><p class="eyebrow">Photo ${session.completed.length+1} of 4</p><h1>${title(s)}</h1><p class="lead">${s.surface==='palm'?'Turn the palm toward the camera and rest the back of your hand lightly on the surface.':'Turn the back of your hand toward the camera and rest the palm lightly on the surface.'} Place the card above the fingertips. Keep all five fingers visible and gently separated.</p><div class="beta-card"><label class="check-label"><input id="view-confirmed" type="checkbox"><span>I am photographing my <strong>${s.side} hand</strong>, with its <strong>${s.surface}</strong> facing the camera.</span></label></div><p class="muted">The diagram is a guide. Once positioned correctly, keep still: the photo is taken automatically.</p>${errorMarkup()}<div class="actions">${button('Open camera','open-camera')}</div></div>${diagram()}</div>`);
  document.querySelector('#open-camera').onclick=()=>{if(!document.querySelector('#view-confirmed').checked){error='Please confirm the hand and view before opening the camera.';render();return;}error='';requestOrientation();page='camera';render();startCamera();};
 }else if(page==='processing'){
  shell(`${progress()}<div class="processing"><div class="spinner" aria-hidden="true"></div><p class="eyebrow">Photo ${session.completed.length+1} of 4</p><h1>Measuring your fingers.</h1><p class="lead">We are checking your finger knuckles. We took 3 photos of this view and combine them for a steadier result. This takes up to a minute. Please keep this page open.</p></div>`);
 }else if(page==='result'){
  if(!answers)initAnswers();
  shell(resultView());wireResult();
 }
}
function renderMonitor(){
 const s=session.next,live=session.activity&&Date.now()-session.activity.at<16000;
 const phase=session.processing?'processing':live?session.activity.phase:session.error?'retry':'waiting';
 const phaseLabel={guide:'Follow the steps on your phone',camera:'Camera open · positioning the hand',processing:'Photo taken · measuring',retry:'Please retake this view on your phone',waiting:session.activity?'Phone inactive · reopen the link':'Scan the QR code to connect your phone'}[phase]||'Follow the steps on your phone';
 const showQR=page==='qr';
 shell(`${progress()}<section class="monitor-heading"><div><p class="eyebrow">Live phone progress</p></div><div class="saved-counter"><strong>${session.completed.length}</strong><span>of 4<br>photos measured</span></div></section><section class="monitor-main"><div class="monitor-current"><span class="monitor-stage ${phase==='processing'?'working':''}">${phase==='processing'?'<span class="small-spinner"></span>':''}${phaseLabel}</span><p class="eyebrow">${phase==='processing'?'Processing':'Current photo'} ${session.completed.length+1} of 4</p><h1>${s.side==='left'?'Left':'Right'} hand</h1><h2>${s.surface==='palm'?'Palm':'Back'} facing the camera</h2><div class="monitor-bar"><span style="width:${session.completed.length*25}%"></span></div><p class="muted">This screen follows the phone automatically and shows your sizes when all four photos are measured.</p>${session.error?`<p class="beta-error">${escape(session.error)}</p>`:''}</div>${showQR?`<aside class="monitor-connect"><h2>Scan with your phone</h2><p class="muted">Open the camera and scan this code to begin.</p><div class="qr-card" id="qr"></div><a class="qr-link" id="phone-link"></a>${localBase()?'<p class="muted">This address only works on this computer. Open the public https link on this computer, or start with start-public.bat, so the QR code works on your phone.</p>':''}</aside>`:diagram()}</section><div class="monitor-steps">${scans.map((item,i)=>`<div class="monitor-step ${session.completed.includes(item.key)?'saved':item.key===s.key?'current':''}"><span>${session.completed.includes(item.key)?'✓':i+1}</span><div><strong>${title(item)}</strong><small>${session.completed.includes(item.key)?'Measured':item.key===s.key?'Current view':'Next'}</small></div></div>`).join('')}</div><div class="actions">${button(showQR?'Hide QR code':'Show QR code','toggle-qr',true)}${button('Continue on this device','same-device',true)}</div>`);
 if(document.querySelector('#qr')){const url=new URL((publicBase||location.origin)+'/');url.searchParams.set('session',session.id);url.searchParams.set('scan','1');const qr=qrcode(0,'M');qr.addData(url.href);qr.make();document.querySelector('#qr').innerHTML=qr.createSvgTag({cellSize:4,margin:0,scalable:true});const link=document.querySelector('#phone-link');link.href=url.href;link.textContent=url.href;}
 document.querySelector('#same-device').onclick=()=>{captureClient=true;page='scan';render();};document.querySelector('#toggle-qr').onclick=()=>{page=page==='qr'?'monitor':'qr';render();};
}
const localBase=()=>!publicBase&&/^(localhost|127\.|\[::1\])/.test(location.hostname);
async function register(){
 pName=document.querySelector('#pname').value.trim();pGender=document.querySelector('input[name=gender]:checked')?.value||'';consent=document.querySelector('#consent').checked;
 if(pName.length<2){error='Please enter your name.';render();return;}if(!pGender){error='Please choose male or female.';render();return;}
 if(!consent){error='Please agree to continue.';render();return;}
 document.querySelector('#register').disabled=true;
 try{session=await createSession({name:pName,gender:pGender});const url=new URL(location.href);url.searchParams.set('session',session.id);history.replaceState(null,'',url);
  captureClient=matchMedia('(pointer:coarse)').matches;
  if(!captureClient)try{publicBase=(await getPublicUrl()).url;}catch{}
  page=captureClient?'scan':'qr';error='';render();poll();}
 catch(e){error=e.message;render();}
}
async function refresh(){
 if(!session)return;const next=await getSession(session.id),changed=JSON.stringify(next.completed)!==JSON.stringify(session.completed);session=next;
 if(page==='processing'&&localMeasuring)return;
 if(page==='camera')return;
 if(next.complete){if(page!=='result'){stopCamera();page='result';render();}else if((next.validated||next.skipped)&&!thanked){thanked=true;render();}return;}
 if(!captureClient){page=page==='qr'?'qr':'monitor';render();return;}
 if(changed&&page!=='scan'){page='scan';render();}
}
function poll(){clearInterval(polling);polling=setInterval(()=>refresh().catch(()=>{}),1500);}
async function pushActivity(){if(!captureClient||!session||session.complete||document.hidden)return;const phase=page==='camera'?'camera':page==='processing'?'processing':page==='scan'?'guide':null;if(phase)try{await publishActivity(session.id,phase);}catch{}}
setInterval(pushActivity,5000);
function t(key){return {back:'Back',card:'Card',hand:'Hand',checks:['Keep the hand and card visible','Gently separate all fingers','Hold the phone flat (3° maximum)'],enableMotion:'Enable motion sensor',hold:'Keep still',shutter:'Automatic photo',modelLoading:'Preparing the camera…'}[key];}
// On a computer without a motion sensor the level cannot be read: treat it as level so the camera still works.
function tiltReady(){return noSensor?true:captureAngleAllowed(level,observedAt,performance.now());}
let noSensor=!isTouch;
function updateLevel(){
 if(page!=='camera')return;
 const now=performance.now(),angleOK=tiltReady(),streamReady=!!stream&&!!document.querySelector('#camera')?.videoWidth;
 drawCameraLevel(!noSensor&&now-observedAt<=1000?level:null,angleOK);
 const status=document.querySelector('#angle-status');if(status)status.textContent=noSensor?'No motion sensor on this device · keep the camera flat above your hand':angleOK?'Phone level is ready · maximum 3°':now-observedAt>1000?'A fresh angle reading is needed. Enable the motion sensor.':`Hold the phone flatter: ${level.angle.toFixed(2)}° · maximum 3°`;
 document.querySelector('#orientation-permission')?.classList.toggle('hidden',noSensor||now-observedAt<2000);
 if(capturing||!stream)return;
 const step=autoGate.tick(now,angleOK&&!document.hidden),countdown=document.querySelector('#countdown');if(countdown){countdown.classList.toggle('hidden',step.remaining===null);if(step.remaining!==null)countdown.textContent=Math.max(1,step.remaining);}
 countdownActive=step.remaining!==null;
 if(!countdownActive)preFrames=[];
 else if(step.leftMs>0&&preFrameDue(step.leftMs,preFrames.length)){try{const v=document.querySelector('#camera');if(v?.videoWidth)preFrames.push(canvasPhoto(v,v));}catch{}}
 const info=document.querySelector('#capture-info');if(info)info.textContent=countdownActive?(step.leftMs<=1500?`Taking photos ${Math.min(3,preFrames.length+(step.leftMs===0?1:0))}/3 · keep still`:'Keep still. Taking your photo automatically…'):liveMessage;
 if(step.fire)capture();
}
function renderCamera(){
 document.body.classList.add('camera-active');app.innerHTML=captureMarkup(t,handPath,scan())+`<div class="capture-step-label">${session.completed.length+1}/4 · ${scan().side==='left'?'Left':'Right'} hand · ${scan().surface==='palm'?'Palm':'Back'} facing camera</div>`;
 document.querySelector('#back').onclick=()=>{stopCamera();page='scan';render();};document.querySelector('#orientation-permission').onclick=requestOrientation;
 mountStudyCameraControls({onRestart:()=>restartCamera()});
 updateLevel();
}
async function requestOrientation(){try{if(typeof globalThis.DeviceOrientationEvent?.requestPermission==='function'){const result=await DeviceOrientationEvent.requestPermission();if(result!=='granted')throw new Error('Motion permission was declined. Enable motion access in your browser to take a photo.');}}catch(e){if(page==='camera')document.querySelector('#capture-info').textContent=e.message;}}
window.addEventListener('deviceorientation',e=>{const screenAngle=Number(screen.orientation?.angle||window.orientation||0),next=phoneLevel(e.beta,e.gamma,screenAngle);if(!next)return;noSensor=false;level=next;observedAt=performance.now();reading={beta:e.beta,gamma:e.gamma,screenAngle};if(activeCapture){activeCapture.maximumAngle=Math.max(activeCapture.maximumAngle,next.angle);if(next.angle>3)activeCapture.invalid=true;}updateLevel();});
async function startCamera(){
 const epoch=++cameraEpoch;liveMessage='Starting the camera. Please hold still…';inspectionMaxSide=960;missedChecks=0;lastVideoTime=-1;lastFrameAt=performance.now();autoGate.reset();
 try{
  const candidate=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}},audio:false});
  if(page!=='camera'||epoch!==cameraEpoch){candidate.getTracks().forEach(t=>t.stop());return;}
  stream=candidate;const video=document.querySelector('#camera');video.srcObject=stream;await video.play();if(page!=='camera'||epoch!==cameraEpoch||stream!==candidate)return;
  const track=candidate.getVideoTracks()[0],capabilities=track.getCapabilities?.();
  if(capabilities?.focusMode?.includes('continuous'))track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
  track.addEventListener('ended',()=>{if(stream===candidate&&page==='camera'&&!document.hidden)restartCamera();},{once:true});
  liveMessage='Checking the hand and card. Automatic capture will start when ready.';lastFrameAt=performance.now();updateLevel();
 }catch{if(page==='camera'&&epoch===cameraEpoch){const el=document.querySelector('#camera-error');el.classList.remove('hidden');el.textContent='Camera unavailable. Allow camera access (this page needs https or localhost), then tap Restart camera.';}}
}
function stopCamera(){
 cameraEpoch++;inspectionController?.abort();inspectionController=null;inspecting=false;autoGate.reset();countdownActive=false;preFrames=[];
 const old=stream;stream=null;old?.getTracks().forEach(t=>t.stop());
}
async function restartCamera(){
 if(restartingCamera||page!=='camera')return;restartingCamera=true;lastRecoveryAt=performance.now();
 stopCamera();liveMessage='Restarting the camera…';document.querySelector('#camera-error')?.classList.add('hidden');
 try{await startCamera();}finally{restartingCamera=false;}
}
setInterval(()=>{
 if(page!=='camera'||!stream||capturing||document.hidden||restartingCamera)return;
 const video=document.querySelector('#camera'),now=performance.now();if(!video)return;
 if(video.readyState>=2&&video.videoWidth&&video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;lastFrameAt=now;}
 else if(now-lastFrameAt>6000&&now-lastRecoveryAt>15000)restartCamera();
},1000);
function canvasPhoto(source,video){const width=source.videoWidth||source.width,height=source.videoHeight||source.height;if(!width||!height)throw new Error('The camera is not ready. Please try again.');const box=video.getBoundingClientRect(),crop=coverCrop(width,height,box.width,box.height),ratio=Math.min(1,2400/Math.max(crop.width,crop.height)),canvas=document.createElement('canvas');canvas.width=Math.round(crop.width*ratio);canvas.height=Math.round(crop.height*ratio);canvas.getContext('2d').drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);return freezeFrame(canvas);}
async function capture(){
 if(!cameraCaptureAllowed({angleReady:tiltReady(),streamReady:!!stream&&!!document.querySelector('#camera')?.videoWidth,capturing,visible:!document.hidden,inspectionReady:autoGate.fresh(performance.now())}))return;capturing=true;updateLevel();
 const video=document.querySelector('#camera');activeCapture={maximumAngle:level?.angle??0,invalid:false};
 try{const track=stream.getVideoTracks()[0],frames=preFrames.slice(0,2),total=3;preFrames=[];
  // Normally two frames were already taken during the last 1.5 s of the countdown. Any missing frame is taken now.
  while(frames.length<total){
   burstNote(frames.length+1,total);
   frames.push(frames.length===total-1?await takeFrame(track,video):canvasPhoto(video,video));
   if(!tiltReady()||activeCapture.invalid||document.hidden||page!=='camera'||!stream){autoGate.reset();countdownActive=false;burstNote(0,total);return;}
   if(frames.length<total)await new Promise(r=>setTimeout(r,300));
  }
  await processPhoto(frames);
 }catch(e){scanError(e.message);}finally{activeCapture=null;capturing=false;updateLevel();}
}
function burstNote(n,total){const info=document.querySelector('#capture-info');if(!info)return;if(n)info.textContent=`Taking photos ${n}/${total} · keep still`;}
async function takeFrame(track,video){
 let canvas;
 if(typeof ImageCapture!=='undefined'){try{const bitmap=await createImageBitmap(await new ImageCapture(track).takePhoto());try{canvas=canvasPhoto(bitmap,video);}finally{bitmap.close();}}catch{}}
 return canvas||canvasPhoto(video,video);
}
async function processPhoto(photos){
 localMeasuring=true;stopCamera();page='processing';error='';render();pushActivity();let wake;
 try{try{wake=await navigator.wakeLock?.request('screen');}catch{}
  session=await measurePhoto(photos,session.id);page=session.complete?'result':'scan';error='';render();
 }catch(e){scanError(e.message);}finally{localMeasuring=false;await wake?.release().catch(()=>{});}
}
function scanError(message){stopCamera();error=message||'The photo could not be measured. Please try this view again.';page='scan';render();}
setInterval(updateLevel,100);
setInterval(async()=>{
 if(page!=='camera'||!stream||inspecting||capturing||document.hidden)return;
 const video=document.querySelector('#camera');if(!video?.videoWidth||video.readyState<2)return;
 const epoch=cameraEpoch,controller=new AbortController(),started=performance.now();inspectionController=controller;inspecting=true;
 try{
  const check=await inspectFrame(video,{signal:controller.signal,maxSide:inspectionMaxSide});
  if(page!=='camera'||!stream||epoch!==cameraEpoch||capturing)return;
  const stale=performance.now()-started>3000;
  const flags=[check.hand===true&&check.card===true&&check.framed===true&&check.resolutionOK===true,check.spread===true,tiltReady()&&check.flat===true];
  if(!check.hand||!check.card){missedChecks++;if(missedChecks>=2)inspectionMaxSide=1280;}else missedChecks=0;
  autoGate.observe(!stale&&flags.every(Boolean),performance.now());
  liveMessage=stale?'Live checks are catching up. Hold still; they will retry automatically.':liveCheckMessage(check);
  flags.forEach((good,i)=>{const node=document.querySelector('#check-'+i);node.classList.toggle('good',good&&!stale);node.querySelector('.check-icon').textContent=stale?'…':good?'✓':'×';});updateLevel();
 }catch(e){
  if(epoch!==cameraEpoch||page!=='camera')return;
  autoGate.reset();liveMessage='Live check unavailable — retrying automatically. Keep your hand and card visible, or tap Restart camera.';
  document.querySelectorAll('.capture-check').forEach(node=>{node.classList.remove('good');node.querySelector('.check-icon').textContent='…';});updateLevel();
 }finally{if(inspectionController===controller){inspectionController=null;inspecting=false;}}
},1500);
window.addEventListener('pagehide',()=>stopCamera());document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else if(page==='camera')startCamera();});
async function initialize(){
 const id=params.get('session');
 if(id){try{session=await getSession(id);captureClient=isPhone;page=session.complete?'result':isPhone?'scan':'monitor';if(!isPhone)try{publicBase=(await getPublicUrl()).url;}catch{}poll();}catch(e){error=e.message;page='intro';history.replaceState(null,'','/');}}
 render();
}
initialize();
