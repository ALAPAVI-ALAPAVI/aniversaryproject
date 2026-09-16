import { getRoom, putRoom, sha256, timingSafeEqual } from '../lib/room.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { password = '', text = '' } = req.body || {};
  const trimmed = String(text).trim();
  if (!trimmed) return res.status(400).json({ error: 'empty' });

  const room = await getRoom();
  if (room.passwordHash) {
    const hash = await sha256(password);
    if (!timingSafeEqual(hash, room.passwordHash)) {
      return res.status(401).json({ error: 'wrong_password' });
    }
  }

  room.replies = Array.isArray(room.replies) ? room.replies : [];
  room.replies.push({ text: trimmed, time: Date.now() });
  await putRoom(room);
  res.status(200).json({ ok: true });
}
