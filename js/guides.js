/**
 * Cobblemon Guides Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const listContainer = document.getElementById('guides-list');
  const readerContainer = document.getElementById('guide-reader');
  const emptyState = document.getElementById('guides-empty');
  const backBtn = document.getElementById('guide-back-btn');

  const guides = await Core.loadJSON('guides', 'data/guides.json') || [];

  function renderList() {
    listContainer.innerHTML = '';
    readerContainer.style.display = 'none';
    listContainer.style.display = 'grid';

    if (guides.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';

    guides.forEach((guide, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';

      const coverHTML = guide.coverImage 
        ? `<div style="height: 140px; margin: -1.5rem -1.5rem 1rem -1.5rem; overflow: hidden; border-top-left-radius: var(--radius-lg); border-top-right-radius: var(--radius-lg);">
            <img src="${guide.coverImage}" style="width: 100%; height: 100%; object-fit: cover;">
           </div>`
        : '';

      card.innerHTML = `
        ${coverHTML}
        <div style="font-size: 0.75rem; background: var(--primary-light); color: var(--primary-text); display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 700; margin-bottom: 0.5rem;">
          ${escapeHTML(guide.category || '攻略')}
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.4rem; color: var(--text-main);">${escapeHTML(guide.title || '未命名攻略')}</h3>
        <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1rem;">
          ${escapeHTML(guide.summary || '')}
        </p>
        <div style="font-size: 0.8rem; color: var(--text-light); display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
          <span>作者：${escapeHTML(guide.author || '管理員')}</span>
          <span>${escapeHTML(guide.updatedAt || '')}</span>
        </div>
      `;

      card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = 'var(--shadow-md)'; });
      card.addEventListener('mouseleave', () => { card.style.transform = 'none'; card.style.boxShadow = 'var(--shadow-sm)'; });
      card.addEventListener('click', () => openGuide(guide));

      listContainer.appendChild(card);
    });
  }

  function openGuide(guide) {
    listContainer.style.display = 'none';
    readerContainer.style.display = 'block';

    document.getElementById('reader-title').textContent = guide.title || '';
    document.getElementById('reader-meta').textContent = `${guide.category || '攻略'} · 作者: ${guide.author || '管理員'} · 更新於: ${guide.updatedAt || '近期'}`;
    
    // Render content (paragraphs, formatted breaks, image tags)
    const contentEl = document.getElementById('reader-content');
    contentEl.innerHTML = parseGuideContent(guide.content || '');
  }

  function parseGuideContent(raw) {
    if (!raw) return '<p style="color: var(--text-muted);">本攻略暫無內文。</p>';
    // Simple safe line parser supporting Markdown image syntax ![alt](url)
    const paragraphs = raw.split(/\n\n+/);
    return paragraphs.map(p => {
      // Check for image markdown: ![alt](url)
      const imgMatch = p.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        return `<div style="text-align: center; margin: 1.5rem 0;">
                  <img src="${imgMatch[2]}" alt="${escapeHTML(imgMatch[1])}" style="max-width: 100%; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.35rem;">${escapeHTML(imgMatch[1])}</div>
                </div>`;
      }
      return `<p style="margin-bottom: 1rem; line-height: 1.7; font-size: 1rem; color: var(--text-main);">${escapeHTML(p).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      readerContainer.style.display = 'none';
      listContainer.style.display = 'grid';
    });
  }

  renderList();
});
