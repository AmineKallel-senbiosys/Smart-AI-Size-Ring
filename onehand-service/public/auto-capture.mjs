// State machine shared by the camera and its deterministic regression tests.
export class AutoCaptureGate{
 constructor({checks=2,countdownMs=3000,maxInspectionAgeMs=2500}={}){this.checks=checks;this.countdownMs=countdownMs;this.maxAge=maxInspectionAgeMs;this.reset();}
 reset(){this.good=0;this.lastInspection=-Infinity;this.started=null;this.triggered=false;}
 observe(good,now){if(!good){this.reset();return;}this.good++;this.lastInspection=now;}
 fresh(now){return this.good>=this.checks&&now>=this.lastInspection&&now-this.lastInspection<=this.maxAge;}
 tick(now,angleReady){if(!angleReady||this.good>0&&now-this.lastInspection>this.maxAge){this.reset();return {remaining:null,fire:false};}if(!this.fresh(now)||this.triggered)return {remaining:null,fire:false};if(this.started===null)this.started=now;const leftMs=this.countdownMs-(now-this.started),remaining=Math.ceil(leftMs/1000);if(remaining<=0){this.triggered=true;return {remaining:0,fire:true,leftMs:0};}return {remaining,fire:false,leftMs};}
}

// The three photos of a view are taken in the last 1.5 s of the countdown: at 1.5 s, at 0.75 s and at 0 s.
export const preFrameDue=(leftMs,taken)=>(taken===0&&leftMs<=1500)||(taken===1&&leftMs<=750);
