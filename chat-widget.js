(function() {

  // ── STATE ──
  var state = {
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    isDragging: false,
    isResizing: false,
    isStreaming: false,
    position: { x: null, y: null },
    size: { w: 420, h: 560 },
    conversations: [],
    currentConversationId: null,
    messages: [],
    messageBuffer: '',
    convDropdownOpen: false,
    hasLoadedOnce: false,
    welcomeHidden: false
  };

  // ── DOM REFS ──
  var els = {};

  // ── TOOL LABELS ──
  var TOOL_LABELS = {
    'get_health_data': 'Checking your health data',
    'get_health_metrics': 'Checking your health metrics',
    'get_meals': 'Analyzing your meals',
    'get_meal_data': 'Analyzing your meals',
    'get_meal_log': 'Pulling your meal history',
    'get_bloodwork': 'Reviewing your bloodwork',
    'get_blood_work': 'Reviewing your bloodwork',
    'get_sleep_data': 'Analyzing your sleep',
    'get_sleep': 'Analyzing your sleep',
    'get_activity': 'Looking at your activity',
    'get_activity_data': 'Looking at your activity',
    'get_fitness_tests': 'Reviewing your fitness tests',
    'get_fitness_data': 'Reviewing your fitness data',
    'get_weight_data': 'Checking your weight history',
    'get_weight': 'Checking your weight history',
    'get_supplements': 'Looking at your supplements',
    'get_user_profile': 'Loading your profile',
    'get_profile': 'Loading your profile',
    'get_documents': 'Reading your documents',
    'get_weekly_insights': 'Pulling your weekly insights',
    'get_health_summary': 'Building your health summary'
  };

  // ── DAILY RDA ──
  var DAILY_RDA = {
    'Vitamin A': { value: 900, unit: 'mcg' },
    'Vitamin C': { value: 90, unit: 'mg' },
    'Vitamin D': { value: 20, unit: 'mcg' },
    'Vitamin E': { value: 15, unit: 'mg' },
    'Vitamin K': { value: 120, unit: 'mcg' },
    'Vitamin B6': { value: 1.3, unit: 'mg' },
    'Vitamin B12': { value: 2.4, unit: 'mcg' },
    'Thiamin': { value: 1.2, unit: 'mg' },
    'Riboflavin': { value: 1.3, unit: 'mg' },
    'Niacin': { value: 16, unit: 'mg' },
    'Folate': { value: 400, unit: 'mcg' },
    'Calcium': { value: 1000, unit: 'mg' },
    'Iron': { value: 18, unit: 'mg' },
    'Magnesium': { value: 420, unit: 'mg' },
    'Zinc': { value: 11, unit: 'mg' },
    'Potassium': { value: 2600, unit: 'mg' },
    'Sodium': { value: 2300, unit: 'mg' },
    'Phosphorus': { value: 700, unit: 'mg' },
    'Selenium': { value: 55, unit: 'mcg' },
    'Copper': { value: 0.9, unit: 'mg' },
    'Manganese': { value: 2.3, unit: 'mg' },
    'Fiber': { value: 28, unit: 'g' }
  };

  // ── INIT ──
  function init() {
    // Cache DOM
    els.fab = document.getElementById('cw-fab');
    els.window = document.getElementById('cw-window');
    els.titlebar = document.getElementById('cw-titlebar');
    els.title = document.getElementById('cw-title');
    els.convToggle = document.getElementById('cw-conv-toggle');
    els.convDropdown = document.getElementById('cw-conv-dropdown');
    els.messages = document.getElementById('cw-messages');
    els.inputArea = document.getElementById('cw-input-area');
    els.textarea = document.getElementById('cw-textarea');
    els.send = document.getElementById('cw-send');
    els.minPill = document.getElementById('cw-min-pill');
    els.btnMin = document.getElementById('cw-btn-min');
    els.btnMax = document.getElementById('cw-btn-max');
    els.btnClose = document.getElementById('cw-btn-close');

    if (!els.window || !els.fab) return; // Not on dashboard page

    // Titlebar buttons
    els.btnClose.addEventListener('click', function() { close(); });
    els.btnMin.addEventListener('click', function() { minimize(); });
    els.btnMax.addEventListener('click', function() { maximize(); });
    els.convToggle.addEventListener('click', function() { toggleConvDropdown(); });
    els.minPill.addEventListener('click', function() { restore(); });
    els.send.addEventListener('click', function() { sendMessage(); });

    // Textarea auto-resize
    els.textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    els.textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && state.isOpen && !state.isMinimized) {
        e.stopPropagation();
        if (state.convDropdownOpen) {
          closeConvDropdown();
        } else {
          minimize();
        }
      }
    });

    // Close conv dropdown when clicking outside
    document.addEventListener('click', function(e) {
      if (state.convDropdownOpen && !e.target.closest('#cw-conv-dropdown') && !e.target.closest('#cw-conv-toggle')) {
        closeConvDropdown();
      }
    });

    // Drag & Resize
    initDrag();
    initResize();

    // Viewport resize
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (state.position.x !== null) {
          state.position.x = Math.min(state.position.x, window.innerWidth - 40);
          state.position.y = Math.max(0, Math.min(state.position.y, window.innerHeight - 40));
          applyPosition();
        }
        if (window.innerWidth < 900 && state.isOpen && !state.isMinimized) {
          state.isMaximized = true;
          els.window.classList.add('maximized');
        }
      }, 150);
    });

    // Load persisted state
    var wasOpen = loadPersistedState();
    applySize();
    applyPosition();

    // Auto-open if was previously open
    if (wasOpen) {
      open();
      if (state.isMinimized) {
        els.window.classList.add('minimized');
      }
    }
  }

  // ── OPEN / CLOSE / TOGGLE ──

  function open(prefillQuestion) {
    state.isOpen = true;
    els.window.classList.remove('hidden');
    els.fab.classList.add('hidden');

    if (!state.hasLoadedOnce) {
      state.hasLoadedOnce = true;
      showWelcome();
      loadConversations().then(function() {
        resumeLastConversation();
      });
    }

    els.textarea.focus();

    if (prefillQuestion) {
      els.textarea.value = prefillQuestion;
      els.textarea.dispatchEvent(new Event('input'));
    }

    persistState();
  }

  function close() {
    state.isOpen = false;
    els.window.classList.add('hidden');
    els.fab.classList.remove('hidden');
    closeConvDropdown();
    persistState();
  }

  function toggle() {
    if (state.isOpen) {
      close();
    } else {
      open();
    }
  }

  // ── MINIMIZE / MAXIMIZE / RESTORE ──

  function minimize() {
    state.isMinimized = true;
    els.window.classList.add('minimized');
    persistState();
  }

  function restore() {
    state.isMinimized = false;
    els.window.classList.remove('minimized');
    els.textarea.focus();
    persistState();
  }

  function maximize() {
    if (state.isMaximized) {
      exitMaximize();
    } else {
      state.isMaximized = true;
      els.window.classList.add('maximized');
      persistState();
    }
  }

  function exitMaximize() {
    state.isMaximized = false;
    els.window.classList.remove('maximized');
    applySize();
    applyPosition();
    persistState();
  }

  // ── OPEN WITH QUESTION ──

  function openWithQuestion(question) {
    open();
    startNewChat();
    els.textarea.value = question;
    els.textarea.dispatchEvent(new Event('input'));
    setTimeout(function() {
      sendMessage();
    }, 100);
  }

  // ── CONVERSATIONS ──

  async function loadConversations() {
    var session = getSession();
    if (!session || !currentUser) return;
    try {
      var data = await supabaseRequest(
        '/rest/v1/conversations?user_id=eq.' + currentUser.id + '&is_archived=eq.false&order=updated_at.desc&limit=30',
        'GET', null, session.access_token
      );
      if (data && !data.error && Array.isArray(data)) {
        state.conversations = data;
      } else {
        state.conversations = [];
      }
      renderConversations();
    } catch (e) {
      console.error('[ChatWidget] loadConversations error:', e);
      state.conversations = [];
      renderConversations();
    }
  }

  function renderConversations() {
    if (!els.convDropdown) return;
    var now = new Date();
    var html = '<div class="cw-conv-list">';
    html += '<button class="cw-conv-new" onclick="HealixChat._startNewChat()">';
    html += '<span style="font-size:14px">+</span> New Chat</button>';

    if (state.conversations.length === 0) {
      html += '<div class="cw-conv-empty">No conversations yet</div>';
    } else {
      for (var i = 0; i < state.conversations.length; i++) {
        var c = state.conversations[i];
        var isActive = c.id === state.currentConversationId;
        var title = c.title || 'New Conversation';
        var time = formatRelativeTime(new Date(c.updated_at), now);
        html += '<div class="cw-conv-item' + (isActive ? ' active' : '') + '" data-id="' + c.id + '" onclick="HealixChat._selectConv(\'' + c.id + '\')">';
        html += '<div class="cw-conv-item-text">';
        html += '<div class="cw-conv-item-title">' + escapeHtml(title) + '</div>';
        html += '<div class="cw-conv-item-time">' + time + '</div>';
        html += '</div>';
        html += '<button class="cw-conv-delete" onclick="event.stopPropagation();HealixChat._deleteConv(\'' + c.id + '\')" title="Delete">&times;</button>';
        html += '</div>';
      }
    }

    html += '</div>';
    els.convDropdown.innerHTML = html;
  }

  async function selectConversation(convId) {
    if (convId === state.currentConversationId) return;
    state.currentConversationId = convId;
    localStorage.setItem('healix_chat_last_conv', convId);
    renderConversations();
    closeConvDropdown();
    await loadMessages(convId);
  }

  async function loadMessages(convId) {
    var session = getSession();
    if (!session) return;
    els.messages.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px">Loading...</div>';
    hideWelcome();
    try {
      var data = await supabaseRequest(
        '/rest/v1/messages?conversation_id=eq.' + convId + '&order=created_at.asc&limit=100&select=role,content,created_at',
        'GET', null, session.access_token
      );
      if (!data || data.error || !Array.isArray(data) || data.length === 0) {
        els.messages.innerHTML = '';
        showWelcome();
        return;
      }
      els.messages.innerHTML = '';
      state.messages = [];
      data.forEach(function(msg) {
        var role = msg.role === 'assistant' ? 'ai' : msg.role;
        if (role === 'user' || role === 'ai') {
          addMessage(role, msg.content, true);
        }
      });
      els.messages.scrollTop = els.messages.scrollHeight;
    } catch (e) {
      console.error('[ChatWidget] loadMessages error:', e);
      els.messages.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px">Failed to load messages.</div>';
    }
  }

  function startNewChat() {
    state.currentConversationId = null;
    localStorage.removeItem('healix_chat_last_conv');
    state.messages = [];
    state.welcomeHidden = false;
    els.messages.innerHTML = '';
    showWelcome();
    renderConversations();
    closeConvDropdown();
    els.textarea.focus();
  }

  async function deleteConversation(convId) {
    var confirmed = await confirmModal('This conversation will be permanently deleted.', { title: 'Delete Conversation', confirmText: 'Delete', danger: true });
    if (!confirmed) return;
    var session = getSession();
    if (!session) return;
    try {
      await supabaseRequest('/rest/v1/messages?conversation_id=eq.' + convId, 'DELETE', null, session.access_token);
      await supabaseRequest('/rest/v1/conversations?id=eq.' + convId, 'DELETE', null, session.access_token);
      state.conversations = state.conversations.filter(function(c) { return c.id !== convId; });
      if (state.currentConversationId === convId) {
        state.currentConversationId = null;
        localStorage.removeItem('healix_chat_last_conv');
        els.messages.innerHTML = '';
        showWelcome();
      }
      renderConversations();
    } catch (e) {
      console.error('[ChatWidget] deleteConversation error:', e);
    }
  }

  async function resumeLastConversation() {
    var lastId = localStorage.getItem('healix_chat_last_conv');
    if (lastId && state.conversations.some(function(c) { return c.id === lastId; })) {
      state.currentConversationId = lastId;
      renderConversations();
      await loadMessages(lastId);
    }
  }

  // ── CONVERSATION DROPDOWN ──

  function toggleConvDropdown() {
    state.convDropdownOpen = !state.convDropdownOpen;
    if (state.convDropdownOpen) {
      els.convDropdown.classList.add('open');
    } else {
      els.convDropdown.classList.remove('open');
    }
  }

  function closeConvDropdown() {
    state.convDropdownOpen = false;
    els.convDropdown.classList.remove('open');
  }

  // ── SEND MESSAGE (SSE STREAMING) ──

  async function sendMessage() {
    var text = els.textarea.value.trim();
    if (!text || state.isStreaming) return;
    state.isStreaming = true;
    hideWelcome();
    addMessage('user', text);
    els.textarea.value = '';
    els.textarea.style.height = 'auto';
    els.send.disabled = true;
    showTyping();

    try {
      var session = getSession();
      if (!session) throw new Error('No session');
      var response = await fetch(SUPABASE_URL + '/functions/v1/chat-with-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          conversation_id: state.currentConversationId,
          user_message: text,
          stream: true,
          ui_metadata: {
            source: 'web',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        })
      });

      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('text/event-stream') !== -1) {
        removeTyping();
        var streamEl = addStreamingMessage();
        var fullContent = '';
        var chartHtml = '';
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        while (true) {
          var result = await reader.read();
          if (result.done) break;
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || ''; // CRITICAL: keep incomplete line in buffer
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            try {
              var evt = JSON.parse(line.slice(6));
              if (evt.type === 'content' && evt.content) {
                fullContent += evt.content;
                updateStreamingMessage(streamEl, chartHtml + fullContent);
              } else if (evt.type === 'start' && evt.conversation_id) {
                state.currentConversationId = evt.conversation_id;
                localStorage.setItem('healix_chat_last_conv', evt.conversation_id);
              } else if (evt.type === 'tool_call') {
                var toolLabel = getToolLabel(evt.tool_name);
                if (!fullContent) {
                  var toolBubble = streamEl.querySelector('.cw-msg-content');
                  if (toolBubble) toolBubble.innerHTML = '<div class="cw-tool-status"><div class="cw-tool-dot"></div>' + escapeHtml(toolLabel) + '</div>';
                }
              } else if (evt.type === 'tool_result') {
                if (evt.chart_data && evt.chart_data.type === 'micronutrient_chart') {
                  var chart = renderNutrientChart(evt.chart_data);
                  if (chart) {
                    chartHtml = chart;
                    updateStreamingMessage(streamEl, chartHtml);
                  }
                }
              } else if (evt.type === 'done') {
                if (evt.conversation_id) {
                  state.currentConversationId = evt.conversation_id;
                  localStorage.setItem('healix_chat_last_conv', evt.conversation_id);
                }
                loadConversations();
              } else if (evt.type === 'error') {
                console.error('[ChatWidget] Stream error:', evt.error);
                if (!fullContent) {
                  fullContent = evt.error || 'Something went wrong. Please try again.';
                  updateStreamingMessage(streamEl, fullContent);
                }
              }
            } catch (pe) { /* skip malformed */ }
          }
        }

        if (!fullContent) fullContent = 'Sorry, I had trouble responding. Please try again.';
        updateStreamingMessage(streamEl, chartHtml + fullContent);
        state.messages.push({ role: 'ai', text: fullContent });
      } else {
        // Non-streaming fallback
        var data = await response.json();
        removeTyping();
        if (data.content) {
          addMessage('ai', data.content);
          if (data.conversation_id) state.currentConversationId = data.conversation_id;
        } else if (data.error) {
          addMessage('ai', 'Error: ' + data.error);
        } else {
          addMessage('ai', 'Sorry, I had trouble responding. Please try again.');
        }
      }
    } catch (e) {
      removeTyping();
      addMessage('ai', 'Something went wrong. Please try again.');
      console.error('[ChatWidget] sendMessage error:', e);
    }

    state.isStreaming = false;
    els.send.disabled = false;
    els.textarea.focus();
  }

  // ── RENDERING ──

  function safeMarkdown(text) {
    var safe = escapeHtml(text);
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function addMessage(role, text, skipAnimation) {
    var el = document.createElement('div');
    el.className = 'cw-msg ' + role;
    if (skipAnimation) el.style.animation = 'none';
    el.innerHTML = '<div class="cw-msg-content">' + safeMarkdown(text) + '</div>';
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
    state.messages.push({ role: role, text: text });
  }

  function addStreamingMessage() {
    var el = document.createElement('div');
    el.className = 'cw-msg ai';
    el.innerHTML = '<div class="cw-msg-content"></div>';
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
    return el;
  }

  function updateStreamingMessage(el, text) {
    var content = el.querySelector('.cw-msg-content');
    if (content) {
      var chartMatch = text.match(/^(<div class="nutrient-chart">[\s\S]*?<\/div><\/div>)([\s\S]*)$/);
      if (chartMatch) {
        content.innerHTML = chartMatch[1] + safeMarkdown(chartMatch[2]);
      } else {
        content.innerHTML = safeMarkdown(text);
      }
      els.messages.scrollTop = els.messages.scrollHeight;
    }
  }

  function showTyping() {
    removeTyping();
    var el = document.createElement('div');
    el.className = 'cw-msg ai';
    el.id = 'cw-typing';
    el.innerHTML = '<div class="cw-msg-content"><div class="cw-typing"><span></span><span></span><span></span></div></div>';
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function removeTyping() {
    var t = document.getElementById('cw-typing');
    if (t) t.remove();
  }

  // ── WELCOME ──

  function showWelcome() {
    state.welcomeHidden = false;
    var firstName = 'there';
    if (typeof currentUser !== 'undefined' && currentUser) {
      var meta = currentUser.user_metadata;
      firstName = (meta && meta.full_name) ? meta.full_name.split(' ')[0] : 'there';
    }
    var greeting = getTimeGreeting();
    els.messages.innerHTML = '<div class="cw-welcome">'
      + '<div class="cw-welcome-title">' + greeting + ', <em>' + escapeHtml(firstName) + '.</em></div>'
      + '<p class="cw-welcome-sub">Ask me anything about your health data.</p>'
      + '<div class="cw-suggestions">'
      + '<span class="cw-suggestion" onclick="HealixChat._useSuggestion(this)">How is my health this week?</span>'
      + '<span class="cw-suggestion" onclick="HealixChat._useSuggestion(this)">Show me micronutrient gaps</span>'
      + '<span class="cw-suggestion" onclick="HealixChat._useSuggestion(this)">What should I focus on?</span>'
      + '</div></div>';
  }

  function hideWelcome() {
    if (!state.welcomeHidden) {
      var w = els.messages.querySelector('.cw-welcome');
      if (w) w.remove();
      state.welcomeHidden = true;
    }
  }

  function getTimeGreeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  // ── TOOL LABELS ──

  function getToolLabel(toolName) {
    if (!toolName) return 'Thinking...';
    if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName] + '...';
    var lower = toolName.toLowerCase();
    for (var key in TOOL_LABELS) {
      if (lower.indexOf(key.replace('get_', '')) !== -1) return TOOL_LABELS[key] + '...';
    }
    var label = toolName.replace(/_/g, ' ').replace(/^get /, '');
    return 'Pulling ' + label + '...';
  }

  // ── NUTRIENT CHART ──

  function renderNutrientChart(chartData) {
    var micros = chartData.micronutrient_totals;
    if (!micros || Object.keys(micros).length === 0) return null;
    var period = chartData.period || 'this week';
    var mealCount = chartData.meal_count || 0;
    var days = 1;
    if (typeof period === 'string' && period.indexOf(' to ') !== -1) {
      var parts = period.split(' to ');
      var d1 = new Date(parts[0]);
      var d2 = new Date(parts[1]);
      days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    }
    var rows = [];
    for (var name in micros) {
      var entry = micros[name];
      var dailyAvg = entry.value / days;
      var rdaMatch = null;
      for (var rdaName in DAILY_RDA) {
        if (name.toLowerCase().indexOf(rdaName.toLowerCase()) !== -1 || rdaName.toLowerCase().indexOf(name.toLowerCase()) !== -1) {
          rdaMatch = DAILY_RDA[rdaName];
          break;
        }
      }
      if (!rdaMatch) continue;
      var pct = Math.round((dailyAvg / rdaMatch.value) * 100);
      var status = pct >= 80 && pct <= 120 ? 'adequate' : pct < 80 ? 'low' : pct > 150 ? 'excess' : 'high';
      rows.push({ name: name, pct: pct, status: status });
    }
    if (rows.length === 0) return null;
    rows.sort(function(a, b) { return a.pct - b.pct; });
    var html = '<div class="nutrient-chart">';
    html += '<div class="nutrient-chart-title">Daily Micronutrient Intake vs RDA (' + mealCount + ' meals, ' + days + ' day' + (days > 1 ? 's' : '') + ')</div>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var barWidth = Math.min(r.pct, 200);
      html += '<div class="nutrient-row"><div class="nutrient-label">' + r.name + '</div><div class="nutrient-bar-track"><div class="nutrient-bar-fill ' + r.status + '" style="width:' + (barWidth / 2) + '%"></div><div class="nutrient-rda-line" style="left:50%"></div></div><div class="nutrient-pct">' + r.pct + '%</div></div>';
    }
    html += '<div class="nutrient-legend">';
    html += '<div class="nutrient-legend-item"><div class="nutrient-legend-swatch" style="background:var(--down)"></div>Low</div>';
    html += '<div class="nutrient-legend-item"><div class="nutrient-legend-swatch" style="background:var(--gold)"></div>OK</div>';
    html += '<div class="nutrient-legend-item"><div class="nutrient-legend-swatch" style="background:var(--info)"></div>Above</div>';
    html += '<div class="nutrient-legend-item"><div class="nutrient-legend-swatch" style="background:var(--warn)"></div>Excess</div>';
    html += '</div></div>';
    return html;
  }

  // ── RELATIVE TIME ──

  function formatRelativeTime(date, now) {
    var diffMs = now - date;
    var diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + 'm ago';
    var diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours + 'h ago';
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return diffDays + 'd ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ── DRAG SYSTEM ──

  function initDrag() {
    var offsetX = 0;
    var offsetY = 0;

    function onMouseDown(e) {
      if (e.target.closest('.cw-btn') || e.target.closest('button')) return;
      if (state.isMaximized) {
        exitMaximize();
      }
      state.isDragging = true;
      var rect = els.window.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!state.isDragging) return;
      requestAnimationFrame(function() {
        var x = e.clientX - offsetX;
        var y = e.clientY - offsetY;
        var maxX = window.innerWidth - 40;
        var maxY = window.innerHeight - 40;
        x = Math.max(-state.size.w + 40, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        state.position.x = x;
        state.position.y = y;
        applyPosition();
      });
    }

    function onMouseUp() {
      if (!state.isDragging) return;
      state.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      snapToEdge();
      persistState();
    }

    els.titlebar.addEventListener('mousedown', onMouseDown);

    // Touch support
    els.titlebar.addEventListener('touchstart', function(e) {
      if (e.target.closest('.cw-btn') || e.target.closest('button')) return;
      var touch = e.touches[0];
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, target: e.target, preventDefault: function() {} });

      function onTouchMove(te) {
        var t = te.touches[0];
        onMouseMove({ clientX: t.clientX, clientY: t.clientY });
      }
      function onTouchEnd() {
        onMouseUp();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      }
      document.addEventListener('touchmove', onTouchMove, { passive: true });
      document.addEventListener('touchend', onTouchEnd);
    }, { passive: true });
  }

  // ── SNAP TO EDGE ──

  function snapToEdge() {
    var SNAP = 20;
    var sidebarW = window.innerWidth >= 900 ? 220 : 0;
    if (state.position.x !== null) {
      if (state.position.x < sidebarW + SNAP) state.position.x = sidebarW;
      if (state.position.x + state.size.w > window.innerWidth - SNAP) {
        state.position.x = window.innerWidth - state.size.w;
      }
    }
    if (state.position.y !== null) {
      if (state.position.y < SNAP) state.position.y = 0;
      if (state.position.y + state.size.h > window.innerHeight - SNAP) {
        state.position.y = window.innerHeight - state.size.h;
      }
    }
    applyPosition();
  }

  // ── RESIZE SYSTEM ──

  function initResize() {
    var handles = els.window.querySelectorAll('.cw-resize-handle');
    handles.forEach(function(handle) {
      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.isMaximized) exitMaximize();
        state.isResizing = true;
        var dir = handle.getAttribute('data-handle');
        var startX = e.clientX;
        var startY = e.clientY;
        var startRect = els.window.getBoundingClientRect();
        var startW = state.size.w;
        var startH = state.size.h;
        var startPosX = state.position.x !== null ? state.position.x : startRect.left;
        var startPosY = state.position.y !== null ? state.position.y : startRect.top;

        function onMove(me) {
          requestAnimationFrame(function() {
            var dx = me.clientX - startX;
            var dy = me.clientY - startY;
            var newW = startW;
            var newH = startH;
            var newX = startPosX;
            var newY = startPosY;

            if (dir.indexOf('e') !== -1) newW = startW + dx;
            if (dir.indexOf('w') !== -1) { newW = startW - dx; newX = startPosX + dx; }
            if (dir.indexOf('s') !== -1) newH = startH + dy;
            if (dir.indexOf('n') !== -1) { newH = startH - dy; newY = startPosY + dy; }

            // Clamp size
            newW = Math.max(320, Math.min(newW, 800));
            newH = Math.max(400, Math.min(newH, window.innerHeight - 40));

            // Adjust position if width/height were clamped on w/n edges
            if (dir.indexOf('w') !== -1) newX = startPosX + startW - newW;
            if (dir.indexOf('n') !== -1) newY = startPosY + startH - newH;

            state.size.w = newW;
            state.size.h = newH;
            state.position.x = newX;
            state.position.y = newY;
            applySize();
            applyPosition();
          });
        }

        function onUp() {
          state.isResizing = false;
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          persistState();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  // ── POSITION / SIZE ──

  function applyPosition() {
    if (state.position.x !== null && state.position.y !== null) {
      els.window.style.left = state.position.x + 'px';
      els.window.style.top = state.position.y + 'px';
      els.window.style.right = 'auto';
      els.window.style.bottom = 'auto';
    } else {
      els.window.style.left = '';
      els.window.style.top = '';
      els.window.style.right = '24px';
      els.window.style.bottom = '24px';
    }
  }

  function applySize() {
    if (!state.isMaximized) {
      els.window.style.width = state.size.w + 'px';
      els.window.style.height = state.size.h + 'px';
    }
  }

  // ── PERSISTENCE ──

  function persistState() {
    try {
      localStorage.setItem('healix_chat_widget', JSON.stringify({
        position: state.position,
        size: state.size,
        isMinimized: state.isMinimized,
        isMaximized: state.isMaximized,
        wasOpen: state.isOpen
      }));
    } catch (e) {}
  }

  function loadPersistedState() {
    try {
      var saved = localStorage.getItem('healix_chat_widget');
      if (saved) {
        var data = JSON.parse(saved);
        if (data.position) state.position = data.position;
        if (data.size) state.size = data.size;
        if (data.isMinimized) state.isMinimized = data.isMinimized;
        if (data.isMaximized) state.isMaximized = data.isMaximized;
        return data.wasOpen || false;
      }
    } catch (e) {}
    return false;
  }

  // ── PUBLIC API ──
  window.HealixChat = {
    open: function(prefill) { open(prefill); },
    close: function() { close(); },
    toggle: function() { toggle(); },
    minimize: function() { minimize(); },
    isOpen: function() { return state.isOpen; },
    openWithQuestion: function(q) { openWithQuestion(q); },
    _useSuggestion: function(el) {
      els.textarea.value = el.textContent;
      els.textarea.dispatchEvent(new Event('input'));
      els.textarea.focus();
    },
    _startNewChat: function() { startNewChat(); },
    _selectConv: function(id) { selectConversation(id); },
    _deleteConv: function(id) { deleteConversation(id); }
  };

  // ── BOOT ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
