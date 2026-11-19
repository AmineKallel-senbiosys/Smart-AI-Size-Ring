"""Vision worker for the size-only ring sizing app.

Reads one JSON job per line on stdin and answers one JSON line on stdout.
  mode "inspect": fast live-camera check (hand, card, spread, flat, framed)
  mode "measure": MobileSAM knuckle-band width (the "k8" recipe) for 5 fingers
Photos live only in memory while measured, EXCEPT the temporary test copies below.

TEST COPIES (temporary, for checking the detection): after a successful measurement two JPGs are
saved in data/test-photos/ (switch: RING_SAVE_TEST_PHOTOS=true/false in .env.local (project root) or onehand-service/.env, default OFF; folder override: RING_TEST_PHOTOS_DIR):
  *_blurred.jpg    the photo with the card blurred (the unblurred photo is never saved)
  *_annotated.jpg  the same, plus the card outline, the finger bones and the finger-width lines
These show a hand: delete the folder when testing is over.
"""
import sys, json, base64, os, time, itertools
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


TEST_DIR = Path(os.environ.get('RING_TEST_PHOTOS_DIR') or ROOT / 'data' / 'test-photos')
ENV_FILES = [ROOT / '.env', ROOT.parent / '.env.local', ROOT.parent / '.env']


def save_enabled():
    """RING_SAVE_TEST_PHOTOS: true = save the test photos, anything else (or missing) = off.
    Looked up in the environment, then onehand-service/.env, then the project's .env.local and .env.
    The files are read on every photo, so changing them needs no restart."""
    value = os.environ.get('RING_SAVE_TEST_PHOTOS')
    for env_file in ENV_FILES:
        if value is not None:
            break
        try:
            for line in env_file.read_text(encoding='utf-8').splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, raw = line.partition('=')
                    if key.strip() == 'RING_SAVE_TEST_PHOTOS':
                        value = raw.strip().strip('"\'')
        except OSError:
            pass
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')
_counter = itertools.count(1)


def test_log(message):
    """Append one line to data/test-photos/_log.txt (the service hides the worker's stderr)."""
    if not save_enabled():
        return
    try:
        TEST_DIR.mkdir(parents=True, exist_ok=True)
        with open(TEST_DIR / '_log.txt', 'a', encoding='utf-8') as handle:
            handle.write(time.strftime('%Y-%m-%d %H:%M:%S ') + message + '\n')
    except Exception:  # noqa: BLE001
        pass


test_log(f'worker started, test photos ON, folder: {TEST_DIR}')  # only written when saving is enabled
BONES = {'little': [17, 18, 19, 20], 'ring': [13, 14, 15, 16], 'middle': [9, 10, 11, 12], 'index': [5, 6, 7, 8], 'thumb': [2, 3, 4]}


def blur_card(image, q, inner=0.86):
    """Blur only the inside of the card. A thin sharp border (about 7% of each side) stays, so the edges remain visible."""
    h, w = image.shape[:2]
    centre = q.mean(axis=0)
    core = (centre + (q - centre) * inner).astype(np.int32)
    mask = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(mask, core, 255)
    card_w = float(np.linalg.norm(q[0] - q[1]))
    k = int(card_w * 0.16) | 1
    blurred = cv2.GaussianBlur(image, (k, k), 0)
    blurred = cv2.GaussianBlur(blurred, (k, k), 0)
    soft = cv2.GaussianBlur(mask, (9, 9), 0).astype(np.float32)[..., None] / 255.0
    return (image * (1 - soft) + blurred * soft).astype(np.uint8)


def save_test_photos(image, lm, q, mask, details):
    """Never raises: the test copies must not be able to change a measurement."""
    try:
        TEST_DIR.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime('%Y%m%d-%H%M%S') + f'-{next(_counter):03d}'
        base = blur_card(image, q)
        cv2.imwrite(str(TEST_DIR / f'{stamp}_blurred.jpg'), base, [cv2.IMWRITE_JPEG_QUALITY, 90])
        note = base.copy()
        h, w = note.shape[:2]
        t = max(2, int(max(w, h) / 700))
        try:
            m8 = (np.asarray(mask) > 0).astype(np.uint8) * 255
            contours, _ = cv2.findContours(m8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(note, contours, -1, (255, 0, 255), t)
        except Exception:
            pass
        cv2.polylines(note, [q.astype(np.int32)], True, (0, 255, 0), t * 2)
        cv2.putText(note, 'card 85.6 x 53.98 mm', tuple((q[0] + [0, -12]).astype(int)), cv2.FONT_HERSHEY_SIMPLEX, t * 0.5, (0, 255, 0), t)
        pts = lambda idx: [tuple(int(v) for v in lm[i]) for i in idx]
        for name, idx in BONES.items():
            p = pts(idx)
            for a, b in zip(p, p[1:]):
                cv2.line(note, a, b, (0, 215, 255), t)
            for a in p:
                cv2.circle(note, a, t * 2, (0, 140, 255), -1)
            diag, entry = details.get(name, ({}, {}))
            for sec in diag.get('sections', []):
                edges = sec.get('maskEdgesPx')
                if sec.get('status') == 'accepted' and edges and all(e is not None for e in edges):
                    cv2.line(note, tuple(np.int32(edges[0])), tuple(np.int32(edges[1])), (255, 255, 0), max(1, t - 1))
            width = entry.get('widthMm')
            label = f"{name} {width:.1f} mm" if width else f"{name} ?"
            cv2.putText(note, label, (p[-1][0] - 40, max(20, p[-1][1] - 20)), cv2.FONT_HERSHEY_SIMPLEX, t * 0.5, (255, 255, 255), t + 2)
            cv2.putText(note, label, (p[-1][0] - 40, max(20, p[-1][1] - 20)), cv2.FONT_HERSHEY_SIMPLEX, t * 0.5, (0, 0, 0), t)
        cv2.imwrite(str(TEST_DIR / f'{stamp}_annotated.jpg'), note, [cv2.IMWRITE_JPEG_QUALITY, 90])
        test_log(f'saved {stamp} (blurred + annotated)')
    except Exception as error:  # noqa: BLE001
        test_log(f'test photo NOT saved: {error!r}')


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
                                 pixelScale=float((np.linalg.norm(q[0] - q[1]) + np.linalg.norm(q[2] - q[3])) / (2 * 85.6)),
                                 cardQuad=[[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in q])
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
        if save_enabled():
            save_test_photos(image, lm, q, np.zeros((h, w), np.uint8), {})
        raise ValueError('We could not identify a reliable hand outline. Please retake the photo on a contrasting, plain surface. ' + str(error)) from error
    fingers = {}
    details = {}
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
        details[name] = (diagnostics, entry)
    if save_enabled():
        save_test_photos(image, lm, q, mask, details)
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
        if isinstance(job, dict) and job.get('mode') != 'inspect':
            test_log(f'photo not saved, measurement stopped before the card was found: {e}')
        print(json.dumps({'id': (job or {}).get('id'), 'error': str(e)}), flush=True)
    finally:
        if isinstance(job, dict):
            job.pop('image', None)
