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
    },
    body: JSON.stringify(items),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { item_ids } = req.body;
    const items = await getItems();
    const idToItem = new Map(items.map(i => [i.id, i]));

    item_ids.forEach((id: string, pos: number) => {
      const item = idToItem.get(id);
      if (item) item.position = pos;
    });

    await setItems(items);
    return res.status(200).json({ status: 'reordered' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
