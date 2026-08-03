import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const threadsHook = readFileSync(new URL('../../../lib/useThreads.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../../entrypoints/sidepanel/App.tsx', import.meta.url), 'utf8');
const authProvider = readFileSync(new URL('../../../lib/auth-provider.tsx', import.meta.url), 'utf8');
const chatView = readFileSync(new URL('../../../features/chat/components/ChatView.tsx', import.meta.url), 'utf8');
const chatPluginBar = readFileSync(new URL('../../../features/chat/components/ChatPluginBar.tsx', import.meta.url), 'utf8');
const clientTools = readFileSync(new URL('../../../features/chat/lib/clientTools.ts', import.meta.url), 'utf8');

describe('thread ownership', () => {
  it('the extension never generates a chat thread id', () => {
    expect(threadsHook).not.toMatch(/crypto\.randomUUID\s*\(/);
    expect(app).not.toMatch(/setActiveThreadId\(crypto\.randomUUID\s*\(/);
  });

  it('the empty chat view does not construct an agent connection', () => {
    expect(chatView).toMatch(/if \(!props\.activeThreadId\)/);
  });

  it('message replacement actions sync their retained transcript to durable storage', () => {
    expect(chatView).not.toMatch(/syncMessagesToServer:\s*false/);
    expect(chatView).toMatch(
      /handleEditMessage[\s\S]*setMessages\(messages\.slice\(0, messageIndex\)\);[\s\S]*setPendingEdit\(\{ text: newText \}\)/,
    );
    expect(chatView).toMatch(
      /handleRegenerateMessage[\s\S]*setMessages\(messages\.slice\(0, userMessageIndex\)\);[\s\S]*setPendingEdit\(\{ text: userText \}\)/,
    );
  });

  it('thread history loading uses a stable auth-loss callback', () => {
    expect(authProvider).toMatch(/handleAuthLost = useCallback\(\(\) => setUser\(null\), \[\]\)/);
    expect(app).toMatch(/useThreads\(!!user, handleAuthLost\)/);
    expect(app).not.toMatch(/useThreads\(!!user, \(\) => setUser\(null\)\)/);
  });

  it('the empty chat uses the full input and preserves the pending first send', () => {
    const shell = chatView.slice(chatView.indexOf('export function ChatView'));
    expect(shell).toMatch(/const \[isCreating, setIsCreating\] = useState\(false\);/);
    expect(shell).toMatch(/const creatingThreadRef = useRef\(false\);/);
    expect(shell).toMatch(/if \(creatingThreadRef\.current\) return;/);
    expect(shell).toMatch(/creatingThreadRef\.current = true;/);
    expect(shell).toMatch(/creatingThreadRef\.current = false;/);
    expect(chatView).toMatch(/function EmptyThreadChatView[\s\S]*<ChatInput/);
    expect(shell).not.toMatch(/<textarea value=\{props\.inputValue\}/);
  });

  it('the chat shell is not remounted when its server thread id changes', () => {
    expect(app).not.toMatch(/<ChatView\s+key=\{activeThreadId\}/);
  });

  it('the empty thread shell retains navigation chrome and captures first-message context', () => {
    expect(chatView).toMatch(/function EmptyThreadChatView/);
    expect(chatView).toMatch(/<ChatHeader/);
    expect(chatView).toMatch(/getActiveTabPageContext\(\)/);
    expect(chatView).toMatch(/captureScreenshot\(\)/);
    expect(chatView).toMatch(/pendingContextRef\.current = initialRequest\.context/);
  });

  it('the first message handoff is consumed before it mutates the external chat store', () => {
    expect(chatView).toMatch(/const consumedInitialRequestRef = useRef<InitialMessageRequest \| null>\(null\);/);
    expect(chatView).toMatch(
      /consumedInitialRequestRef\.current = initialRequest;[\s\S]*onInitialMessageSent\?\.\(\);[\s\S]*sendChatMessage\(\{ text: initialRequest\.text \}\)/,
    );
    expect(chatView).toMatch(/const handleInitialMessageSent = useCallback\(\(\) => setPendingInitialMessage\(null\), \[\]\);/);
    expect(chatView).not.toMatch(/onInitialMessageSent=\{\(\) => setPendingInitialMessage\(null\)\}/);
  });

  it('message replacement actions never call React state setters inside chat-store updaters', () => {
    expect(chatView).not.toMatch(/setMessages\(prev => \{[\s\S]*?setPendingEdit\([\s\S]*?\}\);/);
  });

  it('server-authoritative chat disables replay feedback and throttles live store notifications', () => {
    expect(chatView).toMatch(/resume:\s*false/);
    expect(chatView).toMatch(/experimental_throttle:\s*50/);
    expect(chatView).not.toMatch(/new Proxy\(/);
    expect(chatView).toMatch(/const agent = useAgent\(agentOptions\);/);
  });

  it('expected screenshot permission failures are handled as unavailable context', () => {
    expect(clientTools).toMatch(/isExpectedScreenshotPermissionError/);
    expect(clientTools).toMatch(/if \(!isExpectedScreenshotPermissionError\(error\)\)/);
    expect(clientTools).toMatch(/return null/);
  });

  it('plugin chips remain visible while an enabled plugin reconnects', () => {
    expect(chatPluginBar).toMatch(/availablePlugins\.filter\(plugin => !disabledPlugins\.includes\(plugin\.id\)\)/);
    expect(chatPluginBar).not.toMatch(/const enabled = [^\n]*plugin\.state === 'ready'/);
    expect(chatView).toMatch(/p\.state === 'ready'/);
    expect(chatView).not.toMatch(/showPluginsPopup|pluginsPopupRef/);
  });

  it('plugin favicon failures render one shared initial fallback', () => {
    expect(chatPluginBar).toMatch(/function PluginIcon/);
    expect(chatPluginBar).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
    expect(chatPluginBar).toMatch(/plugin\.name\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/);
  });
});
