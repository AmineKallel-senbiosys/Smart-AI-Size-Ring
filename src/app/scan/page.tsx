import type { Metadata } from "next";
import { CameraScan } from "@/components/camera/CameraScan";

export const metadata: Metadata = {
  title: "Camera scan",
  description:
    "Guided phone camera ring sizing with credit-card scale. Private, on-device.",
};

export default function ScanPage() {
  return <CameraScan />;
}
