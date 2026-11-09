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
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <code style="font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; color: var(--primary-text); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-sm);">${escapeHTML(cmd.name || '')}</code>
              <span style="font-size: 0.75rem; background: var(--bg-subtle); color: var(--text-muted); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">${escapeHTML(cmd.category || '一般')}</span>
              ${cmd.permission ? `<span style="font-size: 0.75rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: var(--radius-sm);">${escapeHTML(cmd.permission)}</span>` : ''}
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
