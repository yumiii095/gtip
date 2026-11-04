/**
 * Cobblemon Donate View Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('donate-packages');
  const disclaimerEl = document.getElementById('donate-disclaimer');
  const contactEl = document.getElementById('donate-contact');
  const emptyState = document.getElementById('donate-empty');

  const donateData = await Core.loadJSON('donate', 'data/donate.json') || { packages: [] };

  if (disclaimerEl && donateData.disclaimer) {
    disclaimerEl.textContent = donateData.disclaimer;
  }
  if (contactEl && donateData.contactNote) {
    contactEl.textContent = donateData.contactNote;
  }

  const packages = donateData.packages || [];

  if (packages.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = '';
  packages.forEach(pkg => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.justifyContent = 'space-between';
    card.style.position = 'relative';

    const perksHTML = (pkg.perks || []).map(p => `
      <li style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.9rem;">
        <span style="color: var(--primary); font-weight: bold;">✓</span>
        <span>${escapeHTML(p)}</span>
      </li>
    `).join('');

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main);">${escapeHTML(pkg.name || '方案')}</h3>
          ${pkg.badge ? `<span style="background: #fef3c7; color: #92400e; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-sm);">${escapeHTML(pkg.badge)}</span>` : ''}
        </div>
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary-text); margin: 0.75rem 0;">
          ${escapeHTML(pkg.price || 'NT$ 0')}
        </div>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">${escapeHTML(pkg.description || '')}</p>
        <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem;">包含特權：</div>
          <ul style="list-style: none; padding: 0;">${perksHTML}</ul>
        </div>
      </div>
      <div style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <button class="btn btn-primary" style="width: 100%;" onclick="Core.showToast('請至 Discord 開單回報此方案')">
          前往支持
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }
});
