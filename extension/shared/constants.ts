import { ModelEntry } from './types';

declare const __BUILD_ENV__: string | undefined;

/** Worker API base URL — production or local dev. */
export const WORKER_URL = __BUILD_ENV__ === 'production'
  ? 'https://api.linkos.in'
  : 'http://127.0.0.1:8787';

/** Google OAuth client used by the extension ID-token flow. */
export const GOOGLE_CLIENT_ID = '4924083673-9u1npacjm2egsp8ebsnsrd75gpn5qqlg.apps.googleusercontent.com';

/** LocalStorage key for saved chat threads. */
export const LS_THREADS = 'obot_chats';
/** LocalStorage key for the active thread ID. */
export const LS_ACTIVE  = 'obot_active_thread_id';
/** LocalStorage key for disabled plugin IDs. */
export const LS_DISABLED_PLUGINS = 'obot_disabled_plugins';
/** LocalStorage key for the selected model. */
export const LS_MODEL = 'obot_model';

/** Default LLM model ID. */
export const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct';

/** Supported model IDs that can be selected by the user. */
export const VALID_MODELS = [
  '@cf/meta/llama-3.2-1b-instruct',
  '@cf/google/gemma-2b-it-lora',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/unum/uform-gen2-qwen-500m',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/zai-org/glm-5.2',
  '@cf/moonshotai/kimi-k2.5',
  '@cf/moonshotai/kimi-k2.6',
  '@cf/openai/gpt-oss-120b',
];

/** Display metadata for each available model. */
export const MODELS_DATA: ModelEntry[] = [
  // ── Basic (text only) ──
  { value: '@cf/meta/llama-3.2-1b-instruct',               label: 'Llama 3.2 1B',     desc: 'Meta Tiny Text (fastest)',                        icon: 'meta.svg',   tier: 'basic' },
  { value: '@cf/google/gemma-2b-it-lora',                   label: 'Gemma 2B LoRA',    desc: 'Google Lightweight LoRA (2B)',                    icon: 'google.svg', tier: 'basic' },
  { value: '@cf/meta/llama-3.2-3b-instruct',               label: 'Llama 3.2 3B',     desc: 'Meta Small Text (balanced)',                      icon: 'meta.svg',   tier: 'basic' },
  // ── Basic (vision) ──
  { value: '@cf/unum/uform-gen2-qwen-500m',                 label: 'UForm Gen2 500M',  desc: 'Small multimodal (text + image)',                 icon: 'meta.svg', tier: 'basic', hasVision: true },
  // ── Intermediate (text only) ──
  { value: '@cf/qwen/qwen3-30b-a3b-fp8',                    label: 'Qwen 3 30B',       desc: 'Alibaba Multilingual MoE (3B active)',            icon: 'qwen.svg',   tier: 'intermediate' },
  { value: '@cf/zai-org/glm-4.7-flash',                     label: 'GLM 4.7 Flash',    desc: 'Zhipu AI Fast Bilingual Assistant',               icon: 'zai.svg',    tier: 'intermediate' },
  { value: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',       label: 'Llama 3.1 8B',     desc: 'Meta Fast Text (FP8 quantized)',                  icon: 'meta.svg',   tier: 'intermediate' },
  // ── Intermediate (vision) ──
  { value: '@cf/meta/llama-3.2-11b-vision-instruct',        label: 'Llama 3.2 11B Vis', desc: 'Meta multimodal (text + image) — 11B',           icon: 'meta.svg',   tier: 'intermediate', hasVision: true },
  // ── Advanced (text only) ──
  { value: '@cf/zai-org/glm-5.2',                           label: 'GLM 5.2',          desc: 'Zhipu AI High Performance Reasoning',             icon: 'zai.svg',    tier: 'advanced' },
  { value: '@cf/openai/gpt-oss-120b',                       label: 'GPT-OSS 120B',     desc: 'Open-source frontier text model',                 icon: 'openai.svg', tier: 'advanced' },
  // ── Advanced (vision) ──
  { value: '@cf/meta/llama-4-scout-17b-16e-instruct',       label: 'Llama 4 Scout',    desc: 'Meta MoE multimodal (text + image)',              icon: 'meta.svg',   tier: 'advanced', hasVision: true },
  { value: '@cf/google/gemma-3-12b-it',                     label: 'Gemma 3 12B',      desc: 'Google multimodal (text + image)',                icon: 'google.svg', tier: 'advanced', hasVision: true },
  { value: '@cf/google/gemma-4-26b-a4b-it',                 label: 'Gemma 4 26B',      desc: 'Google MoE multimodal (4B active)',               icon: 'google.svg', tier: 'advanced', hasVision: true },
  { value: '@cf/moonshotai/kimi-k2.5',                      label: 'Kimi K2.5',       desc: 'Long context & vision',                           icon: 'moonshotai.svg', tier: 'advanced', hasVision: true },
  { value: '@cf/moonshotai/kimi-k2.6',                      label: 'Kimi K2.6',       desc: 'Long context & vision',                           icon: 'moonshotai.svg', tier: 'advanced', hasVision: true },
];
