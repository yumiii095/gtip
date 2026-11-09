/**
 * Cobblemon Admin Dashboard Logic
 * High-performance, offline-first admin controller
 */

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

    // 1. Load initial data (supports local file:// via INITIAL_DATABASE)
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

  /* ================= 1. Config Section ================= */
  renderConfigForm() {
    const c = this.data.config || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('cfg-serverName', c.serverName);
    setVal('cfg-serverIp', c.serverIp);
    setVal('cfg-serverPort', c.serverPort || '25565');
    setVal('cfg-version', c.version);
    setVal('cfg-discordUrl', c.discordUrl);
    setVal('cfg-tagline', c.tagline);
    setVal('cfg-description', c.description);

    ['cfg-serverName', 'cfg-serverIp', 'cfg-serverPort', 'cfg-version', 'cfg-discordUrl', 'cfg-tagline', 'cfg-description'].forEach(id => {
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

    this.data.config.serverName = getVal('cfg-serverName');
    this.data.config.serverIp = getVal('cfg-serverIp');
    this.data.config.serverPort = getVal('cfg-serverPort');
    this.data.config.version = getVal('cfg-version');
    this.data.config.discordUrl = getVal('cfg-discordUrl');
    this.data.config.tagline = getVal('cfg-tagline');
    this.data.config.description = getVal('cfg-description');
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
              <option value="維護" ${a.category === '維護' ? 'selected' : ''}>維護</option>
              <option value="一般" ${a.category === '一般' ? 'selected' : ''}>一般</option>
            </select>
          </div>
          <div class="form-group" style="max-width: 160px;">
            <label class="form-label">發布日期</label>
            <input type="date" class="form-control" value="${escapeAttr(a.date || '')}" oninput="Admin.updateAnnouncement(${idx}, 'date', this.value)">
          </div>
          <div class="form-group" style="max-width: 110px; display: flex; flex-direction: column; justify-content: flex-end;">
            <label style="display: flex; align-items: center; gap: 4px; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.75rem; cursor: pointer;">
              <input type="checkbox" ${a.pinned ? 'checked' : ''} onchange="Admin.updateAnnouncement(${idx}, 'pinned', this.checked)"> 📌 置頂
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">公告內容</label>
          <textarea class="form-control" style="min-height: 80px;" oninput="Admin.updateAnnouncement(${idx}, 'content', this.value)" placeholder="輸入公告內容說明...">${escapeAttr(a.content || '')}</textarea>
        </div>
      `;
      container.appendChild(item);
    });
  },

  addAnnouncement() {
    const today = new Date().toISOString().slice(0, 10);
    this.data.announcements.unshift({
      title: '全新公告標題',
      category: '更新',
      date: today,
      pinned: false,
      content: '請在此輸入詳細公告說明內容。'
    });
    this.renderAnnouncementsList();
    Core.saveDraft('announcements', this.data.announcements);
    Core.showToast('已新增一則最新公告');
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

    this.data.commands.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';
      item.innerHTML = `
        <div class="item-toolbar">
          <span class="item-index">指令 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteCommand(${idx})">刪除</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">指令名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(cmd.name || '')}" oninput="Admin.updateCommand(${idx}, 'name', this.value)" placeholder="例如: /pc">
          </div>
          <div class="form-group">
            <label class="form-label">分類</label>
            <input type="text" class="form-control" value="${escapeAttr(cmd.category || '寶可夢')}" oninput="Admin.updateCommand(${idx}, 'category', this.value)" placeholder="例如: 寶可夢 / 常用 / 領地">
          </div>
          <div class="form-group">
            <label class="form-label">權限標籤</label>
            <input type="text" class="form-control" value="${escapeAttr(cmd.permission || '玩家')}" oninput="Admin.updateCommand(${idx}, 'permission', this.value)" placeholder="例如: 玩家 / VIP / 管理員">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex: 2;">
            <label class="form-label">完整語法說明</label>
            <input type="text" class="form-control" value="${escapeAttr(cmd.syntax || '')}" oninput="Admin.updateCommand(${idx}, 'syntax', this.value)" placeholder="例如: /pc [頁數]">
          </div>
          <div class="form-group" style="flex: 3;">
            <label class="form-label">功能說明</label>
            <input type="text" class="form-control" value="${escapeAttr(cmd.description || '')}" oninput="Admin.updateCommand(${idx}, 'description', this.value)" placeholder="例如: 隨時隨地打開個人寶可夢電腦儲存箱">
          </div>
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
    Core.showToast('已新增一筆指令');
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

  /* ================= 4. Pokédex Section (High Performance) ================= */
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
      // Restore cursor position if re-rendering
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

  /* ================= 5. Guides Section ================= */
  renderGuidesList() {
    const container = document.getElementById('admin-guides-list');
    if (!container) return;
    container.innerHTML = '';

    if (!this.data.guides || this.data.guides.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何攻略，點擊上方「＋ 新增攻略文章」建立第一篇。</div>';
      return;
    }

    this.data.guides.forEach((g, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';
      item.innerHTML = `
        <div class="item-toolbar">
          <span class="item-index">攻略篇章 #${idx + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deleteGuide(${idx})">刪除</button>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex: 2;">
            <label class="form-label">攻略標題</label>
            <input type="text" class="form-control" value="${escapeAttr(g.title || '')}" oninput="Admin.updateGuide(${idx}, 'title', this.value)" placeholder="例如: Cobblemon 新手起步與精靈球製作">
          </div>
          <div class="form-group">
            <label class="form-label">文章分類</label>
            <input type="text" class="form-control" value="${escapeAttr(g.category || '新手教學')}" oninput="Admin.updateGuide(${idx}, 'category', this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">作者名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(g.author || '管理員')}" oninput="Admin.updateGuide(${idx}, 'author', this.value)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">簡介摘要（卡片展示用）</label>
          <input type="text" class="form-control" value="${escapeAttr(g.summary || '')}" oninput="Admin.updateGuide(${idx}, 'summary', this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">內文 (支援插入圖片)</label>
          <textarea class="form-control" style="min-height: 140px;" oninput="Admin.updateGuide(${idx}, 'content', this.value)">${escapeAttr(g.content || '')}</textarea>
        </div>
      `;
      container.appendChild(item);
    });
  },

  addGuide() {
    const today = new Date().toISOString().slice(0, 10);
    this.data.guides.push({
      title: '新攻略標題',
      category: '新手教學',
      author: '管理員',
      updatedAt: today,
      summary: '攻略大綱簡述...',
      content: '請在此輸入攻略內文說明。',
      coverImage: ''
    });
    this.renderGuidesList();
    Core.saveDraft('guides', this.data.guides);
    Core.showToast('已新增一篇攻略草稿');
  },

  updateGuide(idx, field, val) {
    if (this.data.guides[idx]) {
      this.data.guides[idx][field] = val;
      Core.saveDraft('guides', this.data.guides);
    }
  },

  deleteGuide(idx) {
    if (confirm('確定刪除此篇攻略嗎？')) {
      this.data.guides.splice(idx, 1);
      this.renderGuidesList();
      Core.saveDraft('guides', this.data.guides);
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
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">目前無任何方案，點擊上方「＋ 新增贊助方案」建立第一筆。</div>';
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
