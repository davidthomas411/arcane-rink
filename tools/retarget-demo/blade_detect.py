"""Find the stick blade in each frame: the dark shape that differs from the median background,
below the hands. Writes blade.json with heel/toe positions in 1920-wide image pixels.
Run from a folder that has hf/f001.png ... (frames scaled to 1920 wide)."""
import cv2, glob, json, numpy as np
files = sorted(glob.glob('hf/f*.png'))
G = np.stack([cv2.cvtColor(cv2.resize(cv2.imread(f), (960, 540)), cv2.COLOR_BGR2GRAY) for f in files]).astype(np.float32)
bg = np.median(G, axis=0)
out = []
for g in G:
    fg = ((np.abs(g - bg) > 40) & (g < 105)).astype(np.uint8); fg[:300] = 0; fg[:, :300] = 0
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    if n <= 1: out.append(None); continue
    k = 1 + int(np.argmax(st[1:, 4])); ys, xs = np.nonzero(lab == k)
    band = ys > ys.max() - 34                       # the blade is the lowest part of the shape
    P = np.stack([xs[band], ys[band]], 1).astype(float); c = P.mean(0)
    d = np.linalg.svd(P - c, full_matrices=False)[2][0]; d = d if d[0] >= 0 else -d
    pr = (P - c) @ d
    out.append({'toe': ((c + d * np.percentile(pr, 98)) * 2).tolist(), 'heel': ((c + d * np.percentile(pr, 2)) * 2).tolist()})
json.dump(out, open('blade.json', 'w')); print('blade found in', sum(1 for o in out if o), 'of', len(out), 'frames')
