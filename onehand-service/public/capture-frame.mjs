// Materialize the pixels while the camera is live. Keep the canvas rather than
// a canvas-backed ImageBitmap that can turn black on mobile browser capture.
export function frameHasPixels(data){
 let maximum=0,total=0,count=0;
 const stride=Math.max(1,Math.floor(data.length/4/12000))*4;
 for(let i=0;i<data.length;i+=stride){const value=Math.max(data[i],data[i+1],data[i+2]);maximum=Math.max(maximum,value);total+=value;count++;}
 return count>0&&maximum>8&&total/count>1;
}
export function freezeFrame(canvas){
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 if(!frameHasPixels(pixels.data))throw new Error('The camera returned a black frame. Keep the camera open and retry.');
 ctx.putImageData(pixels,0,0);
 return canvas;
}
