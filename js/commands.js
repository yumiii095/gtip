/**
 * Cobblemon Commands View Logic (Dynamic Category & Accordion System)
 * Default State: All categories collapsed
 */

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('commands-list');
  const searchInput = document.getElementById('command-search');
  const categoryFilters = document.getElementById('category-filters');
  const emptyState = document.getElementById('commands-empty');
  const btnExpandAll = document.getElementById('btn-expand-all');
  const btnCollapseAll = document.getElementById('btn-collapse-all');

  // Load config & categories
  const config = await Core.loadJSON('config', 'data/config.json') || {};
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

  let rawCatList = (config.commandCategories && Array.isArray(config.commandCategories) && config.commandCategories.length > 0)
    ? config.commandCategories
    : defaultCategories;

  // Load commands
  const rawCommands = await Core.loadJSON('commands', 'data/commands.json') || [];
  const commands = rawCommands.map(cmd => {
    let cat = cmd.category || '個人功能';
    if (cat === '個人' || cat === '常用') cat = '個人功能';
    if (cmd.permission && cmd.permission.includes('VIP') && cat === '個人') {
      cat = 'VIP專屬';
    }
    return { ...cmd, category: cat };
  });

  // Ensure any category found in commands exists in category list
  const catNamesSet = new Set(rawCatList.map(c => c.name));
  commands.forEach(cmd => {
    if (cmd.category && !catNamesSet.has(cmd.category)) {
      rawCatList.push({ name: cmd.category, icon: '📌' });
      catNamesSet.add(cmd.category);
    }
  });

  const categoryMeta = {};
  const categoryOrder = [];
  rawCatList.forEach(c => {
    categoryMeta[c.name] = { icon: c.icon || '📌', label: c.name };
    categoryOrder.push(c.name);
  });

  let currentCategory = 'all';
  let searchQuery = '';
  // Requirement: Default all collapsed (empty set)
  const openCategories = new Set();

  // Dynamically render category filter buttons
  function renderFilterButtons() {
    if (!categoryFilters) return;
    let buttonsHtml = `<button class="btn btn-primary active btn-sm" data-cat="all">全部</button>`;
    categoryOrder.forEach(cat => {
      const meta = categoryMeta[cat] || { icon: '📌', label: cat };
      buttonsHtml += ` <button class="btn btn-secondary btn-sm" data-cat="${escapeHTML(cat)}">${meta.icon} ${escapeHTML(cat)}</button>`;
    });
    categoryFilters.innerHTML = buttonsHtml;
  }

  function render() {
    container.innerHTML = '';
    let totalVisible = 0;

    categoryOrder.forEach(cat => {
      // Category filter check
      if (currentCategory !== 'all' && currentCategory !== cat) {
        return;
      }

      // Filter commands within this category
      const items = commands.filter(cmd => {
        if (cmd.category !== cat) return false;
        if (!searchQuery) return true;
        return (cmd.name && cmd.name.toLowerCase().includes(searchQuery)) ||
               (cmd.description && cmd.description.toLowerCase().includes(searchQuery)) ||
               (cmd.syntax && cmd.syntax.toLowerCase().includes(searchQuery)) ||
               (cmd.permission && cmd.permission.toLowerCase().includes(searchQuery));
      });

      if (items.length === 0 && searchQuery) {
        return;
      }

      totalVisible += items.length;

      const meta = categoryMeta[cat] || { icon: '📌', label: cat };
      // If user typed a search query, auto-expand categories that have results; otherwise check openCategories
      const isOpen = searchQuery ? true : openCategories.has(cat);

      const groupEl = document.createElement('div');
      groupEl.className = `cmd-accordion-group ${isOpen ? 'open' : ''}`;
      groupEl.setAttribute('data-cat', cat);

      // Accordion Header (Click anywhere to toggle expand/collapse)
      const headerEl = document.createElement('div');
      headerEl.className = 'cmd-accordion-header';
      headerEl.innerHTML = `
        <div class="cmd-accordion-title-wrap">
          <span class="cmd-cat-icon">${meta.icon}</span>
          <span class="cmd-cat-name">${escapeHTML(cat)}</span>
        </div>
        <div class="cmd-accordion-meta">
          <span class="cmd-count-badge">${items.length} 指令</span>
          <span class="cmd-chevron">▼</span>
        </div>
      `;

      headerEl.addEventListener('click', () => {
        const isNowOpen = groupEl.classList.toggle('open');
        if (isNowOpen) {
          openCategories.add(cat);
        } else {
          openCategories.delete(cat);
        }
      });

      // Accordion Body
      const bodyEl = document.createElement('div');
      bodyEl.className = 'cmd-accordion-body';

      if (items.length === 0) {
        bodyEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem; padding: 0.75rem 0.5rem;">此分類目前尚無任何指令。</div>`;
      } else {
        items.forEach(cmd => {
          const card = document.createElement('div');
          card.className = 'command-card card';
          card.style.marginBottom = '0.5rem';
          card.style.padding = '0.75rem 1.15rem';

          const permBadgeHtml = renderPermissionBadge(cmd.permission || '所有玩家');

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; width: 100%;">
              <div style="flex: 1; min-width: 240px;">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <code style="font-family: var(--font-mono); font-size: 1.05rem; font-weight: 700; color: var(--primary-text); background: var(--primary-light); padding: 2px 7px; border-radius: var(--radius-sm);">${escapeHTML(cmd.name || cmd.syntax || '')}</code>
                  ${permBadgeHtml}
                </div>
                <div style="color: var(--text-main); font-size: 0.9rem; margin-top: 0.35rem; line-height: 1.5;">${escapeHTML(cmd.description || '')}</div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm copy-btn" style="padding: 0.35rem 0.85rem; font-size: 0.82rem; white-space: nowrap; font-weight: 700;" data-syntax="${escapeHTML(cmd.syntax || cmd.name || '')}">
                📋 複製指令
              </button>
            </div>
          `;
          bodyEl.appendChild(card);
        });
      }

      groupEl.appendChild(headerEl);
      groupEl.appendChild(bodyEl);
      container.appendChild(groupEl);
    });

    if (totalVisible === 0) {
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
    }

    // Bind copy buttons
    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-syntax');
        Core.copyText(text, `已複製指令: ${text}`);
      });
    });
  }

  function renderPermissionBadge(perm) {
    if (!perm) return '';
    if (perm === 'VIP專屬') {
      return `<span style="font-size: 0.75rem; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 700;">👑 VIP專屬</span>`;
    }
    if (perm === 'Master VIP專屬') {
      return `<span style="font-size: 0.75rem; background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 800;">👑 Master VIP專屬</span>`;
    }
    if (perm === '所有玩家' || perm === '玩家') {
      return `<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: var(--radius-sm);">所有玩家</span>`;
    }
    return `<span style="font-size: 0.75rem; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: var(--radius-sm);">${escapeHTML(perm)}</span>`;
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      render();
    });
  }

  // Category filter tabs
  if (categoryFilters) {
    categoryFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        categoryFilters.querySelectorAll('button').forEach(b => {
          b.classList.remove('active', 'btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary', 'active');
        currentCategory = btn.getAttribute('data-cat') || 'all';
        // When clicking a specific category filter, auto open that category
        if (currentCategory !== 'all') {
          openCategories.add(currentCategory);
        }
        render();
      }
    });
  }

  // Expand / Collapse all
  if (btnExpandAll) {
    btnExpandAll.addEventListener('click', () => {
      categoryOrder.forEach(c => openCategories.add(c));
      document.querySelectorAll('.cmd-accordion-group').forEach(el => el.classList.add('open'));
    });
  }

  if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', () => {
      openCategories.clear();
      document.querySelectorAll('.cmd-accordion-group').forEach(el => el.classList.remove('open'));
    });
  }

  renderFilterButtons();
  render();
});
