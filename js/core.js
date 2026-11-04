/**
 * Cobblemon Wiki - Core Utilities
 */

const Core = {
  // Load JSON with localStorage override capability (useful for instant live preview from Admin)
  async loadJSON(key, defaultPath) {
    // Check if there is an unsaved or cached draft in localStorage first
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
      // Fallback empty structures if file not found
      return null;
    }
  },

  // Save draft state to localStorage for live preview
  saveDraft(key, data) {
    localStorage.setItem('draft_' + key, JSON.stringify(data));
  },

  // Clear drafts
  clearDrafts() {
    ['config', 'commands', 'pokemon', 'guides', 'donate'].forEach(k => {
      localStorage.removeItem('draft_' + k);
    });
  },

  // Clipboard copy with notification toast
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

  // Toast notification
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

  // Initialize common header and branding
  async setupCommonUI() {
    const config = await Core.loadJSON('config', 'data/config.json');
    if (config && config.serverName) {
      document.querySelectorAll('.server-name-target').forEach(el => {
        el.textContent = config.serverName;
      });
    }

    // Highlight active nav item
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Core.setupCommonUI();
});
