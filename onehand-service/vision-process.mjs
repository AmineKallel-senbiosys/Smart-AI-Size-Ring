import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./worker.py',import.meta.url)),cwd=fileURLToPath(new URL('.',import.meta.url));
const venv=fileURLToPath(new URL(process.platform==='win32'?'./.venv/Scripts/python.exe':'./.venv/bin/python',import.meta.url));
const python=process.env.RING_PYTHON||(existsSync(venv)?venv:process.platform==='win32'?'python':'python3');
export class VisionProcess{
 constructor({timeoutMs=600000,maxPending=5,label='Measurement',spawnProcess=spawn}={}){this.timeoutMs=timeoutMs;this.maxPending=maxPending;this.label=label;this.spawnProcess=spawnProcess;this.pending=new Map();this.child=null;this.sequence=0;}
 fail(child,message){if(this.child!==child)return;this.child=null;for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(new Error(message));}this.pending.clear();child.kill();}
 start(){if(this.child)return this.child;const child=this.spawnProcess(python,['-u',script],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;child.stderr.on('data',()=>{});child.stdin.on('error',()=>this.fail(child,`${this.label} worker connection stopped. Please retry.`));const lines=createInterface({input:child.stdout});lines.on('line',line=>{let reply;try{reply=JSON.parse(line);}catch{return;}if(this.child!==child||reply.ready)return;const job=this.pending.get(reply.id);if(!job)return;if(reply.stage!==undefined){try{job.onStage(reply.stage);}catch{}return;}this.pending.delete(reply.id);clearTimeout(job.timer);reply.error?job.reject(new Error(reply.error)):job.resolve(reply.result);});child.on('error',()=>this.fail(child,`${this.label} worker could not start.`));child.on('exit',()=>this.fail(child,`${this.label} worker stopped. Please retry.`));return child;}
 request(image,mode,onStage=()=>{},context=null){if(this.pending.size>=this.maxPending)return Promise.reject(new Error(`${this.label} is busy. Retrying shortly.`));const child=this.start();return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>this.fail(child,`${this.label} timed out. The worker will restart automatically.`),this.timeoutMs);this.pending.set(id,{resolve,reject,timer,onStage});try{child.stdin.write(JSON.stringify({id,image:image.toString('base64'),mode,context})+'\n');}catch{this.fail(child,`${this.label} worker connection failed.`);}});}
 close(){if(this.child)this.fail(this.child,`${this.label} stopped.`);}
}
