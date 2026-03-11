# SSE Streaming & Chat Patterns

## Chat Architecture

`chat.html` implements an AI chat interface that calls the `chat-with-ai` Supabase edge function with Server-Sent Events (SSE) streaming.

## Edge Function Request

```javascript
var response = await fetch(SUPABASE_URL + '/functions/v1/chat-with-ai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + session.access_token
  },
  body: JSON.stringify({
    conversation_id: currentConversationId,
    user_message: messageText,
    stream: true
  })
});
```

## SSE Stream Parsing

The response is a `ReadableStream` of SSE events. The parsing pattern is critical — get it wrong and messages will be corrupted or lost.

```javascript
var reader = response.body.getReader();
var decoder = new TextDecoder();
var buffer = '';

while (true) {
  var result = await reader.read();
  if (result.done) break;

  buffer += decoder.decode(result.value, { stream: true });
  var lines = buffer.split('\n');
  buffer = lines.pop() || '';  // CRITICAL: keep incomplete line in buffer

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line.startsWith('data: ')) continue;
    try {
      var evt = JSON.parse(line.slice(6));
      handleStreamEvent(evt);
    } catch (pe) { /* skip malformed events */ }
  }
}
```

### Buffer Rule

**Never discard the last element from `split('\n')`** — it may be an incomplete line that continues in the next chunk. `lines.pop()` saves it back to the buffer.

## Event Types

The edge function emits these event types:

| `evt.type` | Payload | Action |
|------------|---------|--------|
| `start` | `evt.conversation_id` | Save conversation ID for future messages |
| `content` | `evt.content` (string) | Append text to current message bubble |
| `tool_call` | `evt.tool_name` | Show "thinking" or "searching" indicator |
| `tool_result` | `evt.chart_data` (optional) | Render chart/visualization if present |
| `done` | — | Finalize message, re-enable input |
| `error` | `evt.error` (string) | Show error message, re-enable input |

### Content Accumulation

Content events arrive as small chunks (often single words or partial sentences). Accumulate into a buffer and render incrementally:

```javascript
var messageBuffer = '';

function handleContentEvent(evt) {
  messageBuffer += evt.content;
  messageEl.innerHTML = renderMarkdown(messageBuffer);
  scrollToBottom();
}
```

## Markdown Rendering

Chat messages support a minimal markdown subset:

- `**bold**` → `<strong>bold</strong>`
- `\n` → `<br>`
- No other HTML tags — all other content is escaped

## Error Handling

1. **Network failure**: Catch fetch errors, show "Connection lost" message
2. **Non-SSE response**: Check `content-type` header — if not `text/event-stream`, parse as JSON error
3. **Stream interruption**: `reader.read()` returns `{ done: true }` — finalize message even if no `done` event received
4. **Malformed events**: `JSON.parse` in try/catch — skip silently, don't break the stream

## Conversation State

```javascript
var currentConversationId = null;  // Set on 'start' event, persists across messages
var conversations = [];             // Sidebar conversation list
```

- New conversation: send without `conversation_id` — server creates one and returns it in `start` event
- Existing conversation: include `conversation_id` in request body
- Conversation list in sidebar, loaded from `/rest/v1/conversations`

## Important Notes

- The chat uses the same auth session as the dashboard — `getSession()` pattern
- Token refresh must be handled before long conversations (50-min refresh cycle)
- The edge function is shared with HealthBite — same API contract
- `stream: true` in the request body is required — without it, the response is a single JSON object instead of SSE
