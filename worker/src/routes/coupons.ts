import { Hono } from 'hono';
import { Env } from '../db/schema';
import { generateChatResponse } from '../services/ai';

const app = new Hono<{ Bindings: Env }>();

app.get('/coupons', async (c) => {
  const product = c.req.query('product');
  const store = c.req.query('store');

  if (!product || !store) {
    return c.json({ error: 'Missing product or store query params' }, 400);
  }

  const cacheKey = `coupons:${product.toLowerCase()}:${store.toLowerCase()}`;
  const cached = await c.env.CACHE.get(cacheKey);

  if (cached) {
    return c.json({ coupons: JSON.parse(cached) });
  }

  const prompt = `Suggest 2-3 valid coupon codes or deals for "${product}" at ${store}. Return as JSON array: [{code: string, description: string, discount: string}]`;

  const result = await generateChatResponse(c.env.AI, prompt, '');
  let coupons;
  try {
    coupons = JSON.parse(result as string);
  } catch {
    return c.json({ coupons: [], note: 'Could not parse coupon response' });
  }

  await c.env.CACHE.put(cacheKey, JSON.stringify(coupons), { expirationTtl: 3600 });

  return c.json({ coupons });
});

export default app;
