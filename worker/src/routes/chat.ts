import { Hono } from 'hono';
import { Env } from '../db/schema';
import { streamText, generateText, createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';

function buildSystemPrompt(canvas: any[]): string {
  const ctx = canvas.map((p: any, i: number) =>
    `[Product ${i + 1}] ${p.name} — ${p.currency || '$'}${p.price} at ${p.store} — Rating: ${p.rating ?? 'N/A'} — ${p.description?.slice(0, 200) ?? ''}`
  ).join('\n');
  return `You are Obot, a helpful AI assistant. Answer user queries, compare items, and help them make decisions. Use the context data below to give specific, accurate answers. Be direct.\n\n${ctx}`;
}

const app = new Hono<{ Bindings: Env }>();

app.post('/chat', async (c) => {
  const { prompt, canvas, model } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'Missing prompt' }, 400);
  }

  const chatModel = model || DEFAULT_MODEL;

  try {
    const workersai = createWorkersAI({ binding: c.env.AI });
    const { text } = await generateText({
      model: workersai(chatModel),
      system: buildSystemPrompt(canvas || []),
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 1024,
      temperature: 0.3,
    });
    return c.json({ message: text, structured: null });
  } catch (err) {
    console.error('Chat error:', err);
    return c.json({
      message: 'Sorry, the AI assistant is not available right now.',
      structured: null,
      detail: String(err)
    }, 500);
  }
});

app.post('/chat/stream', async (c) => {
  const { prompt, canvas, model } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'Missing prompt' }, 400);
  }

  const chatModel = model || DEFAULT_MODEL;

  try {
    const workersai = createWorkersAI({ binding: c.env.AI });
    const result = streamText({
      model: workersai(chatModel),
      system: buildSystemPrompt(canvas || []),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  } catch (err) {
    console.error('Stream error:', err);
    return c.json({ error: 'Streaming failed', detail: String(err) }, 500);
  }
});

export default app;
