import os from "node:os";
import type { NextConfig } from "next";

/** Every non-internal IPv4 this machine is reachable on (LAN phone testing). */
function localNetworkHosts(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((iface) => iface ?? [])
    .filter((net) => net.family === "IPv4" && !net.internal)
    .map((net) => net.address);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    ...localNetworkHosts(),
    "192.168.0.0/16",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
  ],
  serverExternalPackages: ["@huggingface/transformers", "sharp", "onnxruntime-node"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        sharp$: false,
        "onnxruntime-node$": false,
      };
    }
    // MediaPipe's bundle uses a dynamic require webpack can't statically
    // resolve — harmless, but it spams "Critical dependency" warnings.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@mediapipe[\\/]tasks-vision/ },
    ];
    return config;
  },
};

export default nextConfig;
