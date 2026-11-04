/**
 * Cobblemon Admin Dashboard Logic
 */

const Admin = {
  data: {
    config: {},
    commands: [],
    pokemon: [],
    guides: [],
    donate: { packages: [] }
  },

  async init() {
    this.setupTabs();

    // Load initial data
    this.data.config = await Core.loadJSON('config', 'data/config.json') || {};
    this.data.commands = await Core.loadJSON('commands', 'data/commands.json') || [];
    this.data.pokemon = await Core.loadJSON('pokemon', 'data/pokemon.json') || [];
    this.data.guides = await Core.loadJSON('guides', 'data/guides.json') || [];
    this.data.donate = await Core.loadJSON('donate', 'data/donate.json') || { packages: [] };

    this.renderConfigForm();
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
    const c = this.data.config;
    document.getElementById('cfg-serverName').value = c.serverName || '';
    document.getElementById('cfg-serverIp').value = c.serverIp || '';
    document.getElementById('cfg-serverPort').value = c.serverPort || '25565';
    document.getElementById('cfg-version').value = c.version || '';
    document.getElementById('cfg-discordUrl').value = c.discordUrl || '';
    document.getElementById('cfg-tagline').value = c.tagline || '';
    document.getElementById('cfg-description').value = c.description || '';

    // Image upload for banner
    const bannerInput = document.getElementById('cfg-banner-file');
    const bannerPath = document.getElementById('cfg-bannerImage');
    const bannerPreview = document.getElementById('cfg-banner-preview');

    if (c.bannerImage) {
      bannerPath.value = c.bannerImage;
      bannerPreview.src = c.bannerImage;
      bannerPreview.style.display = 'block';
    }

    bannerInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const cleanName = 'banner_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '');
      const relPath = 'images/banners/' + cleanName;

      Exporter.registerUploadedImage(relPath, file);
      bannerPath.value = relPath;
      bannerPreview.src = URL.createObjectURL(file);
      bannerPreview.style.display = 'block';
      this.syncConfig();
    });

    ['cfg-serverName', 'cfg-serverIp', 'cfg-serverPort', 'cfg-version', 'cfg-discordUrl', 'cfg-tagline', 'cfg-description'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.syncConfig());
    });
  },

  syncConfig() {
    this.data.config.serverName = document.getElementById('cfg-serverName').value.trim();
    this.data.config.serverIp = document.getElementById('cfg-serverIp').value.trim();
    this.data.config.serverPort = document.getElementById('cfg-serverPort').value.trim();
    this.data.config.version = document.getElementById('cfg-version').value.trim();
    this.data.config.discordUrl = document.getElementById('cfg-discordUrl').value.trim();
    this.data.config.tagline = document.getElementById('cfg-tagline').value.trim();
    this.data.config.description = document.getElementById('cfg-description').value.trim();
    this.data.config.bannerImage = document.getElementById('cfg-bannerImage').value.trim();
    Core.saveDraft('config', this.data.config);
  },

  /* ================= 2. Commands Section ================= */
  renderCommandsList() {
    const container = document.getElementById('admin-commands-list');
    container.innerHTML = '';

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
            <input type="text" class="form-control" value="${escapeAttr(cmd.category || '寶可夢')}" oninput="Admin.updateCommand(${idx}, 'category', this.value)" placeholder="例如: 寶可夢 / 領地 / 常用">
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
      category: '一般',
      permission: '玩家',
      syntax: '/newcmd',
      description: '指令說明'
    });
    this.renderCommandsList();
    Core.saveDraft('commands', this.data.commands);
    Core.showToast('已新增一筆指令，請填寫欄位');
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

  /* ================= 3. Pokédex Section ================= */
  renderPokemonList() {
    const container = document.getElementById('admin-pokemon-list');
    container.innerHTML = '';

    const availableTypes = ["一般", "格鬥", "飛行", "毒", "地面", "岩石", "蟲", "幽靈", "鋼", "火", "水", "草", "電", "超能力", "冰", "龍", "惡", "妖精"];

    this.data.pokemon.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'editable-item';

      const typesHTML = availableTypes.map(t => {
        const checked = (p.types || []).includes(t) ? 'checked' : '';
        return `
          <label style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.8rem; margin-right: 8px;">
            <input type="checkbox" ${checked} onchange="Admin.togglePokeType(${idx}, '${t}', this.checked)"> ${t}
          </label>
        `;
      }).join('');

      item.innerHTML = `
        <div class="item-toolbar">
          <span class="item-index">寶可夢 #${p.id || (idx + 1)}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="Admin.deletePokemon(${idx})">刪除</button>
        </div>
        <div class="form-row">
          <div class="form-group" style="max-width: 120px;">
            <label class="form-label">全國編號</label>
            <input type="number" class="form-control" value="${p.id || (idx + 1)}" oninput="Admin.updatePokemon(${idx}, 'id', parseInt(this.value, 10))">
          </div>
          <div class="form-group">
            <label class="form-label">中文名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(p.name || '')}" oninput="Admin.updatePokemon(${idx}, 'name', this.value)" placeholder="例如: 妙蛙種子">
          </div>
          <div class="form-group">
            <label class="form-label">英文名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(p.nameEn || '')}" oninput="Admin.updatePokemon(${idx}, 'nameEn', this.value)" placeholder="例如: Bulbasaur">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">屬性標籤（可多選）</label>
          <div style="background: var(--bg-page); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; flex-wrap: wrap;">
            ${typesHTML}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">HP</label>
            <input type="number" class="form-control" value="${p.hp || 50}" oninput="Admin.updatePokemon(${idx}, 'hp', parseInt(this.value, 10))">
          </div>
          <div class="form-group">
            <label class="form-label">物攻</label>
            <input type="number" class="form-control" value="${p.atk || 50}" oninput="Admin.updatePokemon(${idx}, 'atk', parseInt(this.value, 10))">
          </div>
          <div class="form-group">
            <label class="form-label">物防</label>
            <input type="number" class="form-control" value="${p.def || 50}" oninput="Admin.updatePokemon(${idx}, 'def', parseInt(this.value, 10))">
          </div>
          <div class="form-group">
            <label class="form-label">特攻</label>
            <input type="number" class="form-control" value="${p.spa || 50}" oninput="Admin.updatePokemon(${idx}, 'spa', parseInt(this.value, 10))">
          </div>
          <div class="form-group">
            <label class="form-label">特防</label>
            <input type="number" class="form-control" value="${p.spd || 50}" oninput="Admin.updatePokemon(${idx}, 'spd', parseInt(this.value, 10))">
          </div>
          <div class="form-group">
            <label class="form-label">速度</label>
            <input type="number" class="form-control" value="${p.spe || 50}" oninput="Admin.updatePokemon(${idx}, 'spe', parseInt(this.value, 10))">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">棲息環境 / 生成條件</label>
            <input type="text" class="form-control" value="${escapeAttr(p.habitat || '')}" oninput="Admin.updatePokemon(${idx}, 'habitat', this.value)" placeholder="例如: 森林群系、平原、白天生成">
          </div>
          <div class="form-group">
            <label class="form-label">進化方式</label>
            <input type="text" class="form-control" value="${escapeAttr(p.evolution || '')}" oninput="Admin.updatePokemon(${idx}, 'evolution', this.value)" placeholder="例如: 16級進化為妙蛙草">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">寶可夢圖片 (上傳後自動歸檔至 images/pokemon/)</label>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <input type="file" accept="image/*" onchange="Admin.handlePokemonImageUpload(${idx}, this.files[0])">
            <span class="image-path-tag">${p.image || '未設定圖片'}</span>
          </div>
        </div>
      `;
      container.appendChild(item);
    });
  },

  addPokemon() {
    const nextId = (this.data.pokemon.length > 0) ? (Math.max(...this.data.pokemon.map(p => p.id || 0)) + 1) : 1;
    this.data.pokemon.push({
      id: nextId,
      name: '',
      nameEn: '',
      types: ['一般'],
      hp: 50,
      atk: 50,
      def: 50,
      spa: 50,
      spd: 50,
      spe: 50,
      habitat: '',
      evolution: '',
      image: ''
    });
    this.renderPokemonList();
    Core.saveDraft('pokemon', this.data.pokemon);
    Core.showToast('已新增一隻寶可夢，請填寫各項參數');
  },

  updatePokemon(idx, field, val) {
    if (this.data.pokemon[idx]) {
      this.data.pokemon[idx][field] = val;
      Core.saveDraft('pokemon', this.data.pokemon);
    }
  },

  togglePokeType(idx, type, checked) {
    if (!this.data.pokemon[idx]) return;
    let list = this.data.pokemon[idx].types || [];
    if (checked && !list.includes(type)) {
      list.push(type);
    } else if (!checked) {
      list = list.filter(t => t !== type);
    }
    this.data.pokemon[idx].types = list;
    Core.saveDraft('pokemon', this.data.pokemon);
  },

  handlePokemonImageUpload(idx, file) {
    if (!file || !this.data.pokemon[idx]) return;
    const cleanName = 'poke_' + (this.data.pokemon[idx].id || (idx + 1)) + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '');
    const relPath = 'images/pokemon/' + cleanName;

    Exporter.registerUploadedImage(relPath, file);
    this.data.pokemon[idx].image = relPath;
    Core.saveDraft('pokemon', this.data.pokemon);
    this.renderPokemonList();
    Core.showToast(`圖片已設定並記錄路徑: ${relPath}`);
  },

  deletePokemon(idx) {
    if (confirm('確定刪除此隻寶可夢資料嗎？')) {
      this.data.pokemon.splice(idx, 1);
      this.renderPokemonList();
      Core.saveDraft('pokemon', this.data.pokemon);
    }
  },

  /* ================= 4. Guides Section ================= */
  renderGuidesList() {
    const container = document.getElementById('admin-guides-list');
    container.innerHTML = '';

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
            <input type="text" class="form-control" value="${escapeAttr(g.category || '新手教學')}" oninput="Admin.updateGuide(${idx}, 'category', this.value)" placeholder="例如: 新手教學 / 繁殖培育 / 伺服器特色">
          </div>
          <div class="form-group">
            <label class="form-label">作者名稱</label>
            <input type="text" class="form-control" value="${escapeAttr(g.author || '管理員')}" oninput="Admin.updateGuide(${idx}, 'author', this.value)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">簡介摘要（卡片展示用）</label>
          <input type="text" class="form-control" value="${escapeAttr(g.summary || '')}" oninput="Admin.updateGuide(${idx}, 'summary', this.value)" placeholder="一句話概括這篇攻略的核心重點...">
        </div>
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">內文 (支援插入圖片)</label>
            <div>
              <label class="btn btn-secondary btn-sm" style="cursor: pointer;">
                📷 上傳並插入圖片至內文
                <input type="file" accept="image/*" style="display: none;" onchange="Admin.insertGuideImage(${idx}, this.files[0])">
              </label>
            </div>
          </div>
          <textarea id="guide-textarea-${idx}" class="form-control" style="min-height: 160px;" oninput="Admin.updateGuide(${idx}, 'content', this.value)" placeholder="輸入攻略段落，段落之間請空一行...">${escapeAttr(g.content || '')}</textarea>
          <div class="form-hint">提示：每段文字以空行隔開。若點擊上方按鈕插入圖片，系統會自動在游標處產生 ![圖片說明](images/guides/...) 語法。</div>
        </div>
      `;
      container.appendChild(item);
    });
  },

  addGuide() {
    const today = new Date().toISOString().slice(0, 10);
    this.data.guides.push({
      title: '新攻略標題',
      category: '新手指南',
      author: '管理員',
      updatedAt: today,
      summary: '',
      content: '',
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

  insertGuideImage(idx, file) {
    if (!file || !this.data.guides[idx]) return;
    const cleanName = 'guide_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '');
    const relPath = 'images/guides/' + cleanName;

    Exporter.registerUploadedImage(relPath, file);

    const textarea = document.getElementById(`guide-textarea-${idx}`);
    const markdownImg = `\n\n![${file.name}](${relPath})\n\n`;

    if (textarea) {
      const pos = textarea.selectionStart || textarea.value.length;
      const original = textarea.value;
      textarea.value = original.slice(0, pos) + markdownImg + original.slice(pos);
      this.data.guides[idx].content = textarea.value;
    } else {
      this.data.guides[idx].content = (this.data.guides[idx].content || '') + markdownImg;
    }

    Core.saveDraft('guides', this.data.guides);
    Core.showToast(`已插入圖片語法，並已排入 images/guides 資料夾`);
  },

  deleteGuide(idx) {
    if (confirm('確定刪除此篇攻略嗎？')) {
      this.data.guides.splice(idx, 1);
      this.renderGuidesList();
      Core.saveDraft('guides', this.data.guides);
    }
  },

  /* ================= 5. Donate Section ================= */
  renderDonateList() {
    const container = document.getElementById('admin-donate-list');
    container.innerHTML = '';

    const discInput = document.getElementById('donate-cfg-disclaimer');
    const contactInput = document.getElementById('donate-cfg-contact');

    discInput.value = this.data.donate.disclaimer || '';
    contactInput.value = this.data.donate.contactNote || '';

    discInput.oninput = () => {
      this.data.donate.disclaimer = discInput.value.trim();
      Core.saveDraft('donate', this.data.donate);
    };
    contactInput.oninput = () => {
      this.data.donate.contactNote = contactInput.value.trim();
      Core.saveDraft('donate', this.data.donate);
    };

    (this.data.donate.packages || []).forEach((pkg, idx) => {
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
          <input type="text" class="form-control" value="${escapeAttr(pkg.description || '')}" oninput="Admin.updatePackage(${idx}, 'description', this.value)" placeholder="例如: 適合剛加入伺服器、希望加快起步的冒險者">
        </div>
        <div class="form-group">
          <label class="form-label">特權清單 (每行一項)</label>
          <textarea class="form-control" style="min-height: 80px;" oninput="Admin.updatePackagePerks(${idx}, this.value)" placeholder="彩色聊天稱號&#10;每日領取專屬精靈球禮包&#10;自訂傳送點 +2 個">${escapeAttr((pkg.perks || []).join('\n'))}</textarea>
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

  /* ================= 6. Export Actions ================= */
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
