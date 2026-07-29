import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const extensionRoot = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'));
const extensionPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const modelSelector = readFileSync(new URL('../../ui/features/chat/components/ModelSelector.tsx', import.meta.url), 'utf8');
const chatInput = readFileSync(new URL('../../ui/features/chat/components/ChatInput.tsx', import.meta.url), 'utf8');
const rootReadme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../../../.github/workflows/release-extension.yml', import.meta.url), 'utf8');

test('all extension icons live under the UI assets directory', () => {
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
    assert.equal(existsSync(new URL(`../../ui/assets/icons/${asset}`, import.meta.url)), true, asset);
  }
  assert.equal(existsSync(new URL('icons', extensionRoot)), false);
  assert.deepEqual(manifest.action.default_icon, {
    16: 'ui/assets/icons/icon16.png',
    48: 'ui/assets/icons/icon48.png',
    128: 'ui/assets/icons/icon128.png',
  });
  assert.deepEqual(manifest.icons, manifest.action.default_icon);
  assert.equal(
    (modelSelector.match(/chrome\.runtime\.getURL\(`ui\/assets\/icons\/models\//g) ?? []).length,
    2,
  );
  assert.doesNotMatch(modelSelector, /chrome\.runtime\.getURL\(`icons\//);
  assert.equal(rootReadme.includes('<img src="extension/ui/assets/icons/icon.svg"'), true);
  assert.equal(releaseWorkflow.includes('zip -r "../$ZIP_NAME" manifest.json dist ui'), true);
  assert.doesNotMatch(releaseWorkflow, /manifest\.json icons|side-panel/);
});

test('shared UI components live directly under the shared directory', () => {
  assert.equal(existsSync(new URL('../../ui/shared/Favicon.tsx', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../ui/shared/components', import.meta.url)), false);
  assert.match(chatInput, /shared\/Favicon/);
  assert.doesNotMatch(chatInput, /shared\/components/);
});

test('the package test script includes the structure contract', () => {
  assert.equal(extensionPackage.scripts.test, 'node --test tests/**/*.test.mjs');
});

