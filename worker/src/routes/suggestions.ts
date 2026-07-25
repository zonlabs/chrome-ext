import { Hono } from 'hono';
import { Env } from '../db/schema';

const route = new Hono<{ Bindings: Env }>();

route.post('/suggestions', async (c) => {
  const { url, title, pageText } = await c.req.json<{
    url: string;
    title: string;
    pageText?: string;
  }>();

  const contextBlock = [
    `Tab URL: ${url}`,
    `Tab Title: ${title}`,
    pageText ? `Page excerpt:\n${pageText.slice(0, 600)}` : '',
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
  const errors: Record<string, string> = {};
  let rawSample = '';

  for (const model of MODELS) {
    try {
      const res: any = await c.env.AI.run(model, {
        messages: [
          { role: 'system', content: 'You are a helpful assistant that responds only with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      });

      // Workers AI may return an array directly, or a JSON-string in `response`.
      let arr: unknown = res?.response;
      if (!Array.isArray(arr)) {
        const raw = String(res?.response ?? '').trim();
        if (!rawSample) rawSample = raw.slice(0, 200);

        // Robust extraction: take from the first '[' to the last ']'.
        // Tolerates truncated output (no closing bracket) and markdown fences.
        const first = raw.indexOf('[');
        const last = raw.lastIndexOf(']');
        if (first !== -1 && last > first) {
          try { arr = JSON.parse(raw.slice(first, last + 1)); } catch { arr = null; }
        }
        // Fallback: pull individual quoted strings if array parse failed.
        if (!Array.isArray(arr)) {
          const strs = [...raw.matchAll(/"([^"\\]*(\\.[^"\\]*)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
          arr = strs.length ? strs : null;
        }
      }

      const valid = (Array.isArray(arr) ? arr : [])
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 3);

      if (valid.length > 0) {
        suggestions = valid;
        break;
      } else {
        errors[model] = 'no valid string items in response';
      }
    } catch (e: any) {
      errors[model] = e?.message ?? String(e);
      // Try the next model
    }
  }

  const debug = {
    v: 2,
    tried: MODELS,
    errors,
    rawSample,
    hasBinding: !!c.env.AI,
  };

  return c.json({ suggestions, debug }, 200);
});

export default route;
