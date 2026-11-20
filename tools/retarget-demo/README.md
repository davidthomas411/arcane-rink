# Pose -> avatar retargeting demo

Takes a clip of a player stickhandling and drives a jointed 3D hockey skater (the game's
colours, ice and hall) with the player's body, the stick blade and the puck.

Pipeline (each step writes a file the next one reads):

1. Extract frames, 1920 wide, as `hf/f001.png ...`, and frame times as `t.txt` (`n pts_time` per line).
2. `pose_run.py` -> `pose.json` (MediaPipe pose landmarker: pixel and world landmarks per frame).
   Needs `pose_landmarker_heavy.task` and, on Linux, `libegl1`.
3. Puck positions -> `puck.json` (colour tracker; see the main README for the colour settings).
4. `blade_detect.py` -> `blade.json`.
5. `prepare_data.py` -> `data.json`.
6. Serve this folder with `three.module.js` in `vendor/` and `ice.jpg`, `hall.jpg` in `assets/`,
   open `index.html`, and call `renderFrame(i)`; `shoot.js` screenshots every frame with Playwright.

How the retarget works (`retarget.js`): MediaPipe world landmarks (metres, hips-centred, x right,
y down, z away) become scene joints; every limb is a cylinder stretched between two joints, the head is
oriented from the nose and ears, and skates from heel and toe. The player's own limb lengths are used,
so hands and feet land where the player's did. Different proportions would need IK to keep the blade on the puck.

Estimated, not measured: the phone's focal length (1400 px) and that it is level. These place the stick
blade and puck on the ice. The stick shaft runs from the detected blade up through the top hand.
