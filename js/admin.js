/**
 * Cobblemon Admin Dashboard Logic
 * High-performance, offline-first admin controller with Direct Local File System Access API
 */

function escapeHTML(str) {
  return String(str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}
function escapeAttr(str) {
  return escapeHTML(str);
}

/* ================= File System Access API Module ================= */
const FS = {
  dirHandle: null,
  isSupported: ('showDirectoryPicker' in window),

  async init() {
    this.bindUI();

    if (!this.isSupported) {
      this.updateStatus(false, '瀏覽器不支援本機寫入（建議使用 Chrome / Edge）');
      return;
    }

    try {
      const storedHandle = await this.getStoredHandle();
      if (storedHandle) {
        this.dirHandle = storedHandle;
        const perm = await this.dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          this.updateStatus(true);
        } else {
          this.updateStatus(false, '已記住專案資料夾，點擊按鈕授權連線');
        }
      } else {
        this.updateStatus(false, '未連結本機專案資料夾');
      }
    } catch (e) {
      console.warn('FS init error:', e);
      this.updateStatus(false, '未連結本機專案資料夾');
    }
  },

  bindUI() {
    const connectBtn = document.getElementById('btn-fs-connect');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.connect());
    }

    const syncBtn = document.getElementById('btn-fs-sync-all');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => Admin.saveCurrent());
    }
  },

  async openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('CobblemonAdminDB', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('handles')) {
          req.result.createObjectStore('handles');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async storeHandle(handle) {
    try {
      const db = await this.openIDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'projectDir');
    } catch (e) {
      console.warn('Store handle error:', e);
    }
  },

  async getStoredHandle() {
    try {
      const db = await this.openIDB();
      return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('projectDir');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  async connect() {
    if (!this.isSupported) {
      alert('您的瀏覽器不支援本機檔案直接寫入 API（建議使用 Google Chrome 或 Microsoft Edge）。您仍可透過「打包匯出 ZIP」下載檔案。');
      return false;
    }
    try {
      // If we have a remembered handle that needs permission authorization on page load:
      if (this.dirHandle) {
        const queryPerm = await this.dirHandle.queryPermission({ mode: 'readwrite' });
        if (queryPerm !== 'granted') {
          const perm = await this.dirHandle.requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') {
            this.updateStatus(true);
            Core.showToast(`✅ 已授權連線至資料夾: ${this.dirHandle.name}`);
            return true;
          }
        }
      }

      // If already granted (user clicked "🔄 切換資料夾") or no handle stored:
      // Always open native directory picker dialog!
      const newHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      this.dirHandle = newHandle;
      await this.storeHandle(this.dirHandle);
      this.updateStatus(true);
      Core.showToast(`🎉 已成功切換並連結專案資料夾: ${this.dirHandle.name}`);
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Pick directory error:', err);
        alert('選取資料夾時發生錯誤: ' + err.message);
      }
      return false;
    }
  },

  async disconnect() {
    this.dirHandle = null;
    this.isConnected = false;
    try {
      const db = await this.openIDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete('projectDir');
    } catch (e) {}
    this.updateStatus(false, '已解除資料夾連結');
    Core.showToast('⚪ 已解除本機資料夾連結');
  },

  updateStatus(isConnected, note = '') {
    this.isConnected = !!isConnected;
    const badge = document.getElementById('fs-status-badge');
    const btn = document.getElementById('btn-fs-connect');
    const disconnectBtn = document.getElementById('btn-fs-disconnect');
    const syncBtn = document.getElementById('btn-fs-sync-all');

    if (isConnected && this.dirHandle) {
      if (badge) {
        badge.className = 'fs-badge fs-connected';
        badge.innerHTML = `🟢 已連結本機: <strong>${escapeAttr(this.dirHandle.name)}</strong>`;
      }
      if (btn) {
        btn.textContent = '🔄 切換資料夾';
      }
      if (disconnectBtn) {
        disconnectBtn.style.display = 'inline-flex';
      }
      if (syncBtn) {
        syncBtn.style.display = 'inline-flex';
      }
    } else {
      if (badge) {
        badge.className = 'fs-badge fs-disconnected';
        badge.textContent = `⚪ ${note || '未連結專案資料夾 (修改僅暫存於瀏覽器)'}`;
      }
      if (btn) {
        btn.textContent = '📁 連結本機專案資料夾';
      }
      if (disconnectBtn) {
        disconnectBtn.style.display = 'none';
      }
      if (syncBtn) {
        syncBtn.style.display = 'none';
      }
    }
  },

  async writeFile(pathParts, content) {
    if (!this.dirHandle) return false;
    try {
      let current = this.dirHandle;
      for (let i = 0; i < pathParts.length - 1; i++) {
        current = await current.getDirectoryHandle(pathParts[i], { create: true });
      }
      const filename = pathParts[pathParts.length - 1];
      const fileHandle = await current.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      console.error('Write file error:', pathParts, err);
      return false;
    }
  },

  async saveGuideImage(file) {
    if (!this.dirHandle) {
      const want = confirm('尚未連結本機專案資料夾！\n\n是否立即選取您的網站資料夾（例如 Desktop/gtip）？\n連結後圖片將會自動存入 images/guides 資料夾！');
      if (want) {
        const ok = await this.connect();
        if (!ok) return null;
      } else {
        return null;
      }
    }

    try {
      const extMatch = file.name ? file.name.split('.').pop().toLowerCase() : 'png';
      const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extMatch) ? extMatch : 'png';
      const filename = `guide_${Date.now()}.${ext}`;
      const pathParts = ['images', 'guides', filename];

      const ok = await this.writeFile(pathParts, file);
      if (ok) {
        return `images/guides/${filename}`;
      }
      return null;
    } catch (err) {
      console.error('Save guide image error:', err);
      alert('儲存圖片至本機時失敗: ' + err.message);
      return null;
    }
  },

  async syncAll(data) {
    if (!this.dirHandle) {
      const want = confirm('尚未連結本機專案資料夾！\n\n點擊「確定」選取您的專案資料夾 (Desktop/gtip)，即可直接將變更寫入硬碟檔案。');
      if (want) {
        const ok = await this.connect();
        if (!ok) return false;
      } else {
        return false;
      }
    }

    try {
      Core.showToast('⏳ 正在同步寫入檔案至硬碟...');

      // 1. config.json
      await this.writeFile(['data', 'config.json'], JSON.stringify(data.config || {}, null, 2));
      // 2. announcements.json
      await this.writeFile(['data', 'announcements.json'], JSON.stringify(data.announcements || [], null, 2));
      // 3. commands.json
      await this.writeFile(['data', 'commands.json'], JSON.stringify(data.commands || [], null, 2));
      // 4. guides.json
      await this.writeFile(['data', 'guides.json'], JSON.stringify(data.guides || [], null, 2));
      // 5. donate.json
      await this.writeFile(['data', 'donate.json'], JSON.stringify(data.donate || {}, null, 2));
      // 5.5 beginner.json
      if (data.beginner) {
        await this.writeFile(['data', 'beginner.json'], JSON.stringify(data.beginner, null, 2));
      }

      // 6. poke.json
      if (data.pokemon && data.pokemon.length > 0) {
        await this.writeFile(['data', 'poke.json'], JSON.stringify(data.pokemon, null, 2));
      }

      // 7. database.js (Offline bundled cache)
      const dbContent = '// Auto-generated offline database cache\n' +
        'window.INITIAL_DATABASE = {\n' +
        '  config: ' + JSON.stringify(data.config || {}, null, 2) + ',\n' +
        '  announcements: ' + JSON.stringify(data.announcements || [], null, 2) + ',\n' +
        '  commands: ' + JSON.stringify(data.commands || [], null, 2) + ',\n' +
        '  guides: ' + JSON.stringify(data.guides || [], null, 2) + ',\n' +
        '  donate: ' + JSON.stringify(data.donate || {}, null, 2) + ',\n' +
        '  beginner: ' + JSON.stringify(data.beginner || {}, null, 2) + ',\n' +
        '  poke: ' + JSON.stringify(data.pokemon || []) + '\n' +
        '};\n';
      await this.writeFile(['data', 'database.js'], dbContent);

      Core.showToast('🎉 資料已成功同步寫入本機硬碟檔案！');
      return true;
    } catch (err) {
      console.error('syncAll error:', err);
      alert('寫入檔案時發生錯誤: ' + err.message);
      return false;
    }
  }
};

/* ================= Main Admin Controller ================= */
const Admin = {
  data: {
    config: {},
    announcements: [],
    commands: [],
    pokemon: [],
    guides: [],
    donate: { packages: [] }
  },

  pokePage: 1,
  pokePageSize: 20,
  pokeSearchQuery: '',
  expandedCommandIndices: new Set(),
  draggedCmdIndex: null,

  // Commands Grouping & Categories
  commandsViewMode: 'category', // 'category' or 'time'
  commandCategories: ['個人功能', '社交', '任務/獎勵', '領地', 'Home系統', '經濟', '傳送', 'VIP專屬'],
  commandCategoryMeta: {
    '個人功能': { icon: '🎮', label: '個人功能' },
    '社交': { icon: '💬', label: '社交' },
    '任務/獎勵': { icon: '🎁', label: '任務/獎勵' },
    '領地': { icon: '🏕️', label: '領地' },
    'Home系統': { icon: '🏠', label: 'Home系統' },
    '經濟': { icon: '💰', label: '經濟' },
    '傳送': { icon: '🧭', label: '傳送' },
    'VIP專屬': { icon: '👑', label: 'VIP專屬' }
  },
  // Requirement: Default all categories collapsed in admin
  expandedAdminCategories: new Set(),

  initCommandCategories() {
    const defaultCategories = [
      { name: '個人功能', icon: '🎮' },
      { name: '社交', icon: '💬' },
      { name: '任務/獎勵', icon: '🎁' },
      { name: '領地', icon: '🏕️' },
      { name: 'Home系統', icon: '🏠' },
      { name: '經濟', icon: '💰' },
      { name: '傳送', icon: '🧭' },
      { name: 'VIP專屬', icon: '👑' }
    ];

    if (!this.data.config.commandCategories || !Array.isArray(this.data.config.commandCategories) || this.data.config.commandCategories.length === 0) {
      this.data.config.commandCategories = defaultCategories;
    }

    this.commandCategories = [];
    this.commandCategoryMeta = {};

    this.data.config.commandCategories.forEach(cat => {
      this.commandCategories.push(cat.name);
      this.commandCategoryMeta[cat.name] = { icon: cat.icon || '📌', label: cat.name };
    });

    if (this.data.commands && Array.isArray(this.data.commands)) {
      this.data.commands.forEach(cmd => {
        if (cmd.category && !this.commandCategoryMeta[cmd.category]) {
          this.commandCategories.push(cmd.category);
          this.commandCategoryMeta[cmd.category] = { icon: '📌', label: cmd.category };
          this.data.config.commandCategories.push({ name: cmd.category, icon: '📌' });
        }
      });
    }
  },

  async init() {
    this.setupTabs();
    this.setupFloatingToolbar();

    // Clear stale drafts from previous mock data session
    if (localStorage.getItem('admin_draft_cleaned_v2') !== 'done') {
      Core.clearDrafts();
      localStorage.setItem('admin_draft_cleaned_v2', 'done');
    }

    // 1. Load initial data
    this.data.config = await Core.loadJSON('config', 'data/config.json') || {};
    this.data.announcements = await Core.loadJSON('announcements', 'data/announcements.json') || [];
    this.data.commands = await Core.loadJSON('commands', 'data/commands.json') || [];
    if (Array.isArray(this.data.commands)) {
      this.data.commands.forEach(c => {
        if (c.category === '常用' || c.category === '個人' || !c.category) {
          if (c.permission && c.permission.includes('VIP')) {
            c.category = 'VIP專屬';
          } else {
            c.category = '個人功能';
          }
        }
      });
    }
    this.initCommandCategories();

    // Load Pokédex data (supports poke.json with 1,000+ Cobblemon entries)
    let pList = await Core.loadJSON('poke', 'data/poke.json');
    if (!pList || pList.length === 0) {
      pList = await Core.loadJSON('pokemon', 'data/pokemon.json') || [];
    }
    this.data.pokemon = pList;

    this.data.guides = await Core.loadJSON('guides', 'data/guides.json') || [];
    this.data.beginner = await Core.loadJSON('beginner', 'data/beginner.json') || null;
    this.data.donate = await Core.loadJSON('donate', 'data/donate.json') || { packages: [] };

    // 2. Render all panels
    this.renderConfigForm();
    this.renderAnnouncementsList();
    this.renderCommandsList();
    this.renderPokemonList();
    this.renderGuidesList();
    this.renderBeginnerPanel();
    this.renderDonateList();
    this.setupExportActions();

    // 3. Initialize File System Access handler
    await FS.init();
  },

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        const panel = document.getElementById(target);
        if (panel) panel.classList.add('active');
      });
    });
  },

  async saveCurrent() {
    this.syncConfig();
    if (this.data.beginner) {
      Core.saveDraft('beginner', this.data.beginner);
    }
    await FS.syncAll(this.data);
  },

  /* ================= 1. Config Section ================= */
  renderConfigForm() {
    const c = this.data.config || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('cfg-serverName', c.serverName);
    setVal('cfg-tagline', c.tagline);

    ['cfg-serverName', 'cfg-tagline'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.oninput = () => this.syncConfig();
      }
    });

    this.renderQuickNavConfig();
  },

  renderQuickNavConfig() {
    const container = document.getElementById('cfg-quicknav-container');
    if (!container) return;
    container.innerHTML = '';

    const defaultQuickNav = [
      { icon: '🔰', title: '新手入門專區', desc: '鍵盤快捷鍵對照、從零開始的冒險開局與領地防護教學。', link: 'beginner.html' },
      { icon: '⌨️', title: '指令速查手冊', desc: '寶可夢指令、領地操作、實用快捷功能一鍵複製。', link: 'commands.html' },
      { icon: '📖', title: 'Cobblemon 圖鑑', desc: '查詢 1,000+ 隻寶可夢擊敗掉落物機率、群系加成與立繪。', link: 'pokedex.html' },
      { icon: '🧭', title: '進階攻略指南', desc: '精靈球製作、牧場繁育、努力值培育等實用教學。', link: 'guides.html' }
    ];

    if (!this.data.config.quickNav || !Array.isArray(this.data.config.quickNav) || this.data.config.quickNav.length < 4) {
      this.data.config.quickNav = defaultQuickNav;
    }

    const pageOptions = [
      { val: 'beginner.html', label: '🔰 新手專區 (beginner.html)' },
      { val: 'commands.html', label: '⌨️ 指令速查 (commands.html)' },
      { val: 'pokedex.html', label: '📖 寶可夢圖鑑 (pokedex.html)' },
      { val: 'type-chart.html', label: '⚔️ 屬性相剋 (type-chart.html)' },
      { val: 'guides.html', label: '🧭 攻略專區 (guides.html)' },
      { val: 'donate.html', label: '💖 贊助支持 (donate.html)' }
    ];

    this.data.config.quickNav.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #ffffff;';

      const optHtml = pageOptions.map(p => 
        `<option value="${p.val}" ${item.link === p.val ? 'selected' : ''}>${p.label}</option>`
      ).join('');

      card.innerHTML = `
        <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 0.75rem; color: var(--primary-text); display: flex; align-items: center; justify-content: space-between;">
          <span>📌 第 ${idx + 1} 個導覽鍵</span>
        </div>
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.8rem;">按鈕圖示 (Emoji / 圖示)</label>
          <input type="text" class="form-control" style="font-size: 1.1rem; width: 80px;" value="${escapeAttr(item.icon || '')}" oninput="Admin.updateQuickNavItem(${idx}, 'icon', this.value)">
        </div>
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.8rem;">按鈕標題</label>
          <input type="text" class="form-control" value="${escapeAttr(item.title || '')}" oninput="Admin.updateQuickNavItem(${idx}, 'title', this.value)">
        </div>
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.8rem;">副簡介說明</label>
          <input type="text" class="form-control" value="${escapeAttr(item.desc || '')}" oninput="Admin.updateQuickNavItem(${idx}, 'desc', this.value)">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">點擊跳轉頁面</label>
          <select class="form-control" onchange="Admin.updateQuickNavItem(${idx}, 'link', this.value)">
            ${optHtml}
          </select>
        </div>
      `;
      container.appendChild(card);
    });
  },

  updateQuickNavItem(idx, field, value) {
    if (this.data.config.quickNav && this.data.config.quickNav[idx]) {
      this.data.config.quickNav[idx][field] = value.trim();
      Core.saveDraft('config', this.data.config);
    }
  },

  syncConfig() {
    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    this.data.config.serverName = getVal('cfg-serverName') || 'CobblemonOasis 綠洲';
    this.data.config.tagline = getVal('cfg-tagline');
    Core.saveDraft('config', this.data.config);
  },

  /* ================= 2. Announcements Section ================= */
  renderAnnouncementsList() {
    const container = document.getElementById('admin-announcements-list');
    if (!container) return;
    container.innerHTML = '';

    if (!this.data.announcements || this.data.announcements.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何公告，點擊上方「＋ 新增公告」建立第一則動態。</div>';
      return;
    }

    this.data.announcements.forEach((a, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';
      item.innerHTML = `
        <div class="item-toolbar">
          <span class="item-index">公告 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteAnnouncement(${idx})">刪除</button>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex: 2;">
            <label class="form-label">公告標題</label>
            <input type="text" class="form-control" value="${escapeAttr(a.title || '')}" oninput="Admin.updateAnnouncement(${idx}, 'title', this.value)" placeholder="例如: 伺服器賽季更新與福利發放">
          </div>
          <div class="form-group" style="max-width: 140px;">
            <label class="form-label">分類標籤</label>
            <select class="form-control" onchange="Admin.updateAnnouncement(${idx}, 'category', this.value)">
              <option value="重要" ${a.category === '重要' ? 'selected' : ''}>重要</option>
              <option value="更新" ${a.category === '更新' ? 'selected' : ''}>更新</option>
              <option value="活動" ${a.category === '活動' ? 'selected' : ''}>活動</option>
              <option value="公告" ${a.category === '公告' ? 'selected' : ''}>公告</option>
            </select>
          </div>
          <div class="form-group" style="max-width: 160px;">
            <label class="form-label">發布日期</label>
            <input type="date" class="form-control" value="${escapeAttr(a.date || '')}" onchange="Admin.updateAnnouncement(${idx}, 'date', this.value)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">公告內容</label>
          <textarea class="form-control" style="min-height: 80px;" oninput="Admin.updateAnnouncement(${idx}, 'content', this.value)">${escapeAttr(a.content || '')}</textarea>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
          <input type="checkbox" id="ann-pin-${idx}" ${a.pinned ? 'checked' : ''} onchange="Admin.updateAnnouncement(${idx}, 'pinned', this.checked)">
          <label for="ann-pin-${idx}" style="font-size: 0.88rem; font-weight: 700; cursor: pointer; color: var(--accent-red);">📌 置頂於首頁最上方</label>
        </div>
      `;
      container.appendChild(item);
    });
  },

  addAnnouncement() {
    const today = new Date().toISOString().slice(0, 10);
    this.data.announcements.unshift({
      title: '新公告標題',
      category: '重要',
      date: today,
      pinned: false,
      content: '請在此輸入公告詳細內容說明。'
    });
    this.renderAnnouncementsList();
    Core.saveDraft('announcements', this.data.announcements);
    Core.showToast('已新增一則公告');
  },

  updateAnnouncement(idx, field, val) {
    if (this.data.announcements[idx]) {
      this.data.announcements[idx][field] = val;
      Core.saveDraft('announcements', this.data.announcements);
    }
  },

  deleteAnnouncement(idx) {
    if (confirm('確定刪除這則公告嗎？')) {
      this.data.announcements.splice(idx, 1);
      this.renderAnnouncementsList();
      Core.saveDraft('announcements', this.data.announcements);
    }
  },

  /* ================= 3. Commands Section ================= */
  setCommandsViewMode(mode) {
    this.commandsViewMode = mode;
    const catBtn = document.getElementById('btn-cmd-view-cat');
    const timeBtn = document.getElementById('btn-cmd-view-time');
    if (catBtn && timeBtn) {
      if (mode === 'category') {
        catBtn.style.background = 'var(--primary)';
        catBtn.style.color = '#fff';
        timeBtn.style.background = 'transparent';
        timeBtn.style.color = 'var(--text-main)';
      } else {
        timeBtn.style.background = 'var(--primary)';
        timeBtn.style.color = '#fff';
        catBtn.style.background = 'transparent';
        catBtn.style.color = 'var(--text-main)';
      }
    }
    this.renderCommandsList();
  },

  toggleAdminCategory(cat) {
    if (this.expandedAdminCategories.has(cat)) {
      this.expandedAdminCategories.delete(cat);
    } else {
      this.expandedAdminCategories.add(cat);
    }
    this.renderCommandsList();
  },

  promptAddCommandCategory() {
    const catName = prompt('請輸入新分類名稱 (例如: 抽獎系統、公會、釣魚):');
    if (!catName || !catName.trim()) return;
    const trimmed = catName.trim();

    if (this.commandCategories.includes(trimmed)) {
      Core.showToast(`⚠️ 分類「${trimmed}」已存在！`);
      return;
    }

    const icon = prompt(`請輸入「${trimmed}」代表的 Emoji 圖示 (例如: 🎰, 🛡️, 🎣, 🎪, 📦):`, '📌') || '📌';

    if (!this.data.config.commandCategories) {
      this.data.config.commandCategories = [];
    }

    this.data.config.commandCategories.push({
      name: trimmed,
      icon: icon.trim()
    });

    this.initCommandCategories();
    // Auto expand the new category so the user sees it immediately
    this.expandedAdminCategories.add(trimmed);
    this.renderCommandsList();

    Core.saveDraft('config', this.data.config);
    Core.showToast(`✅ 已新增分類 [ ${icon.trim()} ${trimmed} ]！`);
  },

  deleteCommandCategory(catName) {
    const inUseCount = (this.data.commands || []).filter(c => (c.category || '個人功能') === catName).length;
    if (inUseCount > 0) {
      alert(`無法刪除分類「${catName}」：目前尚有 ${inUseCount} 個指令屬於此分類！請先將指令移至其他分類或刪除。`);
      return;
    }

    if (!confirm(`確定要刪除無指令的分類「${catName}」嗎？`)) return;

    this.data.config.commandCategories = (this.data.config.commandCategories || []).filter(c => c.name !== catName);
    this.expandedAdminCategories.delete(catName);
    this.initCommandCategories();
    this.renderCommandsList();
    Core.saveDraft('config', this.data.config);
    Core.showToast(`🗑️ 已刪除分類 [ ${catName} ]`);
  },

  renderCommandsList() {
    const container = document.getElementById('admin-commands-list');
    if (!container) return;
    container.innerHTML = '';

    if (!this.data.commands || this.data.commands.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何指令，點擊上方「＋ 新增指令」建立第一筆。</div>';
      return;
    }

    const categoryOptions = this.commandCategories;
    const permissionOptions = ['所有玩家', 'VIP專屬', 'Master VIP專屬'];

    // Helper to render an individual command card
    const renderCommandCard = (c, idx) => {
      const isExpanded = this.expandedCommandIndices.has(idx);
      const currentCat = c.category || '個人功能';
      const currentPerm = (c.permission === '玩家' || !c.permission) ? '所有玩家' : c.permission;

      let catSelectHtml = categoryOptions.map(opt => `<option value="${opt}" ${currentCat === opt ? 'selected' : ''}>${opt}</option>`).join('');
      if (!categoryOptions.includes(currentCat)) {
        catSelectHtml += `<option value="${escapeAttr(currentCat)}" selected>${escapeAttr(currentCat)} (自訂)</option>`;
      }

      let permSelectHtml = permissionOptions.map(opt => `<option value="${opt}" ${currentPerm === opt ? 'selected' : ''}>${opt}</option>`).join('');
      if (!permissionOptions.includes(currentPerm)) {
        permSelectHtml += `<option value="${escapeAttr(currentPerm)}" selected>${escapeAttr(currentPerm)} (自訂)</option>`;
      }

      let permBadgeHtml = `<span id="cmd-perm-badge-${idx}" style="font-size: 0.75rem; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: var(--radius-sm);">${escapeAttr(currentPerm)}</span>`;
      if (currentPerm === 'VIP專屬') {
        permBadgeHtml = `<span id="cmd-perm-badge-${idx}" style="font-size: 0.75rem; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 700;">👑 VIP專屬</span>`;
      } else if (currentPerm === 'Master VIP專屬') {
        permBadgeHtml = `<span id="cmd-perm-badge-${idx}" style="font-size: 0.75rem; background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 800;">👑 Master VIP專屬</span>`;
      }

      const item = document.createElement('div');
      item.className = 'editable-item';
      item.id = `cmd-item-${idx}`;
      item.style.padding = '0.9rem 1.15rem';
      item.style.marginBottom = '0.75rem';
      item.style.background = '#ffffff';
      item.style.border = '1px solid var(--border-color)';
      item.style.borderRadius = 'var(--radius-md)';
      item.style.transition = 'all 0.15s ease';
      item.dataset.index = idx;

      // Drag and Drop
      item.addEventListener('dragstart', (e) => {
        Admin.draggedCmdIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.editable-item.drag-over').forEach(el => el.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (Admin.draggedCmdIndex !== null && Admin.draggedCmdIndex !== idx) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const fromIdx = Admin.draggedCmdIndex;
        const toIdx = idx;
        if (fromIdx !== null && fromIdx !== undefined && fromIdx !== toIdx) {
          Admin.reorderCommand(fromIdx, toIdx);
        }
      });

      item.innerHTML = `
        <div class="item-toolbar" style="margin-bottom: ${isExpanded ? '0.85rem' : '0'}; padding-bottom: ${isExpanded ? '0.65rem' : '0'}; border-bottom: ${isExpanded ? '1px dashed var(--border-color)' : 'none'}; cursor: pointer; user-select: none;" onclick="Admin.toggleCommand(${idx}, event)">
          <div style="display: flex; align-items: center; gap: 0.65rem; flex: 1; flex-wrap: wrap;">
            <span class="cmd-drag-handle" title="按住上下拖曳排序" onmouseenter="this.closest('.editable-item').draggable=true" onmouseleave="this.closest('.editable-item').draggable=false" onclick="event.stopPropagation()">⠿</span>
            <span class="item-index" style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted);">#${idx + 1}</span>
            <code id="cmd-name-preview-${idx}" style="font-family: var(--font-mono); font-weight: 800; font-size: 1.05rem; color: var(--primary-text); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-sm);">${escapeAttr(c.name || '/未命名')}</code>
            <span id="cmd-cat-badge-${idx}" style="font-size: 0.75rem; background: var(--bg-subtle); color: var(--text-muted); padding: 2px 7px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-weight: 600;">${escapeAttr(currentCat)}</span>
            ${permBadgeHtml}
            <span id="cmd-desc-preview-${idx}" style="color: var(--text-muted); font-size: 0.88rem; margin-left: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 340px;">${escapeAttr(c.description || '（尚未填寫說明）')}</span>
          </div>
          <div style="display: flex; gap: 0.35rem; align-items: center;" onclick="event.stopPropagation()">
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 6px;" title="向上移動" onclick="Admin.moveCommand(${idx}, -1, event)" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 6px;" title="向下移動" onclick="Admin.moveCommand(${idx}, 1, event)" ${idx === this.data.commands.length - 1 ? 'disabled' : ''}>⬇️</button>
            <button type="button" id="cmd-toggle-btn-${idx}" class="btn btn-secondary btn-sm" onclick="Admin.toggleCommand(${idx}, event)">
              ${isExpanded ? '▲ 收折' : '✏️ 編輯'}
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteCommand(${idx})">🗑️ 刪除</button>
          </div>
        </div>

        <div id="cmd-body-${idx}" style="display: ${isExpanded ? 'block' : 'none'};">
          <div class="form-row">
            <div class="form-group" style="flex: 1.5;">
              <label class="form-label">指令名稱 (或語法)</label>
              <input type="text" class="form-control" value="${escapeAttr(c.name || '')}" oninput="Admin.updateCommand(${idx}, 'name', this.value)" placeholder="例如: /pc">
            </div>
            <div class="form-group" style="flex: 1; min-width: 140px;">
              <label class="form-label">所屬分類</label>
              <select class="form-control" onchange="Admin.updateCommand(${idx}, 'category', this.value)">
                ${catSelectHtml}
              </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 160px;">
              <label class="form-label">使用權限</label>
              <select class="form-control" onchange="Admin.updateCommand(${idx}, 'permission', this.value)">
                ${permSelectHtml}
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">功能說明 (詳細說明此指令的用途)</label>
            <input type="text" class="form-control" value="${escapeAttr(c.description || '')}" oninput="Admin.updateCommand(${idx}, 'description', this.value)" placeholder="例如: 快速回覆上一個私聊訊息">
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-color);">
            <button type="button" class="btn btn-primary btn-sm" onclick="Admin.collapseCommand(${idx}, event)">
              ✅ 編輯完成並收折
            </button>
          </div>
        </div>
      `;
      return item;
    };

    // 1. Category Accordion Mode
    if (this.commandsViewMode === 'category') {
      this.commandCategories.forEach(cat => {
        const meta = this.commandCategoryMeta[cat] || { icon: '📌', label: cat };
        const catCommandsWithIndex = [];
        this.data.commands.forEach((c, i) => {
          if ((c.category || '個人功能') === cat) {
            catCommandsWithIndex.push({ cmd: c, index: i });
          }
        });

        const isCatOpen = this.expandedAdminCategories.has(cat);

        const groupEl = document.createElement('div');
        groupEl.className = `cmd-accordion-group ${isCatOpen ? 'open' : ''}`;
        groupEl.style.cssText = 'margin-bottom: 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg, 12px); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);';

        const headerEl = document.createElement('div');
        headerEl.className = 'cmd-accordion-header';
        headerEl.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.25rem; background: #ffffff; cursor: pointer; user-select: none; border-bottom: 1px solid var(--border-color);';

        headerEl.innerHTML = `
          <div class="cmd-accordion-title-wrap" style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.3rem;">${meta.icon}</span>
            <span style="font-size: 1.05rem; font-weight: 800; color: var(--text-main);">${cat}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <span class="cmd-count-badge" style="font-size: 0.8rem; font-weight: 800; color: #2563eb; background: #eff6ff; border: 1px solid #dbeafe; padding: 2px 10px; border-radius: 999px;">
              ${catCommandsWithIndex.length} 指令
            </span>
            <button type="button" class="btn btn-primary btn-sm" style="padding: 2px 9px; font-size: 0.78rem;" onclick="event.stopPropagation(); Admin.addCommand('${escapeAttr(cat)}')" title="在此分類新增指令">
              ＋ 新增
            </button>
            ${catCommandsWithIndex.length === 0 ? `
              <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="event.stopPropagation(); Admin.deleteCommandCategory('${escapeAttr(cat)}')" title="刪除此無指令分類">
                🗑️ 刪除
              </button>
            ` : ''}
            <span class="cmd-chevron" style="color: #3b82f6; font-size: 0.75rem; transform: ${isCatOpen ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;">▼</span>
          </div>
        `;

        headerEl.addEventListener('click', () => {
          this.toggleAdminCategory(cat);
        });

        const bodyEl = document.createElement('div');
        bodyEl.className = 'cmd-accordion-body';
        bodyEl.style.cssText = `padding: 1rem 1.15rem; background: #f8fafc; display: ${isCatOpen ? 'block' : 'none'};`;

        if (catCommandsWithIndex.length === 0) {
          bodyEl.innerHTML = `
            <div style="color: var(--text-muted); font-size: 0.88rem; padding: 0.75rem 0.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); background: #ffffff;">
              此分類目前尚無指令，可點擊上方「＋ 新增」建立。
            </div>
          `;
        } else {
          catCommandsWithIndex.forEach(({ cmd, index }) => {
            bodyEl.appendChild(renderCommandCard(cmd, index));
          });
        }

        groupEl.appendChild(headerEl);
        groupEl.appendChild(bodyEl);
        container.appendChild(groupEl);
      });
      return;
    }

    // 2. Chronological / Time Mode
    this.data.commands.forEach((c, idx) => {
      container.appendChild(renderCommandCard(c, idx));
    });
  },

  toggleCommand(idx, event) {
    if (event) event.stopPropagation();
    if (this.expandedCommandIndices.has(idx)) {
      this.expandedCommandIndices.delete(idx);
    } else {
      this.expandedCommandIndices.clear();
      this.expandedCommandIndices.add(idx);
    }
    this.renderCommandsList();
  },

  collapseCommand(idx, event) {
    if (event) event.stopPropagation();
    this.expandedCommandIndices.delete(idx);
    this.renderCommandsList();
  },

  collapseAllCommands() {
    this.expandedCommandIndices.clear();
    if (this.commandsViewMode === 'category') {
      this.expandedAdminCategories.clear();
    }
    this.renderCommandsList();
  },

  expandAllCommands() {
    if (this.commandsViewMode === 'category') {
      this.commandCategories.forEach(c => this.expandedAdminCategories.add(c));
    }
    if (this.data.commands) {
      this.data.commands.forEach((_, i) => this.expandedCommandIndices.add(i));
    }
    this.renderCommandsList();
  },

  reorderCommand(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.data.commands.length || toIdx < 0 || toIdx >= this.data.commands.length) return;
    const [moved] = this.data.commands.splice(fromIdx, 1);
    this.data.commands.splice(toIdx, 0, moved);

    if (this.expandedCommandIndices.has(fromIdx)) {
      this.expandedCommandIndices.clear();
      this.expandedCommandIndices.add(toIdx);
    } else {
      this.expandedCommandIndices.clear();
    }

    Core.saveDraft('commands', this.data.commands);
    this.renderCommandsList();
    Core.showToast(`已移動指令順序至 #${toIdx + 1}`);
  },

  moveCommand(idx, direction, event) {
    if (event) event.stopPropagation();
    const toIdx = idx + direction;
    if (toIdx < 0 || toIdx >= this.data.commands.length) return;
    this.reorderCommand(idx, toIdx);
  },

  addCommand(defaultCategory) {
    const cat = defaultCategory || (this.commandCategories[0] || '個人功能');
    this.data.commands.unshift({
      name: '/newcmd',
      category: cat,
      permission: cat === 'VIP專屬' ? 'VIP專屬' : '所有玩家',
      syntax: '/newcmd',
      description: '請在此輸入指令說明與用途'
    });

    if (this.commandsViewMode === 'category') {
      this.expandedAdminCategories.add(cat);
    }
    this.expandedCommandIndices.clear();
    this.expandedCommandIndices.add(0);

    this.renderCommandsList();
    Core.saveDraft('commands', this.data.commands);
    Core.showToast(`已於 [ ${cat} ] 分類中新增指令！`);

    setTimeout(() => {
      const firstInput = document.querySelector('#cmd-item-0 input');
      if (firstInput) {
        firstInput.focus();
        firstInput.select();
      }
    }, 50);
  },

  updateCommand(idx, field, val) {
    if (this.data.commands[idx]) {
      this.data.commands[idx][field] = val;
      if (field === 'name') {
        this.data.commands[idx].syntax = val;
      }
      Core.saveDraft('commands', this.data.commands);

      if (field === 'category') {
        this.renderCommandsList();
        return;
      }

      if (field === 'name') {
        const namePreview = document.getElementById(`cmd-name-preview-${idx}`);
        if (namePreview) namePreview.textContent = val || '/未命名';
      } else if (field === 'permission') {
        const permBadge = document.getElementById(`cmd-perm-badge-${idx}`);
        if (permBadge) {
          if (val === 'VIP專屬') {
            permBadge.outerHTML = `<span id="cmd-perm-badge-${idx}" style="font-size: 0.75rem; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 700;">👑 VIP專屬</span>`;
          } else if (val === 'Master VIP專屬') {
            permBadge.outerHTML = `<span id="cmd-perm-badge-${idx}" style="font-size: 0.75rem; background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 800;">👑 Master VIP專屬</span>`;
          } else {
            permBadge.outerHTML = `<span id="cmd-perm-badge-${idx}" style="font-size: 0.75rem; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: var(--radius-sm);">${escapeAttr(val || '所有玩家')}</span>`;
          }
        }
      } else if (field === 'description') {
        const descPreview = document.getElementById(`cmd-desc-preview-${idx}`);
        if (descPreview) descPreview.textContent = val || '（尚未填寫說明）';
      }
    }
  },

  deleteCommand(idx) {
    if (confirm('確定刪除這筆指令嗎？')) {
      this.data.commands.splice(idx, 1);
      this.expandedCommandIndices.delete(idx);
      this.renderCommandsList();
      Core.saveDraft('commands', this.data.commands);
    }
  },

  /* ================= 4. Pokédex Section ================= */
  renderPokemonList() {
    const container = document.getElementById('admin-pokemon-list');
    if (!container) return;

    const list = this.data.pokemon || [];
    const q = this.pokeSearchQuery.trim().toLowerCase();

    const filtered = list.filter((p, i) => {
      if (!q) return true;
      const noStr = String(p.no || p.id || i + 1);
      const nameStr = (p.name || '').toLowerCase();
      const dropsStr = (p.drops_raw || '').toLowerCase();
      return noStr.includes(q) || nameStr.includes(q) || dropsStr.includes(q);
    });

    const total = filtered.length;
    const start = (this.pokePage - 1) * this.pokePageSize;
    const end = Math.min(start + this.pokePageSize, total);
    const visible = filtered.slice(start, end);

    let html = `
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap;">
        <input type="text" id="admin-poke-search" class="form-control" style="flex: 1; min-width: 240px;" placeholder="🔍 搜尋寶可夢名稱、編號或掉落物..." value="${escapeAttr(this.pokeSearchQuery)}">
        <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted);">共 ${total} 隻寶可夢 (第 ${this.pokePage} / ${Math.max(1, Math.ceil(total / this.pokePageSize))} 頁)</span>
      </div>
    `;

    if (visible.length === 0) {
      html += '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">查無符合的寶可夢。</div>';
    } else {
      visible.forEach(p => {
        const rawIdx = list.indexOf(p);
        const pNo = p.no || p.id || (rawIdx + 1);
        const artworkUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pNo}.png`;

        html += `
          <div class="editable-item" style="display: grid; grid-template-columns: 80px 1fr auto; gap: 1rem; align-items: center;">
            <div style="text-align: center;">
              <img src="${artworkUrl}" style="width: 60px; height: 60px; object-fit: contain;" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pNo}.png'">
              <div style="font-family: var(--font-mono); font-weight: 800; font-size: 0.8rem; color: var(--primary-text);">#${String(pNo).padStart(3, '0')}</div>
            </div>
            <div>
              <div class="form-row">
                <div class="form-group" style="max-width: 160px; margin-bottom: 0.5rem;">
                  <label class="form-label">名稱</label>
                  <input type="text" class="form-control" value="${escapeAttr(p.name || '')}" oninput="Admin.updatePokemonField(${rawIdx}, 'name', this.value)">
                </div>
                <div class="form-group" style="flex: 1; margin-bottom: 0.5rem;">
                  <label class="form-label">掉落物列表說明 (drops_raw)</label>
                  <input type="text" class="form-control" value="${escapeAttr(p.drops_raw || '')}" oninput="Admin.updatePokemonField(${rawIdx}, 'drops_raw', this.value)" placeholder="例如: 西瓜種子 0-1, 奇蹟種子 5%">
                </div>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">群系加成說明 (biome_bonus)</label>
                <input type="text" class="form-control" value="${escapeAttr(p.biome_bonus || '')}" oninput="Admin.updatePokemonField(${rawIdx}, 'biome_bonus', this.value)" placeholder="例如: 櫻花林夜間額外刷新">
              </div>
            </div>
            <div>
              <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deletePokemon(${rawIdx})">刪除</button>
            </div>
          </div>
        `;
      });

      // Pagination controls
      const maxPages = Math.ceil(total / this.pokePageSize);
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <button class="btn btn-secondary btn-sm" ${this.pokePage <= 1 ? 'disabled' : ''} onclick="Admin.prevPokePage()">← 上一頁</button>
          <span style="font-size: 0.85rem; color: var(--text-muted);">顯示 ${start + 1} - ${end} 隻</span>
          <button class="btn btn-secondary btn-sm" ${this.pokePage >= maxPages ? 'disabled' : ''} onclick="Admin.nextPokePage()">下一頁 →</button>
        </div>
      `;
    }

    container.innerHTML = html;

    const sInput = document.getElementById('admin-poke-search');
    if (sInput) {
      sInput.addEventListener('input', (e) => {
        this.pokeSearchQuery = e.target.value;
        this.pokePage = 1;
        this.renderPokemonList();
      });
      sInput.focus();
      sInput.setSelectionRange(sInput.value.length, sInput.value.length);
    }
  },

  prevPokePage() {
    if (this.pokePage > 1) {
      this.pokePage--;
      this.renderPokemonList();
    }
  },

  nextPokePage() {
    this.pokePage++;
    this.renderPokemonList();
  },

  updatePokemonField(rawIdx, field, val) {
    if (this.data.pokemon[rawIdx]) {
      this.data.pokemon[rawIdx][field] = val;
      Core.saveDraft('poke', this.data.pokemon);
    }
  },

  addPokemon() {
    const nextNo = (this.data.pokemon.length > 0) ? (Math.max(...this.data.pokemon.map(p => p.no || p.id || 0)) + 1) : 1;
    this.data.pokemon.unshift({
      no: nextNo,
      name: '新寶可夢',
      drops: [],
      drops_raw: '特殊掉落物 5%',
      biome_bonus: ''
    });
    this.pokePage = 1;
    this.renderPokemonList();
    Core.saveDraft('poke', this.data.pokemon);
    Core.showToast(`已新增 #${nextNo} 號寶可夢`);
  },

  deletePokemon(rawIdx) {
    if (confirm('確定刪除這隻寶可夢嗎？')) {
      this.data.pokemon.splice(rawIdx, 1);
      this.renderPokemonList();
      Core.saveDraft('poke', this.data.pokemon);
    }
  },

  /* ================= 5. Guides Section with Multi-Step Modal & Word Formatting ================= */
  currentGuideIdx: null,
  guideModalStep: 1,

  renderGuidesList() {
    const container = document.getElementById('admin-guides-list');
    if (!container) return;
    container.innerHTML = '';

    if (!this.data.guides || this.data.guides.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何攻略，點擊上方「＋ 新增攻略文章」開啟兩步驟引導編輯。</div>';
      return;
    }

    this.data.guides.forEach((g, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.gap = '1rem';
      item.style.flexWrap = 'wrap';
      item.innerHTML = `
        <div style="flex: 1; min-width: 260px;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span style="font-size: 0.75rem; background: var(--primary-light); color: var(--primary-text); padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 700;">${escapeAttr(g.category || '新手教學')}</span>
            <strong style="font-size: 1.1rem; color: var(--text-main);">${escapeAttr(g.title || '未命名攻略')}</strong>
          </div>
          <div style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.45; margin-bottom: 0.35rem;">
            ${escapeAttr(g.summary || '（暫無簡介摘要）')}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-light);">
            作者: ${escapeAttr(g.author || '管理員')} ｜ 最後更新: ${escapeAttr(g.updatedAt || '剛剛')}
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Admin.openGuideModal(${idx})">✏️ 編輯文章</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteGuide(${idx})">🗑️ 刪除</button>
        </div>
      `;
      container.appendChild(item);
    });
  },

  openGuideModal(idx = null) {
    this.currentGuideIdx = idx;
    this.guideModalStep = 1;

    const modalTitle = document.getElementById('modal-guide-header-title');
    const inputTitle = document.getElementById('modal-input-title');
    const inputCat = document.getElementById('modal-input-category');
    const inputAuthor = document.getElementById('modal-input-author');
    const inputSummary = document.getElementById('modal-input-summary');
    const editor = document.getElementById('modal-guide-visual-editor');

    if (idx !== null && this.data.guides[idx]) {
      const g = this.data.guides[idx];
      if (modalTitle) modalTitle.textContent = `✏️ 編輯攻略文章`;
      if (inputTitle) inputTitle.value = g.title || '';
      if (inputCat) inputCat.value = g.category || '新手教學';
      if (inputAuthor) inputAuthor.value = g.author || '管理員';
      if (inputSummary) inputSummary.value = g.summary || '';
      if (editor) editor.innerHTML = this.convertMarkdownToHTML(g.content || '');
    } else {
      if (modalTitle) modalTitle.textContent = '📖 新增攻略文章';
      if (inputTitle) inputTitle.value = '';
      if (inputCat) inputCat.value = '新手教學';
      if (inputAuthor) inputAuthor.value = '管理員';
      if (inputSummary) inputSummary.value = '';
      if (editor) editor.innerHTML = '';
    }

    this.switchGuideTab('write');
    this.showGuideStep(1);

    const overlay = document.getElementById('guide-modal-overlay');
    if (overlay) overlay.style.display = 'flex';

    this.setupVisualEditorEvents();
  },

  closeGuideModal() {
    const overlay = document.getElementById('guide-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  showGuideStep(step) {
    this.guideModalStep = step;
    const step1El = document.getElementById('modal-guide-step-1');
    const step2El = document.getElementById('modal-guide-step-2');
    const badge1 = document.getElementById('modal-step-badge-1');
    const badge2 = document.getElementById('modal-step-badge-2');
    const btnCancel = document.getElementById('btn-modal-cancel');
    const btnPrev = document.getElementById('btn-modal-prev');
    const btnNext = document.getElementById('btn-modal-next');
    const btnSubmit = document.getElementById('btn-modal-submit');

    if (step === 1) {
      if (step1El) step1El.style.display = 'block';
      if (step2El) step2El.style.display = 'none';
      if (badge1) badge1.className = 'step-item active';
      if (badge2) badge2.className = 'step-item';
      if (btnCancel) btnCancel.style.display = 'inline-block';
      if (btnPrev) btnPrev.style.display = 'none';
      if (btnNext) btnNext.style.display = 'inline-block';
      if (btnSubmit) btnSubmit.style.display = 'none';
    } else {
      if (step1El) step1El.style.display = 'none';
      if (step2El) step2El.style.display = 'block';
      if (badge1) badge1.className = 'step-item';
      if (badge2) badge2.className = 'step-item active';
      if (btnCancel) btnCancel.style.display = 'none';
      if (btnPrev) btnPrev.style.display = 'inline-block';
      if (btnNext) btnNext.style.display = 'none';
      if (btnSubmit) btnSubmit.style.display = 'inline-block';

      // Update Top Review Summary Box
      const titleVal = document.getElementById('modal-input-title').value.trim() || '未命名攻略';
      const catVal = document.getElementById('modal-input-category').value.trim() || '新手教學';
      const authorVal = document.getElementById('modal-input-author').value.trim() || '管理員';
      const summaryVal = document.getElementById('modal-input-summary').value.trim() || '（無簡介摘要）';

      document.getElementById('review-guide-title').textContent = titleVal;
      document.getElementById('review-guide-category').textContent = catVal;
      document.getElementById('review-guide-author').textContent = `作者: ${authorVal}`;
      document.getElementById('review-guide-summary').textContent = summaryVal;

      this.switchGuideTab('write');
    }
  },

  previewSubTab: 'reader',

  switchGuideTab(tab) {
    const btnWrite = document.getElementById('btn-tab-write');
    const btnPreview = document.getElementById('btn-tab-preview');
    const toolbarBox = document.getElementById('modal-word-toolbar-box');
    const previewPane = document.getElementById('modal-guide-live-preview');

    if (tab === 'write') {
      if (btnWrite) btnWrite.classList.add('active');
      if (btnPreview) btnPreview.classList.remove('active');
      if (toolbarBox) toolbarBox.style.display = 'block';
      if (previewPane) previewPane.style.display = 'none';
    } else {
      if (btnWrite) btnWrite.classList.remove('active');
      if (btnPreview) btnPreview.classList.add('active');
      if (toolbarBox) toolbarBox.style.display = 'none';
      if (previewPane) {
        previewPane.style.display = 'block';
        this.renderMockPreview();
      }
    }
  },

  renderMockPreview(viewMode = null) {
    if (viewMode) this.previewSubTab = viewMode;
    const previewPane = document.getElementById('modal-guide-live-preview');
    const editor = document.getElementById('modal-guide-visual-editor');
    if (!previewPane) return;

    const titleVal = document.getElementById('modal-input-title').value.trim() || '未命名攻略文章';
    const catVal = document.getElementById('modal-input-category').value.trim() || '新手教學';
    const authorVal = document.getElementById('modal-input-author').value.trim() || '管理員';
    const summaryVal = document.getElementById('modal-input-summary').value.trim() || '（此文章尚無簡介摘要說明）';
    const today = new Date().toISOString().slice(0, 10);
    const contentHTML = editor ? editor.innerHTML : '';

    const isReader = this.previewSubTab === 'reader';

    previewPane.innerHTML = `
      <div class="frontend-mock-wrapper">
        <!-- Mock Browser Bar -->
        <div class="frontend-mock-topbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="frontend-mock-dots">
              <span class="mock-dot-red"></span>
              <span class="mock-dot-yellow"></span>
              <span class="mock-dot-green"></span>
            </div>
            <span style="font-family: var(--font-mono); font-size: 0.78rem; color: #64748b; background: #fff; padding: 2px 10px; border-radius: 4px; border: 1px solid #cbd5e1;">
              🌐 模擬前端視窗: guides.html
            </span>
          </div>
          <!-- View Toggle Pills -->
          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn btn-sm ${isReader ? 'btn-primary' : 'btn-secondary'}" style="font-size: 0.75rem; padding: 2px 8px;" onclick="Admin.renderMockPreview('reader')">
              📖 點開後文章閱讀頁
            </button>
            <button type="button" class="btn btn-sm ${!isReader ? 'btn-primary' : 'btn-secondary'}" style="font-size: 0.75rem; padding: 2px 8px;" onclick="Admin.renderMockPreview('card')">
              🗂️ 前台清單卡片樣式
            </button>
          </div>
        </div>

        <!-- Mock Content Screen -->
        <div class="frontend-mock-content">
          ${isReader ? `
            <!-- 1:1 Simulation of guides.html reader card -->
            <div class="mock-guide-reader">
              <button type="button" class="btn btn-secondary btn-sm" style="margin-bottom: 1.5rem; pointer-events: none; opacity: 0.85;">
                ← 返回攻略清單
              </button>
              <div style="margin-bottom: 0.5rem;">
                <span style="font-size: 0.75rem; background: var(--primary-light); color: var(--primary-text); display: inline-block; padding: 2px 10px; border-radius: var(--radius-sm); font-weight: 700;">
                  ${escapeAttr(catVal)}
                </span>
              </div>
              <h1>${escapeAttr(titleVal)}</h1>
              <div class="mock-guide-meta">
                <span>${escapeAttr(catVal)}</span>
                <span>•</span>
                <span>作者: ${escapeAttr(authorVal)}</span>
                <span>•</span>
                <span>更新於: ${today}</span>
              </div>
              <div class="mock-guide-body">
                ${contentHTML || '<p style="color: var(--text-muted); font-style: italic;">（目前無內文，請回到編輯分頁輸入文字）</p>'}
              </div>
            </div>
          ` : `
            <!-- 1:1 Simulation of guides.html listing card -->
            <div style="max-width: 340px; margin: 1.5rem auto;">
              <div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; margin-bottom: 0.5rem; font-weight: 700;">
                👇 玩家在「攻略專區」清單中看到的卡片外觀
              </div>
              <div class="card" style="padding: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); background: #ffffff; cursor: default;">
                <div style="font-size: 0.75rem; background: var(--primary-light); color: var(--primary-text); display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 700; margin-bottom: 0.5rem;">
                  ${escapeAttr(catVal)}
                </div>
                <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.4rem; color: var(--text-main); line-height: 1.4;">${escapeAttr(titleVal)}</h3>
                <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.55; margin-bottom: 1rem;">
                  ${escapeAttr(summaryVal)}
                </p>
                <div style="font-size: 0.8rem; color: var(--text-light); display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                  <span>作者: ${escapeAttr(authorVal)}</span>
                  <span>${today}</span>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  },

  guideNextStep() {
    const title = document.getElementById('modal-input-title').value.trim();
    if (!title) {
      alert('請先輸入攻略標題！');
      document.getElementById('modal-input-title').focus();
      return;
    }
    this.showGuideStep(2);
  },

  guidePrevStep() {
    this.showGuideStep(1);
  },

  async submitGuideModal() {
    const title = document.getElementById('modal-input-title').value.trim();
    if (!title) {
      alert('攻略標題不能為空！');
      this.showGuideStep(1);
      return;
    }

    const category = document.getElementById('modal-input-category').value.trim() || '新手教學';
    const author = document.getElementById('modal-input-author').value.trim() || '管理員';
    const summary = document.getElementById('modal-input-summary').value.trim();
    const editor = document.getElementById('modal-guide-visual-editor');
    const content = editor ? editor.innerHTML : '';
    const today = new Date().toISOString().slice(0, 10);

    const guideObj = {
      title,
      category,
      author,
      updatedAt: today,
      summary,
      content,
      coverImage: ''
    };

    if (this.currentGuideIdx !== null && this.data.guides[this.currentGuideIdx]) {
      this.data.guides[this.currentGuideIdx] = guideObj;
      Core.showToast(`✅ 已更新攻略「${title}」`);
    } else {
      if (!this.data.guides) this.data.guides = [];
      this.data.guides.unshift(guideObj);
      Core.showToast(`✅ 已成功新增攻略「${title}」`);
    }

    Core.saveDraft('guides', this.data.guides);
    this.renderGuidesList();
    this.closeGuideModal();

    // Auto-sync to disk if folder is connected
    if (FS.dirHandle) {
      await FS.writeFile(['data', 'guides.json'], JSON.stringify(this.data.guides, null, 2));
      await FS.syncAll(this.data);
    }
  },

  deleteGuide(idx) {
    if (confirm('確定刪除這篇攻略文章嗎？')) {
      this.data.guides.splice(idx, 1);
      this.renderGuidesList();
      Core.saveDraft('guides', this.data.guides);
      if (FS.dirHandle) {
        FS.syncAll(this.data);
      }
    }
  },

  /* True Universal WYSIWYG & Textarea / Input Formatting Engine */
  _savedRange: null,
  lastActiveTarget: null,

  saveSelection() {
    const info = this.getSelectionInfo();
    if (info) {
      this.lastActiveTarget = info;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this._savedRange = sel.getRangeAt(0).cloneRange();
    }
  },

  restoreSelection() {
    if (this._savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this._savedRange);
    }
  },

  getSelectionInfo() {
    // 1. Check active input / textarea
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'))) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && start !== end) {
        const text = active.value.substring(start, end).trim();
        if (text.length > 0) {
          return {
            type: 'input',
            el: active,
            text: text,
            start: start,
            end: end,
            rect: active.getBoundingClientRect()
          };
        }
      }
    }

    // 2. Check contenteditable selection
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const text = sel.toString().trim();
      if (text.length > 0) {
        const anchor = sel.anchorNode;
        const parent = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement) : null;
        const editable = parent ? parent.closest('[contenteditable="true"]') : null;
        if (editable) {
          return {
            type: 'contenteditable',
            el: editable,
            text: text,
            range: sel.getRangeAt(0),
            rect: sel.getRangeAt(0).getBoundingClientRect()
          };
        }
      }
    }

    return null;
  },

  getLastEditTarget() {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'))) {
      return {
        el: active,
        type: active.isContentEditable ? 'contenteditable' : 'input',
        start: active.selectionStart,
        end: active.selectionEnd
      };
    }
    if (this.lastActiveTarget && this.lastActiveTarget.el && document.body.contains(this.lastActiveTarget.el)) {
      return this.lastActiveTarget;
    }
    const guideEditor = document.getElementById('modal-guide-visual-editor');
    if (guideEditor) {
      return { el: guideEditor, type: 'contenteditable' };
    }
    return null;
  },

  triggerTargetInput(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },

  applyWordFormat(type) {
    const target = this.getLastEditTarget();
    if (!target) return;

    if (target.type === 'input') {
      const el = target.el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;
      const selected = val.substring(start, end);

      let rep = '';
      switch (type) {
        case 'bold': rep = selected ? `**${selected}**` : `**粗體**`; break;
        case 'italic': rep = selected ? `*${selected}*` : `*斜體*`; break;
        case 'strikethrough': rep = selected ? `~~${selected}~~` : `~~刪除線~~`; break;
        case 'hr': rep = `\n---\n`; break;
        case 'h2': rep = selected ? `\n## ${selected}\n` : `\n## 大標題\n`; break;
        case 'h3': rep = selected ? `\n### ${selected}\n` : `\n### 次標題\n`; break;
        case 'list':
          rep = (selected || '清單項目').split('\n').map(l => `- ${l}`).join('\n');
          break;
        case 'numlist':
          rep = (selected || '清單項目').split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n');
          break;
        case 'outdent':
          rep = selected.replace(/^\s{2,4}/gm, '');
          break;
        case 'indent':
          rep = selected.replace(/^/gm, '  ');
          break;
      }
      el.setRangeText(rep, start, end, 'end');
      el.focus();
      this.triggerTargetInput(el);
      return;
    }

    // contenteditable
    this.restoreSelection();
    const editor = target.el;
    if (editor && editor.focus) editor.focus();

    switch (type) {
      case 'bold': document.execCommand('bold', false, null); break;
      case 'italic': document.execCommand('italic', false, null); break;
      case 'strikethrough': document.execCommand('strikeThrough', false, null); break;
      case 'hr': {
        document.execCommand('insertHorizontalRule', false, null);
        if (editor.lastElementChild && editor.lastElementChild.tagName === 'HR') {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          editor.appendChild(p);
        }
        break;
      }
      case 'h2':
        try { document.execCommand('formatBlock', false, '<h2>'); }
        catch (e) { document.execCommand('formatBlock', false, 'H2'); }
        break;
      case 'h3':
        try { document.execCommand('formatBlock', false, '<h3>'); }
        catch (e) { document.execCommand('formatBlock', false, 'H3'); }
        break;
      case 'list': document.execCommand('insertUnorderedList', false, null); break;
      case 'numlist': document.execCommand('insertOrderedList', false, null); break;
      case 'outdent': document.execCommand('outdent', false, null); break;
      case 'indent': document.execCommand('indent', false, null); break;
    }
    this.triggerTargetInput(editor);
  },

  applyTextColor(colorHex) {
    const target = this.getLastEditTarget();
    if (!target) return;

    if (target.type === 'input') {
      const el = target.el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.substring(start, end);
      const rep = `<span style="color: ${colorHex}; font-weight: 700;">${selected || '文字'}</span>`;
      el.setRangeText(rep, start, end, 'end');
      el.focus();
      this.triggerTargetInput(el);
      return;
    }

    this.restoreSelection();
    const editor = target.el;
    if (editor && editor.focus) editor.focus();
    document.execCommand('foreColor', false, colorHex);
    this.triggerTargetInput(editor);
  },

  applyHighlight(colorHex) {
    const target = this.getLastEditTarget();
    if (!target) return;

    if (target.type === 'input') {
      const el = target.el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.substring(start, end);
      let rep = '';
      if (colorHex === 'transparent') {
        rep = selected.replace(/<\/?mark[^>]*>/gi, '');
      } else {
        rep = `<mark style="background-color: ${colorHex}; padding: 2px 5px; border-radius: 4px;">${selected || '重點文字'}</mark>`;
      }
      el.setRangeText(rep, start, end, 'end');
      el.focus();
      this.triggerTargetInput(el);
      return;
    }

    this.restoreSelection();
    const editor = target.el;
    if (editor && editor.focus) editor.focus();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (colorHex === 'transparent') {
        const span = document.createElement('span');
        span.style.backgroundColor = 'transparent';
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } else {
        const mark = document.createElement('mark');
        mark.style.backgroundColor = colorHex;
        mark.style.padding = '2px 5px';
        mark.style.borderRadius = '4px';
        mark.style.fontWeight = '600';
        mark.appendChild(range.extractContents());
        range.insertNode(mark);
      }
      sel.removeAllRanges();
    } else {
      document.execCommand('hiliteColor', false, colorHex);
    }
    this.triggerTargetInput(editor);
  },

  applyFontSize(size) {
    const target = this.getLastEditTarget();
    if (!target) return;

    if (target.type === 'input') {
      const el = target.el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.substring(start, end);
      const rep = `<span style="font-size: ${size}; line-height: 1.4;">${selected || '文字'}</span>`;
      el.setRangeText(rep, start, end, 'end');
      el.focus();
      this.triggerTargetInput(el);
      Core.showToast(`🔤 已設定字級：${size}`);
      return;
    }

    this.restoreSelection();
    const editor = target.el;
    if (editor && editor.focus) editor.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      Core.showToast('💡 請先用滑鼠選取要更改大小的文字！');
      return;
    }

    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = size;
    span.style.lineHeight = '1.4';
    span.appendChild(range.extractContents());
    range.insertNode(span);

    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    this.saveSelection();
    this.triggerTargetInput(editor);
    Core.showToast(`🔤 已設定字級：${size}`);
  },

  insertKeycap(keyText) {
    const target = this.getLastEditTarget();
    if (!target) return;

    if (target.type === 'input') {
      const el = target.el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const rep = `<span class="keycap">${keyText}</span> `;
      el.setRangeText(rep, start, end, 'end');
      el.focus();
      this.triggerTargetInput(el);
      Core.showToast(`⌨️ 已嵌入 [ ${keyText} ] 按鍵！`);
      return;
    }

    this.restoreSelection();
    const editor = target.el;
    if (editor && editor.focus) editor.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const keySpan = document.createElement('span');
    keySpan.className = 'keycap';
    keySpan.setAttribute('contenteditable', 'false');
    keySpan.textContent = keyText;
    keySpan.style.margin = '0 3px';
    keySpan.style.verticalAlign = 'middle';
    keySpan.style.userSelect = 'all';

    range.insertNode(keySpan);

    const space = document.createTextNode('\u00A0');
    if (keySpan.nextSibling) {
      keySpan.parentNode.insertBefore(space, keySpan.nextSibling);
    } else {
      keySpan.parentNode.appendChild(space);
    }

    range.setStartAfter(space);
    range.setEndAfter(space);
    sel.removeAllRanges();
    sel.addRange(range);
    this.saveSelection();
    this.triggerTargetInput(editor);
    Core.showToast(`⌨️ 已嵌入 [ ${keyText} ] 按鍵！`);
  },

  insertMouseAction(btnType) {
    const target = this.getLastEditTarget();
    if (!target) return;

    const isRight = btnType === 'right';
    const mouseBadgeHTML = `
      <span class="mouse-indicator mouse-${btnType}" contenteditable="false" style="margin: 0 4px; vertical-align: middle; user-select: all;" title="${isRight ? '滑鼠右鍵點擊' : '滑鼠左鍵點擊'}">
        <svg viewBox="0 0 24 34" width="16" height="22" style="display:inline-block; vertical-align:middle;">
          <rect x="1" y="1" width="22" height="32" rx="11" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
          <line x1="12" y1="1" x2="12" y2="15" stroke="#94a3b8" stroke-width="1.5"/>
          <path class="btn-left" d="M1 12 C1 6 6 1 12 1 L12 15 L1 15 Z" fill="${isRight ? 'transparent' : '#dc2626'}"/>
          <path class="btn-right" d="M12 1 C18 1 23 6 23 12 L23 15 L12 15 Z" fill="${isRight ? '#0284c7' : 'transparent'}"/>
          <rect x="10.5" y="6" width="3" height="5" rx="1.5" fill="#64748b"/>
        </svg>
        <span class="mouse-label" style="font-size: 0.78rem;">${isRight ? '右鍵' : '左鍵'}</span>
      </span>
    `.trim() + ' ';

    if (target.type === 'input') {
      const el = target.el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.setRangeText(mouseBadgeHTML, start, end, 'end');
      el.focus();
      this.triggerTargetInput(el);
      Core.showToast(`🖱️ 已嵌入 [ ${isRight ? '滑鼠右鍵' : '滑鼠左鍵'} ] 動作！`);
      return;
    }

    this.restoreSelection();
    const editor = target.el;
    if (editor && editor.focus) editor.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = mouseBadgeHTML;
    const frag = document.createDocumentFragment();
    let node;
    while ((node = tempDiv.firstChild)) {
      frag.appendChild(node);
    }
    range.insertNode(frag);
    this.saveSelection();
    this.triggerTargetInput(editor);
    Core.showToast(`🖱️ 已嵌入 [ ${isRight ? '滑鼠右鍵' : '滑鼠左鍵'} ] 動作！`);
  },

  insertCustomKeycap(btnEl) {
    let input = null;
    if (btnEl && btnEl.parentElement) {
      input = btnEl.parentElement.querySelector('.wt-custom-key-input') || btnEl.parentElement.querySelector('input');
    }
    if (!input) {
      input = document.querySelector('.wt-custom-key-input') || document.getElementById('wt-custom-key-input');
    }
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
      Core.showToast('⚠️ 請輸入自訂按鍵文字 (例如: Shift + 右鍵)');
      return;
    }
    this.insertKeycap(text);
    input.value = '';
  },

  setupFloatingToolbar() {
    const floatBar = document.getElementById('floating-word-toolbar');
    if (!floatBar) return;

    // Track focused inputs & contenteditable across the whole page
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) {
        this.lastActiveTarget = {
          el: el,
          type: el.isContentEditable ? 'contenteditable' : 'input'
        };
      }
    });

    const updateFloatingToolbar = () => {
      const info = this.getSelectionInfo();
      if (!info) {
        floatBar.style.display = 'none';
        return;
      }

      this.lastActiveTarget = info;

      floatBar.style.display = 'flex';
      const barWidth = floatBar.offsetWidth || 420;
      const barHeight = floatBar.offsetHeight || 38;

      const rect = info.rect;
      let left = rect.left + (rect.width / 2) - (barWidth / 2);
      let top = rect.top - barHeight - 10;

      if (left < 10) left = 10;
      if (left + barWidth > window.innerWidth - 10) {
        left = window.innerWidth - barWidth - 10;
      }
      if (top < 10) {
        top = rect.bottom + 10;
      }

      floatBar.style.left = `${left}px`;
      floatBar.style.top = `${top}px`;
    };

    document.addEventListener('selectionchange', () => {
      updateFloatingToolbar();
    });

    document.addEventListener('mouseup', () => {
      setTimeout(updateFloatingToolbar, 20);
    });

    document.addEventListener('keyup', () => {
      setTimeout(updateFloatingToolbar, 20);
    });

    document.addEventListener('mousedown', (e) => {
      if (!floatBar.contains(e.target)) {
        const isInput = e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type === 'text') || (e.target.isContentEditable);
        if (!isInput) {
          floatBar.style.display = 'none';
        }
      }
    });
  },

  setupVisualEditorEvents() {
    const editor = document.getElementById('modal-guide-visual-editor');
    if (!editor || editor._hasVisualEvents) return;
    editor._hasVisualEvents = true;

    editor.addEventListener('paste', async (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;
      const items = clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            await Admin.handleModalGuideImageUpload(file);
          }
          break;
        }
      }
    });

    editor.addEventListener('dragover', (e) => {
      e.preventDefault();
      editor.style.borderColor = 'var(--primary)';
    });
    editor.addEventListener('dragleave', () => {
      editor.style.borderColor = '';
    });
    editor.addEventListener('drop', async (e) => {
      e.preventDefault();
      editor.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          await Admin.handleModalGuideImageUpload(file);
        }
      }
    });
  },

  async handleModalImageFile(inputEl) {
    if (inputEl.files && inputEl.files[0]) {
      await this.handleModalGuideImageUpload(inputEl.files[0]);
      inputEl.value = '';
    }
  },

  async handleModalGuideImageUpload(file) {
    Core.showToast('⏳ 正在儲存圖片至本機 images/guides/ ...');
    const relPath = await FS.saveGuideImage(file);
    if (!relPath) return;

    const editor = document.getElementById('modal-guide-visual-editor');
    if (editor) {
      editor.focus();
      const imgHTML = `<p><img src="${relPath}" alt="圖片" style="max-width: 100%; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: 0 4px 12px rgba(0,0,0,0.06); margin: 8px 0;"></p><p><br></p>`;
      document.execCommand('insertHTML', false, imgHTML);
      Core.showToast(`✅ 圖片已存入 ${relPath} 並即時顯示於編輯框！`);
    }
  },

  convertMarkdownToHTML(text) {
    if (!text) return '';
    if (/<[a-z][\s\S]*>/i.test(text)) return text;
    return text.split(/\n\n+/).map(p => {
      const t = p.trim();
      if (t === '---' || t === '***' || t === '___') return '<hr>';
      const img = t.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (img) return `<p><img src="${img[2]}" alt="${img[1]}" style="max-width: 100%; border-radius: 8px;"></p>`;
      if (t.startsWith('## ')) return `<h2>${t.slice(3)}</h2>`;
      if (t.startsWith('### ')) return `<h3>${t.slice(4)}</h3>`;
      if (t.split('\n').every(l => l.trim().startsWith('- '))) {
        return `<ul>${t.split('\n').map(l => `<li>${l.trim().slice(2)}</li>`).join('')}</ul>`;
      }
      if (t.split('\n').every(l => /^\d+\.\s/.test(l.trim()))) {
        return `<ol>${t.split('\n').map(l => `<li>${l.trim().replace(/^\d+\.\s*/, '')}</li>`).join('')}</ol>`;
      }
      return `<p>${t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/~~(.*?)~~/g, '<del>$1</del>').replace(/\n/g, '<br>')}</p>`;
    }).join('');
  },

  /* ================= 5.5 Beginner Guide Hub Section ================= */
  switchBeginnerTab(tabName, btnEl) {
    document.querySelectorAll('.beginner-sub-tab').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#panel-beginner .editor-tabs .btn-tab').forEach(b => b.classList.remove('active'));

    if (btnEl) btnEl.classList.add('active');
    const target = document.getElementById(`beginner-sub-${tabName}`);
    if (target) target.style.display = 'block';

    if (tabName === 'live-view') {
      this.refreshBeginnerPreview();
    }
  },

  refreshBeginnerPreview() {
    const iframe = document.getElementById('beginner-live-iframe');
    if (iframe) {
      if (this.data && this.data.beginner) {
        Core.saveDraft('beginner', this.data.beginner);
      }
      iframe.src = 'beginner.html?edit=1&t=' + Date.now();
    }
  },

  renderBeginnerPanel() {
    if (!this.data.beginner) {
      this.data.beginner = { shortcuts: [], steps: [], safety: [], faq: [] };
    }
    const nameEl = document.getElementById('admin-sim-server-name');
    if (nameEl && this.data.config && this.data.config.serverName) {
      nameEl.textContent = this.data.config.serverName;
    }
    this.renderAdminBeginnerShortcuts();
    this.renderAdminBeginnerSteps();
    this.renderAdminBeginnerSafety();
    this.renderAdminBeginnerFaq();
  },

  renderAdminBeginnerShortcuts() {
    const container = document.getElementById('admin-beginner-shortcuts-list');
    if (!container) return;
    container.innerHTML = '';

    const list = this.data.beginner.shortcuts || [];
    if (list.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; grid-column: 1/-1;">目前無快捷操作資料，可點擊上方按鈕新增。</div>';
      return;
    }

    list.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'sim-shortcut-card';

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.45rem; padding-bottom: 0.5rem; border-bottom: 1px dashed var(--border-color); flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">鍵位:</span>
            <input type="text" class="form-control" style="font-size: 0.82rem; padding: 3px 8px; width: 110px; font-family: var(--font-mono); font-weight: 800;" value="${escapeAttr(item.keyDisplay || '')}" oninput="Admin.updateBeginnerShortcutKey(${idx}, this.value)" placeholder="如 R, Shift">
            <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-left: 0.25rem;">滑鼠:</span>
            <select class="form-control" style="font-size: 0.8rem; padding: 3px 6px; width: auto;" onchange="Admin.updateBeginnerShortcutMouse(${idx}, this.value)">
              <option value="none" ${item.mouseButton === 'none' || !item.mouseButton ? 'selected' : ''}>無滑鼠</option>
              <option value="left" ${item.mouseButton === 'left' ? 'selected' : ''}>滑鼠左鍵</option>
              <option value="right" ${item.mouseButton === 'right' ? 'selected' : ''}>滑鼠右鍵</option>
            </select>
          </div>
          <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="Admin.deleteBeginnerShortcut(${idx})" title="刪除此操作項">🗑️ 刪除</button>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div id="admin-sc-preview-${idx}">
            ${this.renderAdminKeyMouseVisual(item)}
          </div>
          <div style="flex: 1;">
            <div contenteditable="true" style="font-weight: 800; font-size: 1rem; color: var(--text-main); margin-bottom: 3px;" oninput="Admin.updateBeginnerShortcut(${idx}, 'title', this.innerHTML)" title="點擊直接修改操作名稱">${item.title || ''}</div>
            <div contenteditable="true" style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;" oninput="Admin.updateBeginnerShortcut(${idx}, 'desc', this.innerHTML)" title="點擊直接修改操作說明">${item.desc || ''}</div>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  },

  updateBeginnerShortcutKey(idx, val) {
    if (!this.data.beginner.shortcuts[idx]) return;
    this.data.beginner.shortcuts[idx].keyDisplay = val.trim();
    Core.saveDraft('beginner', this.data.beginner);
    const prevEl = document.getElementById(`admin-sc-preview-${idx}`);
    if (prevEl) prevEl.innerHTML = this.renderAdminKeyMouseVisual(this.data.beginner.shortcuts[idx]);
  },

  updateBeginnerShortcutMouse(idx, val) {
    if (!this.data.beginner.shortcuts[idx]) return;
    this.data.beginner.shortcuts[idx].mouseButton = val;
    Core.saveDraft('beginner', this.data.beginner);
    const prevEl = document.getElementById(`admin-sc-preview-${idx}`);
    if (prevEl) prevEl.innerHTML = this.renderAdminKeyMouseVisual(this.data.beginner.shortcuts[idx]);
  },

  renderAdminKeyMouseVisual(item) {
    const parts = [];
    const btn = item.mouseButton || 'none';
    
    if (item.keyDisplay) {
      if (item.keyType === 'mouse' && item.keyDisplay === '手持精靈球') {
        parts.push(`<span class="keycap" style="font-size: 0.75rem; padding: 0 6px; white-space: nowrap;">手持精靈球</span>`);
      } else {
        const keys = item.keyDisplay.split(/(\s*\+\s*|\s*或\s*)/);
        keys.forEach(k => {
          const trimmed = k.trim();
          if (trimmed === '+' || trimmed === '或') {
            parts.push(`<span style="font-weight: 800; color: var(--text-muted); font-size: 0.8rem;">${trimmed}</span>`);
          } else if (trimmed) {
            parts.push(`<span class="keycap" style="min-width: 28px; height: 28px; font-size: 0.85rem;">${escapeHTML(trimmed)}</span>`);
          }
        });
      }
    }

    if (btn === 'right') {
      if (parts.length > 0 && item.keyType !== 'mouse') {
        parts.push(`<span style="font-weight: 800; color: var(--text-muted); font-size: 0.8rem;">+</span>`);
      }
      parts.push(`
        <div class="mouse-indicator mouse-right" title="滑鼠右鍵點擊">
          <svg viewBox="0 0 24 34" width="16" height="22">
            <rect x="1" y="1" width="22" height="32" rx="11" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
            <line x1="12" y1="1" x2="12" y2="15" stroke="#94a3b8" stroke-width="1.5"/>
            <path class="btn-left" d="M1 12 C1 6 6 1 12 1 L12 15 L1 15 Z" fill="transparent"/>
            <path class="btn-right" d="M12 1 C18 1 23 6 23 12 L23 15 L12 15 Z" fill="#0284c7"/>
            <rect x="10.5" y="6" width="3" height="5" rx="1.5" fill="#64748b"/>
          </svg>
          <span class="mouse-label" style="font-size: 0.78rem;">右鍵</span>
        </div>
      `);
    } else if (btn === 'left') {
      if (parts.length > 0 && item.keyType !== 'mouse') {
        parts.push(`<span style="font-weight: 800; color: var(--text-muted); font-size: 0.8rem;">+</span>`);
      }
      parts.push(`
        <div class="mouse-indicator mouse-left" title="滑鼠左鍵點擊">
          <svg viewBox="0 0 24 34" width="16" height="22">
            <rect x="1" y="1" width="22" height="32" rx="11" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
            <line x1="12" y1="1" x2="12" y2="15" stroke="#94a3b8" stroke-width="1.5"/>
            <path class="btn-left" d="M1 12 C1 6 6 1 12 1 L12 15 L1 15 Z" fill="#dc2626"/>
            <path class="btn-right" d="M12 1 C18 1 23 6 23 12 L23 15 L12 15 Z" fill="transparent"/>
            <rect x="10.5" y="6" width="3" height="5" rx="1.5" fill="#64748b"/>
          </svg>
          <span class="mouse-label" style="font-size: 0.78rem;">左鍵</span>
        </div>
      `);
    }

    return `<div class="keycap-combo">${parts.join('')}</div>`;
  },

  addBeginnerShortcut() {
    if (!this.data.beginner.shortcuts) this.data.beginner.shortcuts = [];
    this.data.beginner.shortcuts.push({
      keyType: 'keyboard',
      keyDisplay: '新按鍵',
      mouseButton: 'none',
      title: '自訂操作名稱',
      desc: '請在此輸入操作之功能說明...'
    });
    this.renderAdminBeginnerShortcuts();
    Core.saveDraft('beginner', this.data.beginner);
  },

  deleteBeginnerShortcut(idx) {
    if (confirm('確定刪除此快捷操作項目嗎？')) {
      this.data.beginner.shortcuts.splice(idx, 1);
      this.renderAdminBeginnerShortcuts();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  updateBeginnerShortcut(idx, field, val) {
    const item = this.data.beginner.shortcuts[idx];
    if (item) {
      item[field] = val.trim();
      Core.saveDraft('beginner', this.data.beginner);
      const prevEl = document.getElementById(`admin-sc-preview-${idx}`);
      if (prevEl) {
        prevEl.innerHTML = this.renderAdminKeyMouseVisual(item);
      }
    }
  },

  addBeginnerStep() {
    if (!this.data.beginner.steps) this.data.beginner.steps = [];
    const num = this.data.beginner.steps.length + 1;
    this.data.beginner.steps.push({
      badge: `階段 0${num}`,
      title: '新步驟指引',
      desc: '步驟簡要說明...',
      points: ['重點 1: 說明文字']
    });
    this.renderAdminBeginnerSteps();
    Core.saveDraft('beginner', this.data.beginner);
  },

  deleteBeginnerStep(idx) {
    if (confirm('確定刪除此開局步驟嗎？')) {
      this.data.beginner.steps.splice(idx, 1);
      this.renderAdminBeginnerSteps();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  renderAdminBeginnerSteps() {
    const container = document.getElementById('admin-beginner-steps-list');
    if (!container) return;
    container.innerHTML = '';

    const steps = this.data.beginner.steps || [];
    if (steps.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">目前無開局步驟，可點擊上方按鈕新增。</div>';
      return;
    }

    steps.forEach((step, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #ffffff;';

      const pointsText = (step.points || []).join('\n');

      card.innerHTML = `
        <div style="font-weight: 800; font-size: 1rem; color: var(--primary-text); margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <span>📌 第 ${idx + 1} 階段教學</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteBeginnerStep(${idx})">🗑️ 刪除</button>
        </div>
        <div style="display: grid; grid-template-columns: 200px 1fr; gap: 0.75rem; margin-bottom: 0.65rem;">
          <div>
            <label class="form-label" style="font-size: 0.8rem;">階段徽章標籤 (Badge)</label>
            <input type="text" class="form-control" value="${escapeAttr(step.badge || '')}" oninput="Admin.updateBeginnerStep(${idx}, 'badge', this.value)">
          </div>
          <div>
            <label class="form-label" style="font-size: 0.8rem;">步驟標題 (Title)</label>
            <input type="text" class="form-control" value="${escapeAttr(step.title || '')}" oninput="Admin.updateBeginnerStep(${idx}, 'title', this.value)">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.8rem;">前言引導說明 (Description)</label>
          <input type="text" class="form-control" value="${escapeAttr(step.desc || '')}" oninput="Admin.updateBeginnerStep(${idx}, 'desc', this.value)">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">重點列點清單 (每行一點)</label>
          <textarea class="form-control" style="min-height: 90px; font-size: 0.9rem;" oninput="Admin.updateBeginnerStepPoints(${idx}, this.value)">${escapeHTML(pointsText)}</textarea>
        </div>
      `;
      container.appendChild(card);
    });
  },

  updateBeginnerStep(idx, field, val) {
    if (this.data.beginner.steps[idx]) {
      this.data.beginner.steps[idx][field] = val.trim();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  updateBeginnerStepPoints(idx, multiline) {
    if (this.data.beginner.steps[idx]) {
      this.data.beginner.steps[idx].points = multiline.split('\n').map(s => s.trim()).filter(Boolean);
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  addBeginnerSafety() {
    if (!this.data.beginner.safety) this.data.beginner.safety = [];
    this.data.beginner.safety.push({
      title: '新領地與家園教學',
      desc: '請在此輸入領地或指令教學說明...'
    });
    this.renderAdminBeginnerSafety();
    Core.saveDraft('beginner', this.data.beginner);
  },

  deleteBeginnerSafety(idx) {
    if (confirm('確定刪除此領地教學項目嗎？')) {
      this.data.beginner.safety.splice(idx, 1);
      this.renderAdminBeginnerSafety();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  renderAdminBeginnerSafety() {
    const container = document.getElementById('admin-beginner-safety-list');
    if (!container) return;
    container.innerHTML = '';

    const safety = this.data.beginner.safety || [];
    if (safety.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">目前無領地教學項目，可點擊上方按鈕新增。</div>';
      return;
    }

    safety.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #ffffff;';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
          <span style="font-weight: 800; font-size: 0.95rem; color: var(--primary-text);">領地防護指南 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteBeginnerSafety(${idx})">🗑️ 刪除</button>
        </div>
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.8rem;">指南標題</label>
          <input type="text" class="form-control" value="${escapeAttr(s.title || '')}" oninput="Admin.updateBeginnerSafety(${idx}, 'title', this.value)">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">防護教學詳細說明</label>
          <textarea class="form-control" style="min-height: 60px;" oninput="Admin.updateBeginnerSafety(${idx}, 'desc', this.value)">${escapeHTML(s.desc || '')}</textarea>
        </div>
      `;
      container.appendChild(card);
    });
  },

  updateBeginnerSafety(idx, field, val) {
    if (this.data.beginner.safety[idx]) {
      this.data.beginner.safety[idx][field] = val.trim();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  renderAdminBeginnerFaq() {
    const container = document.getElementById('admin-beginner-faq-list');
    if (!container) return;
    container.innerHTML = '';

    const faq = this.data.beginner.faq || [];
    faq.forEach((f, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #ffffff;';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
          <span style="font-weight: 800; font-size: 0.9rem; color: var(--primary-text);">問答 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteBeginnerFaq(${idx})">🗑️ 刪除</button>
        </div>
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.8rem;">問題 (Q)</label>
          <input type="text" class="form-control" value="${escapeAttr(f.q || '')}" oninput="Admin.updateBeginnerFaq(${idx}, 'q', this.value)">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">解答說明 (A)</label>
          <textarea class="form-control" style="min-height: 60px;" oninput="Admin.updateBeginnerFaq(${idx}, 'a', this.value)">${escapeHTML(f.a || '')}</textarea>
        </div>
      `;
      container.appendChild(card);
    });
  },

  addBeginnerFaq() {
    if (!this.data.beginner.faq) this.data.beginner.faq = [];
    this.data.beginner.faq.push({
      q: '新常見問題標題？',
      a: '請在此輸入詳細解答與說明操作方式...'
    });
    this.renderAdminBeginnerFaq();
    Core.saveDraft('beginner', this.data.beginner);
  },

  deleteBeginnerFaq(idx) {
    if (confirm('確定刪除此問答項目嗎？')) {
      this.data.beginner.faq.splice(idx, 1);
      this.renderAdminBeginnerFaq();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  updateBeginnerFaq(idx, field, val) {
    if (this.data.beginner.faq[idx]) {
      this.data.beginner.faq[idx][field] = val.trim();
      Core.saveDraft('beginner', this.data.beginner);
    }
  },

  async saveBeginnerData() {
    Core.saveDraft('beginner', this.data.beginner);
    if (FS.dirHandle) {
      await FS.writeFile(['data', 'beginner.json'], JSON.stringify(this.data.beginner, null, 2));
      await FS.syncAll(this.data);
      Core.showToast('🎉 新手專區設定已成功儲存並同步寫入硬碟！');
    } else {
      Core.showToast('✅ 新手專區設定已暫存至瀏覽器快取！');
    }
  },

  /* ================= 6. Donate Section ================= */
  renderDonateList() {
    const container = document.getElementById('admin-donate-list');
    if (!container) return;
    container.innerHTML = '';

    const discInput = document.getElementById('donate-cfg-disclaimer');
    const contactInput = document.getElementById('donate-cfg-contact');

    if (discInput) discInput.value = this.data.donate.disclaimer || '';
    if (contactInput) contactInput.value = this.data.donate.contactNote || '';

    if (discInput) {
      discInput.oninput = () => {
        this.data.donate.disclaimer = discInput.value.trim();
        Core.saveDraft('donate', this.data.donate);
      };
    }
    if (contactInput) {
      contactInput.oninput = () => {
        this.data.donate.contactNote = contactInput.value.trim();
        Core.saveDraft('donate', this.data.donate);
      };
    }

    const packages = this.data.donate.packages || [];
    if (packages.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何贊助方案，點擊上方「＋ 新增贊助方案」建立第一筆。</div>';
      return;
    }

    packages.forEach((pkg, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';
      item.innerHTML = `
        <div class="item-toolbar">
          <span class="item-index">方案 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deletePackage(${idx})">刪除</button>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex: 2;">
            <label class="form-label">方案名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(pkg.name || '')}" oninput="Admin.updatePackage(${idx}, 'name', this.value)" placeholder="例如: 冒險家贊助 (VIP 1)">
          </div>
          <div class="form-group">
            <label class="form-label">價格</label>
            <input type="text" class="form-control" value="${escapeAttr(pkg.price || '')}" oninput="Admin.updatePackage(${idx}, 'price', this.value)" placeholder="例如: NT$ 150 / 月">
          </div>
          <div class="form-group">
            <label class="form-label">特別徽章</label>
            <input type="text" class="form-control" value="${escapeAttr(pkg.badge || '')}" oninput="Admin.updatePackage(${idx}, 'badge', this.value)" placeholder="例如: 熱門 / 推薦">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">簡述說明</label>
          <input type="text" class="form-control" value="${escapeAttr(pkg.description || '')}" oninput="Admin.updatePackage(${idx}, 'description', this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">特權清單 (每行一項)</label>
          <textarea class="form-control" style="min-height: 80px;" oninput="Admin.updatePackagePerks(${idx}, this.value)">${escapeAttr((pkg.perks || []).join('\n'))}</textarea>
        </div>
      `;
      container.appendChild(item);
    });
  },

  addPackage() {
    if (!this.data.donate.packages) this.data.donate.packages = [];
    this.data.donate.packages.push({
      name: '全新贊助方案',
      price: 'NT$ 100',
      badge: '',
      description: '方案描述說明',
      perks: ['特色權益一', '特色權益二']
    });
    this.renderDonateList();
    Core.saveDraft('donate', this.data.donate);
    Core.showToast('已新增一個贊助方案');
  },

  updatePackage(idx, field, val) {
    if (this.data.donate.packages[idx]) {
      this.data.donate.packages[idx][field] = val;
      Core.saveDraft('donate', this.data.donate);
    }
  },

  updatePackagePerks(idx, multiline) {
    if (this.data.donate.packages[idx]) {
      this.data.donate.packages[idx].perks = multiline.split('\n').map(s => s.trim()).filter(Boolean);
      Core.saveDraft('donate', this.data.donate);
    }
  },

  deletePackage(idx) {
    if (confirm('確定刪除此贊助方案嗎？')) {
      this.data.donate.packages.splice(idx, 1);
      this.renderDonateList();
      Core.saveDraft('donate', this.data.donate);
    }
  },

  /* ================= 7. Export Actions ================= */
  setupExportActions() {
    const exportBtn = document.getElementById('btn-export-zip');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        Exporter.exportZip(this.data);
      });
    }

    const clearDraftBtn = document.getElementById('btn-clear-drafts');
    if (clearDraftBtn) {
      clearDraftBtn.addEventListener('click', () => {
        if (confirm('確定清除本地所有草稿並還原為原檔案資料嗎？')) {
          Core.clearDrafts();
          location.reload();
        }
      });
    }
  }
};

function escapeAttr(str) {
  return escapeHTML(str);
}

window.Admin = Admin;
window.FS = FS;
window.escapeHTML = escapeHTML;
window.escapeAttr = escapeAttr;

document.addEventListener('DOMContentLoaded', () => {
  Admin.init();
});
