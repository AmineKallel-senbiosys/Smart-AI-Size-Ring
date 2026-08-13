import type { DetectedCard } from "@/lib/detect";

const LABELS = [
  "credit card",
  "bank card",
  "debit card",
  "payment card",
  "visa card",
];

type OwlDetector = (
  image: unknown,
  labels: string[],
  options?: { threshold?: number; topk?: number }
) => Promise<
  Array<{
    score: number;
    label: string;
    box: { xmin: number; ymin: number; xmax: number; ymax: number };
  }>
>;

let detectorPromise: Promise<OwlDetector | null> | null = null;
let loadFailed = false;

async function getOwlDetector(): Promise<OwlDetector | null> {
  if (loadFailed) return null;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { pipeline } = await import("@huggingface/transformers");
        const detector = await pipeline(
          "zero-shot-object-detection",
          "Xenova/owlvit-base-patch32",
          { dtype: "q8" }
        );
        return detector as OwlDetector;
      } catch (err) {
        loadFailed = true;
        console.warn("OWL-ViT card detector unavailable:", err);
        return null;
      }
    })();
  }
  return detectorPromise;
}

/** Zero-shot credit card detection via OWL-ViT (on-device, ~80MB download once). */
export async function detectCardOwl(
  imageData: ImageData
): Promise<DetectedCard | null> {
  const detector = await getOwlDetector();
  if (!detector) return null;

  const { RawImage } = await import("@huggingface/transformers");
  const raw = new RawImage(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
    4
  );

  const results = await detector(raw, LABELS, {
    threshold: 0.04,
    topk: 6,
  });

  if (!results?.length) return null;

  const { width, height } = imageData;
  let best: DetectedCard | null = null;

  for (const r of results) {
    const bw = r.box.xmax - r.box.xmin;
    const bh = r.box.ymax - r.box.ymin;
    if (bw < 8 || bh < 8) continue;

    const aspect = bw / bh;
    if (aspect < 1.2 || aspect > 2.4) continue;

    const cx = (r.box.xmin + r.box.xmax) / 2;
    const cy = (r.box.ymin + r.box.ymax) / 2;
    const hit: DetectedCard = {
      xPct: (cx / width) * 100,
      yPct: (cy / height) * 100,
      wPct: (Math.max(bw, bh * 1.586) / width) * 100,
      score: r.score * 100 + (cx / width) * 8,
    };

    if (!best || hit.score > best.score) best = hit;
  }

  return best;
}

export async function preloadCardOwl(): Promise<boolean> {
  return (await getOwlDetector()) != null;
}
