import { getRoom, sha256, timingSafeEqual } from '../lib/room.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const password = req.query.password || '';
  const room = await getRoom();

  if (room.passwordHash) {
    const hash = await sha256(password);
    if (!timingSafeEqual(hash, room.passwordHash)) {
      return res.status(401).json({ error: 'wrong_password' });
    }
  }

  const { passwordHash, ...safe } = room; // never send the hash to the client
  res.status(200).json(safe);
}
