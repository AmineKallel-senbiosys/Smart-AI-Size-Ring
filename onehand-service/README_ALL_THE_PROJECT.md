# Ring Size Finder: the whole project

A web app (velia, Senbiosys) that tells a person their US ring size (6, 8, 10 or 12) from a photo of their hand and a standard card, measured with computer vision. It runs on one computer (Node.js plus a Python vision worker) and is used from a phone browser.

This file describes the whole project from the beginning. `README.md` holds the run instructions and the `/onehand` section; the "Ring Size Finder - Technical Documentation" doc has the full technical detail.

> The app is a measurement aid. It is not a medical or regulatory result. Legal, regulatory (CE marking, FDA) and data-protection questions must be confirmed by the relevant Senbiosys teams.

## 1. How the project grew

1. **The study.** A 55-participant study (the folder `MobileSAM Finger test 4 sides`) measured finger widths from photos with MediaPipe and MobileSAM and compared them with a physical ring kit. Its best recipe is the starting point of the app: width across the knuckle band, circumference = pi x width - a per-finger offset, size limits fitted by cross-validation.
2. **The four-photo app.** A size-only app: palm and back of both hands (4 photos) with a card for scale, a size for all ten fingers, then the user checks each finger with the kit and validates. Three frames are taken per photo and the median width is used.
3. **Validation, dashboard and participants.** Validated tests are saved to `data/validated/`; `/dashboard` shows accuracy; `/participants` lets an administrator review, correct or delete a test.
4. **The one-hand flow (`/onehand`).** One photo of the back of one hand, gender-specific settings, an "or" size near a band limit, a clear message when the size is outside 6 to 12, and a validated test saved without a name in `data/onehand/`.
5. **One-hand tools.** `/onehand/dashboard` (accuracy and settings optimizer), `/onehand/config` (editable settings with reset buttons per gender and built-in defaults) and `/onehand/participants` (switch a test on or off for the dashboard).
6. **Documentation.** The technical documentation, the training and evaluation plan for the Sizing Kit Model, and these READMEs.

## 2. What the app does

| Flow | Photos | Result | Address |
| --- | --- | --- | --- |
| Four-photo | Left and right hand, palm and back | A size for all ten fingers; the user validates | `/` |
| One-hand | Back of one hand | A size for the five fingers of that hand; the user validates | `/onehand` |

Sizes are US 6, 8, 10 and 12. Outside that range the user is told clearly that we do not have their size: "US 6 too big" below the range, "US 12 too small" above it. A smaller size is never offered as a second choice.

## 3. Architecture

Three processes and one data folder:

- **Phone or desktop browser.** Camera, live checks, countdown, sends frames, shows the sizes and the validation screen. Static pages in `public/`.
- **Node.js server (`server.mjs`).** Sessions in memory, the API, the admin PIN, the sizing rules (`sizing.mjs`) and the median of the three frames (`aggregate.mjs`). No web framework.
- **Python vision worker (`worker.py`).** One process started by `vision-worker.mjs` / `vision-process.mjs`. Takes a JPEG and returns one width in mm per finger.
- **`data/`.** Saved tests and settings on the computer that hosts the app. Not in git.

Stack: Node.js 24, Python 3.11, MediaPipe, OpenCV, ONNX Runtime (CPU), NumPy; plain JavaScript pages without a build step.

### Image pipeline (per frame)

1. MediaPipe Hand Landmarker returns 21 landmarks (retries at lower resolution, with rotations and a contrast boost).
2. OpenCV finds the card (85.6 x 53.98 mm) and fits it to get the pixels-per-millimetre scale. The photo is rejected when the scale is below 3 px/mm or the card looks angled (opposite sides differ by more than 3.5%).
3. MobileSAM, prompted from the landmarks, gives the hand mask.
4. Cross-sections across each finger around the PIP joint (IP for the thumb) give the knuckle-band width; the median of the accepted cross-sections is the consensus width.
5. The server takes the median per finger over the frames and turns widths into sizes.

The deployed worker measures the knuckle band only. A finger-base measurement exists in `hand_segmentation.py` but is not called yet. The presentation describes measuring both places and keeping the larger width as W; this is a planned change, to be tested against the saved tests first.

### Width to size

C = pi x W - finger offset. The size bands are set by four limits u6, u8, u10, u12 (the lowest edge is 2 x u6 - u8). One-hand defaults in mm (`ONEHAND_DEFAULTS` in `sizing.mjs`):

| | Thumb | Index | Middle | Ring | Little | u6 | u8 | u10 | u12 | Borderline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Male | 2.85 | 2.40 | 0.40 | 1.95 | 2.60 | 52.64 | 57.62 | 63.86 | 69.23 | 0.9 |
| Female | 3.20 | 3.85 | 0.21 | 2.35 | 1.65 | 52.64 | 57.62 | 63.867 | 69.23 | 1.0 |

The four-photo flow uses the tables in `sizing.json` (one for both views, one for a single photo). The borderline rule shows the next larger size for a finger within the margin of the top of its band, and never a smaller one.

## 4. Project files

| Path | Purpose |
| --- | --- |
| `server.mjs` | HTTP server, sessions, API, admin, saving tests |
| `sizing.mjs`, `sizing.json` | Width to size, defaults and edited settings |
| `aggregate.mjs` | Median of the frames |
| `vision-worker.mjs`, `vision-process.mjs` | Starts and talks to the Python worker |
| `worker.py`, `hand_detection.py`, `card_detection.py`, `neural_hand_mask.py`, `hand_segmentation.py`, `measurement_geometry.py` | The vision pipeline |
| `models/` | MobileSAM encoder and decoder (ONNX), MediaPipe hand landmarker, licence and hashes |
| `public/` | Pages: `index.html` + `app.js` (four photos), `onehand.html` + `onehand.js`, dashboards, participants, config |
| `tests/` | Unit tests (`npm test`) |
| `data/` | Saved tests and settings (not in git) |
| `start.bat`, `package.json`, `requirements.txt` | Start and install |

## 5. Run

Node.js 24 and Python 3.11. Double-click `start.bat` or run `npm start`, then open http://localhost:4185 (`PORT` changes the port). Python packages: `pip install --target .vision-tools -r requirements.txt`, or reuse the `.vision-tools` folder of the original study.

**HTTPS host for phones.** The phone camera needs https, so the app must be reachable on an HTTPS host. Set the address in `PUBLIC_URL`; the page then shows a QR code that points to it. During development a tunnel (for example ngrok) can provide the host; if `PUBLIC_URL` is not set the server looks for a local tunnel on ports 4040 to 4049. A permanent server is the plan for later.

Environment variables: `PORT` (default 4185), `PUBLIC_URL`, `ADMIN_PIN`, `RING_VISION_THREADS` (CPU threads for the worker, default 1), `RING_PYTHON` (Python executable). A change to `server.mjs` or `sizing.mjs` needs a restart; changes in `public/` only need a page refresh.

## 6. Pages and API

| Address | Purpose |
| --- | --- |
| `/` | Four-photo flow |
| `/dashboard`, `/participants` | Four-photo accuracy; review and edit saved tests (admin) |
| `/onehand` | One-hand flow |
| `/onehand/dashboard`, `/onehand/config`, `/onehand/participants` | One-hand accuracy and optimizer; settings and resets; saved tests with on/off switch |

API: `POST /api/inspect` (live check), `POST /api/session`, `POST /api/session/:id/measure|validate|skip|reset|activity`, `GET /api/session/:id`, `GET /api/public-url`, `GET /api/validated`, `GET /api/onehand-validated`, `GET|PUT /api/onehand-config`, `POST /api/onehand-config/reset`, `GET|PUT /api/sizing`, `POST /api/sizing/reset`, `GET /healthz`, and `/api/admin/...` for participants and one-hand tests.

**Admin access.** Changing settings and the participants pages only work on the computer that runs the app, or anywhere with a PIN (`ADMIN_PIN` or `data/admin-pin.txt`). After 8 wrong PIN attempts from one address, that address is locked for 10 minutes.

## 7. Saved data and privacy

Nothing is stored unless the user validates; until then the photo is in server memory only, and Skip saves nothing. A validated one-hand test is a folder in `data/onehand/` with `back.jpg` and `record.json`, without a name. Four-photo tests go to `data/validated/` with the four photos, the name and the gender.

Hand photos and finger measurements from real people are sensitive data (GDPR, Swiss nFADP). Get explicit consent before saving, state a retention period, keep `data/` on an encrypted disk, close or restrict the public host when no session runs, and use a card with no personal data as the scale (a card number in the photo would be saved in the photo). All processing runs on the host computer; no image goes to an outside inference service. Whether these measures meet the legal requirement is for the data-protection contacts to confirm. Saving tests and the dashboard, participants and settings pages are for the test phase and are removed in the client version.

## 8. Models and licences

MobileSAM (code Apache 2.0; ONNX conversion by Acly, pinned by revision and SHA-256 in `models/model-manifest.json`) and the MediaPipe hand landmarker run locally. They are generic models, not a ring-size model. Python packages: NumPy, MediaPipe, OpenCV, ONNX Runtime (permissive licences). Check the licences again before any release to a client, and avoid GPL or AGPL dependencies.

## 9. Training and evaluation of the Sizing Kit Model (plan)

The dataset is 670 hand images with known ring sizes. MobileSAM stays pretrained and frozen (the labels are sizes, not masks); the trained part is a size-prediction model on the finger crop and geometric features.

- 100 images (15%) held out as the test set; 570 for 5-fold cross-validation (about 456 training and 114 validation per fold). Photos of one person stay in one fold (`GroupKFold`).
- Starting configuration: MobileNetV3-Small backbone, AdamW, learning rate 0.001, batch 8 to 16, at most 50 epochs, early stopping with patience 7, model chosen on validation loss or validation size error.
- The training and validation curves in the technical documentation are simulated (best epoch 25, early stop at epoch 32), not logs of a measured run.

The app that runs today does not use a trained size network. It turns the measured width into a size with the per-finger offsets above, tuned on the study participants.

## 10. Results so far

On the one-hand dashboard (107 tests saved by 16 November 2026, 526 fingers): 87.8% of fingers overall, 88.1% male and 87.5% female matched the ring-kit size (the kit size equals the size shown first or the "or" size). The thumb is the weakest finger. Moving the offsets or limits improved accuracy on the data it was tuned on but not on held-out people.

## 11. Limits and next steps

- One joint measured from a flat photo: the app cannot see how a ring sits over the knuckle or how the finger swells. Accuracy is lowest for wide thumbs and near the size limits.
- The kit answers are not always consistent: nearly equal widths received different sizes, which no setting can fix.
- Decide whether to add the finger-base measurement and test it on the saved tests.
- Log real training runs and report the result on the 100-image test set.
- More tests from thumbs and very wide hands would be the most useful new data.
- Replace the tunnel with a permanent HTTPS host and remove the test-phase pages before delivery to a client.
- Security and data-protection questions: the Senbiosys security and data-protection contacts.
