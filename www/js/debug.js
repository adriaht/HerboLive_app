// js/debug.js
(function(HL){
  const DEBUG = HL.config.DEBUG_SHOW_RAW;

  HL.debug = HL.debug || {};

  HL.debug.initDebugUI = function initDebugUI() {
    if (!DEBUG) return;
    if (document.getElementById('debug-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.position = 'fixed';
    panel.style.right = '12px';
    panel.style.bottom = '12px';
    panel.style.width = '360px';
    panel.style.maxHeight = '40vh';
    panel.style.overflow = 'auto';
    panel.style.background = 'rgba(255,255,255,0.95)';
    panel.style.border = '1px solid rgba(0,0,0,0.12)';
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    panel.style.borderRadius = '8px';
    panel.style.fontSize = '12px';
    panel.style.zIndex = '99999';
    panel.style.padding = '8px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '6px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const title = document.createElement('strong');
    title.textContent = 'Debug (UI)';
    title.style.fontSize = '13px';
    header.appendChild(title);

    const controls = document.createElement('div');

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Limpiar';
    clearBtn.className = 'btn-flat';
    clearBtn.style.fontSize = '11px';
    clearBtn.style.marginRight = '6px';
    clearBtn.addEventListener('click', () => {
      const body = document.getElementById('debug-body');
      if (body) body.innerHTML = '';
    });
    controls.appendChild(clearBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Ocultar';
    toggleBtn.className = 'btn-flat';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.addEventListener('click', () => {
      const body = document.getElementById('debug-body');
      if (!body) return;
      if (body.style.display === 'none') { body.style.display = 'block'; toggleBtn.textContent = 'Ocultar'; }
      else { body.style.display = 'none'; toggleBtn.textContent = 'Mostrar'; }
    });
    controls.appendChild(toggleBtn);

    header.appendChild(controls);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.id = 'debug-body';
    body.style.overflow = 'auto';
    body.style.maxHeight = 'calc(40vh - 60px)';
    body.style.paddingTop = '6px';
    panel.appendChild(body);

    HL.debug.appendDebugMessage('info', 'Panel de depuración inicializado');
    document.body.appendChild(panel);
  };

  HL.debug.appendDebugMessage = function appendDebugMessage(level, ...args) {
    try {
      if (!HL.config.DEBUG_SHOW_RAW) return;
      const body = document.getElementById('debug-body');
      if (!body) return;

      const ts = new Date().toLocaleTimeString();
      const row = document.createElement('div');
      row.style.marginBottom = '6px';
      row.style.whiteSpace = 'pre-wrap';

      const label = document.createElement('span');
      label.textContent = `[${ts}] ${level.toUpperCase()}: `;
      label.style.fontWeight = '600';
      label.style.color = (level === 'error') ? '#b71c1c' : (level === 'warn' ? '#ff6f00' : '#0b8043');

      const text = document.createElement('span');
      const textParts = args.map(a => {
        try { if (typeof a === 'string') return a; return JSON.stringify(a, null, 2); } catch (e) { try { return String(a); } catch { return '[unserializable]'; } }
      });
      text.textContent = textParts.join(' ');
      row.appendChild(label);
      row.appendChild(text);
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
    } catch (e) { /* silent */ }
  };

  // Hijack console to UI (only if debug active)
  (function hijackConsoleToUI() {
    if (!HL.config.DEBUG_SHOW_RAW) return;
    const original = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console)
    };
    console.log = function(...args) { original.log(...args); HL.debug.appendDebugMessage('log', ...args); };
    console.info = function(...args) { original.info(...args); HL.debug.appendDebugMessage('info', ...args); };
    console.warn = function(...args) { original.warn(...args); HL.debug.appendDebugMessage('warn', ...args); };
    console.error = function(...args) { original.error(...args); HL.debug.appendDebugMessage('error', ...args); };
  })();

})(window.HerboLive);
