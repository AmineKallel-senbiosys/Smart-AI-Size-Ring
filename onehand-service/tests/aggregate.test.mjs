import test from 'node:test';import assert from 'node:assert/strict';
import {mergeFrames} from '../aggregate.mjs';
test('median per finger, ignores missing',()=>{
 const f=(a,b)=>({fingers:{thumb:{widthMm:a},index:{widthMm:b},middle:{widthMm:18},ring:{widthMm:17},little:{widthMm:null}}});
 const r=mergeFrames([f(20,16),f(21,null),f(30,16.2)]);
 assert.equal(r.widths.thumb,21);assert.equal(r.widths.index,16.1);assert.equal(r.widths.little,null);assert.equal(r.measured,4);
});
import {preFrameDue,AutoCaptureGate} from '../public/auto-capture.mjs';
test('burst frames are due in the last 1.5 s of the countdown',()=>{
 assert.equal(preFrameDue(2000,0),false);assert.equal(preFrameDue(1500,0),true);assert.equal(preFrameDue(1400,1),false);assert.equal(preFrameDue(750,1),true);assert.equal(preFrameDue(100,2),false);
 const g=new AutoCaptureGate();g.observe(true,0);g.observe(true,0);const a=g.tick(0,true);assert.equal(a.leftMs,3000);g.observe(true,1500);const b=g.tick(1500,true);assert.equal(b.leftMs,1500);g.observe(true,3000);assert.equal(g.tick(3000,true).fire,true);});
