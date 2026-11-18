// Shared by the live camera and the layout-only preview; no camera permission here.
export function mountStudyCameraControls({root=document,onRestart=()=>{}}={}){
 const restart=document.createElement('button');restart.id='restart-camera';restart.type='button';restart.textContent='Restart camera';restart.onclick=onRestart;root.querySelector('.capture-controls').append(restart);
 const panel=document.createElement('div');panel.className='camera-bottom-panel';root.querySelector('.capture-page').append(panel);
 for(const selector of ['#angle-status','#orientation-permission','.capture-checks','#capture-info','.capture-controls'])panel.append(root.querySelector(selector));
 return panel;
}
