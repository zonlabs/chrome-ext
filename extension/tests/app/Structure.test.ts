import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const extensionRoot = new URL('../../', import.meta.url);
const publicIconsDir = new URL('public/icons/', extensionRoot);
const builtManifestPath = new URL('.output/chrome-mv3/manifest.json', extensionRoot);
const extensionPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const modelSelector = readFileSync(new URL('../../features/chat/components/ModelSelector.tsx', import.meta.url), 'utf8');
const chatInput = readFileSync(new URL('../../features/chat/components/ChatInput.tsx', import.meta.url), 'utf8');
const rootReadme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../../../.github/workflows/release-extension.yml', import.meta.url), 'utf8');

describe('extension structure', () => {
  it('all extension icons live under the public icons directory', () => {
    const expectedAssets = [
      'icon.svg',
      'icon16.png',
      'icon48.png',
      'icon128.png',
      'models/alibaba.svg',
      'models/google.svg',
      'models/meta.svg',
      'models/moonshotai.svg',
      'models/openai.svg',
      'models/qwen.svg',
      'models/zai.svg',
    ];
    for (const asset of expectedAssets) {
      expect(existsSync(new URL(asset, publicIconsDir)), asset).toBe(true);
    }
    expect(existsSync(new URL('icons', extensionRoot))).toBe(false);
  });

  it.skipIf(!existsSync(builtManifestPath))('the built manifest points at the wxt-built icon paths', () => {
    const manifest = JSON.parse(readFileSync(builtManifestPath, 'utf8'));
    const iconPaths = { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
    expect(manifest.action.default_icon).toEqual(iconPaths);
    expect(manifest.icons).toEqual(iconPaths);
  });

  it('model icons are loaded through the public icons path', () => {
    expect((modelSelector.match(/browser\.runtime\.getURL\(`\/icons\/models\//g) ?? []).length).toBe(2);
    expect(modelSelector).not.toMatch(/getURL\(`icons\//);
  });

  it('shared UI components live directly under the shared directory', () => {
    expect(existsSync(new URL('../../components/Favicon.tsx', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../../components/components', import.meta.url))).toBe(false);
    expect(chatInput).toMatch(/components\/Favicon/);
    expect(chatInput).not.toMatch(/shared\/components/);
  });

  it('the root README references the migrated icon path', () => {
    expect(rootReadme.includes('<img src="extension/public/icons/icon.svg"')).toBe(true);
  });

  it('the release workflow builds and zips with wxt', () => {
    expect(releaseWorkflow.includes('zip -r "../$ZIP_NAME" manifest.json dist ui')).toBe(false);
    expect(releaseWorkflow).toMatch(/npm run build/);
    expect(releaseWorkflow).toMatch(/npm run zip/);
    expect(releaseWorkflow).not.toMatch(/manifest\.json icons|side-panel/);
  });

  it('the package test script is vitest run', () => {
    expect(extensionPackage.scripts.test).toBe('vitest run');
  });
});
