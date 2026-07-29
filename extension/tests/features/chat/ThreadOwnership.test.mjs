import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const threadsHook = readFileSync(new URL('../../../ui/features/chat/hooks/useThreads.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../../ui/app/App.tsx', import.meta.url), 'utf8');
const chatView = readFileSync(new URL('../../../ui/features/chat/components/ChatView.tsx', import.meta.url), 'utf8');
const chatPluginBar = readFileSync(new URL('../../../ui/features/plugins/components/ChatPluginBar.tsx', import.meta.url), 'utf8');
const clientTools = readFileSync(new URL('../../../ui/features/chat/lib/clientTools.ts', import.meta.url), 'utf8');

test('the extension never generates a chat thread id', () => {
  assert.doesNotMatch(threadsHook, /crypto\.randomUUID\s*\(/);
  assert.doesNotMatch(app, /setActiveThreadId\(crypto\.randomUUID\s*\(/);
});

test('the empty chat view does not construct an agent connection', () => {
  assert.match(chatView, /if \(!props\.activeThreadId\)/);
});

test('message replacement actions sync their retained transcript to durable storage', () => {
  assert.doesNotMatch(chatView, /syncMessagesToServer:\s*false/);
  assert.match(
    chatView,
    /handleEditMessage[\s\S]*setMessages\(messages\.slice\(0, messageIndex\)\);[\s\S]*setPendingEdit\(\{ text: newText \}\)/,
  );
  assert.match(
    chatView,
    /handleRegenerateMessage[\s\S]*setMessages\(messages\.slice\(0, userMessageIndex\)\);[\s\S]*setPendingEdit\(\{ text: userText \}\)/,
  );
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
test('the first message handoff is consumed before it mutates the external chat store', () => {
  assert.match(chatView, /const consumedInitialRequestRef = useRef<InitialMessageRequest \| null>\(null\);/);
  assert.match(
    chatView,
    /consumedInitialRequestRef\.current = initialRequest;[\s\S]*onInitialMessageSent\?\.\(\);[\s\S]*sendMessage\(\{ text: initialRequest\.text \}\);/,
  );
  assert.match(
    chatView,
    /const handleInitialMessageSent = useCallback\(\(\) => setPendingInitialMessage\(null\), \[\]\);/,
  );
  assert.doesNotMatch(chatView, /onInitialMessageSent=\{\(\) => setPendingInitialMessage\(null\)\}/);
});

test('message replacement actions never call React state setters inside chat-store updaters', () => {
  assert.doesNotMatch(
    chatView,
    /setMessages\(prev => \{[\s\S]*?setPendingEdit\([\s\S]*?\}\);/,
  );
});
test('server-authoritative chat disables replay feedback and throttles live store notifications', () => {
  assert.match(chatView, /resume:\s*false/);
  assert.match(chatView, /experimental_throttle:\s*50/);
  assert.doesNotMatch(chatView, /new Proxy\(/);
  assert.match(chatView, /const agent = useAgent\(agentOptions\);/);
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
