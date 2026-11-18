import type { Metadata } from "next";
import { PhoneFlow } from "@/components/onehand/PhoneFlow";

export const metadata: Metadata = { title: "Find your size" };

type Props = { searchParams?: Promise<{ s?: string }> };

/** Phone side of the sizing flow: opened from the QR code on the desktop modal. */
export default async function PhonePage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const id = params.s && /^[a-f0-9-]{8,64}$/i.test(params.s) ? params.s : null;
  return <PhoneFlow sessionId={id} />;
}
