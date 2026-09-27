/**
 * Llama Web Application Controller
 */

// Application State
const state = {
  currentConversationId: null,
  conversations: [],
  isGenerating: false,
  abortController: null,
  serverInfo: null
};

// DOM Elements
const elements = {
  // Sidebar
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  mobileToggleBtn: document.getElementById('mobileToggleBtn'),
  sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  topNewChatBtn: document.getElementById('topNewChatBtn'),
  conversationsList: document.getElementById('conversationsList'),
  emptyHistoryNotice: document.getElementById('emptyHistoryNotice'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  serverStatusCard: document.getElementById('serverStatusCard'),
  statusTitle: document.getElementById('statusTitle'),
  statusIp: document.getElementById('statusIp'),
  disclaimerIp: document.getElementById('disclaimerIp'),

  // Header & Model
  modelName: document.getElementById('modelName'),
  networkTag: document.getElementById('networkTag'),

  // Chat Area
  chatContainer: document.getElementById('chatContainer'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  messagesList: document.getElementById('messagesList'),
  scrollBottomBtn: document.getElementById('scrollBottomBtn'),

  // Input
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  toastContainer: document.getElementById('toastContainer')
};

// SVG Icons for Code Blocks & Copying
const ICONS = {
  copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10a37f" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  userAvatar: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  botAvatar: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 2.2 1 4.2 2.6 5.6L6 22l6.2-3.1A7.9 7.9 0 0 0 12 18a8 8 0 0 0 8-8 8 8 0 0 0-8-8z"></path></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  setupMarkedOptions();
  setupEventListeners();
  adjustTextareaHeight();
  await checkServerHealth();
  await loadConversations();
});

/* ==========================================================================
   Markdown & Code Formatting Configuration
   ========================================================================== */

/**
 * Configure Marked.js with Github Flavored Markdown & breaks
 */
function setupMarkedOptions() {
  if (typeof marked !== 'undefined') {
    const options = {
      breaks: true,
      gfm: true
    };
    try {
      if (typeof marked.use === 'function') {
        marked.use(options);
      } else if (typeof marked.setOptions === 'function') {
        marked.setOptions(options);
      }
    } catch (e) {
      console.warn('Marked configuration error:', e);
    }
  }
}

/**
 * Robust copy helper that functions across localhost, HTTPS, and non-secure LAN IP contexts
 */
async function copyToClipboard(text) {
  // Try modern Clipboard API if supported and in secure context
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }

  // Fallback for LAN HTTP (e.g. http://192.168.x.x or http://172.x.x.x)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-999999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.error('Fallback copy error:', err);
  }
  return false;
}

/**
 * High-reliability built-in Markdown fallback parser
 * Handles headings (# to ######), bold, italic, bullet lists, numbered lists,
 * inline code, links, blockquotes, horizontal rules, and fenced code blocks.
 */
function parseMarkdownFallback(rawText) {
  if (!rawText) return '';

  // 1. Extract fenced code blocks first so inner characters are never mangled
  const codeBlocks = [];
  let processed = rawText.replace(/(?:^|\n)```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)(?:\r?\n```|$)/g, (match, lang, code) => {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({ lang: (lang || 'code').trim(), code });
    return `\n\n${token}\n\n`;
  });

  // 2. Extract inline code
  const inlineCodes = [];
  processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
    const token = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(escapeHtml(code));
    return token;
  });

  // 3. Process line-by-line for blocks
  const lines = processed.split(/\r?\n/);
  const output = [];
  let inList = null; // 'ul' or 'ol'
  let inBlockquote = false;

  const closeList = () => {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      output.push('</blockquote>');
      inBlockquote = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check code block placeholder
    const codeMatch = trimmed.match(/^__CODE_BLOCK_(\d+)__$/);
    if (codeMatch) {
      closeList();
      closeBlockquote();
      const idx = parseInt(codeMatch[1], 10);
      const cb = codeBlocks[idx];
      const langClass = cb.lang ? ` class="language-${escapeHtml(cb.lang)}"` : '';
      output.push(`<pre><code${langClass}>${escapeHtml(cb.code)}</code></pre>`);
      continue;
    }

    // Blank line
    if (!trimmed) {
      closeList();
      closeBlockquote();
      continue;
    }

    // Headings (# to ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      closeBlockquote();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal Rule (--- or *** or ___)
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      closeList();
      closeBlockquote();
      output.push('<hr>');
      continue;
    }

    // Blockquote (> text)
    const bqMatch = line.match(/^>\s?(.*)$/);
    if (bqMatch) {
      closeList();
      if (!inBlockquote) {
        output.push('<blockquote>');
        inBlockquote = true;
      }
      output.push(`<p>${formatInline(bqMatch[1])}</p>`);
      continue;
    } else {
      closeBlockquote();
    }

    // Unordered list item (- or * or +)
    const ulMatch = line.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        output.push('<ul>');
        inList = 'ul';
      }
      output.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list item (1. 2. etc)
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        output.push('<ol>');
        inList = 'ol';
      }
      output.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    // Regular line / paragraph
    closeList();
    output.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  closeBlockquote();

  let html = output.join('\n');

  // Restore inline codes
  html = html.replace(/__INLINE_CODE_(\d+)__/g, (match, idx) => {
    return `<code>${inlineCodes[parseInt(idx, 10)]}</code>`;
  });

  return html;

  function formatInline(str) {
    let s = escapeHtml(str);
    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => {
      const cleanUrl = url.trim();
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
    });
    // Bold: **text** or __text__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Strikethrough: ~~text~~
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s;
  }
}

/**
 * Pre-processes text to normalize code blocks (e.g. ensure newlines around fences)
 * and closes open code blocks during live token streaming so syntax highlighting
 * displays cleanly while generating.
 */
function normalizeMarkdown(text, isStreaming = false) {
  if (!text) return '';
  let str = text;

  // Ensure code fences start on a fresh line if prefixed by text
  str = str.replace(/([^\n])```/g, '$1\n```');

  // If streaming and an open code fence exists without closure, add temporary closing fence
  if (isStreaming) {
    const fenceMatches = str.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      str = str + '\n```';
    }
  }

  return str;
}

/**
 * Renders raw Markdown text into safe HTML with fallback support
 */
function renderMarkdown(rawText, isStreaming = false) {
  if (!rawText) return '';
  const normalized = normalizeMarkdown(rawText, isStreaming);

  if (typeof marked !== 'undefined') {
    try {
      const parsed = typeof marked.parse === 'function' ? marked.parse(normalized) : marked(normalized);
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(parsed, {
          ADD_ATTR: ['target', 'rel']
        });
      }
      return parsed;
    } catch (err) {
      console.warn('Marked parsing error, using fallback:', err);
    }
  }

  return parseMarkdownFallback(normalized);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Decorates rendered code blocks inside a message container:
 * Adds custom header with language name, copy code button, and syntax highlight.
 */
function enhanceCodeBlocks(container) {
  const preElements = container.querySelectorAll('pre');
  preElements.forEach((pre) => {
    // Avoid double-enhancing
    if (pre.parentElement && pre.parentElement.classList.contains('code-block-container')) return;

    const codeEl = pre.querySelector('code');
    // Use textContent to preserve exact whitespace and line breaks
    const fullCode = codeEl ? codeEl.textContent : pre.textContent;

    // Detect language from class (e.g. class="language-python")
    let lang = 'code';
    if (codeEl) {
      const match = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
      if (match) lang = match[1];

      // Highlight element if hljs is present
      if (typeof hljs !== 'undefined' && !codeEl.dataset.highlighted) {
        try {
          hljs.highlightElement(codeEl);
          codeEl.dataset.highlighted = 'yes';
        } catch (e) {
          try {
            hljs.highlightAuto(codeEl.textContent);
          } catch (_) {}
        }
      }
    }

    // Create wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-container';

    // Header bar
    const header = document.createElement('div');
    header.className = 'code-header';

    const langLabel = document.createElement('span');
    langLabel.className = 'code-lang';
    langLabel.textContent = lang.toUpperCase();

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
    copyBtn.innerHTML = `${ICONS.copy}<span>Copy code</span>`;
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const success = await copyToClipboard(fullCode);
      if (success) {
        copyBtn.innerHTML = `${ICONS.check}<span>Copied!</span>`;
        copyBtn.style.color = 'var(--accent-emerald)';
        setTimeout(() => {
          copyBtn.innerHTML = `${ICONS.copy}<span>Copy code</span>`;
          copyBtn.style.color = '';
        }, 2000);
      } else {
        showToast('Could not copy code to clipboard', 'error');
      }
    });

    header.appendChild(langLabel);
    header.appendChild(copyBtn);

    // Insert into DOM
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

/**
 * Post-processes rendered message bubble: ensures links open safely in a new tab
 */
function postProcessMessageBubble(bubble) {
  if (!bubble) return;
  const links = bubble.querySelectorAll('a');
  links.forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
}

/* ==========================================================================
   Server Health & Network Info
   ========================================================================== */
async function checkServerHealth() {
  try {
    const health = await API.getHealth();
    state.serverInfo = health;

    // Display status and configured access URL
    const indicator = elements.serverStatusCard.querySelector('.status-indicator-dot');
    indicator.className = 'status-indicator-dot online';

    elements.statusTitle.textContent = 'Server Online';
    const displayHost = health.server_host || window.location.hostname;
    const displayPort = health.server_port || window.location.port || '8000';
    elements.statusIp.textContent = `${displayHost}:${displayPort}`;
    elements.disclaimerIp.textContent = `${displayHost}:${displayPort}`;

    const modelToDisplay = health.model || health.llm_model || 'Llama';
    elements.modelName.textContent = modelToDisplay;

    const modeTag = document.getElementById("modeTag");
    if (modeTag) {
      if (health.mode === "local") {
        modeTag.textContent = "LOCAL LLM";
        modeTag.className = "mode-tag mode-live";
      } else if (health.mode === "live") {
        modeTag.textContent = "LIVE LLM";
        modeTag.className = "mode-tag mode-live";
      } else if (health.mode === "unavailable") {
        modeTag.textContent = "OLLAMA OFFLINE";
        modeTag.className = "mode-tag mode-error";
        showToast(health.error || "Ollama is not running or model unavailable", "error");
      } else {
        modeTag.textContent = "MOCK MODE";
        modeTag.className = "mode-tag mode-mock";
      }
    }

  } catch (err) {
    console.warn('Health check warning:', err);
    const indicator = elements.serverStatusCard.querySelector('.status-indicator-dot');
    if (indicator) indicator.className = 'status-indicator-dot offline';
    elements.statusTitle.textContent = 'Offline';
    elements.statusIp.textContent = 'Reconnecting...';
  }
}

/* ==========================================================================
   Conversation Management
   ========================================================================== */
async function loadConversations() {
  try {
    const list = await API.getConversations();
    state.conversations = list;
    renderConversationsList();
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderConversationsList() {
  elements.conversationsList.innerHTML = '';

  if (state.conversations.length === 0) {
    elements.conversationsList.appendChild(elements.emptyHistoryNotice);
    return;
  }

  state.conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = `conversation-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
    item.dataset.id = conv.id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'conversation-title';
    titleSpan.textContent = conv.title || 'Untitled Chat';
    titleSpan.title = conv.title || 'Untitled Chat';

    const actions = document.createElement('div');
    actions.className = 'conversation-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'conv-action-btn';
    deleteBtn.title = 'Delete conversation';
    deleteBtn.innerHTML = ICONS.trash;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteConversation(conv.id);
    });

    actions.appendChild(deleteBtn);
    item.appendChild(titleSpan);
    item.appendChild(actions);

    item.addEventListener('click', () => {
      selectConversation(conv.id);
      closeMobileSidebar();
    });

    elements.conversationsList.appendChild(item);
  });
}

async function selectConversation(convId) {
  if (state.isGenerating) return;
  state.currentConversationId = convId;
  renderConversationsList();

  try {
    const details = await API.getConversation(convId);
    showChatScreen();
    elements.messagesList.innerHTML = '';

    details.messages.forEach((msg) => {
      appendMessage(msg.role, msg.content, false);
    });

    scrollToBottom(true);
  } catch (err) {
    showToast(`Error loading chat: ${err.message}`, 'error');
  }
}

function startNewChat() {
  if (state.isGenerating) return;
  state.currentConversationId = null;
  renderConversationsList();
  elements.messagesList.innerHTML = '';
  showWelcomeScreen();
  elements.messageInput.value = '';
  adjustTextareaHeight();
  elements.messageInput.focus();
  closeMobileSidebar();
}

async function handleDeleteConversation(convId) {
  if (!confirm('Are you sure you want to delete this chat?')) return;
  try {
    await API.deleteConversation(convId);
    state.conversations = state.conversations.filter((c) => c.id !== convId);
    if (state.currentConversationId === convId) {
      startNewChat();
    } else {
      renderConversationsList();
    }
    showToast('Conversation deleted', 'success');
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

async function handleClearAllConversations() {
  if (state.conversations.length === 0) return;
  if (!confirm('Clear all conversation history? This cannot be undone.')) return;
  try {
    await API.clearAllConversations();
    state.conversations = [];
    startNewChat();
    showToast('All conversations cleared', 'success');
  } catch (err) {
    showToast(`Clear failed: ${err.message}`, 'error');
  }
}

/* ==========================================================================
   UI Screen Toggles & Message Rendering
   ========================================================================== */
function showWelcomeScreen() {
  elements.welcomeScreen.style.display = 'flex';
}

function showChatScreen() {
  elements.welcomeScreen.style.display = 'none';
}

function appendMessage(role, content = '', isStreaming = false) {
  showChatScreen();

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.innerHTML = role === 'user' ? ICONS.userAvatar : ICONS.botAvatar;

  const wrapper = document.createElement('div');
  wrapper.className = 'message-content-wrapper';

  const author = document.createElement('div');
  author.className = 'message-author';
  author.textContent = role === 'user' ? 'You' : 'Llama';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content, false);
    enhanceCodeBlocks(bubble);
    postProcessMessageBubble(bubble);
  }

  wrapper.appendChild(author);
  wrapper.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(wrapper);

  elements.messagesList.appendChild(row);
  return { row, bubble };
}

/* ==========================================================================
   Send Message & Streaming Logic
   ========================================================================== */
async function handleSendMessage() {
  const text = elements.messageInput.value.trim();
  if (!text || state.isGenerating) return;

  // Clear and reset textarea
  elements.messageInput.value = '';
  adjustTextareaHeight();
  updateSendButtonState();

  // 1. Append User Message
  appendMessage('user', text);
  scrollToBottom(true);

  // 2. Prepare AI Assistant Message Placeholder
  const { row: aiRow, bubble: aiBubble } = appendMessage('assistant', '', true);
  aiBubble.innerHTML = '<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';

  // 3. Update Generation State
  state.isGenerating = true;
  elements.sendBtn.classList.add('generating');
  elements.sendBtn.disabled = false;
  elements.sendBtn.title = 'Stop generation';

  state.abortController = new AbortController();
  let fullResponseText = '';
  let receivedFirstToken = false;

  await API.streamChat({
    conversationId: state.currentConversationId,
    message: text,
    signal: state.abortController.signal,

    onStart: (data) => {
      if (data.conversation_id && !state.currentConversationId) {
        state.currentConversationId = data.conversation_id;
        loadConversations();
      }
    },

    onToken: (chunk) => {
      if (!receivedFirstToken) {
        receivedFirstToken = true;
        aiBubble.innerHTML = '';
      }
      fullResponseText += chunk;
      aiBubble.innerHTML = renderMarkdown(fullResponseText, true) + '<span class="streaming-cursor"></span>';
      enhanceCodeBlocks(aiBubble);
      postProcessMessageBubble(aiBubble);
      scrollToBottom();
    },

    onDone: (data) => {
      finishGeneration(aiBubble, fullResponseText);
      loadConversations(); // refresh title if updated
    },

    onError: (err) => {
      console.error('Chat error:', err);
      finishGeneration(aiBubble, fullResponseText);
      if (!fullResponseText) {
        aiBubble.innerHTML = `<p style="color: var(--accent-danger);">⚠️ <strong>Error:</strong> ${escapeHtml(err.message)}</p>`;
      }
      showToast(err.message, 'error');
    }
  });
}

function finishGeneration(bubble, finalContent) {
  state.isGenerating = false;
  state.abortController = null;
  elements.sendBtn.classList.remove('generating');
  elements.sendBtn.title = 'Send message';
  updateSendButtonState();

  // Remove streaming cursor and finalize markdown
  bubble.innerHTML = renderMarkdown(finalContent, false);
  enhanceCodeBlocks(bubble);
  postProcessMessageBubble(bubble);
  scrollToBottom();
}

function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
    state.isGenerating = false;
    elements.sendBtn.classList.remove('generating');
    updateSendButtonState();
    showToast('Generation stopped', 'success');
  }
}

/* ==========================================================================
   Scroll Management
   ========================================================================== */
function scrollToBottom(force = false) {
  const container = elements.chatContainer;
  const isScrolledNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

  if (force || isScrolledNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function handleChatScroll() {
  const container = elements.chatContainer;
  const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > 140;
  elements.scrollBottomBtn.style.display = isScrolledUp ? 'flex' : 'none';
}

/* ==========================================================================
   Textarea Auto-Resize & Event Listeners
   ========================================================================== */
function adjustTextareaHeight() {
  const input = elements.messageInput;
  input.style.height = 'auto';
  const newHeight = Math.min(input.scrollHeight, 200);
  input.style.height = `${newHeight}px`;
}

function updateSendButtonState() {
  if (state.isGenerating) {
    elements.sendBtn.disabled = false;
    return;
  }
  const hasText = elements.messageInput.value.trim().length > 0;
  elements.sendBtn.disabled = !hasText;
}

function setupEventListeners() {
  // Input handling
  elements.messageInput.addEventListener('input', () => {
    adjustTextareaHeight();
    updateSendButtonState();
  });

  // Enter to send, Shift+Enter for new line
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!state.isGenerating) {
        handleSendMessage();
      }
    }
  });

  // Send / Stop button click
  elements.sendBtn.addEventListener('click', () => {
    if (state.isGenerating) {
      stopGeneration();
    } else {
      handleSendMessage();
    }
  });

  // New Chat buttons
  elements.newChatBtn.addEventListener('click', startNewChat);
  elements.topNewChatBtn.addEventListener('click', startNewChat);

  // Clear all chats
  elements.clearAllBtn.addEventListener('click', handleClearAllConversations);

  // Prompt suggestion cards
  document.querySelectorAll('.suggestion-card').forEach((card) => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      if (prompt) {
        elements.messageInput.value = prompt;
        adjustTextareaHeight();
        updateSendButtonState();
        handleSendMessage();
      }
    });
  });

  // Scroll events
  elements.chatContainer.addEventListener('scroll', handleChatScroll);
  elements.scrollBottomBtn.addEventListener('click', () => scrollToBottom(true));

  // Mobile sidebar controls
  elements.mobileToggleBtn.addEventListener('click', openMobileSidebar);
  elements.sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
  elements.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
}

function openMobileSidebar() {
  elements.sidebar.classList.add('open');
  elements.sidebarBackdrop.classList.add('active');
}

function closeMobileSidebar() {
  elements.sidebar.classList.remove('open');
  elements.sidebarBackdrop.classList.remove('active');
}

/* ==========================================================================
   Toast Notification Utility
   ========================================================================== */
function showToast(message, type = 'error', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

