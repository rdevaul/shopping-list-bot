import type { VercelRequest, VercelResponse } from '@vercel/node';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ITEMS_KEY = 'shopping:items';

interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  is_staple: boolean;
  checked: boolean;
  checked_at?: string;
  position: number;
  added_by: number;
  added_at: string;
}

async function getItems(): Promise<ShoppingItem[]> {
  const response = await fetch(`${UPSTASH_URL}/get/${ITEMS_KEY}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const data = await response.json();
  if (!data.result) return [];
  return JSON.parse(data.result);
}

async function setItems(items: ShoppingItem[]): Promise<void> {
  await fetch(`${UPSTASH_URL}/set/${ITEMS_KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(items)),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const items = await getItems();
      items.sort((a, b) => {
        if (a.is_staple !== b.is_staple) return a.is_staple ? -1 : 1;
        return a.position - b.position;
      });
      return res.status(200).json(items);
    }

    if (req.method === 'POST') {
      const { name, quantity, is_staple = false, added_by } = req.body;
      const items = await getItems();
      
      const normalized = name.toLowerCase().trim();
      const existing = items.find(i => i.name.toLowerCase() === normalized);
      
      if (existing) {
        existing.quantity = quantity || existing.quantity;
        existing.checked = false;
        existing.checked_at = undefined;
        await setItems(items);
        return res.status(200).json(existing);
      }
      
      const maxPos = Math.max(...items.map(i => i.position), -1);
      const newItem: ShoppingItem = {
        id: crypto.randomUUID(),
        name: normalized,
        quantity,
        is_staple,
        checked: false,
        position: maxPos + 1,
        added_by,
        added_at: new Date().toISOString(),
      };
      items.push(newItem);
      await setItems(items);
      return res.status(201).json(newItem);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
