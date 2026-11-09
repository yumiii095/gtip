/**
 * Cobblemon Admin Dashboard Logic
 * High-performance, offline-first admin controller with Direct Local File System Access API
 */

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
      if (this.dirHandle) {
        const perm = await this.dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          this.updateStatus(true);
          Core.showToast(`✅ 已連線至資料夾: ${this.dirHandle.name}`);
          return true;
        }
      }
      this.dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      await this.storeHandle(this.dirHandle);
      this.updateStatus(true);
      Core.showToast(`✅ 已成功連結專案資料夾: ${this.dirHandle.name}`);
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Pick directory error:', err);
        alert('選取資料夾時發生錯誤: ' + err.message);
      }
      return false;
    }
  },

  updateStatus(isConnected, note = '') {
    const badge = document.getElementById('fs-status-badge');
    const btn = document.getElementById('btn-fs-connect');
    const syncBtn = document.getElementById('btn-fs-sync-all');

    if (isConnected && this.dirHandle) {
      if (badge) {
        badge.className = 'fs-badge fs-connected';
        badge.innerHTML = `🟢 已連結本機: <strong>${escapeAttr(this.dirHandle.name)}</strong>`;
      }
      if (btn) {
        btn.textContent = '🔄 切換資料夾';
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

  async init() {
    this.setupTabs();

    // Clear stale drafts from previous mock data session
    if (localStorage.getItem('admin_draft_cleaned_v2') !== 'done') {
      Core.clearDrafts();
      localStorage.setItem('admin_draft_cleaned_v2', 'done');
    }

    // 1. Load initial data
    this.data.config = await Core.loadJSON('config', 'data/config.json') || {};
    this.data.announcements = await Core.loadJSON('announcements', 'data/announcements.json') || [];
    this.data.commands = await Core.loadJSON('commands', 'data/commands.json') || [];

    // Load Pokédex data (supports poke.json with 1,000+ Cobblemon entries)
    let pList = await Core.loadJSON('poke', 'data/poke.json');
    if (!pList || pList.length === 0) {
      pList = await Core.loadJSON('pokemon', 'data/pokemon.json') || [];
    }
    this.data.pokemon = pList;

    this.data.guides = await Core.loadJSON('guides', 'data/guides.json') || [];
    this.data.donate = await Core.loadJSON('donate', 'data/donate.json') || { packages: [] };

    // 2. Render all panels
    this.renderConfigForm();
    this.renderAnnouncementsList();
    this.renderCommandsList();
    this.renderPokemonList();
    this.renderGuidesList();
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
    setVal('cfg-description', c.description);

    ['cfg-serverName', 'cfg-tagline', 'cfg-description'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.oninput = () => this.syncConfig();
      }
    });
  },

  syncConfig() {
    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    this.data.config = {
      serverName: getVal('cfg-serverName') || 'CobblemonOasis 綠洲',
      tagline: getVal('cfg-tagline'),
      description: getVal('cfg-description')
    };
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
  renderCommandsList() {
    const container = document.getElementById('admin-commands-list');
    if (!container) return;
    container.innerHTML = '';

    if (!this.data.commands || this.data.commands.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何指令，點擊上方「＋ 新增指令」建立第一筆。</div>';
      return;
    }

    this.data.commands.forEach((c, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';
      item.innerHTML = `
        <div class="item-toolbar">
          <span class="item-index">指令 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteCommand(${idx})">刪除</button>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex: 1.5;">
            <label class="form-label">指令名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(c.name || '')}" oninput="Admin.updateCommand(${idx}, 'name', this.value)" placeholder="例如: /pc">
          </div>
          <div class="form-group" style="flex: 1;">
            <label class="form-label">分類名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(c.category || '常用')}" oninput="Admin.updateCommand(${idx}, 'category', this.value)" placeholder="例如: 常用 / 領地 / 寶可夢 / 經濟">
          </div>
          <div class="form-group" style="max-width: 140px;">
            <label class="form-label">使用權限</label>
            <input type="text" class="form-control" value="${escapeAttr(c.permission || '玩家')}" oninput="Admin.updateCommand(${idx}, 'permission', this.value)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">完整語法</label>
          <input type="text" class="form-control" value="${escapeAttr(c.syntax || '')}" oninput="Admin.updateCommand(${idx}, 'syntax', this.value)" placeholder="例如: /trade <玩家名稱>">
        </div>
        <div class="form-group">
          <label class="form-label">功能說明</label>
          <input type="text" class="form-control" value="${escapeAttr(c.description || '')}" oninput="Admin.updateCommand(${idx}, 'description', this.value)" placeholder="詳細說明此指令的用途與效果">
        </div>
      `;
      container.appendChild(item);
    });
  },

  addCommand() {
    this.data.commands.push({
      name: '/newcmd',
      category: '常用',
      permission: '玩家',
      syntax: '/newcmd',
      description: '指令說明'
    });
    this.renderCommandsList();
    Core.saveDraft('commands', this.data.commands);
    Core.showToast('已新增一個指令');
  },

  updateCommand(idx, field, val) {
    if (this.data.commands[idx]) {
      this.data.commands[idx][field] = val;
      Core.saveDraft('commands', this.data.commands);
    }
  },

  deleteCommand(idx) {
    if (confirm('確定刪除這筆指令嗎？')) {
      this.data.commands.splice(idx, 1);
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

  /* True WYSIWYG Formatting Actions */
  applyWordFormat(type) {
    const editor = document.getElementById('modal-guide-visual-editor');
    if (!editor) return;
    editor.focus();

    switch (type) {
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'h2':
        document.execCommand('formatBlock', false, '<h2>');
        break;
      case 'h3':
        document.execCommand('formatBlock', false, '<h3>');
        break;
      case 'list':
        document.execCommand('insertUnorderedList', false, null);
        break;
    }
  },

  applyTextColor(colorHex) {
    const editor = document.getElementById('modal-guide-visual-editor');
    if (!editor) return;
    editor.focus();
    document.execCommand('foreColor', false, colorHex);
  },

  applyHighlight(colorHex) {
    const editor = document.getElementById('modal-guide-visual-editor');
    if (!editor) return;
    editor.focus();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const mark = document.createElement('mark');
      mark.style.backgroundColor = colorHex;
      mark.style.padding = '2px 5px';
      mark.style.borderRadius = '4px';
      mark.style.fontWeight = '600';
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
      sel.removeAllRanges();
    } else {
      document.execCommand('hiliteColor', false, colorHex);
    }
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
      const img = t.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (img) return `<p><img src="${img[2]}" alt="${img[1]}" style="max-width: 100%; border-radius: 8px;"></p>`;
      if (t.startsWith('## ')) return `<h2>${t.slice(3)}</h2>`;
      if (t.startsWith('### ')) return `<h3>${t.slice(4)}</h3>`;
      if (t.split('\n').every(l => l.trim().startsWith('- '))) {
        return `<ul>${t.split('\n').map(l => `<li>${l.trim().slice(2)}</li>`).join('')}</ul>`;
      }
      return `<p>${t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>')}</p>`;
    }).join('');
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
  return String(str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

document.addEventListener('DOMContentLoaded', () => {
  Admin.init();
});
