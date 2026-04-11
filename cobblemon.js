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

function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .split(/[\s\u3000,，、。！？/\[\]()（）]+/)
        .filter(t => t.length > 0);
}

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

    if      (titleL === q)          { score += 500; matchedTerms.push(q); }
    else if (titleL.startsWith(q))  { score += 360; matchedTerms.push(q); }
    else if (titleL.includes(q))    { score += 300; matchedTerms.push(q); }

    if (kwL.includes(q) && !titleL.includes(q))                       { score += 200; matchedTerms.push(q); }
    if (descL.includes(q) && !titleL.includes(q) && !kwL.includes(q)) { score +=  80; matchedTerms.push(q); }

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

    if (qTokens.length > 1) {
        const coverage = tokenHits / qTokens.length;
        if      (coverage === 0)  score = 0;
        else if (coverage < 0.5)  score = Math.floor(score * 0.05);
        else if (coverage < 1.0)  score = Math.floor(score * (0.2 + 0.8 * coverage));
    }

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

function handleGlobalSearch(input, suggestBoxId) {
    const query      = input.value.trim();
    const suggestBox = document.getElementById(suggestBoxId);

    if (!query) { suggestBox.classList.add('hidden'); return; }

    _lastQuery = query;
    _positionSuggestionBox(input, suggestBox);

    if (suggestBoxId === 'innerSuggestions' && ALL_DATA.length === 0) {
        _handleDomCommandSearch(query, suggestBox);
        return;
    }

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

function executeHomeSearch() {
    const input = document.getElementById('homeSearchInput');
    const query = input.value.trim();
    if (!query) return;

    _lastQuery = query;
    document.getElementById('homeSuggestions').classList.add('hidden');

    const scored       = rankResults(query, 8);
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

// 將 STRATEGIES_DATA 同步為 DOM 中實際存在的攻略（過濾掉已被刪除的）
function _syncStrategiesDataFromDOM() {
    const existing = new Set(
        Array.from(document.querySelectorAll('#strategy-container > .strat-card[id]')).map(c => c.id)
    );
    window.STRATEGIES_DATA = (window.STRATEGIES_DATA || []).filter(s => existing.has(s.id));
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
            icon  : '📖',
            title : '新攻略標題',
            html  : '<h3 class="text-2xl font-bold text-purple-900 mb-6 flex items-center">新攻略標題</h3><div class="text-gray-700"><p>內容填寫...</p></div>',
        };
        if (!window.STRATEGIES_DATA) window.STRATEGIES_DATA = [];
        // 只保留 DOM 中還存在的攻略，確保已刪除的不會復活
        _syncStrategiesDataFromDOM();
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

    if (!container._stratDelegateAdded) {
        container._stratDelegateAdded = true;
        container.addEventListener('click', e => {
            if (e.target.closest('.admin-btn')) return;
            const card = e.target.closest('.strat-card');
            if (!card) return;

            const strat = (window.STRATEGIES_DATA || []).find(s => s.id === card.id);
            if (strat) {
                openStratModal(strat);
            } else {
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
            }
        });
    }

    if (!window.STRATEGIES_DATA) return;

    container.innerHTML = '';
    window.STRATEGIES_DATA.forEach((strat, idx) => {
        // 保留已儲存的 icon，若無則從預設陣列取得
        if (!strat.icon) strat.icon = _stratIcons[idx % _stratIcons.length];
        const icon    = strat.icon;
        const preview = _stratPreview(strat.html);
        const card    = document.createElement('div');
        card.id        = strat.id;
        card.className = 'strat-card';
        const isEditing = document.body.classList.contains('editing-active');
        card.innerHTML = `
            <button class="edit-ui admin-btn admin-btn-delete" style="position:absolute;top:10px;right:10px;padding:4px 10px;font-size:12px"
                onclick="event.stopPropagation();this.closest('.strat-card').remove()" contenteditable="false">[x]</button>
            <div class="strat-card-icon" ${isEditing ? `onclick="event.stopPropagation();_openStratIconPicker(this,'${strat.id}')" style="cursor:pointer;"` : ''}>${icon}${isEditing ? '<span class="edit-ui" style="position:absolute;top:6px;left:8px;font-size:10px;background:rgba(0,0,0,0.55);color:#fff;border-radius:4px;padding:1px 4px;pointer-events:none;">✏️</span>' : ''}</div>
            <div class="strat-card-title">${strat.title.replace(/^[\p{Emoji}✨⚔️💰🛒🥚📊🌿🏆🗺️💎⚡📖]+\s*/u, '')}</div>
            <div class="strat-card-preview">${preview}</div>
            <span class="strat-card-arrow">›</span>`;
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
    if (isEditing) {
        setTimeout(_setupImgDropTargets, 50);
        // 支援直接貼上圖片（Ctrl+V）
        if (!body._pasteImgHandler) {
            body._pasteImgHandler = function(e) {
                if (!document.body.classList.contains('editing-active')) return;
                const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) continue;
                        const reader = new FileReader();
                        reader.onload = ev => _createDraggableImage(ev.target.result, '貼上圖片');
                        reader.readAsDataURL(file);
                        break;
                    }
                }
            };
            body.addEventListener('paste', body._pasteImgHandler);
        }
    }
}

function saveStratEdits() {
    if (!_activeStrat) return;
    const body  = document.getElementById('strat-modal-body');
    const clone = body.cloneNode(true);
    // 移除所有編輯 UI 元素（工具列、刪除按鈕、鉛筆標記等）
    clone.querySelectorAll('.edit-ui').forEach(el => el.remove());
    // 移除 contenteditable 屬性，避免儲存後重新開啟時內容變成可編輯狀態
    clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    // 清除小提醒/注意事項中的 position:relative style（由 insertTip/insertNotice 加入）
    clone.querySelectorAll('.mt-4.bg-yellow-50, .notice-block').forEach(el => {
        el.style.removeProperty('position');
    });
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

// 攻略卡片圖示選擇器
const _allStratIcons = ['📖','⚔️','💰','🛒','🥚','📊','🌿','✨','🏆','🗺️','💎','⚡',
    '🔥','❄️','💧','🌊','⚡','🌟','🎯','🛡️','🗡️','🧪','🧬','🌐','🎮','🏅','🎁','🌸','🐉'];

function _openStratIconPicker(iconEl, stratId) {
    if (!document.body.classList.contains('editing-active')) return;
    // 移除舊的 picker
    document.querySelectorAll('._strat-icon-picker').forEach(p => p.remove());

    const picker = document.createElement('div');
    picker.className = '_strat-icon-picker';
    picker.setAttribute('contenteditable', 'false');
    picker.style.cssText = [
        'position:fixed','z-index:99999','background:#1e293b',
        'border:1.5px solid #3b82f6','border-radius:12px','padding:10px',
        'display:flex','flex-wrap:wrap','gap:6px','max-width:260px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.45)',
    ].join(';');

    _allStratIcons.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.setAttribute('contenteditable', 'false');
        btn.style.cssText = 'font-size:1.5rem;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:background 0.15s;';
        btn.onmouseenter = () => { btn.style.background = '#334155'; };
        btn.onmouseleave = () => { btn.style.background = 'none'; };
        btn.onmousedown = e => {
            e.preventDefault();
            e.stopPropagation();
            // 更新資料
            const strat = (window.STRATEGIES_DATA || []).find(s => s.id === stratId);
            if (strat) strat.icon = emoji;
            // 更新卡片上的顯示（只更新 icon div 文字節點）
            const textNode = iconEl.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                textNode.nodeValue = emoji;
            } else {
                iconEl.innerHTML = emoji + (iconEl.querySelector('span')?.outerHTML || '');
            }
            picker.remove();
        };
        picker.appendChild(btn);
    });

    // 定位到圖示旁
    const rect = iconEl.getBoundingClientRect();
    picker.style.top  = Math.min(rect.bottom + 6, window.innerHeight - 200) + 'px';
    picker.style.left = Math.max(4, rect.left) + 'px';

    document.body.appendChild(picker);

    // 點擊其他地方關閉
    const closeHandler = e => {
        if (!picker.contains(e.target) && e.target !== iconEl) {
            picker.remove();
            document.removeEventListener('mousedown', closeHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler, true), 10);
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

// ── [修改3] 手機點頁腳5次開啟編輯模式 ─────────────────────────────
let _footerTapCount = 0;
let _footerTapTimer = null;

function _initFooterTapSecret() {
    const footer = document.querySelector('footer');
    if (!footer) return;
    // 讓頁腳可點擊但不顯示任何視覺提示
    footer.style.cursor = 'default';
    footer.style.userSelect = 'none';
    footer.addEventListener('click', function(e) {
        // 已在編輯模式就不再累計
        if (document.body.classList.contains('editing-active')) return;

        _footerTapCount++;
        clearTimeout(_footerTapTimer);

        if (_footerTapCount >= 5) {
            _footerTapCount = 0;
            toggleEditMode(true);
            // 給手機一點視覺回饋
            _showToast('✏️ 編輯模式已開啟');
        } else {
            // 2秒內沒繼續點就重置計數
            _footerTapTimer = setTimeout(() => { _footerTapCount = 0; }, 2000);
        }
    });
}

// 短暫顯示一個浮動提示（手機友善）
function _showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = [
        'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.8)', 'color:#fff', 'padding:10px 20px',
        'border-radius:20px', 'font-size:14px', 'font-weight:700',
        'z-index:99999', 'pointer-events:none',
        'transition:opacity 0.4s',
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 1600);
    setTimeout(() => { toast.remove(); }, 2100);
}

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

        // ── [修改2] 指令集群組內的指令列可拖動排序 ─────────────
        _initScCmdSortables();

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

        // 清除所有指令列排序實例
        _destroyScCmdSortables();

        if (_enterGuard) { document.removeEventListener('keydown', _enterGuard); _enterGuard = null; }
    }
}

// ── [修改2] 指令集群組內指令排序相關函式 ──────────────────────────

// 儲存每個群組的 Sortable 實例，離開編輯模式時清除
let _scCmdSortables = [];

function _initScCmdSortables() {
    _destroyScCmdSortables();
    if (typeof Sortable === 'undefined') return;

    // 對每個 sc-sec-body 內的每個 sc-cmd-group 啟用排序
    document.querySelectorAll('#scSections .sc-sec-body').forEach(body => {
        body.querySelectorAll('.sc-cmd-group').forEach(group => {
            // 找出群組內所有指令列
            const rows = Array.from(group.querySelectorAll('.sc-cmd-row'));
            if (rows.length < 2) return; // 只有一列不需要排序

            // 給群組加上拖移把手（編輯模式限定）
            rows.forEach(row => {
                if (!row.querySelector('.sc-drag-handle')) {
                    const handle = document.createElement('span');
                    handle.className = 'sc-drag-handle';
                    handle.textContent = '⠿';
                    handle.style.cssText = 'cursor:grab;color:#93c5fd;font-size:14px;padding:0 6px;flex-shrink:0;touch-action:none;';
                    handle.setAttribute('contenteditable', 'false');
                    row.prepend(handle);
                }
            });

            const sortable = new Sortable(group, {
                animation    : 150,
                handle       : '.sc-drag-handle',
                draggable    : '.sc-cmd-row',
                ghostClass   : 'sortable-ghost',
                onEnd        : function(evt) {
                    // 同步更新 window.scData 中對應的指令順序
                    _syncScCmdOrder(group);
                },
            });
            _scCmdSortables.push(sortable);
        });
    });
}

// 把 DOM 的指令列順序同步回 window.scData
function _syncScCmdOrder(groupEl) {
    // 找到這個 group 屬於哪個 section
    const secEl  = groupEl.closest('.sc-section');
    if (!secEl) return;
    const secId = secEl.dataset.id;
    const sec   = (window.scData || []).find(s => s.id === secId);
    if (!sec) return;

    // 找是第幾個 group（在 sc-sec-body 中的 index）
    const bodyEl   = secEl.querySelector('.sc-sec-body');
    const groups   = Array.from(bodyEl.querySelectorAll('.sc-cmd-group'));
    const groupIdx = groups.indexOf(groupEl);
    if (groupIdx < 0 || !sec.groups[groupIdx]) return;

    // 讀出 DOM 目前的指令順序，更新到 scData
    const newOrder = Array.from(groupEl.querySelectorAll('.sc-cmd-row')).map(row => {
        const cmdEl  = row.querySelector('.sc-cmd, .sc-edit-cmd-input');
        const descEl = row.querySelector('.sc-cmd-desc, .sc-edit-desc-input');
        return {
            cmd  : cmdEl  ? (cmdEl.value  || cmdEl.textContent || '').trim() : '',
            desc : descEl ? (descEl.value || descEl.textContent || '').trim() : '',
        };
    }).filter(c => c.cmd);

    sec.groups[groupIdx].cmds = newOrder;
}

function _destroyScCmdSortables() {
    _scCmdSortables.forEach(s => { try { s.destroy(); } catch(e) {} });
    _scCmdSortables = [];
    // 移除所有拖移把手
    document.querySelectorAll('.sc-drag-handle').forEach(h => h.remove());
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
    el.style.cssText = 'position:relative;';
    el.setAttribute('contenteditable', 'true');
    el.innerHTML = '<button class="edit-ui" contenteditable="false" onmousedown="event.preventDefault();event.stopPropagation();this.parentElement.remove()" '
        + 'style="position:absolute;top:4px;right:6px;background:none;border:none;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;padding:2px 5px;border-radius:4px;" title="刪除">✕</button>'
        + '💡 <b>小提醒：</b>在此輸入文字...';
    _insertAtCursor(el);
}

function insertNotice() {
    const el = document.createElement('div');
    el.className = 'notice-block';
    el.style.cssText = 'position:relative;';
    el.setAttribute('contenteditable', 'true');
    el.innerHTML = '<button class="edit-ui" contenteditable="false" onmousedown="event.preventDefault();event.stopPropagation();this.parentElement.remove()" '
        + 'style="position:absolute;top:4px;right:6px;background:none;border:none;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;padding:2px 5px;border-radius:4px;" title="刪除">✕</button>'
        + '<div class="notice-title">⚠️ 注意事項</div><p>在此輸入注意事項內容...</p>';
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
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgAlign(this,'left')"   title="靠左對齊">◀</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgAlign(this,'center')" title="置中">■</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgAlign(this,'right')"  title="靠右對齊">▶</button>
        <span class="rb-sep"></span>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgWrap(this,'left')"   title="文繞圖（圖靠左）">⬡◀</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgWrap(this,'right')"  title="文繞圖（圖靠右）">▶⬡</button>
        <button class="rb" style="font-size:10px;padding:2px 5px;" onmousedown="event.preventDefault();setImgWrap(this,'none')"   title="取消文繞圖">⊗</button>
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

    let _resizing = false, _startX, _startW;
    resizeHandle.addEventListener('mousedown', e => {
        if (!document.body.classList.contains('editing-active')) return;
        e.preventDefault(); e.stopPropagation();
        _resizing = true; _startX = e.clientX; _startW = img.offsetWidth;
        const onMove = e2 => {
            if (_resizing) {
                img.style.width    = Math.max(60, _startW + e2.clientX - _startX) + 'px';
                img.style.maxWidth = 'none';
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', () => { _resizing = false; document.removeEventListener('mousemove', onMove); }, { once: true });
    });

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
        zone.addEventListener('dragover', e => {
            if (window._dragImgEl) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
        });
        zone.addEventListener('drop', e => {
            if (!window._dragImgEl) return;
            e.preventDefault();
            const el = window._dragImgEl;
            let range;
            if      (document.caretRangeFromPoint)    range = document.caretRangeFromPoint(e.clientX, e.clientY);
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

function setImgWrap(btn, side) {
    const wrapper = btn.closest('.drag-img');
    // Clear existing alignment/float styles
    wrapper.classList.remove('img-float-left', 'img-float-right', 'img-center');
    if (side === 'left') {
        wrapper.style.cssText = 'float:left;margin:4px 16px 8px 0;display:inline-block;';
    } else if (side === 'right') {
        wrapper.style.cssText = 'float:right;margin:4px 0 8px 16px;display:inline-block;';
    } else {
        // Cancel wrap: revert to block center
        wrapper.style.cssText = 'display:block;text-align:center;margin:8px auto;max-width:100%;float:none;clear:both;';
    }
}


/* ════════════════════════════════════════════════════
   9. ADMIN — 發佈、存檔、版本管理
════════════════════════════════════════════════════ */

function openPublishModal() { document.getElementById('confirm-modal').style.display = 'flex'; }
function closeModal()       { document.getElementById('confirm-modal').style.display = 'none'; }

function updateVersionPreview(type) {
    const versionEl       = document.getElementById('modal-version');
    const maintenanceRow  = document.getElementById('modal-maintenance-row');

    if (type === 'maintenance') {
        versionEl.value    = 'v' + baseVersion.toFixed(1);
        versionEl.readOnly = true;
        versionEl.style.opacity = '0.55';
        versionEl.title    = '維護模式不更新版本號';
        if (maintenanceRow) maintenanceRow.classList.remove('hidden');
    } else {
        versionEl.value    = 'v' + (
            type === 'major'
                ? (Math.floor(baseVersion) + 1).toFixed(1)
                : (baseVersion + 0.1).toFixed(1)
        );
        versionEl.readOnly = false;
        versionEl.style.opacity = '';
        versionEl.title    = '';
        if (maintenanceRow) maintenanceRow.classList.add('hidden');
    }
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
    return (window.STRATEGIES_DATA || []).filter(s => remaining.has(s.id)).map(s => ({
        id    : s.id,
        title : s.title,
        icon  : s.icon || '📖',
        html  : s.html,
    }));
}

function executeFinalSave() {
    const summary    = document.getElementById('modal-summary').value || '攻略站內容更新';
    const detail     = document.getElementById('modal-detail').value;
    const version    = document.getElementById('modal-version').value;
    const updateType = document.querySelector('input[name="update-type"]:checked')?.value || 'minor';

    const publishAnnouncement = updateType !== 'maintenance'
        || (document.getElementById('modal-publish-maintenance')?.checked ?? true);

    const dateStr = new Date().toLocaleDateString('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-');

    const badgeMap = {
        major       : { label: '改版',   badgeCls: 'bg-red-600',    borderCls: 'border-red-500',    dotCls: '!bg-red-500'    },
        minor       : { label: '更新',   badgeCls: 'bg-blue-600',   borderCls: 'border-blue-500',   dotCls: '!bg-blue-500'   },
        maintenance : { label: '維護',   badgeCls: 'bg-yellow-600', borderCls: 'border-yellow-500', dotCls: '!bg-yellow-500' },
    };
    const badge = badgeMap[updateType] || badgeMap.minor;

    const newsContainer = document.getElementById('news-container');
    if (newsContainer.querySelector('p.italic')) newsContainer.innerHTML = '';

    if (publishAnnouncement) {
        const log = document.createElement('div');
        log.className    = `bg-white border-l-4 ${badge.borderCls} shadow-md p-6`;
        log.style.position = 'relative';
        log.innerHTML = `
            <button class="edit-ui admin-btn admin-btn-delete absolute top-3 right-3"
                onclick="this.closest('#news-container > div').remove()" contenteditable="false">[x] 刪除</button>
            <div class="mb-3">
                <span class="${badge.badgeCls} text-white text-xs px-2 py-1 font-bold whitespace-nowrap">${badge.label}</span>
                <h3 class="inline text-xl font-bold text-blue-900 uppercase ml-2">${version} - ${summary}</h3>
            </div>
            <div class="news-item ml-2 pb-1">
                <div class="news-dot ${badge.dotCls}"></div>
                <p class="text-gray-700 text-sm">${detail}</p>
            </div>
            <div class="text-right mt-2">
                <span class="text-gray-400 text-xs font-bold">${dateStr}</span>
            </div>`;
        newsContainer.prepend(log);
    }
    closeModal();
    toggleEditMode(false);
    // 確保已刪除的攻略不被寫入 JSON
    _syncStrategiesDataFromDOM();

    // ── [修改1] 先確保切回首頁（淺色模式狀態） ─────────────────────
    // 同時確保 dark-mode class 不存在，讓下載的 HTML 預設為淺色模式
    document.body.classList.remove('dark-mode');
    document.getElementById('mode-knob').innerText = '🌙';
    showPage('home');

    const strategyEntries = extractStrategiesFromDOM().map(s => ({
        type     : 'strategy',
        target   : s.id,
        keywords : s.title,
        title    : s.title.replace(/^[\p{Emoji}✨⚔️💰🛒🥚📊🌿🏆🗺️💎⚡📖]+\s*/u, ''),
        desc     : (function () {
            const tmp = document.createElement('div');
            tmp.innerHTML = s.html;
            return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        })(),
    }));
    ALL_DATA = [
        ...ALL_DATA.filter(e => e.type !== 'strategy'),
        ...strategyEntries,
    ];

    const serverCmds = window.scData || [];

    const jsonPayload = {
        data_version   : version,
        commands       : extractCommandsFromDOM(),
        serverCommands : serverCmds,
        search_index   : ALL_DATA,
        strategies     : extractStrategiesFromDOM(),
    };
    const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
    Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(jsonBlob), download: 'cobblemon_data.json',
    }).click();

    setTimeout(() => {
        Object.assign(document.createElement('a'), {
            href     : URL.createObjectURL(new Blob(['<!DOCTYPE html>\n' + document.documentElement.outerHTML], { type: 'text/html' })),
            download : 'index.html',
        }).click();
    }, 300);

    setTimeout(() => {
        fetch('cobblemon.js')
            .then(r => r.text())
            .then(src => {
                Object.assign(document.createElement('a'), {
                    href     : URL.createObjectURL(new Blob([src], { type: 'application/javascript' })),
                    download : 'cobblemon.js',
                }).click();
            })
            .catch(() => console.warn('[Save] 無法下載 cobblemon.js'));
    }, 600);
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

document.addEventListener('DOMContentLoaded', function () {
    initStrategies();
    // [修改3] 初始化頁腳5連點開啟編輯模式
    _initFooterTapSecret();
});

// 攔截 contenteditable 區域的貼上，清除 emoji 被包上的黑底 span
document.addEventListener('paste', function(e) {
    const target = e.target;
    if (!target.closest('[contenteditable="true"]')) return;
    // 若剪貼簿只有純文字，不做特殊處理（讓瀏覽器預設行為跑）
    const clipData = e.clipboardData || window.clipboardData;
    if (!clipData) return;
    const html = clipData.getData('text/html');
    const text = clipData.getData('text/plain');
    // 只有在有 HTML 且包含可能帶樣式的 span 時才攔截
    if (!html || !html.includes('background')) return;
    e.preventDefault();
    // 解析 HTML，移除所有 background-color 及 color 樣式，再插入
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('[style]').forEach(el => {
        el.style.removeProperty('background-color');
        el.style.removeProperty('background');
        // 如果是 emoji（只含 emoji 字元），也移除 color
        const txt = el.textContent || '';
        if (/^\p{Emoji}/u.test(txt)) el.style.removeProperty('color');
        // 若 style 清空了，移除 style 屬性
        if (!el.getAttribute('style').trim()) el.removeAttribute('style');
    });
    // 移除空的 span 包裹（把內容提升）
    div.querySelectorAll('span:not([class]):not([id])').forEach(span => {
        if (!span.getAttribute('style')) {
            span.replaceWith(...span.childNodes);
        }
    });
    document.execCommand('insertHTML', false, div.innerHTML);
});

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
    const ft = document.getElementById('float-toolbar');
    if (ft && !ft.contains(e.target)) ft.classList.remove('visible');

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
    const btn = document.getElementById('back-to-top');
    if (btn) btn.classList.toggle('btt-visible', window.scrollY > 280);

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

async function _checkAndRefreshIfNeeded() {
    try {
        const res = await fetch('cobblemon_data.json?_=' + Date.now(), {
            cache: 'no-store',
        });
        if (!res.ok) throw new Error('fetch failed ' + res.status);
        const data = await res.json();

        const serverVer = String(data.data_version || '');
        const localVer  = localStorage.getItem('cobblemon_data_version') || '';

        if (serverVer && serverVer !== localVer) {
            localStorage.setItem('cobblemon_data_version', serverVer);
            console.info('[Cobblemon] 版本更新', localVer || '(無)', '→', serverVer, '，強制重新整理…');

            if ('caches' in window) {
                const names = await caches.keys().catch(() => []);
                await Promise.all(names.map(n => caches.delete(n)));
            }

            location.reload(true);
            return null;
        }

        return data;

    } catch (e) {
        console.warn('[Cobblemon] 版本檢查失敗，略過強制重整：', e.message);
        return null;
    }
}

window.onload = async function () {

    let data = await _checkAndRefreshIfNeeded();

    if (!data) {
        try {
            const res = await fetch('cobblemon_data.json');
            if (res.ok) data = await res.json();
        } catch (e) {
            console.error('[Cobblemon] JSON 載入失敗：', e);
        }
    }

    if (data) {
        COMMANDS_DATA          = data.commands      || [];
        ALL_DATA               = data.search_index  || [];
        window.STRATEGIES_DATA = data.strategies    || [];

        if (Array.isArray(data.serverCommands) && data.serverCommands.length > 0) {
            window.scData = data.serverCommands.map(s => Object.assign({}, s));
            if (typeof window.scRender === 'function') window.scRender();
        }
    }

    initFuse();
    initCommands();
    initStrategies();
};
