import test from 'node:test';import assert from 'node:assert/strict';
import {sizeForCircumference,sizesFromViews,CONFIG} from '../sizing.mjs';
test('boundaries map to kit sizes',()=>{const p=CONFIG.both;
 assert.equal(sizeForCircumference(48,p),6);assert.equal(sizeForCircumference(p.u6,p),8);assert.equal(sizeForCircumference(p.u8,p),10);assert.equal(sizeForCircumference(p.u10,p),12);
 assert.equal(sizeForCircumference(p.u12,p),null);assert.equal(sizeForCircumference(40,p),null);assert.equal(sizeForCircumference(NaN,p),null);});
test('palm and back are averaged and uses both-photo table',()=>{
 const r=sizesFromViews({palm:{index:20.6},back:{index:20.4,thumb:null}});assert.equal(r.index.status,'ok');assert.equal(r.thumb.status,'not-measured');});
test('one photo uses the single-photo table',()=>{const r=sizesFromViews({palm:{middle:19.45}});assert.ok([6,8,10,12].includes(r.middle.size));});
import {fitForCircumference} from '../sizing.mjs';
test('fit zones inside US 6 follow loose, ok, tight, nofit',()=>{const p=CONFIG.both,fit={order:['loose','ok','tight','nofit'],bands:{6:{loose:25,ok:50,tight:15,nofit:10}}};
 assert.equal(fitForCircumference(46,6,p,fit),'loose');assert.equal(fitForCircumference(48,6,p,fit),'ok');assert.equal(fitForCircumference(50.5,6,p,fit),'tight');assert.equal(fitForCircumference(51.5,6,p,fit),'nofit');});

import {alsoSize} from '../sizing.mjs';
test('a finger within 1 mm of a limit also gets the neighbouring size',()=>{const p=CONFIG.both;
 assert.equal(alsoSize(57.0,8,p),10);assert.equal(alsoSize(58.0,10,p),8);assert.equal(alsoSize(54.5,8,p),null);assert.equal(alsoSize(46,6,p),null);});
