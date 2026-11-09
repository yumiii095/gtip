/**
 * Cobblemon Commands View Logic (Full Featured)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('commands-list');
  const searchInput = document.getElementById('command-search');
  const categoryFilters = document.getElementById('category-filters');
  const emptyState = document.getElementById('commands-empty');

  const commands = await Core.loadJSON('commands', 'data/commands.json') || [];

  let currentCategory = 'all';
  let searchQuery = '';

  function render() {
    container.innerHTML = '';

    const filtered = commands.filter(cmd => {
      const matchCat = currentCategory === 'all' || cmd.category === currentCategory;
      const matchSearch = !searchQuery || 
        (cmd.name && cmd.name.toLowerCase().includes(searchQuery)) ||
        (cmd.description && cmd.description.toLowerCase().includes(searchQuery)) ||
        (cmd.syntax && cmd.syntax.toLowerCase().includes(searchQuery));
      return matchCat && matchSearch;
    });

    if (commands.length === 0 || filtered.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    filtered.forEach(cmd => {
      const card = document.createElement('div');
      card.className = 'command-card card';
      card.style.marginBottom = '1rem';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
              <code style="font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; color: var(--primary-text); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-sm);">${escapeHTML(cmd.name || '')}</code>
              <span style="font-size: 0.75rem; background: var(--bg-subtle); color: var(--text-muted); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-weight: 600;">${escapeHTML(cmd.category || '常用')}</span>
              ${renderPermissionBadge(cmd.permission)}
            </div>
            <div style="color: var(--text-main); font-size: 0.95rem; margin-top: 0.35rem;">${escapeHTML(cmd.description || '')}</div>
            ${cmd.syntax ? `<div style="font-size: 0.82rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.25rem;">語法: ${escapeHTML(cmd.syntax)}</div>` : ''}
          </div>
          <button class="btn btn-secondary btn-sm copy-btn" data-syntax="${escapeHTML(cmd.syntax || cmd.name || '')}">
            📋 複製指令
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-syntax');
        Core.copyText(text, `已複製指令: ${text}`);
      });
    });
  }

  function renderPermissionBadge(perm) {
    if (!perm) return '';
    if (perm === 'VIP專屬') {
      return `<span style="font-size: 0.75rem; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 700;">⭐ VIP專屬</span>`;
    }
    if (perm === 'Master VIP專屬') {
      return `<span style="font-size: 0.75rem; background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 800;">👑 Master VIP專屬</span>`;
    }
    if (perm === '所有玩家' || perm === '玩家') {
      return `<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: var(--radius-sm);">👥 所有玩家</span>`;
    }
    return `<span style="font-size: 0.75rem; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: var(--radius-sm);">${escapeHTML(perm)}</span>`;
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      render();
    });
  }

  if (categoryFilters) {
    categoryFilters.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        categoryFilters.querySelectorAll('button').forEach(b => {
          b.classList.remove('active', 'btn-primary');
          b.classList.add('btn-secondary');
        });
        e.target.classList.remove('btn-secondary');
        e.target.classList.add('btn-primary', 'active');
        currentCategory = e.target.getAttribute('data-cat') || 'all';
        render();
      }
    });
  }

  render();
});
