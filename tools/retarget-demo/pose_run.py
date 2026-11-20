import cv2, glob, json, math, numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
base=mpt.BaseOptions(model_asset_path='pose_landmarker_heavy.task')
opts=vision.PoseLandmarkerOptions(base_options=base, running_mode=vision.RunningMode.VIDEO, num_poses=1,
    min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4, min_tracking_confidence=0.4)
lm=vision.PoseLandmarker.create_from_options(opts)
files=sorted(glob.glob('hf/f*.png')); out=[]
for i,f in enumerate(files):
    img=cv2.imread(f); rgb=cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
    res=lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb), int(i*1000/60))
    if res.pose_landmarks:
        p=res.pose_landmarks[0]; w=res.pose_world_landmarks[0]
        out.append({'i':i,'px':[(q.x*1920,q.y*1080,q.visibility) for q in p],'world':[(q.x,q.y,q.z) for q in w]})
    else: out.append({'i':i,'px':None,'world':None})
json.dump(out,open('pose.json','w'))
print('frames',len(out),'with pose',sum(1 for o in out if o['px']))
