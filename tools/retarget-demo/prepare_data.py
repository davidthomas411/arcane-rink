"""Merge pose.json (pose_run.py), puck.json (puck positions, 960-wide px, null when not seen),
blade.json (blade_detect.py) and t.txt (frame times) into data.json for retarget.js.
Also estimates the camera geometry used to place things on the ice (see README)."""
import json, numpy as np
pose = json.load(open('pose.json')); puck = json.load(open('puck.json')); bl = json.load(open('blade.json'))
t = [float(l.split()[1]) for l in open('t.txt')]; N = len(pose)
W = np.array([o['world'] for o in pose], float); PX = np.array([[q[:2] for q in o['px']] for o in pose], float)
def smooth(a): b = a.copy(); b[1:-1] = 0.25 * a[:-2] + 0.5 * a[1:-1] + 0.25 * a[2:]; return b
W, PX = smooth(W), smooth(PX)
pp = np.array([[np.nan, np.nan] if q is None else [q[0] * 2, q[1] * 2] for q in puck], float)
known = ~np.isnan(pp[:, 0]); idx = np.arange(N)
for k in (0, 1): pp[:, k] = np.interp(idx, idx[known], pp[known, k])     # hold/interpolate while the puck is hidden
heel = smooth(np.array([b['heel'] for b in bl], float)); toe = smooth(np.array([b['toe'] for b in bl], float))
sp = float(np.median(np.linalg.norm(PX[:, 24] - PX[:, 28], axis=-1) / np.linalg.norm(W[:, 24] - W[:, 28], axis=-1)))  # px per metre
yfeet = float(np.median(PX[:, [29, 30, 31, 32], 1]))
f, yh, cx = 1400.0, 540.0, 960.0          # ASSUMED: phone focal length (px) and a level camera
params = dict(f=f, cx=cx, yh=yh, sp=sp, camH=(yfeet - yh) / sp, Zg=f / sp, H0=float(np.median(W[:, [27, 28, 29, 30, 31, 32], 1].max(axis=1))), yfeet=yfeet)
json.dump(dict(params=params, t=t, world=W.round(4).tolist(), px=PX.round(1).tolist(), heel=heel.round(1).tolist(), toe=toe.round(1).tolist(),
               puck=pp.round(1).tolist(), hidden=(~known).tolist()), open('data.json', 'w'))
print(params)
