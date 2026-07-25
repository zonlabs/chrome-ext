import { Hono } from 'hono';
import { Env } from '../db/schema';
import { generateChatResponse } from '../services/ai';

const app = new Hono<{ Bindings: Env }>();

app.post('/extract', async (c) => {
  const { html, url } = await c.req.json();

  if (!html) {
    return c.json({ error: 'Missing html field' }, 400);
  }

  const prompt = `Extract product information from this page HTML. Return a JSON object with: name (string), price (number), currency (string), store (string from URL domain), rating (number or null), reviewCount (number or null), image (string URL or null), specs (object), description (string, first 300 chars). Page URL: ${url}\n\nHTML:\n${html.slice(0, 8000)}`;

  const result = await generateChatResponse(c.env.AI, prompt, '');
  return c.json({ data: result });
});

export default app;
