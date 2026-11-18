# Ring size finder

A size-only version of the MobileSAM ring sizing study. The user photographs both hands, palm and back of each (4 photos), with a standard card for scale and and is told a US ring size (6, 8, 10 or 12) for all ten fingers. No fit message, no names, no saved photos.

## Run

Node.js 24 and Python 3.11. Double-click `start.bat` (or `npm start`) and open http://localhost:4185. For a phone, use an https tunnel (the camera needs https), for example the same ngrok setup as the study.

The Python packages (mediapipe, opencv, onnxruntime, numpy) are found automatically in the `.vision-tools` folder of the original study (`..\MobileSAM Finger test 4 sides\ring-sizing\.vision-tools`). On another machine: `pip install --target .vision-tools -r requirements.txt`.
Models are in `models/` (MobileSAM encoder and decoder, MediaPipe hand landmarker).

## Method (best recipe from the 55-participant study)

1. MediaPipe landmarks and card detection give millimetre scale.
2. MobileSAM hand mask; width measured across the knuckle band, plus/minus 8 mm around the PIP joint (IP for the thumb). The consensus width of all accepted cross-sections is kept.
3. Palm and back widths are averaged per finger.
4. Circumference = pi x width - per-finger offset (thumb 8.41, index 2.96, middle 1.86, ring 1.67, little 3.68 mm; single-photo values in `sizing.json`).
5. Size boundaries: 6 below 51.64 mm, 8 below 57.60, 10 below 63.86, 12 below 68.23 (lowest 2 x 51.64 - 57.60 = 45.68). Anything outside is shown as "outside sizes 6-12".

Cross-validated on the study data this recipe matched the kit size about 65% of the time exactly and about 85% within one size. It is a measurement aid, not a medical or regulatory result; the sizes in `sizing.json` can be retuned when more data arrives.

## API

`POST /api/inspect` (live check), `POST /api/session`, `POST /api/session/:id/measure` (JPEG), `GET /api/session/:id` (progress and sizes), `GET /api/public-url` (ngrok address for the QR code). Tests: `npm test`.

## Public link for phones (https)

Start the app and ngrok yourself, as you already do:

```
$env:PORT='4280'; npm start
ngrok http 4280
```

Open the ngrok https address (on the computer too): the page shows a QR code for the phone. If you open the app on localhost instead, the server looks for a running ngrok tunnel (local ports 4040-4049) or `PUBLIC_URL` to build the QR code.

## Three frames per view
Each view is captured as 3 frames about 0.35 s apart (the screen shows "Taking photos 1/3"). The server measures every frame and uses the median width per finger (aggregate.mjs). Restart npm start after updating server.mjs.

## Validation and saved data
At the end the user checks each finger (size and fit, or the second suggested size) and validates. Then data/validated/<date>_<name>_<gender>_<id>/ gets the 4 photos and record.json; data/validated.csv and validated.jsonl get one row. The dashboard reads anonymous rows (no name, no photos) from /api/validated and has Data and Gender filters.

## Participants page
/participants lists every validated test (data/validated). Select one to see its photos, edit name, gender and the confirmed sizes, or delete everything saved for that person. It only opens on the computer running the app, or anywhere with the ADMIN_PIN env variable set.

## One-hand test (`/onehand`)

A second flow next to the four-photo one: one photo of the back of one hand, with a standard card for scale, gives a US ring size (6, 8, 10 or 12) for the five fingers of that hand. After the result the user checks each finger with the physical ring kit and validates, which saves the test without a name. The saved tests are what the one-hand dashboard evaluates. Full technical description: the "Ring Size Finder - Technical Documentation" doc.

### Pages

| Address | What it is |
| --- | --- |
| `/onehand` | The measurement flow (phone and desktop) |
| `/onehand/dashboard` | Accuracy of the app against the ring kit, per gender, hand and finger; optimizer for the settings |
| `/onehand/config` | Settings per gender (finger offsets, size limits, borderline margin), with reset buttons |
| `/onehand/participants` | The saved tests: photo, gender, what the user confirmed; enable or disable a test for the dashboard |

### Flow

1. The user picks the hand (left or right), the gender (male or female) and ticks the consent box. The desktop page shows a QR code; the phone opens the link (the camera needs https, see "Public link for phones").
2. Live checks on the phone: hand and card detected and in frame, resolution, fingers spread, hand flat. The phone must be level (3 degrees at most, motion sensor).
3. When all checks pass a countdown runs and the photo is taken automatically: two frames in the last 1.5 s and a third at the end, about 0.3 s apart. Each frame is measured on its own and a failed frame is skipped. Per finger, the median width of the frames that worked is kept, so one bad frame does not move the size. At least 4 of the 5 fingers must be measured.
4. The result shows one size per finger. Near the top of a size band a second, larger size is shown ("or"). A smaller size is never shown as a second choice.
5. The user taps any finger whose size is wrong, picks the size from the kit (or "none"), and presses Validate. Skip saves nothing. Measure again retakes the photo.

### Measurement (worker.py)

MediaPipe Hand Landmarker gives 21 landmarks; OpenCV finds the card (85.6 x 53.98 mm) for the scale. MobileSAM (ONNX, CPU) segments the hand from landmark prompts. Width is measured at the knuckle band: 32 cross-sections before and 32 after the PIP joint (IP joint for the thumb), plus or minus 8 mm, capped at 26 mm (35 mm for the thumb). The consensus width is the median of the accepted cross-sections. The deployed worker measures the knuckle band only; the finger-base measurement in `hand_segmentation.py` is not called yet.

### From width to size (sizing.mjs)

Circumference C = pi x width - finger offset. Size bands: US 6 from the lowest edge to u6, US 8 from u6 to u8, US 10 from u8 to u10, US 12 from u10 to u12 (lowest edge = 2 x u6 - u8). Below the lowest edge the result says US 6 is too big; at or above u12 it says US 12 is too small. In both cases the user is told we do not have their size.

Built-in defaults (`ONEHAND_DEFAULTS`), per gender, in mm:

| | Thumb | Index | Middle | Ring | Little | u6 | u8 | u10 | u12 | Borderline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Male | 2.85 | 2.40 | 0.40 | 1.95 | 2.60 | 52.64 | 57.62 | 63.86 | 69.23 | 0.9 |
| Female | 3.20 | 3.85 | 0.21 | 2.35 | 1.65 | 52.64 | 57.62 | 63.867 | 69.23 | 1.0 |

Borderline rule: a finger closer than the borderline margin to the top of its band (and not in US 12) also shows the next larger size. Near the bottom of a band nothing extra is shown. A margin of 0 turns the rule off.

### Settings

`/onehand/config` edits the active values for male and female separately. "Reset male", "Reset female" and "Reset both" return to the built-in defaults above. Edited values are saved in `data/onehand-config.json` (the file is removed when both genders are back at the defaults). Changing the settings needs the admin PIN, or the computer that runs the app.

### Saved data

On Validate the server writes one folder per test under `data/onehand/<date-time>_<hand>_<id>/`: `back.jpg` (the photo), `record.json` (gender, settings used, width, app size and user size per finger, whether the user changed it). No name is asked. `gender.txt` exists in a few early folders where the gender was added later. `data/onehand-disabled.json` lists tests switched off for the dashboard; `record.json` files are never changed. The photo stays in server memory until Validate or Skip.

### API

`GET /api/onehand-validated` (anonymous rows for the dashboard), `GET /api/onehand-config`, `PUT /api/onehand-config`, `POST /api/onehand-config/reset` (`{gender}` optional), and under admin: `GET /api/admin/onehand`, `GET /api/admin/onehand/:folder/photo`, `PUT /api/admin/onehand/:folder/enabled`, `DELETE /api/admin/onehand/:folder`. The session endpoints are the same as the four-photo flow, started with `mode: "onehand"`.

### Accuracy

A finger counts as correct when the size confirmed with the kit equals the size shown first or the "or" size. On the one-hand dashboard (107 tests saved by 16 November 2026, 526 fingers): 87.8% overall, 88.1% male (65 male tests), 87.5% female (42 female tests). The weakest finger is the thumb, mainly wide female thumbs above US 12 and inconsistent kit answers at nearly equal widths. Offsets tuned on these tests did not improve accuracy on held-out people, so the settings are close to what this data supports.

### Privacy

Hand photos and finger measurements are sensitive data (GDPR, Swiss nFADP). Get explicit consent, state the retention period, keep `data/` on an encrypted disk, close or restrict the public host when no session runs, and use a card with no personal data as the scale reference. Whether these measures are enough is for the data-protection contacts to confirm. Saving tests and the dashboard, participants and settings pages are for the test phase and are removed in the client version.
