/**
 * Cobblemon 方可夢樂園 — 攻略站
 * cobblemon.js  ·  主要互動邏輯
 *
 * 模組結構：
 *   1. State          — 全域狀態與資料
 *   2. Utils          — 通用工具函式
 *   3. SearchEngine   — 搜尋評分核心
 *   4. Search UI      — 搜尋建議 / 執行搜尋
 *   5. Commands       — 指令集初始化與操作
 *   6. Strategies     — 攻略卡片與 Modal
 *   7. EditMode       — 編輯模式、格式工具列
 *   8. ImageEditor    — 可拖曳圖片
 *   9. Admin          — 發佈、存檔、版本管理
 *  10. UI Helpers     — 頁面切換、深色模式等
 *  11. Events         — 全域事件監聽
 *  12. Init           — 頁面載入初始化
 */

'use strict';

/* ════════════════════════════════════════════════════
   1. STATE — 全域狀態與資料
════════════════════════════════════════════════════ */

let COMMANDS_DATA  = [];
let ALL_DATA       = [];
let _lastQuery     = '';
let baseVersion    = 1.0;
let faqSortable    = null;
let _enterGuard    = null;
let _activeStrat   = null;

const _stratIcons = ['📖','⚔️','💰','🛒','🥚','📊','🌿','✨','🏆','🗺️','💎','⚡'];

const PAGE_LABEL = {
    strategy : '⚔️ 攻略',
    faq      : '❓ 常見問題',
    commands : '📋 指令集',
    tutorial : '🔰 入門教學',
    newbie   : '🚩 快捷鍵',
};


/* ════════════════════════════════════════════════════
   2. UTILS — 通用工具函式
════════════════════════════════════════════════════ */

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 將文字拆成 token 陣列（空格、標點、/ [ ] 皆為分隔符） */
function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .split(/[\s\u3000,，、。！？/\[\]()（）]+/)
        .filter(t => t.length > 0);
}

/**
 * 在 text 中把所有 terms 出現處包上 <mark>，回傳 HTML 字串。
 * 先 escapeHtml 再替換，避免 XSS。
 */
function highlightTerms(text, terms) {
    if (!terms.length) return escapeHtml(text);
    const sorted = [...new Set(terms)].sort((a, b) => b.length - a.length);
    const lower  = text.toLowerCase();
    const marks  = new Array(text.length).fill(false);

    for (const term of sorted) {
        let idx = 0;
        while ((idx = lower.indexOf(term, idx)) !== -1) {
            for (let k = idx; k < idx + term.length; k++) marks[k] = true;
            idx += term.length;
        }
    }

    let result = '', inMark = false;
    for (let i = 0; i < text.length; i++) {
        const ch = escapeHtml(text[i]);
        if (marks[i]  && !inMark) { result += '<mark class="fuzzy-hl">'; inMark = true; }
        if (!marks[i] &&  inMark) { result += '</mark>'; inMark = false; }
        result += ch;
    }
    if (inMark) result += '</mark>';
    return result;
}


/* ════════════════════════════════════════════════════
   3. SEARCH ENGINE — 搜尋評分核心
════════════════════════════════════════════════════ */

/**
 * 搜尋評分（模仿搜尋引擎邏輯）
 *
 * 評分架構（由高到低）：
 *   A. Phrase match   — query 完整出現在標題/關鍵字    +300~500
 *   B. Token AND      — 所有 query token 在欄位中出現
 *      · keyword token 精確匹配                       +100/token
 *      · title 包含 token                             +80/token (+50 若在詞首)
 *      · keywords 包含 token（非精確）                 +55/token
 *      · desc 包含 token                              +20/token
 *   C. Coverage score — 未全部匹配時依覆蓋率打折
 *   D. Prefix boost   — 標題以 query 起頭              +60
 *
 * @returns {{ score: number, titleHl: string }}
 */
function searchScore(query, item) {
    const q = query.toLowerCase().trim();
    if (!q || !item) return { score: 0, titleHl: escapeHtml(item?.title || '') };

    const titleL = (item.title    || '').toLowerCase();
    const kwL    = (item.keywords || '').toLowerCase();
    const descL  = (item.desc     || '').toLowerCase();
    const kwTokenSet = new Set(tokenize(kwL));
    const qTokens    = q.split(/\s+/).filter(Boolean);

    let score = 0;
    const matchedTerms = [];

    // ── A. Phrase match ──────────────────────────────
    if      (titleL === q)          { score += 500; matchedTerms.push(q); }
    else if (titleL.startsWith(q))  { score += 360; matchedTerms.push(q); }
    else if (titleL.includes(q))    { score += 300; matchedTerms.push(q); }

    if (kwL.includes(q) && !titleL.includes(q))                    { score += 200; matchedTerms.push(q); }
    if (descL.includes(q) && !titleL.includes(q) && !kwL.includes(q)) { score +=  80; matchedTerms.push(q); }

    // ── B. Token-level scoring ────────────────────────
    let tokenHits = 0;
    for (const token of qTokens) {
        if (!token) continue;
        let hit = false;

        if (kwTokenSet.has(token)) {
            score += 100; hit = true;
            if (!matchedTerms.includes(token)) matchedTerms.push(token);
        } else if (kwL.includes(token)) {
            score += 55; hit = true;
            if (!matchedTerms.includes(token)) matchedTerms.push(token);
        }

        if (titleL.includes(token)) {
            const isPrefix = titleL.startsWith(token)
                || titleL.includes(' ' + token)
                || titleL.includes('/' + token);
            score += 80 + (isPrefix ? 50 : 0);
            hit = true;
            if (!matchedTerms.includes(token)) matchedTerms.push(token);
        }

        if (descL.includes(token)) {
            score += 20; hit = true;
            if (!matchedTerms.includes(token)) matchedTerms.push(token);
        }

        if (hit) tokenHits++;
    }

    // ── C. Coverage penalty ───────────────────────────
    if (qTokens.length > 1) {
        const coverage = tokenHits / qTokens.length;
        if      (coverage === 0)    score = 0;
        else if (coverage < 0.5)    score = Math.floor(score * 0.05);
        else if (coverage < 1.0)    score = Math.floor(score * (0.2 + 0.8 * coverage));
    }

    // ── D. Prefix boost ───────────────────────────────
    if (score > 0 && titleL.startsWith(q)) score += 60;

    if (score <= 0 && tokenHits === 0 && !titleL.includes(q) && !kwL.includes(q))
        return { score: -1, titleHl: escapeHtml(item.title) };

    return {
        score,
        titleHl: matchedTerms.length
            ? highlightTerms(item.title, matchedTerms)
            : escapeHtml(item.title),
    };
}

/** 取得全域評分結果（最多 limit 筆，score > 0） */
function rankResults(query, limit = 8) {
    return ALL_DATA
        .map(item => { const { score, titleHl } = searchScore(query, item); return { item, score, titleHl }; })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}


/* ════════════════════════════════════════════════════
   4. SEARCH UI — 搜尋建議 / 執行搜尋
════════════════════════════════════════════════════ */

/** 將 suggestion-box 定位到對應 input 正下方 */
function _positionSuggestionBox(input, box) {
    const rect = input.getBoundingClientRect();
    box.style.top = (rect.bottom + 2) + 'px';
    if (window.innerWidth >= 768) {
        box.style.left  = rect.left + 'px';
        box.style.right = '';
        box.style.width = rect.width + 'px';
    } else {
        box.style.removeProperty('left');
        box.style.removeProperty('right');
        box.style.removeProperty('width');
    }
}

/** 處理搜尋框輸入事件，更新建議下拉 */
function handleGlobalSearch(input, suggestBoxId) {
    const query      = input.value.trim();
    const suggestBox = document.getElementById(suggestBoxId);
    if (!query) { suggestBox.classList.add('hidden'); return; }

    _lastQuery = query;
    _positionSuggestionBox(input, suggestBox);

    // 指令集頁面：若 ALL_DATA 為空則回退到 DOM 搜尋
    if (suggestBoxId === 'innerSuggestions' && ALL_DATA.length === 0) {
        _handleDomCommandSearch(query, suggestBox);
        return;
    }

    // 一般搜尋建議
    const allScored = rankResults(query, 8);
    const scored = (suggestBoxId === 'innerSuggestions')
        ? allScored.filter(r => r.item.type === 'commands' || !!r.item.isCommand)
        : allScored;

    if (scored.length > 0) {
        suggestBox.innerHTML = scored.map(({ item: res, titleHl }) => {
            const label = PAGE_LABEL[res.type] || res.type;
            const isCmd = (res.type === 'commands') || !!res.isCommand;
            return `<div class="suggestion-item" onclick="navigateToResult('${escapeHtml(res.type)}','${escapeHtml(res.target)}',${isCmd})">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                    <span style="font-size:10px;font-weight:700;color:#7c3aed;background:#f5f3ff;padding:1px 6px;border-radius:999px;">${label}</span>
                </div>
                <div class="font-bold text-gray-800">${titleHl}</div>
                <div class="text-xs text-gray-500">${escapeHtml(res.desc)}</div>
            </div>`;
        }).join('');
    } else {
        const msg = (suggestBoxId === 'innerSuggestions') ? '相關指令' : '相關結果';
        suggestBox.innerHTML = `<div class="suggestion-item text-gray-400 text-sm">找不到「${escapeHtml(query)}」${msg}</div>`;
    }
    suggestBox.classList.remove('hidden');
}

/** 指令集頁 DOM 回退搜尋 */
function _handleDomCommandSearch(query, suggestBox) {
    const q = query.toLowerCase();
    const domResults = [];
    document.querySelectorAll('.cmd-box').forEach(box => {
        const cmdText = box.querySelector('.cmd-text')?.textContent || '';
        const cmdDesc = box.querySelector('.cmd-desc')?.textContent || '';
        if (cmdText.toLowerCase().includes(q) || cmdDesc.toLowerCase().includes(q))
            domResults.push({ cmdText, cmdDesc });
    });

    if (domResults.length > 0) {
        suggestBox.innerHTML = domResults.slice(0, 8).map(({ cmdText, cmdDesc }) => {
            const safeTxt = cmdText.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
            return '<div class="suggestion-item" onclick="' +
                '_clearCmdHL();' +
                'document.getElementById(\'innerSuggestions\').classList.add(\'hidden\');' +
                'document.getElementById(\'innerSearchInput\').value=\'\';' +
                'var hits=[];' +
                'document.querySelectorAll(\'.cmd-box\').forEach(function(b){' +
                    'b.classList.remove(\'cmd-highlight\');' +
                    'if((b.querySelector(\'.cmd-text\')||{}).textContent===\'' + safeTxt + '\'){' +
                        'b.classList.add(\'cmd-highlight\');' +
                        'b.closest(\'.accordion-item\').classList.add(\'accordion-active\');' +
                        'hits.push(b);' +
                    '}' +
                '});' +
                'if(hits.length){setTimeout(function(){_applyHL(hits,_lastQuery);hits[0].scrollIntoView({behavior:\'smooth\',block:\'center\'});},350);}' +
                '">' +
                '<div class="font-bold text-gray-800">' + escapeHtml(cmdText) + '</div>' +
                '<div class="text-xs text-gray-500">' + escapeHtml(cmdDesc) + '</div>' +
                '</div>';
        }).join('');
    } else {
        suggestBox.innerHTML = `<div class="suggestion-item text-gray-400 text-sm">找不到「${escapeHtml(query)}」相關指令</div>`;
    }
    suggestBox.classList.remove('hidden');
}

/** 執行首頁完整搜尋，顯示猜測結果區 */
function executeHomeSearch() {
    const input = document.getElementById('homeSearchInput');
    const query = input.value.trim();
    if (!query) return;

    _lastQuery = query;
    document.getElementById('homeSuggestions').classList.add('hidden');

    const scored      = rankResults(query, 8);
    const guessSection = document.getElementById('search-guess-section');
    const guessResults = document.getElementById('search-guess-results');
    const guessTitle   = document.getElementById('search-guess-title');

    if (scored.length > 0) {
        const maxScore = scored[0].score;
        guessTitle.innerHTML = `🔍 搜尋「<span class="text-blue-500">${escapeHtml(query)}</span>」的相關結果`;
        guessResults.innerHTML = scored.map(({ item: res, titleHl, score }) => {
            const label = PAGE_LABEL[res.type] || res.type;
            const isCmd = (res.type === 'commands') || !!res.isCommand;
            const barW  = Math.max(8, Math.round((score / maxScore) * 100));
            return `<div class="search-guess-card" onclick="navigateToResult('${escapeHtml(res.type)}','${escapeHtml(res.target)}',${isCmd});document.getElementById('search-guess-section').classList.remove('visible');">
                <div class="flex items-center gap-2 mb-1">
                    <span style="font-size:10px;font-weight:700;color:#7c3aed;background:#f5f3ff;padding:1px 7px;border-radius:999px;">${label}</span>
                    <div style="flex:1;height:4px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                        <div style="width:${barW}%;height:100%;background:linear-gradient(90deg,#00AEEF,#003366);border-radius:999px;transition:width 0.4s;"></div>
                    </div>
                </div>
                <div class="font-bold text-gray-800 text-sm mb-0.5">${titleHl}</div>
                <div class="text-xs text-gray-500">${escapeHtml(res.desc)}</div>
            </div>`;
        }).join('');
    } else {
        guessTitle.innerHTML = `找不到與「<span class="text-red-500">${escapeHtml(query)}</span>」相關的結果`;
        guessResults.innerHTML = `<div class="text-gray-500 text-sm col-span-2 py-2">請嘗試不同的關鍵字，或直接瀏覽上方各頁面分類。</div>`;
    }
    guessSection.classList.add('visible');
}

/** 從搜尋建議跳轉至目標頁面/元素 */
function navigateToResult(page, targetId, isCommand) {
    document.querySelectorAll('.suggestion-box').forEach(b => b.classList.add('hidden'));
    document.querySelectorAll('#homeSearchInput, #innerSearchInput').forEach(el => el.value = '');
    _clearCmdHL();

    if (page === 'commands') isCommand = true;

    if (page === 'strategy') {
        showPage('strategy');
        setTimeout(() => {
            const strat = (window.STRATEGIES_DATA || []).find(s => s.id === targetId);
            if (strat) {
                openStratModal(strat);
            } else {
                document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);
        return;
    }

    showPage(page);
    setTimeout(() => {
        if (isCommand) {
            _highlightAndScrollToCommand(targetId);
        } else {
            const el = document.getElementById(targetId);
            if (el) {
                el.classList.add('ring-4', 'ring-blue-200');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => el.classList.remove('ring-4', 'ring-blue-200'), 2000);
            }
        }
    }, 300);
}

function _highlightAndScrollToCommand(targetId) {
    const hits = [];
    document.querySelectorAll('.cmd-box').forEach(box => {
        box.classList.remove('cmd-highlight');
        if ((box.querySelector('.cmd-text')?.textContent || '').toLowerCase().includes(targetId.toLowerCase())) {
            box.classList.add('cmd-highlight');
            box.closest('.accordion-item').classList.add('accordion-active');
            hits.push(box);
        }
    });
    if (hits.length) {
        setTimeout(() => {
            _applyHL(hits, _lastQuery || targetId);
            hits[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
    }
}


/* ════════════════════════════════════════════════════
   5. COMMANDS — 指令集初始化與操作
════════════════════════════════════════════════════ */

/** 依 COMMANDS_DATA 渲染指令集手風琴 */
function initCommands() {
    const container = document.getElementById('accordion-container');
    if (!container) return;
    container.innerHTML = '';
    COMMANDS_DATA.forEach(cat => {
        let itemsHtml = cat.isResidence
            ? `<div class="mb-4 p-3 bg-orange-50 border border-orange-200 text-sm font-bold text-orange-800">🛠️ 工具：木鋤頭<br>🖱️ 左鍵點擊：第 1 點 / 右鍵點擊：第 2 點</div>`
            : '';
        cat.items.forEach(item => {
            itemsHtml += `<div class="cmd-box" data-cmd="${item.cmd.toLowerCase()}">
                <span class="cmd-text">${item.cmd}</span>
                <span class="cmd-desc">${item.desc}</span>
                <button class="copy-btn" contenteditable="false" onclick="copyCmd(this)">複製</button>
            </div>`;
        });
        container.innerHTML += `
            <div class="bg-white border accordion-item relative">
                <button class="edit-ui admin-btn admin-btn-delete absolute top-2 right-2 z-10" onclick="this.parentElement.remove()">[x] 刪除章節</button>
                <div class="accordion-header p-5 font-bold ${cat.color}" onclick="toggleAccordion(this)">${cat.title}</div>
                <div class="accordion-content px-5">${itemsHtml}</div>
            </div>`;
    });
}

function toggleAccordion(header) {
    header.closest('.accordion-item').classList.toggle('accordion-active');
}

function copyCmd(btn) {
    const text = btn.closest('.cmd-box').querySelector('.cmd-text').innerText;
    const feedback = () => {
        btn.textContent = '✓ 已複製';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '複製'; btn.classList.remove('copied'); }, 1800);
    };
    navigator.clipboard?.writeText(text).then(feedback).catch(() => {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); feedback(); } catch (err) {}
        document.body.removeChild(ta);
    });
}

function addCmdRow(btn) {
    const row = document.createElement('div');
    row.className = 'cmd-box';
    row.innerHTML = `<span class="cmd-text" contenteditable="true">/新指令</span>
        <span class="cmd-desc" contenteditable="true">描述內容</span>
        <button class="edit-ui text-xs text-red-400 ml-2" onclick="this.parentElement.remove()">刪除此行</button>
        <button class="copy-btn" contenteditable="false" onclick="copyCmd(this)">複製</button>`;
    btn.insertAdjacentElement('beforebegin', row);
}

function addNewSection(containerId, type) {
    const container = document.getElementById(containerId);
    const el = document.createElement('div');

    if (type === 'faq') {
        el.className = 'bg-white border shadow-sm p-6 relative';
        el.innerHTML = `<span class="drag-handle edit-ui">☰</span>
            <button class="edit-ui admin-btn admin-btn-delete absolute top-2 right-2" onclick="this.parentElement.remove()">[x] 刪除</button>
            <h3 class="text-xl font-bold text-blue-900 mb-4 inline-block">新問題標題</h3>
            <div class="text-gray-700 space-y-2"><p>內容填寫...</p></div>`;

    } else if (type === 'strategy') {
        const newId   = 'strat-new-' + Date.now();
        const newStrat = {
            id    : newId,
            title : '新攻略標題',
            html  : '<h3 class="text-2xl font-bold text-purple-900 mb-6 flex items-center">新攻略標題</h3><div class="text-gray-700"><p>內容填寫...</p></div>',
        };
        if (!window.STRATEGIES_DATA) window.STRATEGIES_DATA = [];
        window.STRATEGIES_DATA.unshift(newStrat);
        initStrategies();
        return;

    } else if (type === 'command') {
        el.className = 'bg-white border accordion-item relative';
        el.innerHTML = `<button class="edit-ui admin-btn admin-btn-delete absolute top-2 right-2 z-10" onclick="this.parentElement.remove()">[x] 刪除</button>
            <div class="accordion-header p-5 font-bold text-blue-900" onclick="toggleAccordion(this)">新指令群組</div>
            <div class="accordion-content px-5">
                <div class="cmd-box">
                    <span class="cmd-text">/指令</span>
                    <span class="cmd-desc">描述</span>
                    <button class="edit-ui text-xs text-red-400 ml-2" onclick="this.parentElement.remove()">刪除此行</button>
                    <button class="copy-btn" contenteditable="false" onclick="copyCmd(this)">複製</button>
                </div>
                <button class="edit-ui admin-btn text-xs mb-2" onclick="addCmdRow(this)">+ 新增指令行</button>
            </div>`;
    }

    container.prepend(el);
    if (document.body.classList.contains('editing-active')) {
        el.querySelectorAll('.accordion-header,.cmd-text,.cmd-desc,h3,p')
          .forEach(n => { n.contentEditable = 'true'; });
    }
}


/* ════════════════════════════════════════════════════
   6. STRATEGIES — 攻略卡片與 Modal
════════════════════════════════════════════════════ */

function _stratPreview(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function initStrategies() {
    const container = document.getElementById('strategy-container');
    if (!container) return;

    // JSON 尚未載入：為現有靜態卡片附加點擊事件
    if (!window.STRATEGIES_DATA) {
        container.querySelectorAll('.strat-card').forEach(card => {
            if (card._stratListenerAdded) return;
            card._stratListenerAdded = true;
            card.addEventListener('click', e => {
                if (e.target.classList.contains('admin-btn')) return;
                const title   = card.querySelector('.strat-card-title')?.innerText || '攻略';
                const preview = card.querySelector('.strat-card-preview')?.innerText || '';
                const icon    = card.querySelector('.strat-card-icon')?.innerText    || '📖';
                openStratModal({
                    id   : card.id,
                    title,
                    html : `<h3 class="text-2xl font-bold text-purple-900 mb-6 flex items-center">${icon} ${title}</h3>
                            <p class="text-gray-600">${preview}</p>
                            <div class="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                                <p class="font-bold text-yellow-800">⚠️ 完整攻略需要 cobblemon_data.json</p>
                                <p class="text-yellow-700 text-sm mt-1">請確認 JSON 檔案已正確放置於同目錄下，重新整理頁面即可載入完整內容。</p>
                            </div>`,
                });
            });
        });
        return;
    }

    container.innerHTML = '';
    window.STRATEGIES_DATA.forEach((strat, idx) => {
        const icon    = _stratIcons[idx % _stratIcons.length];
        const preview = _stratPreview(strat.html);
        const card    = document.createElement('div');
        card.id        = strat.id;
        card.className = 'strat-card';
        card.innerHTML = `
            <button class="edit-ui admin-btn admin-btn-delete" style="position:absolute;top:10px;right:10px;padding:4px 10px;font-size:12px"
                onclick="event.stopPropagation();this.closest('.strat-card').remove()" contenteditable="false">[x]</button>
            <div class="strat-card-icon">${icon}</div>
            <div class="strat-card-title">${strat.title.replace(/^[\p{Emoji}✨⚔️💰🛒🥚📊🌿🏆🗺️💎⚡📖]+\s*/u, '')}</div>
            <div class="strat-card-preview">${preview}</div>
            <span class="strat-card-arrow">›</span>`;
        card.addEventListener('click', e => {
            if (e.target.classList.contains('admin-btn')) return;
            openStratModal(strat);
        });
        container.appendChild(card);
    });
}

function openStratModal(strat) {
    _activeStrat = strat;
    const modal     = document.getElementById('strat-modal');
    const body      = document.getElementById('strat-modal-body');
    const isEditing = document.body.classList.contains('editing-active');

    body.innerHTML = (isEditing ? _buildModalEditBar() : '') + strat.html;

    if (isEditing) {
        body.setAttribute('contenteditable', 'true');
        body.querySelectorAll('button, input, .edit-ui').forEach(el => el.setAttribute('contenteditable', 'false'));
    } else {
        body.removeAttribute('contenteditable');
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (isEditing) setTimeout(_setupImgDropTargets, 50);
}

function saveStratEdits() {
    if (!_activeStrat) return;
    const body  = document.getElementById('strat-modal-body');
    const clone = body.cloneNode(true);
    clone.querySelectorAll('.edit-ui').forEach(el => el.remove());
    const h3 = clone.querySelector('h3');
    _activeStrat.title = h3 ? h3.innerText.trim() : _activeStrat.title;
    _activeStrat.html  = clone.innerHTML.trim();
    initStrategies();
    const btn = document.querySelector('[onclick="saveStratEdits()"]');
    if (btn) { btn.textContent = '✅ 已儲存'; setTimeout(() => { if (btn) btn.textContent = '💾 儲存'; }, 1500); }
}

function closeStratModal() {
    document.getElementById('strat-modal').classList.remove('open');
    document.getElementById('strat-modal-body').removeAttribute('contenteditable');
    document.body.style.overflow = '';
    _activeStrat = null;
}

function insertStrategyImage(input) {
    if (!input.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = Object.assign(document.createElement('img'), {
            src: e.target.result, alt: input.files[0].name,
            className: 'max-w-full rounded mt-2 mb-2 mx-auto block',
        });
        input.closest('.border-dashed').insertAdjacentElement('beforebegin', img);
        input.value = '';
    };
    reader.readAsDataURL(input.files[0]);
}


/* ════════════════════════════════════════════════════
   7. EDIT MODE — 編輯模式、格式工具列
════════════════════════════════════════════════════ */

function toggleEditMode(enable) {
    const body = document.body;
    if (enable) {
        body.classList.add('editing-active');
        body.contentEditable = 'true';
        document.querySelectorAll('.edit-ignore,.edit-ui,header,nav,button,kbd,footer,.drag-handle,input,textarea,#confirm-modal,.format-toolbar')
            .forEach(el => { el.contentEditable = 'false'; });

        const faqContainer = document.getElementById('faq-container');
        if (faqContainer && typeof Sortable !== 'undefined') {
            faqSortable = new Sortable(faqContainer, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost' });
        }

        const firstNews = document.querySelector('#news-container h3');
        if (firstNews) {
            const m = firstNews.innerText.match(/v(\d+(\.\d+)?)/);
            if (m) baseVersion = parseFloat(m[1]);
        }
        updateVersionPreview('minor');

        _enterGuard = e => {
            if (e.key !== 'Enter') return;
            const el = e.target;
            if (['H3','H4'].includes(el.tagName)
                || el.classList.contains('accordion-header')
                || el.classList.contains('cmd-text')
                || el.classList.contains('cmd-desc')) {
                e.preventDefault();
                el.blur();
            }
        };
        document.addEventListener('keydown', _enterGuard);
        setTimeout(_setupImgDropTargets, 100);

    } else {
        body.classList.remove('editing-active');
        body.contentEditable = 'false';
        if (faqSortable) { faqSortable.destroy(); faqSortable = null; }
        if (_enterGuard) { document.removeEventListener('keydown', _enterGuard); _enterGuard = null; }
    }
}

function applyFormat(command, value = null) {
    document.execCommand(command, false, value);
    updateFormatState();
}

function updateFormatState() {
    try {
        ['bold','italic','underline','strikeThrough'].forEach(cmd => {
            const id  = 'rb-' + cmd.toLowerCase().replace('strikethrough','strike').replace('through','strike');
            const btn = document.getElementById(id);
            if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
        });
    } catch (e) {}
}

function _buildModalEditBar() {
    return `<div class="edit-ui" contenteditable="false"
        style="position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:4px;background:#0f172a;padding:8px 12px;border-radius:10px;margin-bottom:14px;flex-wrap:wrap;box-shadow:0 4px 14px rgba(0,0,0,0.3);">
        <span style="font-size:11px;font-weight:700;color:#00AEEF;margin-right:4px;">✏️ 攻略編輯</span>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('bold')"><b>B</b></button>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('italic')"><i>I</i></button>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('underline')"><u>U</u></button>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('strikeThrough')"><s>S</s></button>
        <span class="rb-sep"></span>
        <div class="rb-swatch" style="background:#e11d48;" onmousedown="event.preventDefault();applyFormat('foreColor','#e11d48')"></div>
        <div class="rb-swatch" style="background:#f97316;" onmousedown="event.preventDefault();applyFormat('foreColor','#f97316')"></div>
        <div class="rb-swatch" style="background:#eab308;" onmousedown="event.preventDefault();applyFormat('foreColor','#eab308')"></div>
        <div class="rb-swatch" style="background:#16a34a;" onmousedown="event.preventDefault();applyFormat('foreColor','#16a34a')"></div>
        <div class="rb-swatch" style="background:#2563eb;" onmousedown="event.preventDefault();applyFormat('foreColor','#2563eb')"></div>
        <div class="rb-swatch" style="background:#9333ea;" onmousedown="event.preventDefault();applyFormat('foreColor','#9333ea')"></div>
        <span class="rb-sep"></span>
        <div class="rb-swatch" style="background:#fef08a;" onmousedown="event.preventDefault();applyFormat('hiliteColor','#fef08a')"></div>
        <div class="rb-swatch" style="background:#bbf7d0;" onmousedown="event.preventDefault();applyFormat('hiliteColor','#bbf7d0')"></div>
        <div class="rb-swatch" style="background:#bfdbfe;" onmousedown="event.preventDefault();applyFormat('hiliteColor','#bfdbfe')"></div>
        <span class="rb-sep"></span>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('justifyLeft')" title="靠左">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14"><rect x="1" y="2" width="14" height="2"/><rect x="1" y="7" width="9" height="2"/><rect x="1" y="12" width="12" height="2"/></svg>
        </button>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('justifyCenter')" title="置中">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14"><rect x="1" y="2" width="14" height="2"/><rect x="3.5" y="7" width="9" height="2"/><rect x="2" y="12" width="12" height="2"/></svg>
        </button>
        <button class="rb" onmousedown="event.preventDefault();applyFormat('insertUnorderedList')" title="清單">≡</button>
        <button class="rb" onmousedown="event.preventDefault();insertLink()" title="連結">🔗</button>
        <span class="rb-sep"></span>
        <label class="rb" style="cursor:pointer;" title="插入圖片">
            🖼 <input type="file" accept="image/*" style="display:none" onchange="insertEditableImage(this)" contenteditable="false">
        </label>
        <button class="rb" onmousedown="event.preventDefault();insertTip()"    title="小提醒">💡</button>
        <button class="rb" onmousedown="event.preventDefault();insertNotice()" title="注意">⚠️</button>
        <button class="rb" onmousedown="event.preventDefault();insertHRule()"  style="font-size:11px;" title="分隔線">─</button>
        <span class="rb-sep"></span>
        <button class="rb" onmousedown="event.preventDefault();document.execCommand('undo')" title="復原">↩</button>
        <button class="rb" onmousedown="event.preventDefault();document.execCommand('redo')" title="重做">↪</button>
        <button onclick="saveStratEdits()"
            style="background:#16a34a;color:white;border:none;padding:5px 14px;border-radius:6px;font-weight:700;cursor:pointer;margin-left:auto;font-size:12px;"
            contenteditable="false">💾 儲存</button>
    </div>`;
}

// ── 游標插入輔助 ──
function _insertAtCursor(el) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        r.collapse(false);
        r.insertNode(el);
        r.setStartAfter(el);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
    }
}

function insertTip() {
    const el = document.createElement('div');
    el.className = 'mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 text-gray-800';
    el.setAttribute('contenteditable', 'true');
    el.innerHTML = '💡 <b>小提醒：</b>在此輸入文字...';
    _insertAtCursor(el);
}

function insertNotice() {
    const el = document.createElement('div');
    el.className = 'notice-block';
    el.setAttribute('contenteditable', 'true');
    el.innerHTML = '<div class="notice-title">⚠️ 注意事項</div><p>在此輸入注意事項內容...</p>';
    _insertAtCursor(el);
}

function insertHRule() {
    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:2px solid #e2e8f0;margin:16px 0;';
    _insertAtCursor(hr);
}

function insertLink() {
    const url = prompt('輸入連結網址：', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
    document.querySelectorAll('[contenteditable] a:not([target])').forEach(a => {
        if (a.href === url) { a.target = '_blank'; a.style.color = '#2563eb'; }
    });
}

function insertImageFromUrl() {
    const url = prompt('輸入圖片網址：', 'https://');
    if (!url) return;
    _createDraggableImage(url, '網路圖片');
}

function insertEditableImage(input) {
    if (!input.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = e => { _createDraggableImage(e.target.result, input.files[0].name); input.value = ''; };
    reader.readAsDataURL(input.files[0]);
}

// ── 正文高亮輔助 ──
function _clearCmdHL() {
    document.querySelectorAll('[data-orig-html]').forEach(el => {
        el.innerHTML = el.getAttribute('data-orig-html');
        el.removeAttribute('data-orig-html');
    });
}

function _applyHL(boxes, query) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return;
    boxes.forEach(box => {
        ['.cmd-text', '.cmd-desc'].forEach(sel => {
            const span = box.querySelector(sel);
            if (!span || span.hasAttribute('data-orig-html')) return;
            span.setAttribute('data-orig-html', span.innerHTML);
            span.innerHTML = highlightTerms(span.textContent, terms);
        });
    });
}


/* ════════════════════════════════════════════════════
   8. IMAGE EDITOR — 可拖曳 / 可縮放圖片
════════════════════════════════════════════════════ */

function _createDraggableImage(src, name) {
    const wrapper = document.createElement('div');
    wrapper.className = 'drag-img img-center edit-ui-img';
    wrapper.setAttribute('contenteditable', 'false');
    wrapper.draggable = true;
    wrapper.style.cssText = 'display:block;text-align:center;margin:8px auto;max-width:100%;';

    const img = document.createElement('img');
    img.src   = src;
    img.alt   = name;
    img.style.cssText = 'max-width:100%;border-radius:6px;display:inline-block;';

    const resizeHandle = Object.assign(document.createElement('div'), {
        className : 'img-resize-handle',
        title     : '拖曳調整大小',
    });

    const imgToolbar = document.createElement('div');
    imgToolbar.className = 'img-toolbar';
    imgToolbar.setAttribute('contenteditable', 'false');
    imgToolbar.innerHTML = `
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgAlign(this,'left')"   title="靠左">◀</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgAlign(this,'center')" title="置中">■</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgAlign(this,'right')"  title="靠右">▶</button>
        <span class="rb-sep"></span>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgWidth(this,'25%')"  title="25%">¼</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgWidth(this,'50%')"  title="50%">½</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgWidth(this,'100%')" title="100%">全</button>
        <span class="rb-sep"></span>
        <button class="rb" style="font-size:10px;padding:2px 5px;color:#f87171;"
            onmousedown="event.preventDefault();this.closest('.drag-img').remove()" title="刪除">✕</button>`;

    wrapper.appendChild(imgToolbar);
    wrapper.appendChild(img);
    wrapper.appendChild(resizeHandle);

    // 圖片選取
    img.addEventListener('click', e => {
        if (!document.body.classList.contains('editing-active')) return;
        e.stopPropagation();
        document.querySelectorAll('.selected-img').forEach(i => i.classList.remove('selected-img'));
        img.classList.add('selected-img');
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.drag-img'))
            document.querySelectorAll('.selected-img').forEach(i => i.classList.remove('selected-img'));
    });

    // 縮放拖曳
    let _resizing = false, _startX, _startW;
    resizeHandle.addEventListener('mousedown', e => {
        if (!document.body.classList.contains('editing-active')) return;
        e.preventDefault(); e.stopPropagation();
        _resizing = true; _startX = e.clientX; _startW = img.offsetWidth;
        const onMove = e2 => { if (_resizing) { img.style.width = Math.max(60, _startW + e2.clientX - _startX) + 'px'; img.style.maxWidth = 'none'; } };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', () => { _resizing = false; document.removeEventListener('mousemove', onMove); }, { once: true });
    });

    // 拖放移動
    wrapper.addEventListener('dragstart', e => {
        if (!document.body.classList.contains('editing-active')) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
        wrapper.style.opacity = '0.5';
        window._dragImgEl = wrapper;
    });
    wrapper.addEventListener('dragend', () => {
        wrapper.style.opacity = '';
        window._dragImgEl = null;
        document.querySelectorAll('.img-drop-indicator').forEach(d => d.remove());
    });

    _insertAtCursor(wrapper);
    img.classList.add('selected-img');
}

function _setupImgDropTargets() {
    document.querySelectorAll('[contenteditable="true"]').forEach(zone => {
        if (zone._imgDropReady) return;
        zone._imgDropReady = true;
        zone.addEventListener('dragover', e => { if (window._dragImgEl) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
        zone.addEventListener('drop', e => {
            if (!window._dragImgEl) return;
            e.preventDefault();
            const el = window._dragImgEl;
            let range;
            if      (document.caretRangeFromPoint)   range = document.caretRangeFromPoint(e.clientX, e.clientY);
            else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
            }
            if (range) { range.collapse(true); range.insertNode(el); }
            else zone.appendChild(el);
            window._dragImgEl = null;
        });
    });
}

function setImgAlign(btn, align) {
    const wrapper = btn.closest('.drag-img');
    wrapper.classList.remove('img-float-left', 'img-float-right', 'img-center');
    wrapper.style.cssText = align === 'left'   ? ';float:left;margin:6px 16px 6px 0;'
                          : align === 'right'  ? ';float:right;margin:6px 0 6px 16px;'
                          : 'display:block;text-align:center;margin:8px auto;max-width:100%;';
}

function setImgWidth(btn, w) {
    const img = btn.closest('.drag-img').querySelector('img');
    img.style.width = w; img.style.maxWidth = '100%';
}


/* ════════════════════════════════════════════════════
   9. ADMIN — 發佈、存檔、版本管理
════════════════════════════════════════════════════ */

function openPublishModal() { document.getElementById('confirm-modal').style.display = 'flex'; }
function closeModal()       { document.getElementById('confirm-modal').style.display = 'none'; }

function updateVersionPreview(type) {
    document.getElementById('modal-version').value = 'v' + (
        type === 'major'
            ? (Math.floor(baseVersion) + 1).toFixed(1)
            : (baseVersion + 0.1).toFixed(1)
    );
}

function extractCommandsFromDOM() {
    return Array.from(document.querySelectorAll('#accordion-container .accordion-item')).flatMap(item => {
        const header = item.querySelector('.accordion-header');
        if (!header) return [];
        const colorMatch = header.className.match(/text-[a-z]+-[0-9]+/);
        const cat = {
            title : header.innerText.trim(),
            color : colorMatch ? colorMatch[0] : 'text-blue-900',
            items : Array.from(item.querySelectorAll('.cmd-box'))
                .map(box => ({
                    cmd  : box.querySelector('.cmd-text')?.innerText.trim() || '',
                    desc : box.querySelector('.cmd-desc')?.innerText.trim() || '',
                }))
                .filter(i => i.cmd),
        };
        if (item.querySelector('.bg-orange-50.border.border-orange-200')) cat.isResidence = true;
        return [cat];
    });
}

function extractStrategiesFromDOM() {
    const remaining = new Set(
        Array.from(document.querySelectorAll('#strategy-container > .strat-card[id]')).map(c => c.id)
    );
    return (window.STRATEGIES_DATA || []).filter(s => remaining.has(s.id));
}

function executeFinalSave() {
    const summary = document.getElementById('modal-summary').value || '攻略站內容更新';
    const detail  = document.getElementById('modal-detail').value;
    const version = document.getElementById('modal-version').value;
    const dateStr = new Date().toLocaleDateString('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-');

    const newsContainer = document.getElementById('news-container');
    if (newsContainer.querySelector('p.italic')) newsContainer.innerHTML = '';

    const log = document.createElement('div');
    log.className    = 'bg-white border-l-4 border-red-500 shadow-md p-6';
    log.style.position = 'relative';
    log.innerHTML = `
        <button class="edit-ui admin-btn admin-btn-delete absolute top-3 right-3"
            onclick="this.closest('#news-container > div').remove()" contenteditable="false">[x] 刪除</button>
        <div class="mb-3">
            <span class="bg-red-600 text-white text-xs px-2 py-1 font-bold whitespace-nowrap">系統更新</span>
            <h3 class="inline text-xl font-bold text-blue-900 uppercase ml-2">${version} - ${summary}</h3>
        </div>
        <div class="news-item ml-2 pb-1">
            <div class="news-dot !bg-red-500"></div>
            <p class="text-gray-700 text-sm">${detail}</p>
        </div>
        <div class="text-right mt-2">
            <span class="text-gray-400 text-xs font-bold">${dateStr}</span>
        </div>`;
    newsContainer.prepend(log);
    closeModal();
    toggleEditMode(false);

    // 下載 JSON
    const jsonBlob = new Blob([JSON.stringify({
        commands     : extractCommandsFromDOM(),
        search_index : ALL_DATA,
        strategies   : extractStrategiesFromDOM(),
    }, null, 2)], { type: 'application/json' });
    Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(jsonBlob), download: 'cobblemon_data.json',
    }).click();

    // 下載 HTML（延遲避免同步觸發問題）
    setTimeout(() => {
        Object.assign(document.createElement('a'), {
            href     : URL.createObjectURL(new Blob(['<!DOCTYPE html>\n' + document.documentElement.outerHTML], { type: 'text/html' })),
            download : 'index.html',
        }).click();
    }, 300);
}

function addNewsCard() {
    const dateStr = new Date().toLocaleDateString('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-');
    const card = document.createElement('div');
    card.className = 'bg-white border-l-4 border-blue-500 shadow-md p-6 relative';
    card.innerHTML = `
        <button class="edit-ui admin-btn admin-btn-delete absolute top-3 right-3"
            onclick="this.closest('#news-container > div').remove()" contenteditable="false">[x] 刪除</button>
        <div class="mb-3">
            <span class="bg-blue-600 text-white text-xs px-2 py-1 font-bold whitespace-nowrap">公告</span>
            <h3 class="inline text-xl font-bold text-blue-900 uppercase ml-2" contenteditable="true">公告標題</h3>
        </div>
        <div class="news-item ml-2 pb-1">
            <div class="news-dot"></div>
            <p class="text-gray-700 text-sm" contenteditable="true">在此輸入公告內容...</p>
        </div>
        <div class="text-right mt-2">
            <span class="text-gray-400 text-xs font-bold" contenteditable="true">${dateStr}</span>
        </div>`;
    document.getElementById('news-container').prepend(card);
}


/* ════════════════════════════════════════════════════
   10. UI HELPERS — 頁面切換、深色模式等
════════════════════════════════════════════════════ */

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    document.getElementById('mode-knob').innerText =
        document.body.classList.contains('dark-mode') ? '🌙' : '☀️';
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId + '-page')?.classList.remove('hidden');
    window.scrollTo(0, 0);
    document.getElementById('mobile-menu').classList.remove('open');
}

function toggleMobileMenu() {
    document.getElementById('mobile-menu').classList.toggle('open');
}


/* ════════════════════════════════════════════════════
   11. EVENTS — 全域事件監聽
════════════════════════════════════════════════════ */

document.addEventListener('selectionchange', () => {
    if (!document.body.classList.contains('editing-active')) return;
    updateFormatState();
    const sel = window.getSelection();
    const ft  = document.getElementById('float-toolbar');
    if (!ft) return;
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        ft.style.left = (rect.left + rect.width / 2 - 130) + 'px';
        ft.style.top  = (rect.top + window.scrollY - 48) + 'px';
        ft.classList.add('visible');
    } else {
        ft.classList.remove('visible');
    }
});

document.addEventListener('mousedown', e => {
    // 浮動格式工具列：點擊外部關閉
    const ft = document.getElementById('float-toolbar');
    if (ft && !ft.contains(e.target)) ft.classList.remove('visible');

    // 搜尋建議：點擊搜尋框或建議框以外的地方時關閉
    if (!e.target.closest('.suggestion-box')
        && !e.target.closest('#homeSearchInput')
        && !e.target.closest('#innerSearchInput')) {
        document.querySelectorAll('.suggestion-box').forEach(b => b.classList.add('hidden'));
    }
});

window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyK') {
        e.preventDefault();
        toggleEditMode(true);
    }
    if (e.key === 'Escape') closeStratModal();
});

window.addEventListener('scroll', () => {
    // 回到頂部按鈕
    const btn = document.getElementById('back-to-top');
    if (btn) btn.classList.toggle('btt-visible', window.scrollY > 280);

    // 搜尋建議框：滾動時重新定位（position:fixed 需手動更新）
    ['homeSearchInput', 'innerSearchInput'].forEach(id => {
        const input = document.getElementById(id);
        const box   = document.getElementById(id === 'homeSearchInput' ? 'homeSuggestions' : 'innerSuggestions');
        if (!input || !box || box.classList.contains('hidden')) return;
        _positionSuggestionBox(input, box);
    });
}, { passive: true });


/* ════════════════════════════════════════════════════
   12. INIT — 頁面載入初始化
════════════════════════════════════════════════════ */

window.onload = async function () {
    try {
        const res = await fetch('cobblemon_data.json');
        if (!res.ok) throw new Error('無法載入 cobblemon_data.json');
        const data = await res.json();
        COMMANDS_DATA          = data.commands      || [];
        ALL_DATA               = data.search_index  || [];
        window.STRATEGIES_DATA = data.strategies    || [];
    } catch (e) {
        console.error('JSON 載入失敗：', e);
    }
    initCommands();
    initStrategies();
};
