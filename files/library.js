import { getRoom, putRoom, requireAdmin } from '../../lib/room.js';

// Replaces the whole saved-letters library in one call, same pattern as
// admin/save.js does for the live letter. Simple last-write-wins — fine
// for a single admin working from one device at a time.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = req.body || {};
  if (!Array.isArray(body.library)) return res.status(400).json({ error: 'invalid_library' });

  const room = await getRoom();
  room.library = body.library.map((item) => ({
    title: String((item && item.title) || '').trim(),
    password: String((item && item.password) || ''),
    text: String((item && item.text) || ''),
  }));

  await putRoom(room);
  res.status(200).json({ ok: true, library: room.library });
}
