import { getRoom, putRoom, requireAdmin, sha256 } from '../../lib/room.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = req.body || {};
  const room = await getRoom();

  room.text = body.text || '';
  room.title = (body.title || '').trim();
  if (typeof body.password === 'string') {
    room.passwordHash = body.password ? await sha256(body.password) : '';
  }
  if (typeof body.live === 'boolean') room.live = body.live;
  if (body.resetReplies) room.replies = [];
  room.updatedAt = Date.now();

  await putRoom(room);
  res.status(200).json({ ok: true });
}
