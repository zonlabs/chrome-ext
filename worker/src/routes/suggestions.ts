import { Hono } from 'hono';
import { rateLimitMiddleware } from '../utils/rate-limit';
import { requireAuth, type AuthEnv } from '../utils/auth';
import { generateAIText } from '../utils/ai';

const route = new Hono<AuthEnv>();

route.use('/suggestions', rateLimitMiddleware({ windowMs: 60_000, max: 30 }), requireAuth);

route.post('/suggestions', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    typeof body.url !== 'string' ||
    body.url.trim().length === 0 ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0 ||
    (body.pageText !== undefined && typeof body.pageText !== 'string')
  ) {
    return c.json({ error: 'Invalid suggestion payload' }, 400);
  }

  const { url, title, pageText } = body;

  const contextBlock = [
    `Tab URL: ${url}`,
    `Tab Title: ${title}`,
    pageText ? `Page Context:\n${pageText.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a helpful browser assistant. Based on the browser tab context below, generate exactly 3 short, highly relevant questions or prompts that the user is most likely to want to ask. The prompts should feel natural, specific to the content, and immediately useful.

${contextBlock}

Rules:
- Each prompt must be a complete, natural sentence
- Be specific to the page content — not generic
- Max 10 words per prompt
- Reply ONLY with a valid JSON array of 3 strings, no markdown, no explanation

Example output:
["Explain what this function does","Find the npm package docs","What are the open issues?"]`;

  const MODELS = [
    '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/meta/llama-3.2-3b-instruct',
    '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  ];

  let suggestions: string[] = [];

  for (const model of MODELS) {
    try {
      const raw = await generateAIText({
        binding: c.env.AI,
        model,
        system: 'You are a helpful assistant that responds only with valid JSON.',
        prompt,
        temperature: 0.7,
      });

      let arr: unknown = null;
      const first = raw.indexOf('[');
      const last = raw.lastIndexOf(']');
      if (first !== -1 && last > first) {
        try { arr = JSON.parse(raw.slice(first, last + 1)); } catch { arr = null; }
      }
      if (!Array.isArray(arr)) {
        const strs = [...raw.matchAll(/"([^"\\]*(\\.[^"\\]*)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
        arr = strs.length ? strs : null;
      }

      const valid = (Array.isArray(arr) ? arr : [])
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 3);

      if (valid.length > 0) {
        suggestions = valid;
        break;
      }
    } catch (e: any) {
      console.warn(`[Suggestions] Model ${model} failed, trying next model:`, e?.message ?? e);
    }
  }

  return c.json({ suggestions }, 200);
});

export default route;
