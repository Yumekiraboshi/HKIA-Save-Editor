"""Optional offline icon lighting approximation. This is not the game shader.
Original normal/tangent frames and normal map are used; light parameters are
fitted to one original icon. Do not publish this diagnostic as an exact icon.
"""
def unit(v):
    import numpy as np
    return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-10)

def sample(im,coords):
    import numpy as np
    arr=np.asarray(im)/255;h,w=arr.shape[:2]
    x=(coords[:,:,0]%1)*w-.5;y=(coords[:,:,1]%1)*h-.5
    ix=np.floor(x).astype(int);iy=np.floor(y).astype(int)
    fx=(x-ix)[...,None];fy=(y-iy)[...,None]
    return (arr[iy%h,ix%w]*(1-fx)+arr[iy%h,(ix+1)%w]*fx)*(1-fy)+(arr[(iy+1)%h,ix%w]*(1-fx)+arr[(iy+1)%h,(ix+1)%w]*fx)*fy

def layers(attrs,base,pattern,bump,p):
    import numpy as np
    from native_dye_albedo import dye_albedo
    b=sample(base,attrs[:,:,:2]);t=sample(pattern,attrs[:,:,:2])
    q=np.broadcast_to(p[0],b[:,:,:3].shape).copy()
    for i in range(3):q+=(p[i+1]-q)*t[:,:,i,None]
    q=p[4]+(q-p[4])*t[:,:,3,None]
    rgb=b[:,:,:3]+(b[:,:,:3]*q-b[:,:,:3])*b[:,:,3,None]
    # Compare the vectorized path with the previously source-verified scalar operation.
    for y,x in [(0,0),(attrs.shape[0]//2,attrs.shape[1]//2)]:
        if not np.allclose(rgb[y,x],dye_albedo(b[y,x,:3],t[y,x],b[y,x,3],p),rtol=0,atol=1e-12):
            raise ValueError("albedo mismatch")
    n=unit(attrs[:,:,2:5])
    tangent=attrs[:,:,5:8]
    tan=unit(tangent-(tangent*n).sum(-1,keepdims=True)*n)
    bitan=np.cross(n,tan)*np.sign(attrs[:,:,8:9])
    m=sample(bump,attrs[:,:,:2])
    # Unity-style normal unpack hypothesis, not a recovered shader instruction.
    xy=np.stack([m[:,:,0]*m[:,:,3],m[:,:,1]],axis=-1)*2-1
    zz=np.sqrt(np.maximum(0,1-(xy**2).sum(-1)))
    nm=unit(tan*xy[:,:,0,None]+bitan*xy[:,:,1,None]+n*zz[...,None])
    return rgb,n,nm

def shade(params,albedo,norm,view):
    import numpy as np
    light=unit(np.array(params[:3]))
    nd=np.maximum(0,(norm*light).sum(-1))
    rim=(1-np.clip((norm*view).sum(-1),0,1))**1.5
    half=unit(light+view)
    spec=np.maximum(0,(norm*half).sum(-1))**16
    return np.clip(albedo*(params[3]+params[4]*nd[...,None])+params[5]*rim[...,None]+params[6]*spec[...,None],0,1)

def fit_lighting(pos,uv,normal,tangent,idx,base,pattern,bump,p,ref,raster,normalize,labels,out):
    import numpy as np
    from scipy.optimize import least_squares
    from PIL import Image
    src=np.column_stack([uv,normal,tangent])
    refn=normalize(ref);target=labels(refn)
    def project(yaw,pitch,roll,N=96):
        mask,attrs=raster(pos,src,idx,yaw,pitch,N,mirror=True,roll=roll,scale=82/96)
        a,b=np.deg2rad([yaw,pitch])
        view=np.array([np.sin(a)*np.cos(b),np.sin(b),np.cos(a)*np.cos(b)])
        return mask,attrs,view
    def classify(rgb,mask):
        return labels(np.dstack([rgb,mask]))
    def compare(rgb,mask):
        v=classify(rgb,mask)
        def iou(a,b):return float((a&b).sum()/max(1,(a|b).sum()))
        silhouette=iou(mask,target>0)
        colors=[iou(v==k,target==k) for k in (1,2,3)]
        return .5*silhouette+.5*float(np.mean(colors)),silhouette,colors
    best=None
    for yaw in (320,330,340):
        for pitch in (5,15,25):
            for roll in (5,15,25):
                mask,attrs,_=project(yaw,pitch,roll)
                rgb,_,_=layers(attrs,base,pattern,bump,p)
                score,sil,colors=compare(rgb,mask)
                c=(score,sil,yaw,pitch,roll,colors)
                if best is None or c>best:best=c
    score,sil,yaw,pitch,roll,colors=best
    mask,attrs,view=project(yaw,pitch,roll)
    rgb,n,nm=layers(attrs,base,pattern,bump,p)
    valid=mask&(target>0)&(target==classify(rgb,mask))
    yy,xx=np.indices(mask.shape)
    train=valid&((xx+3*yy)%5!=0);test=valid&~train
    if min(train.sum(),test.sum())<100:raise ValueError("insufficient aligned reference samples")
    ref_rgb=refn[:,:,:3]
    base_mae=float(np.abs(rgb[test]-ref_rgb[test]).mean())
    results={}
    for tag,nor in [('mesh',n),('bump',nm)]:
        fit=least_squares(lambda z:(shade(z,rgb,nor,view)[train]-ref_rgb[train]).ravel(),
            [.2,1,.7,.9,.5,.08,.05],bounds=([-1,-1,-1,0,0,0,0],[1,1,1,2,2,1,1]),loss='soft_l1',f_scale=.08)
        if not fit.success:raise ValueError("lighting fit failed")
        lit=shade(fit.x,rgb,nor,view)
        results[tag]={"parameters":fit.x.tolist(),"heldOutRgbMae":float(np.abs(lit[test]-ref_rgb[test]).mean())}
        if tag=='bump':
            m,a2,f2=project(yaw,pitch,roll,384)
            r,_,nmm=layers(a2,base,pattern,bump,p)
            final=shade(fit.x,r,nmm,f2)
            Image.fromarray(np.uint8(np.dstack([final,m])*255),'RGBA').resize((256,256),Image.Resampling.LANCZOS).save(out/"lighting-preview.png")
    return {"camera":{"yaw":yaw,"pitch":pitch,"mirror":True,"roll":roll},
            "candidateCount":27,"score":score,"silhouetteIoU":sil,"colorRegionIoUs":colors,
            "trainPixels":int(train.sum()),"heldOutPixels":int(test.sum()),"unlitHeldOutRgbMae":base_mae,
            "lighting":results,"nativeLightingVerified":False,"nativeIconVerified":False}
