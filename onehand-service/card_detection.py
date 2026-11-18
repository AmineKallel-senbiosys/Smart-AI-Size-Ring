import math
import cv2
import numpy as np

def ordered(q):
    center=np.mean(q,axis=0)
    q=np.array(sorted(q,key=lambda p:math.atan2(p[1]-center[1],p[0]-center[0])),dtype=np.float32)
    q=np.roll(q,-int(np.argmin(q.sum(axis=1))),axis=0)
    if np.linalg.norm(q[0]-q[1])<np.linalg.norm(q[1]-q[2]):q=np.roll(q,-1,axis=0)
    return q

def card_quad(image,lm):
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    edges=cv2.Canny(cv2.GaussianBlur(gray,(5,5),0),25,80)
    for channel in cv2.split(image):edges=cv2.bitwise_or(edges,cv2.Canny(channel,35,100))
    edges=cv2.morphologyEx(edges,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    found,_=cv2.findContours(edges,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    contours=list(found)
    hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    masks=[cv2.inRange(hsv,np.array([start,45,45]),np.array([min(179,start+30),255,255])) for start in range(0,180,15)]
    masks.append(cv2.inRange(hsv,np.array([0,0,170]),np.array([179,55,255])))
    for mask in masks:
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
        extra,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        contours.extend(extra)
    candidates=[];h,w=image.shape[:2];hand_y=np.mean(lm[[5,9,13,17],1]);tips=np.mean(lm[[8,12,16,20]],axis=0)
    for contour in contours:
        area=abs(cv2.contourArea(contour))
        if not w*h*.002<area<w*h*.3:continue
        quad=cv2.approxPolyDP(contour,.03*cv2.arcLength(contour,True),True)
        if len(quad)!=4 or not cv2.isContourConvex(quad):continue
        original=ordered(quad.reshape(4,2));original_sides=[np.linalg.norm(original[i]-original[(i+1)%4]) for i in range(4)]
        if max(abs(original_sides[0]-original_sides[2])/max(original_sides[0],original_sides[2]),abs(original_sides[1]-original_sides[3])/max(original_sides[1],original_sides[3]))>.08:continue
        # Fit the full outer contour: polygon corner simplification can shrink
        # a rounded card and systematically inflate all finger measurements.
        rectangle=cv2.minAreaRect(contour)
        if area/(rectangle[1][0]*rectangle[1][1]+1e-8)<.8:continue
        q=ordered(cv2.boxPoints(rectangle));sides=[np.linalg.norm(q[i]-q[(i+1)%4]) for i in range(4)]
        a=(sides[0]+sides[2])/2;b=(sides[1]+sides[3])/2
        if b<20 or not 1.25<a/b<2 or np.mean(q[:,1])>hand_y:continue
        perspective=max(sides[0],sides[2])/min(sides[0],sides[2])
        if perspective>1.5:continue
        # A large unrelated rectangle must not win merely by having more area.
        # Prefer the standard-aspect candidate close to the fingertips.
        distance=float(np.linalg.norm(q.mean(axis=0)-tips))/a
        candidates.append((abs(a/b-85.6/53.98)*2+abs(perspective-1)*.25+distance*.6,q))
    if not candidates:raise ValueError('The standard card was not detected. Keep all four card edges visible above your hand, on the same flat surface.')
    return min(candidates,key=lambda item:item[0])[1]
