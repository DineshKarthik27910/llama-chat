/**
 * API Client for Llama LAN Application
 * Uses relative paths so it functions seamlessly regardless of IP, domain, or port.
 */

const API = {
  // Check health and server configuration
  async getHealth() {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`Health check failed (${res.status})`);
    return await res.json();
  },

  // List all conversations
  async getConversations() {
    const res = await fetch('/api/conversations');
    if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`);
    return await res.json();
  },

  // Create new conversation
  async createConversation(title = 'New Chat') {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!res.ok) throw new Error(`Failed to create conversation (${res.status})`);
    return await res.json();
  },

  // Get single conversation details with all messages
  async getConversation(id) {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Failed to load chat history (${res.status})`);
    return await res.json();
  },

  // Rename a conversation
  async renameConversation(id, title) {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!res.ok) throw new Error(`Failed to rename conversation (${res.status})`);
    return await res.json();
  },

  // Delete a single conversation
  async deleteConversation(id) {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Failed to delete conversation (${res.status})`);
    return true;
  },

  // Clear all conversations
  async clearAllConversations() {
    const res = await fetch('/api/conversations', {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Failed to clear conversations (${res.status})`);
    return true;
  },

  // Send message and stream response tokens via SSE
  async streamChat({ conversationId, message, onStart, onToken, onDone, onError, signal }) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: message,
          stream: true
        }),
        signal
      });

      if (!response.ok) {
        let errorDetail = `Server error (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.detail) errorDetail = errJson.detail;
        } catch (_) {}
        throw new Error(errorDetail);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.event === 'start' && onStart) {
              onStart(data);
            } else if (data.event === 'token' && onToken) {
              onToken(data.chunk);
            } else if (data.event === 'done' && onDone) {
              onDone(data);
            }
          } catch (e) {
            console.error('Error parsing SSE event data:', e, jsonStr);
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (onDone) onDone({ aborted: true });
      } else {
        if (onError) onError(err);
      }
    }
  }
};
