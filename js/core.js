/**
 * Cobblemon Wiki - Core Utilities
 */

const Core = {
  // Load JSON with localStorage override capability (useful for instant live preview from Admin)
  async loadJSON(key, defaultPath) {
    const cached = localStorage.getItem('draft_' + key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.warn('Draft parse error:', e);
      }
    }

    try {
      const res = await fetch(defaultPath + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Could not fetch ${defaultPath}:`, err);
      return null;
    }
  },

  saveDraft(key, data) {
    localStorage.setItem('draft_' + key, JSON.stringify(data));
  },

  clearDrafts() {
    ['config', 'commands', 'pokemon', 'guides', 'donate'].forEach(k => {
      localStorage.removeItem('draft_' + k);
    });
  },

  copyText(text, successMsg = '已複製到剪貼簿！') {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        Core.showToast(successMsg);
      }).catch(() => {
        Core.fallbackCopy(text, successMsg);
      });
    } else {
      Core.fallbackCopy(text, successMsg);
    }
  },

  fallbackCopy(text, successMsg) {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      Core.showToast(successMsg);
    } catch (err) {
      alert('複製失敗，請手動複製：' + text);
    }
    document.body.removeChild(input);
  },

  showToast(message) {
    let toast = document.getElementById('site-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'site-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  },

  async setupCommonUI() {
    const config = await Core.loadJSON('config', 'data/config.json');
    if (config && config.serverName) {
      document.querySelectorAll('.server-name-target').forEach(el => {
        el.textContent = config.serverName;
      });
    }

    // Clean URLs handling: On web/Vercel (http/https), strip .html from navigation links
    const isWeb = window.location.protocol.startsWith('http');
    if (isWeb) {
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && href.endsWith('.html') && !href.startsWith('http') && !href.startsWith('//')) {
          if (href === 'index.html') {
            a.setAttribute('href', './');
          } else {
            a.setAttribute('href', href.replace(/\.html$/, ''));
          }
        }
      });
    }

    // Highlight active nav item
    const rawPath = window.location.pathname.split('/').pop() || '';
    const currentRoute = rawPath.replace(/\.html$/, '');

    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href') || '';
      const cleanHref = href.split('/').pop().replace(/\.html$/, '');
      if (cleanHref === currentRoute || (currentRoute === '' && (cleanHref === '' || cleanHref === 'index'))) {
        link.classList.add('active');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Core.setupCommonUI();
});
