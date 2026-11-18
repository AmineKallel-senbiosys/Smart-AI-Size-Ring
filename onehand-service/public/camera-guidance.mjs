export function coverCrop(width,height,displayWidth,displayHeight){
 if(![width,height,displayWidth,displayHeight].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid camera dimensions');
 const target=displayWidth/displayHeight,source=width/height;
 const cropWidth=source>target?height*target:width,cropHeight=source>target?height:width/target;
 return {x:(width-cropWidth)/2,y:(height-cropHeight)/2,width:cropWidth,height:cropHeight};
}
export function phoneLevel(beta,gamma,screenAngle=0){
 if(![beta,gamma,screenAngle].every(Number.isFinite))return null;
 const b=beta*Math.PI/180,g=gamma*Math.PI/180,a=screenAngle*Math.PI/180;
 const z=Math.cos(b)*Math.cos(g),angle=Math.acos(Math.min(1,Math.abs(z)))*180/Math.PI;
 const gx=Math.sin(g),gy=Math.sin(b)*Math.cos(g);
 const x=gx*Math.cos(a)+gy*Math.sin(a),y=-gx*Math.sin(a)+gy*Math.cos(a);
 return {angle,x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y))};
}
export const MAX_CAPTURE_TILT=3;
export const MAX_ORIENTATION_AGE_MS=1000;
export function captureAngleAllowed(level,observedAt,now){
 return !!level&&Number.isFinite(level.angle)&&level.angle>=0&&level.angle<=MAX_CAPTURE_TILT&&Number.isFinite(observedAt)&&now>=observedAt&&now-observedAt<=MAX_ORIENTATION_AGE_MS;
}
export function levelBubblePosition(level,radius=42){
 const magnitude=Math.hypot(level.x,level.y);
 // 3 degrees reaches the 12px acceptance target; large tilts stay inside the rim.
 const distance=Math.min(radius,Math.max(0,level.angle)*4);
 return {x:magnitude?level.x/magnitude*distance:0,y:magnitude?level.y/magnitude*distance:0};
}
