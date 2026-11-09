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
    if (!raw) return '<p style="color: var(--text-muted);">本攻略暫無內文說明。</p>';

    // If content is already rich HTML (from visual Word editor), display directly
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return raw;
    }

    // Otherwise split legacy structural blocks by double linebreaks
    const blocks = raw.split(/\n\n+/);
    return blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';

      // Horizontal Rule: --- or *** or ___
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        return '<hr style="margin: 1.75rem 0; border: none; border-top: 2px dashed var(--border-color);">';
      }

      // Check for image markdown: ![alt](url)
      const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        return `<div style="text-align: center; margin: 1.75rem 0;">
                  <img src="${imgMatch[2]}" alt="${escapeAttr(imgMatch[1])}" style="max-width: 100%; border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
                  <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.45rem;">${escapeHTML(imgMatch[1])}</div>
                </div>`;
      }

      // Heading 2: ## Heading
      if (trimmed.startsWith('## ')) {
        return `<h2 style="font-size: 1.45rem; font-weight: 800; color: var(--text-main); margin: 1.75rem 0 0.75rem; border-bottom: 2px solid var(--primary-light); padding-bottom: 0.4rem;">${formatInline(trimmed.slice(3))}</h2>`;
      }

      // Heading 3: ### Heading
      if (trimmed.startsWith('### ')) {
        return `<h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin: 1.25rem 0 0.5rem;">${formatInline(trimmed.slice(4))}</h3>`;
      }

      // List: multiple lines starting with -
      const lines = trimmed.split('\n');
      if (lines.length > 0 && lines.every(l => l.trim().startsWith('- '))) {
        const listItems = lines.map(l => `<li style="margin-bottom: 0.35rem;">${formatInline(l.trim().slice(2))}</li>`).join('');
        return `<ul style="margin: 0.75rem 0 1rem 1.75rem; line-height: 1.8; color: var(--text-main);">${listItems}</ul>`;
      }

      // Ordered List: multiple lines starting with 1. 2. etc.
      if (lines.length > 0 && lines.every(l => /^\d+\.\s/.test(l.trim()))) {
        const listItems = lines.map(l => `<li style="margin-bottom: 0.35rem;">${formatInline(l.trim().replace(/^\d+\.\s*/, ''))}</li>`).join('');
        return `<ol style="margin: 0.75rem 0 1rem 1.75rem; line-height: 1.8; color: var(--text-main);">${listItems}</ol>`;
      }

      // Regular paragraph (retains inline breaks)
      return `<p style="margin-bottom: 1.15rem; line-height: 1.8; font-size: 1.02rem; color: var(--text-main);">${formatInline(trimmed).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function formatInline(str) {
    if (!str) return '';
    let res = str;
    // Markdown bold: **text**
    res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Markdown italic: *text*
    res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Markdown strikethrough: ~~text~~
    res = res.replace(/~~(.*?)~~/g, '<del>$1</del>');
    return res;
  }

  function escapeAttr(str) {
    return String(str || '').replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
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
