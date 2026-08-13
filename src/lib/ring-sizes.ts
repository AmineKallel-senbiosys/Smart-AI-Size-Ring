export type RingSizeRow = {
  circumferenceIn: number;
  circumferenceMm: number;
  diameterMm: number;
  us: number;
  uk: string;
  eu: number | null;
  de: number | null;
  jp: number | null;
  it: number | null;
};

/** Full quarter-size chart US 3–13 (matches standard conversion tables). */
export const RING_SIZES: RingSizeRow[] = [
  { circumferenceIn: 1.74, circumferenceMm: 44.2, diameterMm: 14.07, us: 3, uk: "F", eu: 44, de: 14, jp: 4, it: 4 },
  { circumferenceIn: 1.77, circumferenceMm: 44.8, diameterMm: 14.27, us: 3.25, uk: "F ½", eu: 44.625, de: 14.25, jp: null, it: 4.625 },
  { circumferenceIn: 1.79, circumferenceMm: 45.5, diameterMm: 14.48, us: 3.5, uk: "G", eu: 45.25, de: 14.5, jp: 5, it: 5.25 },
  { circumferenceIn: 1.82, circumferenceMm: 46.1, diameterMm: 14.68, us: 3.75, uk: "G ½", eu: 45.875, de: 14.75, jp: 6, it: 5.875 },
  { circumferenceIn: 1.84, circumferenceMm: 46.8, diameterMm: 14.88, us: 4, uk: "H", eu: 46.5, de: 15, jp: 7, it: 6.5 },
  { circumferenceIn: 1.87, circumferenceMm: 47.4, diameterMm: 15.09, us: 4.25, uk: "H ½", eu: 47.125, de: 15.25, jp: null, it: 7.125 },
  { circumferenceIn: 1.89, circumferenceMm: 48.0, diameterMm: 15.29, us: 4.5, uk: "I", eu: 47.75, de: 15.5, jp: 8, it: 7.75 },
  { circumferenceIn: 1.92, circumferenceMm: 48.7, diameterMm: 15.49, us: 4.75, uk: "J", eu: 48.375, de: null, jp: null, it: 8.375 },
  { circumferenceIn: 1.94, circumferenceMm: 49.3, diameterMm: 15.7, us: 5, uk: "J ½", eu: 49, de: 15.75, jp: 9, it: 9 },
  { circumferenceIn: 1.97, circumferenceMm: 50.0, diameterMm: 15.9, us: 5.25, uk: "K", eu: 49.625, de: 16, jp: null, it: 9.625 },
  { circumferenceIn: 1.99, circumferenceMm: 50.6, diameterMm: 16.1, us: 5.5, uk: "K ½", eu: 50.25, de: 16.25, jp: 10, it: 10.25 },
  { circumferenceIn: 2.02, circumferenceMm: 51.2, diameterMm: 16.31, us: 5.75, uk: "L", eu: 50.875, de: null, jp: 11, it: 10.875 },
  { circumferenceIn: 2.04, circumferenceMm: 51.9, diameterMm: 16.51, us: 6, uk: "L ½", eu: 51.5, de: 16.5, jp: 12, it: 11.5 },
  { circumferenceIn: 2.07, circumferenceMm: 52.5, diameterMm: 16.71, us: 6.25, uk: "M", eu: 52.125, de: 16.75, jp: null, it: 12.125 },
  { circumferenceIn: 2.09, circumferenceMm: 53.1, diameterMm: 16.92, us: 6.5, uk: "M ½", eu: 52.75, de: 17, jp: 13, it: 12.75 },
  { circumferenceIn: 2.12, circumferenceMm: 53.8, diameterMm: 17.12, us: 6.75, uk: "N", eu: 53.375, de: null, jp: null, it: 13.375 },
  { circumferenceIn: 2.14, circumferenceMm: 54.4, diameterMm: 17.32, us: 7, uk: "N ½", eu: 54, de: 17.25, jp: 14, it: 14 },
  { circumferenceIn: 2.17, circumferenceMm: 55.1, diameterMm: 17.53, us: 7.25, uk: "O", eu: 54.625, de: 17.5, jp: null, it: 14.625 },
  { circumferenceIn: 2.19, circumferenceMm: 55.7, diameterMm: 17.73, us: 7.5, uk: "O ½", eu: 55.25, de: 17.75, jp: 15, it: 15.25 },
  { circumferenceIn: 2.22, circumferenceMm: 56.3, diameterMm: 17.93, us: 7.75, uk: "P", eu: 55.875, de: null, jp: null, it: 15.875 },
  { circumferenceIn: 2.24, circumferenceMm: 57.0, diameterMm: 18.14, us: 8, uk: "P ½", eu: 56.5, de: 18, jp: 16, it: 16.5 },
  { circumferenceIn: 2.27, circumferenceMm: 57.6, diameterMm: 18.34, us: 8.25, uk: "Q", eu: 57.125, de: 18.25, jp: null, it: 17.125 },
  { circumferenceIn: 2.29, circumferenceMm: 58.3, diameterMm: 18.54, us: 8.5, uk: "Q ½", eu: 57.75, de: 18.5, jp: 17, it: 17.75 },
  { circumferenceIn: 2.32, circumferenceMm: 58.9, diameterMm: 18.75, us: 8.75, uk: "R", eu: 58.375, de: 18.75, jp: null, it: 18.375 },
  { circumferenceIn: 2.34, circumferenceMm: 59.5, diameterMm: 18.95, us: 9, uk: "R ½", eu: 59, de: 19, jp: 18, it: 19 },
  { circumferenceIn: 2.37, circumferenceMm: 60.2, diameterMm: 19.15, us: 9.25, uk: "S", eu: 59.625, de: 19.25, jp: null, it: 19.625 },
  { circumferenceIn: 2.39, circumferenceMm: 60.8, diameterMm: 19.35, us: 9.5, uk: "S ½", eu: 60.25, de: 19.5, jp: 19, it: 20.25 },
  { circumferenceIn: 2.42, circumferenceMm: 61.4, diameterMm: 19.56, us: 9.75, uk: "T", eu: 60.875, de: 19.75, jp: null, it: 20.875 },
  { circumferenceIn: 2.44, circumferenceMm: 62.1, diameterMm: 19.76, us: 10, uk: "T ½", eu: 61.5, de: 20, jp: 20, it: 21.25 },
  { circumferenceIn: 2.47, circumferenceMm: 62.7, diameterMm: 19.96, us: 10.25, uk: "U", eu: 62.125, de: 20.25, jp: 21, it: 22.125 },
  { circumferenceIn: 2.49, circumferenceMm: 63.4, diameterMm: 20.17, us: 10.5, uk: "U ½", eu: 62.75, de: 20.5, jp: 22, it: 22.75 },
  { circumferenceIn: 2.52, circumferenceMm: 64.0, diameterMm: 20.37, us: 10.75, uk: "V", eu: 63.375, de: null, jp: null, it: 23.375 },
  { circumferenceIn: 2.54, circumferenceMm: 64.6, diameterMm: 20.57, us: 11, uk: "V ½", eu: 64, de: 20.75, jp: 23, it: 24 },
  { circumferenceIn: 2.57, circumferenceMm: 65.3, diameterMm: 20.78, us: 11.25, uk: "W", eu: 64.625, de: null, jp: null, it: 24.625 },
  { circumferenceIn: 2.59, circumferenceMm: 65.9, diameterMm: 20.98, us: 11.5, uk: "W ½", eu: 65.25, de: 21, jp: 24, it: 25.25 },
  { circumferenceIn: 2.62, circumferenceMm: 66.6, diameterMm: 21.18, us: 11.75, uk: "X", eu: 65.875, de: null, jp: null, it: 25.875 },
  { circumferenceIn: 2.65, circumferenceMm: 67.2, diameterMm: 21.39, us: 12, uk: "X ½", eu: 66.5, de: 21.25, jp: 25, it: 26.5 },
  { circumferenceIn: 2.68, circumferenceMm: 68.1, diameterMm: 21.69, us: 12.25, uk: "Y", eu: 67.125, de: 21.5, jp: null, it: 27.125 },
  { circumferenceIn: 2.71, circumferenceMm: 68.5, diameterMm: 21.79, us: 12.5, uk: "Z", eu: 67.75, de: 21.75, jp: 26, it: 27.75 },
  { circumferenceIn: 2.72, circumferenceMm: 69.1, diameterMm: 21.99, us: 12.75, uk: "Z ½", eu: 68.375, de: null, jp: null, it: 28.375 },
  { circumferenceIn: 2.75, circumferenceMm: 69.7, diameterMm: 22.18, us: 13, uk: "—", eu: 69, de: 22, jp: 27, it: 29 },
];

/** Highlight rows for the landing preview table (whole sizes). */
export const PREVIEW_SIZES = RING_SIZES.filter((r) => Number.isInteger(r.us) && r.us >= 5 && r.us <= 12);
