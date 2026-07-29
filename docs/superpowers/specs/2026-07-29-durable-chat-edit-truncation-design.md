# Durable Chat Edit Truncation

## Problem

Editing and resending an earlier user message, or regenerating an assistant
response, truncates the transcript displayed by the Obot extension. The
truncation is not sent to the `AIChatAgent` Durable Object because
`useAgentChat` is configured with `syncMessagesToServer: false`. The replacement
turn is appended to the unchanged durable transcript, so reopening the thread
restores the removed messages as well as the replacement turn.

## Design

Obot will use `useAgentChat`'s built-in `setMessages` synchronization for its
flat `AIChatAgent` transcript. The explicit opt-out will be removed so the hook
uses its default `syncMessagesToServer: true` behavior.

The existing edit-and-resend and regenerate handlers will remain responsible for
selecting the retained prefix:

- Edit-and-resend keeps messages before the edited user message.
- Regenerate keeps messages before the user message that prompted the selected
  assistant response.

Calling `setMessages` with that prefix updates the local UI immediately and
sends the full retained transcript to the Durable Object using the SDK's
`CF_AGENT_CHAT_MESSAGES` protocol. The existing pending-edit flow then sends the
replacement user message and starts the new assistant turn.

No custom WebSocket frame or new worker RPC will be introduced.

## Data Flow

1. The user selects edit-and-resend or regenerate.
2. The handler computes the retained transcript prefix.
3. `setMessages(prefix)` updates the UI and synchronizes the prefix to the
   `ChatAgent`.
4. `ChatAgent.persistMessages` removes rows absent from the replacement
   transcript and persists the retained prefix.
5. The replacement user message is sent through the existing `sendMessage`
   flow, including page context when available.
6. Reopening the thread hydrates only the retained prefix, replacement user
   message, and its subsequent assistant response.

## Error Handling

The existing chat error toast remains the error surface for transport or model
failures. The change does not add a second persistence mechanism or retry path.
WebSocket message ordering ensures the transcript replacement is delivered
before the subsequent replacement turn on the same agent connection.

## Testing

Extension contract tests will verify that:

- `setMessages` synchronization is not disabled.
- Edit-and-resend truncates before the edited user message.
- Regenerate truncates before the prompting user message.
- Both paths schedule the replacement text only after selecting a valid target.

The complete extension test suite and production build will be run after the
implementation.
