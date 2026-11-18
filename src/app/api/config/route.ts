import { authorize, SERVICE } from "@/lib/config-auth";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function forward(path: string, method: string, body?: string) {
  try {
    // Server-to-server call from this machine: the sizing service accepts it as local.
    const res = await fetch(`${SERVICE}${path}`, {
      method,
      cache: "no-store",
      headers: body ? { "content-type": "application/json" } : undefined,
      body,
    });
    return json(await res.json().catch(() => ({})), res.status);
  } catch {
    return json({ error: `The sizing service is not reachable at ${SERVICE}. Start it with npm run onehand.` }, 502);
  }
}

export async function GET(request: Request) {
  const auth = authorize(request.headers);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return forward("/api/onehand-config", "GET");
}

export async function PUT(request: Request) {
  const auth = authorize(request.headers);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const text = await request.text();
  if (text.length > 5000) return json({ error: "Body too large." }, 413);
  return forward("/api/onehand-config", "PUT", text);
}

export async function POST(request: Request) {
  const auth = authorize(request.headers);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const text = await request.text();
  if (text.length > 500) return json({ error: "Body too large." }, 413);
  return forward("/api/onehand-config/reset", "POST", text || "{}");
}
