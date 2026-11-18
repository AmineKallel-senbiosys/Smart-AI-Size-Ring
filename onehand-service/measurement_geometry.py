"""Geometry and edge checks independent of hand-landmark inference."""
import math
import cv2
import numpy as np

CARD=np.array([[0,0],[85.6,0],[85.6,53.98],[0,53.98]],dtype=float)

def card_calibration(quad, require_resolution=True):
    # A small corner error in a projective transform grows when extrapolated
    # from the card to the hand. Only accept overhead views, then fit all four
    # corners with one rotation and scale rather than extrapolating perspective.
    quad=np.asarray(quad,dtype=float)
    x=CARD-CARD.mean(axis=0);y=quad-quad.mean(axis=0)
    u,s,vt=np.linalg.svd(x.T@y)
    rotation=u@vt
    if np.linalg.det(rotation)<0:raise ValueError('The card corners could not be calibrated.')
    scale=float(s.sum()/np.square(x).sum())
    residual=np.linalg.norm(x@rotation*scale-y,axis=1)
    sides=np.linalg.norm(quad-np.roll(quad,-1,axis=0),axis=1)
    opposed=max(abs(sides[0]-sides[2])/max(sides[0],sides[2]),abs(sides[1]-sides[3])/max(sides[1],sides[3]))
    if residual.max()/scale>1.5 or opposed>.035:
        raise ValueError('The photo is angled or the card edges are unclear. Hold the camera directly above the hand and card, on the same flat surface.')
    if require_resolution and scale<3:
        raise ValueError('The hand and card are too small in this photo for sizing. Use an original camera photo, move closer so both fill the frame, and keep all card edges visible. Screenshots and video frames are too low resolution.')
    # Match the supplied CameraScan: 85.6 / card-width pixels. Use both
    # long sides to average corner noise; the short sides only validate tilt.
    return float((sides[0]+sides[2])/(2*85.6))

def profile_boundary(image,center,normal,direction,scale,max_half_width=None):
    # Average along the finger to suppress texture. Keep the FIRST sustained
    # transition out of the finger: a stronger neighboring edge is not its edge.
    distances=np.arange(0,min(13*scale,max_half_width if max_half_width is not None else 13*scale),.25)
    axis=np.array([-normal[1],normal[0]])
    coords=center[None,:]+normal[None,:]*distances[:,None]*direction
    h,w=image.shape[:2]
    valid=(coords[:,0]>=2)&(coords[:,1]>=2)&(coords[:,0]<=w-3)&(coords[:,1]<=h-3)
    outside=np.flatnonzero(~valid)
    if len(outside):coords=coords[:outside[0]];distances=distances[:outside[0]]
    if len(coords)<16:return None
    colors=[]
    for offset in [-1,0,1]:
        p=coords+axis*offset
        colors.append(cv2.remap(image,p[:,0].astype(np.float32)[None,:],p[:,1].astype(np.float32)[None,:],cv2.INTER_LINEAR)[0].astype(float))
    values=np.mean(colors,axis=0)
    core=values[distances<scale]
    origin=np.median(core,axis=0)
    change=np.linalg.norm(values-origin,axis=1)
    # Fixed RGB contrast excluded clear edges on similar-coloured surfaces.
    # Compare contrast to the noise measured inside this particular finger.
    noise=float(np.median(np.linalg.norm(core-origin,axis=1)))
    threshold=max(14,noise*4)
    # A narrow visible background gap is enough. The old 1.5 mm window could
    # run straight into the neighboring finger and reject a sharp edge.
    span=max(4,int(scale*.4/.25))
    for i in range(int(1.5*scale/.25),len(values)-span-4):
        if change[i]>threshold and np.median(change[i:i+span])>threshold:
            # Locate the steepest part of that transition, not a later finger.
            start=max(2,i-int(scale/.25));end=i+2
            gradient=np.linalg.norm(values[4:]-values[:-4],axis=1)
            k=start+int(np.argmax(gradient[start-2:end-2]))
            outside=np.median(values[min(k+span,len(values)-1):min(k+span+8,len(values))],axis=0)
            contrast=max(float(np.linalg.norm(outside-origin)),float(np.percentile(change[i:],95)))
            if contrast<threshold or gradient[k-2]*scale/contrast<.6:continue
            return coords[k]
    return None

def finger_width(image,mcp,pip,scale,tip=None,neighbors=()):
    axis=(pip if tip is None else tip)-mcp;normal=np.array([-axis[1],axis[0]])/np.linalg.norm(axis)
    widths=[]
    # Lower sections can cross the web/palm, especially on the little finger.
    for t in [.62,.66,.70,.74,.78,.82,.86]:
        center=mcp+(pip-mcp)*t
        # Stop before the neighboring finger's centre. If the boundary cannot
        # be resolved in that interval, reject it instead of using the neighbor.
        projections=[float(np.dot(a+(b-a)*t-center,normal)) for a,b in neighbors]
        limits={d:min(13*scale,min((p*d*.8 for p in projections if p*d>0),default=13*scale)) for d in [-1,1]}
        left=profile_boundary(image,center,normal,-1,scale,limits[-1])
        right=profile_boundary(image,center,normal,1,scale,limits[1])
        if left is None or right is None:continue
        a=np.linalg.norm(left-center);b=np.linalg.norm(right-center)
        width=(a+b)/scale
        if 10<=width<=26 and min(a,b)>scale*1.5 and max(a,b)/min(a,b)<2.5:widths.append(width)
    if len(widths)<3:raise ValueError('Finger edges could not be detected. Use a plain contrasting surface and keep the whole finger visible.')
    median=float(np.median(widths));mad=float(np.median(np.abs(np.array(widths)-median)))
    # Natural taper and a few web/knuckle samples must not veto an otherwise
    # consistent outline. Keep a consensus of at least three cross sections.
    inliers=np.array(widths)[np.abs(np.array(widths)-median)<=max(.75,median*.06)]
    if len(inliers)<3 or mad>max(.65,median*.05):
        raise ValueError('Finger edge measurements disagree. Keep the hand flat, separate the fingers and use even lighting on a plain contrasting surface.')
    return float(np.median(inliers)),float(np.median(np.abs(inliers-np.median(inliers))))

def circumference_from_width(width_mm):
    if not math.isfinite(width_mm) or width_mm<=0:raise ValueError('Invalid finger width')
    # Same circular-width assumption as the user's CameraScan. This is still
    # an estimate for a finger; the formula is exact for a circular ring hole.
    return width_mm*math.pi
