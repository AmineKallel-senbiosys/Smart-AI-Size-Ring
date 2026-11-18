export function cameraCaptureAllowed({manual=false,angleReady,streamReady,capturing,visible,inspectionReady,manualElapsedMs=0}){return !!(angleReady&&streamReady&&!capturing&&visible&&(manual?manualElapsedMs>=5000:inspectionReady));}
export function liveCheckMessage(check){
 if(!check.hand)return 'No hand detected. Show the whole hand and all five fingers.';
 if(!check.card)return 'Card not detected. Keep all four edges visible above the fingertips.';
 if(!check.framed)return 'Keep the whole hand and card away from the edges of the camera view.';
 if(!check.resolutionOK)return 'Move the phone a little closer while keeping the whole hand and card visible.';
 if(!check.spread)return 'Separate your fingers gently so their edges do not touch.';
 if(!check.flat)return 'Keep the reference card flat and photograph it directly from above.';
 return 'Position checks passed. Hold still and keep the phone at 3° or less.';
}
