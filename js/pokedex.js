/**
 * Cobblemon Pokédex & Drop Rate Logic
 * Connected to data/poke.json (1,000+ Pokémon)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('pokedex-grid');
  const searchInput = document.getElementById('pokedex-search');
  const dropFilter = document.getElementById('drop-filter');
  const countInfo = document.getElementById('poke-count-info');
  const emptyState = document.getElementById('pokedex-empty');
  const loadMoreContainer = document.getElementById('load-more-container');
  const btnLoadMore = document.getElementById('btn-load-more');
  const modal = document.getElementById('pokemon-modal');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');

  // Load poke.json (or fallback)
  let rawList = await Core.loadJSON('poke', 'data/poke.json');
  if (!rawList || rawList.length === 0) {
    rawList = await Core.loadJSON('pokemon', 'data/pokemon.json') || [];
  }

  const PAGE_SIZE = 36;
  let currentPage = 1;
  let filteredList = [...rawList];
  let searchQuery = '';
  let selectedDropFilter = 'all';

  function applyFilters() {
    filteredList = rawList.filter(p => {
      const pNo = String(p.no || p.id || '');
      const pName = (p.name || '').toLowerCase();
      const pDropsRaw = (p.drops_raw || '').toLowerCase();
      const pBiome = (p.biome_bonus || '').toLowerCase();

      // Search match
      let matchSearch = true;
      if (searchQuery) {
        matchSearch = pNo === searchQuery ||
                      pNo.padStart(3, '0').includes(searchQuery) ||
                      pName.includes(searchQuery) ||
                      pDropsRaw.includes(searchQuery) ||
                      pBiome.includes(searchQuery);
      }

      // Drop filter
      let matchDrop = true;
      const hasDrops = p.drops && p.drops.length > 0 && p.drops_raw !== '(無資料)';
      if (selectedDropFilter === 'has_drops') {
        matchDrop = hasDrops;
      } else if (selectedDropFilter === 'no_drops') {
        matchDrop = !hasDrops;
      }

      return matchSearch && matchDrop;
    });

    currentPage = 1;
    render(true);
  }

  function render(reset = false) {
    if (reset) {
      grid.innerHTML = '';
    }

    if (filteredList.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      if (countInfo) countInfo.textContent = '找不到符合條件的寶可夢';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const total = filteredList.length;
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, total);
    const visibleItems = filteredList.slice(startIndex, endIndex);

    if (countInfo) {
      countInfo.textContent = `共 ${total} 隻寶可夢，已顯示前 ${endIndex} 隻`;
    }

    visibleItems.forEach(p => {
      const card = createPokemonCard(p);
      grid.appendChild(card);
    });

    // Handle "Load More" button visibility
    if (endIndex < total) {
      if (loadMoreContainer) loadMoreContainer.style.display = 'block';
      if (btnLoadMore) {
        btnLoadMore.textContent = `載入更多寶可夢 (剩餘 ${total - endIndex} 隻)...`;
      }
    } else {
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }
  }

  function createPokemonCard(p) {
    const card = document.createElement('div');
    card.className = 'poke-card-large';

    const pNo = p.no || p.id || 0;
    const formattedNo = '#' + String(pNo).padStart(3, '0');
    
    // High-res official artwork with fallback to sprite
    const artworkUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pNo}.png`;
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pNo}.png`;

    // Drops presentation
    const drops = p.drops || [];
    let dropsHTML = '';
    if (drops.length > 0) {
      dropsHTML = drops.map(d => {
        const rate = d.chance || (d.quantity ? `數量: ${d.quantity}` : '');
        return `
          <div class="drop-tag">
            <span style="font-weight: 600; color: var(--text-main);">📦 ${escapeHTML(d.item || '')}</span>
            ${rate ? `<span class="drop-tag-chance">${escapeHTML(rate)}</span>` : ''}
          </div>
        `;
      }).join('');
    } else {
      dropsHTML = `<div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 0.5rem 0;">無特殊掉落資料</div>`;
    }

    const biomeHTML = p.biome_bonus ? `
      <div style="font-size: 0.75rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: var(--radius-sm); margin-top: 0.25rem;">
        群系加成: ${escapeHTML(p.biome_bonus)}
      </div>
    ` : '';

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
          <span style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 800; color: var(--primary-text); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-sm);">${formattedNo}</span>
          <span style="font-size: 1.15rem; font-weight: 800; color: var(--text-main);">${escapeHTML(p.name || '未命名')}</span>
        </div>

        <div class="poke-img-container">
          <img src="${artworkUrl}" alt="${escapeHTML(p.name)}" loading="lazy" onerror="this.onerror=null; this.src='${spriteUrl}'; this.onerror=()=>this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>🐾</text></svg>';">
        </div>

        ${biomeHTML}
      </div>

      <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.5rem;">
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.35rem; display: flex; align-items: center; justify-content: space-between;">
          <span>🎯 擊敗掉落物</span>
          <span style="font-size: 0.75rem; color: var(--text-light); font-weight: normal;">(${drops.length} 項)</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${dropsHTML}
        </div>
      </div>
    `;

    card.addEventListener('click', () => openModal(p));
    return card;
  }

  function openModal(p) {
    if (!modal || !modalBody) return;
    const pNo = p.no || p.id || 0;
    const formattedNo = '#' + String(pNo).padStart(3, '0');
    const artworkUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pNo}.png`;

    const drops = p.drops || [];
    const dropsDetailHTML = drops.length > 0 ? drops.map(d => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: var(--bg-page); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 0.4rem;">
        <span style="font-weight: 700;">📦 ${escapeHTML(d.item || '')}</span>
        <span style="font-weight: 700; color: var(--primary-text); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.85rem;">${escapeHTML(d.chance || (d.quantity ? '數量: ' + d.quantity : ''))}</span>
      </div>
    `).join('') : '<div style="color: var(--text-muted);">無掉落資料</div>';

    modalBody.innerHTML = `
      <div style="display: grid; grid-template-columns: 140px 1fr; gap: 1.5rem; align-items: start;">
        <div style="text-align: center;">
          <img src="${artworkUrl}" style="width: 130px; height: 130px; object-fit: contain; margin-bottom: 0.5rem;" onerror="this.onerror=null; this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pNo}.png';">
          <div style="font-family: var(--font-mono); font-weight: 800; color: var(--primary-text); font-size: 1.1rem;">${formattedNo}</div>
        </div>
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.25rem;">${escapeHTML(p.name || '')}</h2>
          ${p.biome_bonus ? `<div style="font-size: 0.88rem; color: #92400e; background: #fef3c7; padding: 4px 8px; border-radius: var(--radius-sm); display: inline-block; margin-bottom: 0.75rem;">群系加成：${escapeHTML(p.biome_bonus)}</div>` : ''}
          <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 0.5rem;">擊敗/捕獲掉落物詳情：</div>
            ${dropsDetailHTML}
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => { modal.style.display = 'none'; });
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      applyFilters();
    });
  }

  if (dropFilter) {
    dropFilter.addEventListener('change', (e) => {
      selectedDropFilter = e.target.value;
      applyFilters();
    });
  }

  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', () => {
      currentPage++;
      render(false);
    });
  }

  applyFilters();
});
