import { ModelEntry } from './types';

declare const __BUILD_ENV__: string | undefined;

export const WORKER_URL = __BUILD_ENV__ === 'production'
  ? 'https://api.linkos.in'
  : 'http://127.0.0.1:8787';

export const LS_THREADS = 'obot_chats';
export const LS_ACTIVE  = 'obot_active_thread_id';
export const LS_DISABLED_PLUGINS = 'obot_disabled_plugins';
export const LS_MODEL = 'obot_model';

export const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct';

export const VALID_MODELS = [
  '@cf/meta/llama-3.2-1b-instruct',
  '@cf/google/gemma-2b-it-lora',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/zai-org/glm-5.2',
  '@cf/moonshotai/kimi-k2.6',
  '@cf/openai/gpt-oss-120b',
];

export const MODELS_DATA: ModelEntry[] = [
  { value: '@cf/meta/llama-3.2-1b-instruct',       label: 'Llama 3.2 1B',   desc: 'Meta Tiny Text Instruct (fastest, cheapest)',   icon: 'meta.svg',   tier: 'basic' },
  { value: '@cf/google/gemma-2b-it-lora',           label: 'Gemma 2B LoRA',  desc: 'Google Lightweight LoRA Adapter (2B)',          icon: 'google.svg', tier: 'basic' },
  { value: '@cf/meta/llama-3.2-3b-instruct',       label: 'Llama 3.2 3B',   desc: 'Meta Small Text Instruct (balanced)',           icon: 'meta.svg',   tier: 'basic' },
  { value: '@cf/qwen/qwen3-30b-a3b-fp8',            label: 'Qwen 3 30B',    desc: 'Alibaba Multilingual MoE (3B active)',          icon: 'qwen.svg',   tier: 'intermediate' },
  { value: '@cf/zai-org/glm-4.7-flash',             label: 'GLM 4.7 Flash', desc: 'Zhipu AI Fast Bilingual Assistant',              icon: 'zai.svg',    tier: 'intermediate' },
  { value: '@cf/meta/llama-3.1-8b-instruct-fp8-fast', label: 'Llama 3.1 8B', desc: 'Meta Fast Text Instruct (FP8 quantized)',       icon: 'meta.svg',   tier: 'intermediate' },
  { value: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', desc: 'Meta MoE Instruct Generalist (17B active)',    icon: 'meta.svg',   tier: 'advanced' },
  { value: '@cf/google/gemma-4-26b-a4b-it',          label: 'Gemma 4 26B',   desc: 'Google MoE Multimodal (4B active)',             icon: 'google.svg', tier: 'advanced' },
  { value: '@cf/zai-org/glm-5.2',                   label: 'GLM 5.2',       desc: 'Zhipu AI High Performance Reasoning',           icon: 'zai.svg',    tier: 'advanced' },
  { value: '@cf/moonshotai/kimi-k2.6',              label: 'Kimi K2.6',     desc: 'Moonshot AI Long Context & Vision',             icon: 'moonshotai.svg', tier: 'advanced' },
  { value: '@cf/openai/gpt-oss-120b',               label: 'GPT-OSS 120B',  desc: 'Open-source frontier text model',               icon: 'openai.svg', tier: 'advanced' },
];
