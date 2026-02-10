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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  try {
    const items = await getItems();
    const itemIndex = items.findIndex(i => i.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (req.method === 'PATCH') {
      const { checked, is_staple, position, quantity } = req.body;
      const item = items[itemIndex];

      if (checked !== undefined) {
        item.checked = checked;
        item.checked_at = checked ? new Date().toISOString() : undefined;
      }
      if (is_staple !== undefined) item.is_staple = is_staple;
      if (position !== undefined) item.position = position;
      if (quantity !== undefined) item.quantity = quantity;

      await setItems(items);
      return res.status(200).json(item);
    }

    if (req.method === 'DELETE') {
      items.splice(itemIndex, 1);
      await setItems(items);
      return res.status(200).json({ status: 'deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
