/**
 * 全站搜尋（首頁搜尋框）
 * - 模糊比對：js/vendor/fuse.min.js（Fuse.js），再補上「完整包含關鍵字」的精準結果並排在最前面
 * - 資料來源：指令、攻略、新手專區、寶可夢圖鑑（沿用 Core.loadJSON，file:// 離線也能用）
 * - 點結果會帶參數跳到各頁定位：commands?q= / guides?g= / beginner?h= / pokedex?q=
 */
(function () {
  const input = document.getElementById('site-search-input');
  const panel = document.getElementById('site-search-results');
  if (!input || !panel) return;

  const isWeb = location.protocol.startsWith('http');
  const pageUrl = (name, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return (isWeb ? name : name + '.html') + qs;
  };

  const PAGES = [
    ['beginner',   '🔰 新手專區',   '快捷鍵、新手開局、家園與領地防護、常見問答', '新手 入門 開局 快捷鍵 領地防護 常見問答 faq'],
    ['commands',   '⌨️ 指令查詢',   '所有伺服器指令，一鍵複製', '指令 速查 command 複製 分類'],
    ['pokedex',    '📖 寶可夢圖鑑', '寶可夢刷新地點、掉落物、群系與稀有度', '圖鑑 寶可夢 刷新地點 刷新 出沒 掉落物 群系 稀有度 spawn pokedex'],
    ['type-chart', '⚔️ 屬性相剋',   '屬性相剋表，查弱點與抵抗', '屬性 相剋 剋制 弱點 抵抗 type 倍率'],
    ['guides',     '🧭 攻略專區',   '進階攻略與教學文章', '攻略 教學 進階 文章'],
    ['donate',     '💝 贊助支持',   '贊助方式與支持伺服器', '贊助 捐款 支持 donate vip']
  ];

  const GROUPS = [
    { type: 'page',     label: '頁面',     icon: '🗂️', limit: 3 },
    { type: 'cmd',     label: '指令',     icon: '⌨️', limit: 6 },
    { type: 'guide',    label: '攻略',     icon: '🧭', limit: 4 },
    { type: 'beginner', label: '新手專區', icon: '🔰', limit: 5 },
    { type: 'poke',     label: '寶可夢圖鑑', icon: '📖', limit: 6 }
  ];

  // 同義詞：讓玩家用不同講法也找得到指令
  const ALIASES = [
    [/^\/(tp|rtp|spawn|back|warp)|^\/(home|sethome|delhome|edithome|homes|homelist)/, '傳送 teleport tp 回家 家 紀錄點'],
    [/^\/(town|res)/, '城鎮 領地 town 圈地 認領 claim 市長'],
    [/^\/cb/, '雕塑 版權 copyright 授權'],
    [/^\/(money|crate|shop|exchange|oasisgts)/, '金幣 錢 經濟 商店 交易 gts 箱子 鑰匙'],
    [/^\/pokeheal|^\/repair|^\/fly/, 'vip 治療 回血 修復 飛行'],
    [/^\/(friend|party)/, '好友 小隊 組隊 朋友'],
    [/^\/(mail|mailbox)/, '郵件 郵箱 信箱 寄信'],
    [/^\/raid/, '團體戰 團戰 raid 首領'],
    [/^\/ranked/, '排位 對戰 排行榜 天梯'],
    [/^\/bingo/, '賓果 bingo 任務'],
    [/^\/gym/, '道館 館主 挑戰'],
    [/^\/daycare/, '培育屋 孵蛋 繁殖 蛋'],
    [/^\/(pokegift|pokemongift)/, '贈送 送寶可夢 禮物'],
    [/^\/(m|r|message)$/, '私聊 密語 聊天 whisper'],
    [/^\/ultra/, '究極洞穴 究極空間 巢穴'],
    [/^\/(sign|owomap)/, '署名 簽名 地圖畫'],
    [/^\/(onlinereward|lbl)/, '在線獎勵 獎勵 幸運方塊']
  ];

  const QUICK_TAGS = ['傳送', '領地', '培育屋', '刷新地點', '屬性相剋', '快捷鍵', '郵件', '道館'];  // 每個詞都要確保搜得到結果

  const plain = (html) => {
    if (!html) return '';
    try { return (new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); }
    catch (e) { return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
  const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

  // ---------- 建立索引 ----------
  let engines = null;       // { type: { fuse, docs } }
  let loadPromise = null;

  function buildEngines(cmds, guides, beginner, poke) {
    const docs = { page: [], cmd: [], guide: [], beginner: [], poke: [] };

    PAGES.forEach(([name, title, sub, kw]) => {
      docs.page.push({ type: 'page', title, sub, tag: '', title_s: title, text: kw + ' ' + sub, url: pageUrl(name) });
    });

    (cmds || []).forEach(c => {
      const name = c.name || c.syntax || '';
      const alias = ALIASES.filter(([re]) => re.test(name)).map(a => a[1]).join(' ');
      docs.cmd.push({
        type: 'cmd', title: name, sub: c.description || '', tag: c.category || '',
        copy: c.syntax || name,
        title_s: name, text: [c.description, c.category, alias].filter(Boolean).join(' '),
        url: pageUrl('commands', { q: name })
      });
    });

    (guides || []).forEach(g => {
      const content = plain(g.content);
      docs.guide.push({
        type: 'guide', title: g.title || '未命名攻略', sub: g.summary || clip(content, 60), tag: g.category || '攻略',
        title_s: g.title || '', text: [g.summary, g.category, content].filter(Boolean).join(' '),
        content, url: pageUrl('guides', { g: g.title || '' })
      });
    });

    if (beginner) {
      const addB = (section, title, body) => {
        const t = plain(title);
        if (!t) return;
        docs.beginner.push({
          type: 'beginner', title: t, sub: clip(plain(body), 70), tag: section,
          title_s: t, text: plain(body) + ' ' + section, url: pageUrl('beginner', { h: t })
        });
      };
      (beginner.shortcuts || []).forEach(s => addB('主要快捷鍵', s.title, s.desc));
      (beginner.steps || []).forEach(s => addB('新手開局指南', s.title, [s.desc].concat(s.points || []).join(' ')));
      (beginner.safety || []).forEach(s => addB('家園與領地防護', s.title, s.desc));
      (beginner.faq || []).forEach(f => addB('新手常見問答', f.q, f.a));
    }

    (poke || []).forEach(p => {
      const no = String(p.no || p.id || '');
      docs.poke.push({
        type: 'poke', title: p.name || '', sub: no ? '#' + no.padStart(3, '0') : '', tag: '',
        title_s: p.name || '', text: no + ' ' + no.padStart(3, '0'),
        url: pageUrl('pokedex', { q: p.name || '' })
      });
    });

    const mk = (type, keys, threshold) => ({
      docs: docs[type],
      // 若 Fuse.js 沒載入（例如 js/vendor/fuse.min.js 沒上傳），退回只做「完整包含」比對，搜尋仍可使用
      fuse: typeof Fuse !== 'function' ? null : new Fuse(docs[type], { keys, threshold, ignoreLocation: true, includeScore: true, minMatchCharLength: 1 })
    });
    return {
      page: mk('page', [{ name: 'title_s', weight: 3 }, { name: 'text', weight: 1.5 }], 0.35),
      cmd: mk('cmd', [{ name: 'title_s', weight: 3 }, { name: 'text', weight: 1.5 }], 0.4),
      guide: mk('guide', [{ name: 'title_s', weight: 3 }, { name: 'text', weight: 1 }], 0.3),
      beginner: mk('beginner', [{ name: 'title_s', weight: 3 }, { name: 'text', weight: 1 }], 0.3),
      poke: mk('poke', [{ name: 'title_s', weight: 3 }, { name: 'text', weight: 2 }], 0.4)
    };
  }

  function ensureLoaded() {
    if (engines) return Promise.resolve(engines);
    if (!loadPromise) {
      loadPromise = Promise.all([
        Core.loadJSON('commands', 'data/commands.json'),
        Core.loadJSON('guides', 'data/guides.json'),
        Core.loadJSON('beginner', 'data/beginner.json'),
        Core.loadJSON('poke', 'data/poke.json')
      ]).then(([c, g, b, p]) => { engines = buildEngines(c, g, b, p); return engines; })
        .catch(err => { console.error('search index error', err); loadPromise = null; throw err; });
    }
    return loadPromise;
  }

  // ---------- 搜尋 ----------
  function searchType(eng, q, qLower) {
    // 1) 完整包含關鍵字（排最前：標題命中優先）
    const exact = [];
    const seen = new Set();
    eng.docs.forEach((d, i) => {
      const inTitle = d.title_s.toLowerCase().includes(qLower);
      const inText = !inTitle && d.text.toLowerCase().includes(qLower);
      if (inTitle || inText) { exact.push({ d, rank: inTitle ? 0 : 1, i }); seen.add(d); }
    });
    exact.sort((a, b) => a.rank - b.rank || a.i - b.i);
    // 2) 模糊比對補上（不重複）
    const fuzzy = eng.fuse ? eng.fuse.search(q.slice(0, 32)).filter(r => !seen.has(r.item)).map(r => r.item) : [];
    return exact.map(e => e.d).concat(fuzzy);
  }

  function hl(text, qLower) {
    const s = String(text || '');
    const i = qLower ? s.toLowerCase().indexOf(qLower) : -1;
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + qLower.length)) + '</mark>' + esc(s.slice(i + qLower.length));
  }

  let activeIdx = -1;
  const itemEls = () => Array.from(panel.querySelectorAll('a.ss-item'));

  function setActive(i) {
    const els = itemEls();
    if (!els.length) { activeIdx = -1; return; }
    activeIdx = (i + els.length) % els.length;
    els.forEach((el, k) => el.classList.toggle('active', k === activeIdx));
    els[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function openPanel() { panel.style.display = 'block'; input.setAttribute('aria-expanded', 'true'); }
  function closePanel() { panel.style.display = 'none'; input.setAttribute('aria-expanded', 'false'); activeIdx = -1; }

  function renderHints() {
    panel.innerHTML = `
      <div class="ss-hint">
        <div class="ss-hint-title">試試看搜尋：</div>
        <div class="ss-tags">${QUICK_TAGS.map(t => `<button type="button" class="ss-tag" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="ss-hint-sub">可搜尋指令、攻略、新手教學與寶可夢，打錯一兩個字也找得到。</div>
      </div>`;
    activeIdx = -1;
  }

  function renderResults(eng, q) {
    const qLower = q.toLowerCase();
    let html = '';
    let total = 0;
    GROUPS.forEach(g => {
      const all = searchType(eng[g.type], q, qLower);
      if (!all.length) return;
      const shown = all.slice(0, g.limit);
      total += shown.length;
      html += `<div class="ss-group"><div class="ss-group-title"><span>${g.icon} ${g.label}</span><span class="ss-count">${all.length > g.limit ? `前 ${g.limit} 筆／共 ${all.length} 筆` : `${all.length} 筆`}</span></div>`;
      shown.forEach(d => {
        html += `<a class="ss-item" href="${esc(d.url)}">
          <span class="ss-item-main">
            <span class="ss-item-title ${d.type === 'cmd' ? 'ss-code' : ''}">${hl(d.title, qLower)}</span>
            ${d.tag ? `<span class="ss-item-tag">${esc(d.tag)}</span>` : ''}
          </span>
          ${d.sub ? `<span class="ss-item-sub">${hl(clip(d.sub, 80), qLower)}</span>` : ''}
        </a>`;
      });
      html += '</div>';
    });
    if (!total) {
      html = `<div class="ss-empty"><div style="font-size:1.6rem;">🔎</div>
        <div style="font-weight:700;color:var(--text-main);">找不到「${esc(q)}」</div>
        <div>換個說法試試，例如用更短的關鍵字，或直接輸入指令名稱。</div></div>`;
    }
    panel.innerHTML = html;
    activeIdx = -1;
    if (total) setActive(0);
  }

  let timer = null;
  let seq = 0;
  function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (!q) { renderHints(); openPanel(); return; }
    if (!engines) {                     // 第一次搜尋需要載入資料，先給提示
      panel.innerHTML = '<div class="ss-empty">搜尋資料載入中…</div>';
      openPanel();
    }
    ensureLoaded().then(eng => {
      if (my !== seq) return;           // 已有更新的輸入
      renderResults(eng, q);
      openPanel();
    }).catch(err => {
      console.error('search error', err);
      if (my !== seq) return;
      panel.innerHTML = '<div class="ss-empty">搜尋暫時無法使用，請重新整理頁面再試一次。</div>';
      openPanel();
    });
  }

  input.addEventListener('focus', () => { ensureLoaded().catch(() => {}); run(); });
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 60); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === 'Enter') {
      const els = itemEls();
      const el = els[activeIdx] || els[0];
      if (el) { e.preventDefault(); el.click(); }
    } else if (e.key === 'Escape') { closePanel(); input.blur(); }
  });

  panel.addEventListener('mousedown', (e) => {
    // 避免點結果時輸入框先失焦造成面板被關閉
    if (e.target.closest('a.ss-item, .ss-tag')) e.preventDefault();
  });
  panel.addEventListener('click', (e) => {
    const tag = e.target.closest('.ss-tag');
    if (tag) { input.value = tag.getAttribute('data-q') || ''; input.focus(); run(); }
  });
  panel.addEventListener('mousemove', (e) => {
    const a = e.target.closest('a.ss-item');
    if (a) { const i = itemEls().indexOf(a); if (i >= 0 && i !== activeIdx) setActive(i); }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.site-search')) closePanel();
  });

  // 按 / 快速跳到搜尋框
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });

  const clearBtn = document.getElementById('site-search-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; input.focus(); run(); });
})();
