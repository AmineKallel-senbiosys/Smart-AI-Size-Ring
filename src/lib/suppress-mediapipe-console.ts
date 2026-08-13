/** MediaPipe/TFLite log to stderr; Next.js dev treats that as a fatal console error. */
let installed = false;

const NOISE = [
  "TensorFlow Lite XNNPACK",
  "Created TensorFlow Lite",
  "OpenGL error checking is disabled",
  "landmark_projection_calculator",
  "inference_feedback_manager",
  "Feedback manager requires a model",
  "gl_context.cc",
  "INFO: Created TensorFlow",
];

function argsToText(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a == null) return "";
      try {
        return String(a);
      } catch {
        return "";
      }
    })
    .join(" ");
}

function isMediaPipeNoise(args: unknown[]): boolean {
  const text = argsToText(args);
  return NOISE.some((n) => text.includes(n));
}

function wrap(
  orig: (...data: unknown[]) => void
): (...data: unknown[]) => void {
  return (...args: unknown[]) => {
    if (isMediaPipeNoise(args)) return;
    orig(...args);
  };
}

export function installMediaPipeConsoleFilter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  console.error = wrap(console.error.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.info = wrap(console.info.bind(console));
  console.log = wrap(console.log.bind(console));
}
