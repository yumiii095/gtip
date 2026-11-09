/**
 * Cobblemon Commands View Logic (Clean 3-Field Version)
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
        (cmd.description && cmd.description.toLowerCase().includes(searchQuery));
      return matchCat && matchSearch;
    });

    if (commands.length === 0 || filtered.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    filtered.forEach(cmd => {
      const card = document.createElement('div');
      card.className = 'command-card';

      const cat = cmd.category || '常用';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
              <code style="font-family: var(--font-mono); font-size: 1.15rem; font-weight: 800; color: var(--primary-text); background: var(--primary-light); padding: 3px 10px; border-radius: var(--radius-sm);">${escapeHTML(cmd.name || '')}</code>
              <span class="category-badge-${escapeHTML(cat)}" style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: var(--radius-sm);">${escapeHTML(cat)}</span>
            </div>
            <div style="color: var(--text-main); font-size: 0.95rem; margin-top: 0.25rem;">${escapeHTML(cmd.description || '')}</div>
          </div>
          <button class="btn btn-secondary btn-sm copy-btn" data-syntax="${escapeHTML(cmd.name || '')}">
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
