"""Vision worker for the size-only ring sizing app.

Reads one JSON job per line on stdin and answers one JSON line on stdout.
  mode "inspect": fast live-camera check (hand, card, spread, flat, framed)
  mode "measure": MobileSAM knuckle-band width (the "k8" recipe) for 5 fingers
Nothing is written to disk: photos live only in memory while measured.
"""
import sys, json, base64, os
for variable in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[variable] = os.environ.get('RING_VISION_THREADS', '1')
from pathlib import Path
ROOT = Path(__file__).resolve().parent
# Python packages: a local .vision-tools folder, an explicit RING_TOOLS_PATH, or the
# folder already installed for the original MobileSAM study next to this project.
for extra in (os.environ.get('RING_TOOLS_PATH'),
              ROOT.parent / 'MobileSAM Finger test 4 sides' / 'ring-sizing' / '.vision-tools',
              ROOT / '.vision-tools'):
    if extra and Path(extra).exists():
        sys.path.insert(0, str(extra))
import cv2
cv2.setNumThreads(max(1, int(os.environ.get('RING_VISION_THREADS', '1'))))
import numpy as np
import mediapipe as mp
from measurement_geometry import card_calibration
from hand_segmentation import measure_finger
from neural_hand_mask import neural_mask
from hand_detection import detect_hands
from card_detection import card_quad

options = mp.tasks.vision.HandLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path=str(ROOT / 'models/hand_landmarker.task')),
    num_hands=2, min_hand_detection_confidence=.35, min_hand_presence_confidence=.4)
model = mp.tasks.vision.HandLandmarker.create_from_options(options)

FINGERS = [('little', 17, 18, [13]), ('ring', 13, 14, [9, 17]), ('middle', 9, 10, [5, 13]),
           ('index', 5, 6, [9]), ('thumb', 2, 3, [])]
KNUCKLE_BAND_MM = 8   # the best recipe: +/-8 mm around the PIP (IP for the thumb) knuckle
MIN_SECTIONS = 3


def detector(rgb):
    result = model.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    return [np.array([(p.x, p.y) for p in hand], dtype=float) for hand in result.hand_landmarks]


def consensus(widths):
    """Median of the cross-sections that agree with the bulk (MAD gate)."""
    w = np.asarray([x for x in widths if x is not None], float)
    if len(w) == 0:
        return None
    m = np.median(w)
    mad = np.median(np.abs(w - m))
    keep = np.abs(w - m) <= max(.4, 3 * mad)
    return float(np.median(w[keep])) if keep.sum() >= MIN_SECTIONS else None


def locate(image, inspect):
    h, w = image.shape[:2]
    factor = min(1, 2400 / max(w, h))
    if factor < 1:
        image = cv2.resize(image, None, fx=factor, fy=factor)
        h, w = image.shape[:2]
    hands = detect_hands(image, detector)
    if not hands:
        if inspect:
            return image, None, dict(hand=False, card=False, spread=False, flat=False)
        raise ValueError('No hand was detected. Show your whole hand, palm down, with all four fingers separated.')
    lm = max(hands, key=lambda p: np.ptp(p[:, 0]) * np.ptp(p[:, 1]))
    try:
        q = card_quad(image, lm)
    except ValueError:
        if inspect:
            return image, None, dict(hand=True, card=False, spread=False, flat=False)
        raise
    length = np.linalg.norm(lm[9] - lm[10])
    spread = all(np.linalg.norm(lm[a] - lm[b]) > length * .6 for a, b in [(8, 12), (12, 16), (16, 20)])
    visible = lm[[5, 8, 9, 12, 13, 16, 17, 20]] / np.array([w, h])
    framed = bool(np.all((visible > .025) & (visible < .975)) and np.all((q / np.array([w, h]) > .015) & (q / np.array([w, h]) < .985)))
    try:
        card_calibration(q, False)
        flat = True
    except ValueError:
        flat = False
    if inspect:
        return image, None, dict(hand=True, card=True, spread=bool(spread), flat=bool(flat), framed=framed,
                                 pixelScale=float((np.linalg.norm(q[0] - q[1]) + np.linalg.norm(q[2] - q[3])) / (2 * 85.6)))
    if not spread:
        raise ValueError('Separate all four fingers so their edges do not touch, then retake the photo.')
    return image, (lm, q), None


def measure(image):
    image, found, _ = locate(image, False)
    lm, q = found
    h, w = image.shape[:2]
    scale = card_calibration(q)
    try:
        mask = neural_mask(image, lm, q)
    except (ValueError, ImportError, RuntimeError) as error:
        raise ValueError('We could not identify a reliable hand outline. Please retake the photo on a contrasting, plain surface. ' + str(error)) from error
    fingers = {}
    for name, mcp, pip, adjacent in FINGERS:
        entry = dict(widthMm=None, reason=None)
        if name == 'thumb' and (np.any(lm[[2, 3, 4]] / np.array([w, h]) <= .025) or np.any(lm[[2, 3, 4]] / np.array([w, h]) >= .975)):
            entry['reason'] = 'thumb-not-visible'
            fingers[name] = entry
            continue
        diagnostics = {}
        try:
            measure_finger(image, mask, lm[mcp], lm[pip], scale, [(lm[n], lm[n + 1]) for n in adjacent],
                           diagnostics=diagnostics, distal=lm[pip + 1], max_width_mm=35 if name == 'thumb' else 26,
                           region='knuckle', knuckle_mm=KNUCKLE_BAND_MM, dense=True)
        except (ValueError, cv2.error):
            pass  # the sections measured before the failure are still valid evidence
        sections = [s for s in diagnostics.get('sections', [])
                    if s.get('status') == 'accepted' or s.get('reason') == 'width-outlier']
        width = consensus([s.get('widthMm') for s in sections])
        entry['widthMm'] = None if width is None else round(width, 3)
        entry['sections'] = len(sections)
        if width is None:
            entry['reason'] = 'edges-unclear'
        fingers[name] = entry
    return dict(fingers=fingers, measured=sum(f['widthMm'] is not None for f in fingers.values()), pixelScale=round(scale, 3))


print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    job = None
    try:
        job = json.loads(line)
        data = np.frombuffer(base64.b64decode(job['image']), np.uint8)
        image = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError('The photo could not be read.')
        if job.get('mode') == 'inspect':
            result = locate(image, True)[2]
        else:
            result = measure(image)
        print(json.dumps({'id': job['id'], 'result': result}), flush=True)
    except Exception as e:
        print(json.dumps({'id': (job or {}).get('id'), 'error': str(e)}), flush=True)
    finally:
        if isinstance(job, dict):
            job.pop('image', None)
