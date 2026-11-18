"""MobileSAM runs locally; MediaPipe landmarks supply automatic prompts.

Encoder export preprocessing is normalization/padding, not resizing. The caller
resizes to longest side 1024 and scales prompt coordinates accordingly.
"""
from pathlib import Path
import os
import cv2,numpy as np
ROOT=Path(__file__).parent
_encoder=None;_decoder=None

def neural_mask(image,landmarks,card):
    global _encoder,_decoder
    paths=[ROOT/'models/mobile_sam_image_encoder.onnx',ROOT/'models/sam_mask_decoder_single.onnx']
    if not all(p.exists() for p in paths):raise ValueError('Local segmentation models are not installed.')
    import onnxruntime as ort
    if _encoder is None:
        # Do not retain separate peak-sized CPU arenas for both SAM models.
        opts=ort.SessionOptions()
        opts.intra_op_num_threads=max(1, int(os.environ.get('RING_VISION_THREADS', '1')))
        opts.inter_op_num_threads=1
        opts.enable_cpu_mem_arena=False
        opts.enable_mem_pattern=False
        opts.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
        opts.add_session_config_entry('session.intra_op.allow_spinning', '0')
        _encoder=ort.InferenceSession(str(paths[0]),sess_options=opts,providers=['CPUExecutionProvider'])
        _decoder=ort.InferenceSession(str(paths[1]),sess_options=opts,providers=['CPUExecutionProvider'])
    h,w=image.shape[:2];ratio=1024/max(h,w);nh=int(h*ratio+.5);nw=int(w*ratio+.5)
    resized=cv2.resize(cv2.cvtColor(image,cv2.COLOR_BGR2RGB),(nw,nh),interpolation=cv2.INTER_LINEAR).astype(np.float32)
    embeddings=_encoder.run(['image_embeddings'],{'input_image':resized})[0]
    positive=np.vstack([landmarks[[2,3,4]],landmarks[5:],landmarks[[5,9,13,17]].mean(axis=0)])
    negative=np.vstack([card.mean(axis=0),np.array([[2,2],[w-3,2],[2,h-3],[w-3,h-3]])])
    points=np.vstack([positive,negative,[[0,0]]]).astype(np.float32)*np.array([nw/w,nh/h],np.float32)
    labels=np.array([1]*len(positive)+[0]*len(negative)+[-1],np.float32)
    masks,score,_=_decoder.run(None,{'image_embeddings':embeddings,'point_coords':points[None],'point_labels':labels[None],'mask_input':np.zeros((1,1,256,256),np.float32),'has_mask_input':np.zeros(1,np.float32),'orig_im_size':np.array([h,w],np.float32)})
    mask=(masks[0,0]>0).astype(np.uint8)
    core=landmarks[[5,6,9,10,13,14,17,18]].astype(int)
    coverage=np.mean(mask[np.clip(core[:,1],0,h-1),np.clip(core[:,0],0,w-1)])
    if float(score[0,0])<.5 or coverage<.75 or mask.mean()>.85:raise ValueError('The learned hand outline was uncertain.')
    return mask
