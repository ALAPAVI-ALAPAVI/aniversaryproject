// lib/room.js — shared storage + auth helpers for the "Dear" app's API routes.
//
// Storage: Vercel KV was sunset, so this uses Upstash Redis via the Vercel
// Marketplace instead. Set it up once:
//   1. In your Vercel project: Marketplace tab -> add "Upstash for Redis" ->
//      connect it to this project. Vercel injects KV_REST_API_URL and
//      KV_REST_API_TOKEN as env vars automatically (yes, still the old
//      KV_ prefix even though the product itself is Upstash now).
//   2. Project Settings -> Environment Variables -> add ADMIN_PASSWORD
//      (your real admin password — this is only ever read on the server).
//   3. npm install @upstash/redis

import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const ROOM_KEY = 'dear:room';

const DEFAULT_ROOM = {
  text: '',
  title: '',
  passwordHash: '',
  live: false,
  replies: [],
  library: [], // saved letters — synced server-side so any device sees the same list
  updatedAt: 0,
};

export async function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Constant-time compare so password checks can't be timed.
export function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function getRoom() {
  const room = await redis.get(ROOM_KEY);
  // Merge over the defaults rather than returning the raw stored value, so
  // a room saved before a new field existed (like `library`) still comes
  // back with that field present instead of undefined.
  return { ...DEFAULT_ROOM, ...(room || {}) };
}

export async function putRoom(room) {
  await redis.set(ROOM_KEY, room);
}

// Checks the X-Admin-Password header against the server-only secret.
// Fails closed if the secret was never configured.
export function requireAdmin(req) {
  const given = req.headers['x-admin-password'] || '';
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) return false;
  return timingSafeEqual(given, real);
}
