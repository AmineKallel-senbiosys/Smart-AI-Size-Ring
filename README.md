# Airing — AI Ring Size

Web ring sizing inspired by [Aitaca](https://aitaca.io)-style guided photo flows.

## Two modes

1. **Camera scan** (`/scan`) — mobile-first. Opens the phone camera, uses a credit card as scale, measures finger or ring, returns US · UK · EU · JP.
2. **Screen sizer** (`/sizer`) — calibrate with a card/coin against the display, then match a ring or paper strip.

Everything runs on-device. Photos are not uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Test camera on a real phone

Camera needs a secure context (`https://` or `localhost`).

From this machine on the same Wi‑Fi:

```bash
npm run dev -- -H 0.0.0.0
```

Then either:

- Use a tunnel (`npx cloudflared tunnel --url http://localhost:3000` or ngrok), **or**
- Open the LAN URL over HTTPS if you set that up

Grant camera permission when prompted. Prefer the rear camera and lay the hand + card flat under even light.

## Stack

- Next.js 16 · React 19 · Tailwind 4 · Framer Motion
