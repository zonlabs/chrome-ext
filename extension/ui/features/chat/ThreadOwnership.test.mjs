import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const threadsHook = readFileSync(new URL('./hooks/useThreads.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../app/App.tsx', import.meta.url), 'utf8');
const chatView = readFileSync(new URL('./components/ChatView.tsx', import.meta.url), 'utf8');
const chatPluginBar = readFileSync(new URL('../plugins/components/ChatPluginBar.tsx', import.meta.url), 'utf8');
const clientTools = readFileSync(new URL('./lib/clientTools.ts', import.meta.url), 'utf8');

test('the extension never generates a chat thread id', () => {
  assert.doesNotMatch(threadsHook, /crypto\.randomUUID\s*\(/);
  assert.doesNotMatch(app, /setActiveThreadId\(crypto\.randomUUID\s*\(/);
});

test('the empty chat view does not construct an agent connection', () => {
  assert.match(chatView, /if \(!props\.activeThreadId\)/);
  assert.match(chatView, /syncMessagesToServer:\s*false/);
});


test('thread history loading uses a stable auth-loss callback', () => {
  assert.match(app, /const handleAuthLost = useCallback\(\(\) => setUser\(null\), \[\]\);/);
  assert.match(app, /useThreads\(!!user, handleAuthLost\)/);
  assert.doesNotMatch(app, /useThreads\(!!user, \(\) => setUser\(null\)\)/);
});

test('the empty chat uses the full input and preserves the pending first send', () => {
  const shell = chatView.slice(chatView.indexOf('export function ChatView'));
  assert.match(shell, /const \[isCreating, setIsCreating\] = useState\(false\);/);
  assert.match(shell, /const creatingThreadRef = useRef\(false\);/);
  assert.match(shell, /if \(creatingThreadRef\.current\) return;/);
  assert.match(shell, /creatingThreadRef\.current = true;/);
  assert.match(shell, /creatingThreadRef\.current = false;/);
  assert.match(chatView, /function EmptyThreadChatView[\s\S]*<ChatInput/);
  assert.doesNotMatch(shell, /<textarea value=\{props\.inputValue\}/);
});

test('the chat shell is not remounted when its server thread id changes', () => {
  assert.doesNotMatch(app, /<ChatView\s+key=\{activeThreadId\}/);
});
test('the empty thread shell retains navigation chrome and captures first-message context', () => {
  assert.match(chatView, /function EmptyThreadChatView/);
  assert.match(chatView, /<ChatHeader/);
  assert.match(chatView, /getActiveTabPageContext\(\)/);
  assert.match(chatView, /captureScreenshot\(\)/);
  assert.match(chatView, /pendingContextRef\.current = initialRequest\.context/);
});
test('expected screenshot permission failures are handled as unavailable context', () => {
  assert.match(clientTools, /isExpectedScreenshotPermissionError/);
  assert.match(clientTools, /if \(!isExpectedScreenshotPermissionError\(error\)\)/);
  assert.match(clientTools, /return null/);
});

test('plugin chips remain visible while an enabled plugin reconnects', () => {
  assert.match(chatPluginBar, /availablePlugins\.filter\(plugin => !disabledPlugins\.includes\(plugin\.id\)\)/);
  assert.doesNotMatch(chatPluginBar, /const enabled = [^\n]*plugin\.state === 'ready'/);
  assert.match(chatView, /p\.state === 'ready'/);
  assert.doesNotMatch(chatView, /showPluginsPopup|pluginsPopupRef/);
});

test('plugin favicon failures render one shared initial fallback', () => {
  assert.match(chatPluginBar, /function PluginIcon/);
  assert.match(chatPluginBar, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(chatPluginBar, /plugin\.name\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/);
  assert.match(chatPluginBar, /fallbackClassName="plugins-selector-fallback-icon"/);
});
