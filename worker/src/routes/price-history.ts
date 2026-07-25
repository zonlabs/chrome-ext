import { Hono } from 'hono';
import { Env, getPriceHistory, insertPriceHistory, generateProductKey } from '../db/schema';

const app = new Hono<{ Bindings: Env }>();

app.get('/price-history', async (c) => {
  const name = c.req.query('name');
  const store = c.req.query('store');
  const days = parseInt(c.req.query('days') ?? '90');

  if (!name || !store) {
    return c.json({ error: 'Missing name or store query params' }, 400);
  }

  const productKey = generateProductKey(name, store);
  const history = await getPriceHistory(c.env.DB, productKey, days);

  return c.json({ history });
});

app.post('/price-history', async (c) => {
  const { name, store, url, price, currency } = await c.req.json();

  if (!name || !store || !url || !price) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const productKey = generateProductKey(name, store);
  await insertPriceHistory(c.env.DB, productKey, store, url, price, currency ?? 'USD');

  return c.json({ success: true });
});

export default app;
