"""Retry missed hand detections without changing measurement image geometry."""
import cv2
import numpy as np

def restore_points(points, turns, width, height):
    p=np.asarray(points,dtype=float)
    x,y=p[:,0],p[:,1]
    if turns==1:x,y=1-y,x
    elif turns==2:x,y=1-x,1-y
    elif turns==3:x,y=y,1-x
    return np.column_stack((x*width,y*height))

def detect_hands(image, detector):
    """detector accepts contiguous RGB and returns normalized XY point arrays."""
    h,w=image.shape[:2]
    rgb=cv2.cvtColor(image,cv2.COLOR_BGR2RGB)
    # Ordinary images retain the original fast path. Only misses use retries.
    sizes=[None,960]
    for size in sizes:
        candidate=rgb
        if size is not None:
            ratio=min(1,size/max(h,w))
            if ratio==1:continue
            candidate=cv2.resize(rgb,(round(w*ratio),round(h*ratio)),interpolation=cv2.INTER_AREA)
        hands=detector(np.ascontiguousarray(candidate))
        if hands:return [restore_points(p,0,w,h) for p in hands]
    ratio=min(1,960/max(h,w))
    candidate=cv2.resize(rgb,(round(w*ratio),round(h*ratio)),interpolation=cv2.INTER_AREA)
    for turns in [1,3,2]:
        hands=detector(np.ascontiguousarray(np.rot90(candidate,turns)))
        if hands:return [restore_points(p,turns,w,h) for p in hands]
    # Uneven illumination gets one local contrast retry; no inferred landmarks.
    lab=cv2.cvtColor(candidate,cv2.COLOR_RGB2LAB)
    lab[:,:,0]=cv2.createCLAHE(clipLimit=2,tileGridSize=(8,8)).apply(lab[:,:,0])
    hands=detector(cv2.cvtColor(lab,cv2.COLOR_LAB2RGB))
    return [restore_points(p,0,w,h) for p in hands]
