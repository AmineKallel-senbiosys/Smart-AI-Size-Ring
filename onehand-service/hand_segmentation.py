"""Local landmark-guided segmentation and mask-constrained subpixel metrology.

This measures the visible outline. It is not a learned circumference predictor.
"""
import cv2
import numpy as np

def segment_hand(image,landmarks,card):
    h,w=image.shape[:2];ratio=min(1,900/max(w,h))
    small=cv2.resize(image,None,fx=ratio,fy=ratio,interpolation=cv2.INTER_AREA) if ratio<1 else image.copy()
    sh,sw=small.shape[:2];p=landmarks*np.array([sw/w,sh/h])
    labels=np.full((sh,sw),cv2.GC_BGD,np.uint8)
    # Landmarks describe the skeleton, not the skin outline. Outside the thin
    # initial tubes must remain eligible foreground, or GrabCut permanently
    # amputates wider/off-centre fingers before edge measurement even starts.
    candidate=np.zeros((sh,sw),np.uint8)
    cv2.fillConvexPoly(candidate,cv2.convexHull(p.astype(np.int32)),1)
    margin=max(8,int(np.linalg.norm(p[9]-p[10])*.6))
    candidate=cv2.dilate(candidate,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(margin*2+1,margin*2+1)))
    labels[candidate==1]=cv2.GC_PR_BGD
    palm=p[[0,5,9,13,17]];centre=palm.mean(axis=0)
    cv2.fillConvexPoly(labels,cv2.convexHull(palm.astype(np.int32)),cv2.GC_PR_FGD)
    cv2.fillConvexPoly(labels,cv2.convexHull((centre+(palm-centre)*.6).astype(np.int32)),cv2.GC_FGD)
    for chain in [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]:
        base=np.linalg.norm(p[chain[0]]-p[chain[1]])
        for i,(a,b) in enumerate(zip(chain,chain[1:])):
            thickness=max(6,int(base*(.9 if i==0 else .65)))
            cv2.line(labels,tuple(p[a].astype(int)),tuple(p[b].astype(int)),cv2.GC_PR_FGD,thickness)
        # Thin inner skeletons are seeds only, never anatomical width estimates.
        for a,b in zip(chain,chain[1:]):
            cv2.line(labels,tuple(p[a].astype(int)),tuple(p[b].astype(int)),cv2.GC_FGD,max(2,int(base*.08)))
    cv2.fillConvexPoly(labels,(card*np.array([sw/w,sh/h])).astype(np.int32),cv2.GC_BGD)
    labels[:2]=cv2.GC_BGD;labels[-2:]=cv2.GC_BGD;labels[:,:2]=cv2.GC_BGD;labels[:,-2:]=cv2.GC_BGD
    bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
    cv2.grabCut(small,labels,None,bg,fg,4,cv2.GC_INIT_WITH_MASK)
    mask=np.isin(labels,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
    # Keep the connected hand containing its palm centre, discard isolated noise.
    _,components=cv2.connectedComponents(mask)
    cy,cx=np.rint(centre[::-1]).astype(int);component=components[np.clip(cy,0,sh-1),np.clip(cx,0,sw-1)]
    if component==0:raise ValueError('The hand outline could not be separated from the background.')
    mask=(components==component).astype(np.uint8)
    return cv2.resize(mask,(w,h),interpolation=cv2.INTER_NEAREST)

def sample_values(image,points):
    return cv2.remap(image,points[:,0].astype(np.float32)[None,:],points[:,1].astype(np.float32)[None,:],cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)[0].astype(float)

def mask_boundary(mask,centre,normal,direction,limit):
    distances=np.arange(0,limit,.5);points=centre+normal*direction*distances[:,None]
    h,w=mask.shape
    valid=(points[:,0]>=1)&(points[:,0]<w-1)&(points[:,1]>=1)&(points[:,1]<h-1)
    stop=np.flatnonzero(~valid)
    if len(stop):points=points[:stop[0]];distances=distances[:stop[0]]
    if len(points)<8:return None
    values=sample_values(mask.astype(np.float32),points)
    if values[0]<.5:return None
    for i in range(2,len(values)-3):
        if values[i]<.5 and np.max(values[i:i+3])<.5:
            before=values[i-1];after=values[i]
            fraction=(before-.5)/max(1e-8,before-after)
            distance=distances[i-1]+np.clip(fraction,0,1)*.5
            return centre+normal*direction*distance
    return None

def refine_edge(image,point,normal,scale):
    radius=max(5,min(10,scale*.8))
    offsets=np.arange(-np.ceil(radius),np.ceil(radius)+1)
    colors=sample_values(image,point+normal*offsets[:,None])
    # Bidirectional colour derivative handles light/dark and hue boundaries.
    gradient=np.linalg.norm(colors[2:]-colors[:-2],axis=1)/2
    peak=int(np.argmax(gradient))
    if gradient[peak]<4 or peak==0 or peak==len(gradient)-1:return None
    a,b,c=gradient[peak-1:peak+2];denominator=a-2*b+c
    subpixel=np.clip(.5*(a-c)/denominator,-.5,.5) if abs(denominator)>1e-8 else 0
    return point+normal*(offsets[peak+1]+subpixel)

def measure_finger(image,mask,mcp,pip,scale,neighbors=(),diagnostics=None,distal=None,max_width_mm=26,region="base",knuckle_mm=4,base_range=(.35,.99),dense=False):
    axis=pip-mcp;normal=np.array([-axis[1],axis[0]])/np.linalg.norm(axis)
    samples=[]
    if diagnostics is not None:diagnostics.update(maskMiss=0,geometryReject=0,widths=[])
    # Find the first independently visible part of the proximal finger above
    # the web. The MCP landmark is often inside the palm; a fixed .4-.7 band
    # misses short fingers. Stop below the PIP and use the earliest valid band.
    if region == 'knuckle':
        if distal is None:
            raise ValueError('The joint and the next finger segment must be visible.')
        distal_axis=distal-pip
        distal_length=float(np.linalg.norm(distal_axis))
        proximal_length=float(np.linalg.norm(axis))
        if min(distal_length,proximal_length)<scale*2:
            raise ValueError('The joint position is unclear.')
        distal_normal=np.array([-distal_axis[1],distal_axis[0]])/distal_length
        # A separate 8 mm band centred on PIP (IP for the thumb).
        # Follow each segment's own perpendicular as the finger bends.
        before=min(.3 if knuckle_mm<=4 else .6,knuckle_mm*scale/proximal_length)
        after=min(.3 if knuckle_mm<=4 else .6,knuckle_mm*scale/distal_length)
        sections=[(float(t),mcp+axis*t,normal,True) for t in np.linspace(1-before,1,32,endpoint=False)]
        sections.extend((1+float(t),pip+distal_axis*t,distal_normal,True) for t in np.linspace(0,after,32))
    elif region == 'base':
        sections=[(float(t),mcp+axis*t,normal,False) for t in np.linspace(base_range[0],base_range[1],160)]
        if distal is not None:
            distal_axis=distal-pip;distal_normal=np.array([-distal_axis[1],distal_axis[0]])/np.linalg.norm(distal_axis)
            sections.extend((1+float(t),pip+distal_axis*t,distal_normal,True) for t in np.linspace(0,.35,32))
    else:
        raise ValueError('Unknown measurement region')
    for t,centre,section_normal,near_joint in sections:
        record=dict(position=float(t),centerPx=centre.tolist(),normal=section_normal.tolist(),nearJoint=near_joint,status='pending')
        if diagnostics is not None:diagnostics.setdefault('sections',[]).append(record)
        normal=section_normal
        projections=[float(np.dot(a+(b-a)*min(t,1)-centre,normal)) for a,b in neighbors]
        limits={d:min((max_width_mm/2)*scale,min((p*d*.8 for p in projections if p*d>0),default=(max_width_mm/2)*scale)) for d in [-1,1]}
        edges=[mask_boundary(mask,centre,normal,d,limits[d]) for d in [-1,1]]
        record.update(searchLimitsPixels={str(d):float(v) for d,v in limits.items()},maskEdgesPx=[None if edge is None else edge.tolist() for edge in edges])
        if any(edge is None for edge in edges):
            record.update(status='rejected',reason='mask-boundary-missing',maskEdgesPx=[None if edge is None else edge.tolist() for edge in edges])
            if diagnostics is not None:diagnostics['maskMiss']+=1
            continue
        refined=[refine_edge(image,edge,normal,scale) for edge in edges]
        contour_only=any(edge is None for edge in refined)
        if contour_only:
            radius=max(5,min(10,scale))
            contrasts=[np.linalg.norm(np.diff(sample_values(image,point+normal*np.array([[-radius],[radius]])),axis=0)) for point in edges]
            if min(contrasts)<20:
                record.update(status='rejected',reason='insufficient-edge-contrast',contrast=[float(c) for c in contrasts])
                continue
            refined=edges
        left,right=refined;half=[np.linalg.norm(edge-centre) for edge in refined]
        width=float(np.linalg.norm(right-left)/scale)
        record.update(leftPx=left.tolist(),rightPx=right.tolist(),widthPixels=float(np.linalg.norm(right-left)),widthMm=width,contourOnly=contour_only)
        if diagnostics is not None:diagnostics['widths'].append(round(width,2))
        if 10<=width<=max_width_mm and min(half)>1.5*scale and max(half)/min(half)<2.5:
            record['status']='candidate'
            samples.append(dict(width=width,left=left,right=right,contourOnly=contour_only,nearJoint=near_joint,trace=record))
            if len(samples)>=64 and not dense:break
        else:
            record.update(status='rejected',reason='width-or-asymmetric-geometry',halfWidthsPixels=[float(v) for v in half])
            if diagnostics is not None:diagnostics['geometryReject']+=1
    if len(samples)<8:raise ValueError('The ring-position outline needs manual alignment.')
    widths=np.array([s['width'] for s in samples]);median=np.median(widths);mad=np.median(np.abs(widths-median))
    good=np.abs(widths-median)<=max(.4,3*mad)
    for sample,accepted in zip(samples,good):sample['trace'].update(status='accepted' if accepted else 'rejected',reason='consensus' if accepted else 'width-outlier')
    if diagnostics is not None:diagnostics['consensus']=dict(initialMedianMm=float(median),initialMadMm=float(mad),outlierToleranceMm=float(max(.4,3*mad)),acceptedCount=int(np.count_nonzero(good)),minimumAcceptedCount=8,maximumMadMm=float(max(.65,median*.05)))
    if np.count_nonzero(good)<8 or mad>max(.65,median*.05):raise ValueError('The ring-position measurements disagree; check the lines on the photo.')
    kept=[s for s,g in zip(samples,good) if g];rejected=[s for s,g in zip(samples,good) if not g];width=float(np.median(widths[good]))
    chosen=min(kept,key=lambda s:abs(s['width']-width));centre=(chosen['left']+chosen['right'])/2
    # Overlay length equals the reported median, without moving its centre.
    half=(chosen['right']-chosen['left'])*width/chosen['width']/2
    contour_fraction=sum(s['contourOnly'] for s in kept)/len(kept)
    near_joint=any(s['nearJoint'] for s in kept)
    return dict(widthMm=width,spreadMm=float(np.median(np.abs(widths[good]-width))),left=centre-half,right=centre+half,samples=kept,rejected=rejected,sampleCount=len(kept),contourFraction=contour_fraction,nearJoint=near_joint,method='segmentation-subpixel' if contour_fraction==0 else 'segmentation-contour')
