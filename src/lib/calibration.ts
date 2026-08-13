export type CalibrationObjectId =
  | "credit-card"
  | "us-quarter"
  | "yuan"
  | "cad-quarter"
  | "euro"
  | "rupee-5"
  | "aud-dollar"
  | "sgd-dollar";

export type CalibrationObject = {
  id: CalibrationObjectId;
  label: string;
  sizeMm: number;
  widthMm?: number;
  heightMm?: number;
  shape: "circle" | "rect";
};

export const CALIBRATION_OBJECTS: CalibrationObject[] = [
  {
    id: "credit-card",
    label: "Credit / Debit Card (universal)",
    sizeMm: 53.98,
    widthMm: 85.6,
    heightMm: 53.98,
    shape: "rect",
  },
  {
    id: "us-quarter",
    label: "US Quarter (24.26 mm)",
    sizeMm: 24.26,
    shape: "circle",
  },
  {
    id: "yuan",
    label: "1 Yuan (25.00 mm)",
    sizeMm: 25.0,
    shape: "circle",
  },
  {
    id: "cad-quarter",
    label: "Canadian 25¢ (23.88 mm)",
    sizeMm: 23.88,
    shape: "circle",
  },
  {
    id: "euro",
    label: "1 Euro (23.25 mm)",
    sizeMm: 23.25,
    shape: "circle",
  },
  {
    id: "rupee-5",
    label: "₹5 Rupee (23.00 mm)",
    sizeMm: 23.0,
    shape: "circle",
  },
  {
    id: "aud-dollar",
    label: "$1 AUD (25.00 mm)",
    sizeMm: 25.0,
    shape: "circle",
  },
  {
    id: "sgd-dollar",
    label: "$1 SGD (24.66 mm)",
    sizeMm: 24.66,
    shape: "circle",
  },
];

const SCREEN_CAL_KEY = "airing.screenCalibration";
const CAMERA_CAL_KEY = "airing.cameraCalibration";
const RESULT_KEY = "airing.lastResult";

export type StoredCalibration = {
  mmPerPx: number;
  objectId: CalibrationObjectId;
  scale: number;
  savedAt: number;
};

export type StoredResult = {
  diameterMm: number;
  circumferenceMm: number;
  mode: "ring" | "finger";
  method: "camera" | "screen";
  savedAt: number;
};

export function getObject(id: CalibrationObjectId): CalibrationObject {
  return (
    CALIBRATION_OBJECTS.find((o) => o.id === id) ?? CALIBRATION_OBJECTS[0]
  );
}

export function mmPerPxFromOutline(
  outlineCssPx: number,
  physicalMm: number
): number {
  if (outlineCssPx <= 0) return 0;
  return physicalMm / outlineCssPx;
}

export function loadCalibration(): StoredCalibration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SCREEN_CAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCalibration;
  } catch {
    return null;
  }
}

export function saveCalibration(data: StoredCalibration): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCREEN_CAL_KEY, JSON.stringify(data));
}

export function loadCameraCalibration(): StoredCalibration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CAMERA_CAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCalibration;
  } catch {
    return null;
  }
}

export function saveCameraCalibration(data: StoredCalibration): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CAMERA_CAL_KEY, JSON.stringify(data));
}

export function loadLastResult(): StoredResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredResult;
  } catch {
    return null;
  }
}

export function saveLastResult(data: StoredResult): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(RESULT_KEY, JSON.stringify(data));
}

export const DEFAULT_COIN_CSS_PX = 120;
export const DEFAULT_CARD_HEIGHT_CSS_PX = 160;

/** ISO/IEC 7810 ID-1 card long edge in mm */
export const CARD_WIDTH_MM = 85.6;
/** ISO/IEC 7810 ID-1 card short edge in mm */
export const CARD_HEIGHT_MM = 53.98;
