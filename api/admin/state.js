import { getRoom, requireAdmin } from '../../lib/room.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

  const room = await getRoom();
  const { passwordHash, ...safe } = room;
  res.status(200).json({ ...safe, hasPassword: !!passwordHash });
}
