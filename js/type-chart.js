/**
 * Cobblemon Type Calculator (Image 1 Style with SVG Icons)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const chartData = await Core.loadJSON('type_chart', 'data/type_chart.json');
  const pokeTypeMap = await Core.loadJSON('pokemon_types', 'data/pokemon_types.json') || {};
  const pokeList = await Core.loadJSON('poke', 'data/poke.json') || [];

  if (!chartData || !chartData.matrix) return;
  const matrix = chartData.matrix;

  // The 18 types in exact Image 1 order
  const typeDefinitions = [
    { name: '一般', en: 'normal' },
    { name: '火', en: 'fire' },
    { name: '水', en: 'water' },
    { name: '電', en: 'electric' },
    { name: '草', en: 'grass' },
    { name: '冰', en: 'ice' },
    { name: '格鬥', en: 'fighting' },
    { name: '毒', en: 'poison' },
    { name: '地面', en: 'ground' },
    { name: '飛行', en: 'flying' },
    { name: '超能力', en: 'psychic' },
    { name: '蟲', en: 'bug' },
    { name: '岩石', en: 'rock' },
    { name: '幽靈', en: 'ghost' },
    { name: '龍', en: 'dragon' },
    { name: '鋼', en: 'steel' },
    { name: '惡', en: 'dark' },
    { name: '妖精', en: 'fairy' }
  ];

  // State
  let defTypes = ['草']; // Default defense type
  let selectedAtk = null; // null = all, or single type string

  // Elements
  const tabByType = document.getElementById('tab-by-type');
  const tabByPokemon = document.getElementById('tab-by-pokemon');
  const modeByType = document.getElementById('mode-by-type');
  const modeByPokemon = document.getElementById('mode-by-pokemon');

  const defGrid = document.getElementById('def-types-grid');
  const atkGrid = document.getElementById('atk-types-grid');
  const defSelectionText = document.getElementById('def-selection-text');
  const btnShowAllAtk = document.getElementById('btn-show-all-atk');

  const singleAtkBanner = document.getElementById('single-atk-banner');
  const breakdownGrid = document.getElementById('multiplier-breakdown-grid');

  // Pokemon Search Elements
  const pokeSearchInput = document.getElementById('poke-search-input');
  const pokeSearchResults = document.getElementById('poke-search-results');
  const pokeSelectedCard = document.getElementById('poke-selected-card');
  const pokeSelectedImg = document.getElementById('poke-selected-img');
  const pokeSelectedName = document.getElementById('poke-selected-name');
  const pokeSelectedTypes = document.getElementById('poke-selected-types');

  // Tab switching
  tabByType.addEventListener('click', () => {
    tabByType.classList.add('active');
    tabByPokemon.classList.remove('active');
    modeByType.style.display = 'block';
    modeByPokemon.style.display = 'none';
  });

  tabByPokemon.addEventListener('click', () => {
    tabByPokemon.classList.add('active');
    tabByType.classList.remove('active');
    modeByType.style.display = 'none';
    modeByPokemon.style.display = 'block';
  });

  // Render 18 Defense Buttons
  function renderDefButtons() {
    defGrid.innerHTML = '';
    typeDefinitions.forEach(t => {
      const isSelected = defTypes.includes(t.name);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `type-btn btn-type-${t.name} ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <img src="images/types/${t.en}.svg" alt="${t.name}">
        <span>${t.name}</span>
      `;

      btn.addEventListener('click', () => {
        if (defTypes.includes(t.name)) {
          if (defTypes.length > 1) {
            defTypes = defTypes.filter(x => x !== t.name);
          }
        } else {
          if (defTypes.length >= 2) {
            defTypes.shift(); // remove oldest
          }
          defTypes.push(t.name);
        }
        updateSelectionUI();
        calculateAndRender();
      });

      defGrid.appendChild(btn);
    });
  }

  // Render 18 Attack Buttons
  function renderAtkButtons() {
    atkGrid.innerHTML = '';
    typeDefinitions.forEach(t => {
      const isSelected = selectedAtk === t.name;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `type-btn btn-type-${t.name} ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <img src="images/types/${t.en}.svg" alt="${t.name}">
        <span>${t.name}</span>
      `;

      btn.addEventListener('click', () => {
        if (selectedAtk === t.name) {
          selectedAtk = null; // deselect
        } else {
          selectedAtk = t.name;
        }
        renderAtkButtons();
        calculateAndRender();
      });

      atkGrid.appendChild(btn);
    });
  }

  function updateSelectionUI() {
    renderDefButtons();
    const badges = defTypes.map(t => {
      const defObj = typeDefinitions.find(x => x.name === t) || { en: 'normal' };
      return `<span class="type-badge type-${t}" style="font-size: 0.9rem; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px; margin: 0 3px;">
                <img src="images/types/${defObj.en}.svg" style="width: 16px; height: 16px;"> ${t}
              </span>`;
    }).join(' ＋ ');
    defSelectionText.innerHTML = badges || '尚未選擇';
  }

  if (btnShowAllAtk) {
    btnShowAllAtk.addEventListener('click', () => {
      selectedAtk = null;
      renderAtkButtons();
      calculateAndRender();
    });
  }

  // Calculate Effectiveness Multipliers
  function calculateMultipliers() {
    const t1 = defTypes[0];
    const t2 = defTypes[1] || null;

    const mults = {};
    typeDefinitions.forEach(atk => {
      let m1 = 1;
      let m2 = 1;

      if (matrix[atk.name] && matrix[atk.name][t1] !== undefined) {
        m1 = matrix[atk.name][t1];
      }
      if (t2 && matrix[atk.name] && matrix[atk.name][t2] !== undefined) {
        m2 = matrix[atk.name][t2];
      }
      mults[atk.name] = m1 * m2;
    });

    return mults;
  }

  function calculateAndRender() {
    const mults = calculateMultipliers();

    // If single attack selected, show high-impact banner
    if (selectedAtk) {
      const factor = mults[selectedAtk] !== undefined ? mults[selectedAtk] : 1;
      const atkObj = typeDefinitions.find(x => x.name === selectedAtk) || { en: 'normal' };
      let bg = '#ffffff';
      let textColor = '#1e293b';
      let label = '正常效果';

      if (factor >= 4) {
        bg = '#fee2e2'; textColor = '#991b1b'; label = '極度致命重創 (效果絕佳 × 4)';
      } else if (factor === 2) {
        bg = '#ffedd5'; textColor = '#9a3412'; label = '效果絕佳 (× 2)';
      } else if (factor === 0.5) {
        bg = '#ecfdf5'; textColor = '#065f46'; label = '效果不好 (傷害減半 ½)';
      } else if (factor <= 0.25 && factor > 0) {
        bg = '#e0f2fe'; textColor = '#0369a1'; label = '極高抗性 (傷害減免至 ¼)';
      } else if (factor === 0) {
        bg = '#334155'; textColor = '#ffffff'; label = '完全無效 (免疫 0 倍傷害)';
      }

      singleAtkBanner.style.display = 'block';
      singleAtkBanner.style.background = bg;
      singleAtkBanner.style.color = textColor;
      singleAtkBanner.style.border = `2px solid ${textColor}`;
      singleAtkBanner.innerHTML = `
        <div style="font-size: 0.95rem; margin-bottom: 0.25rem;">單一攻擊測試結果：</div>
        <div>
          攻擊方 <span class="type-badge type-${selectedAtk}"><img src="images/types/${atkObj.en}.svg" style="width: 14px; vertical-align: middle;"> ${selectedAtk}</span>
          ➜ 防禦方 <strong>${defTypes.join(' + ')}</strong>
        </div>
        <div style="font-size: 1.6rem; margin-top: 0.5rem; font-family: var(--font-mono); font-weight: 900;">
          ${factor}x 傷害 (${label})
        </div>
      `;
    } else {
      singleAtkBanner.style.display = 'none';
    }

    // Breakdown cards
    const buckets = {
      4: [],
      2: [],
      1: [],
      0.5: [],
      0.25: [],
      0: []
    };

    Object.entries(mults).forEach(([tName, factor]) => {
      if (buckets[factor]) {
        buckets[factor].push(tName);
      }
    });

    breakdownGrid.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
        ${renderBucketCard('4x 極度弱點 (受到 400% 傷害)', buckets[4], '#fee2e2', '#991b1b')}
        ${renderBucketCard('2x 弱點 (受到 200% 傷害)', buckets[2], '#ffedd5', '#9a3412')}
        ${renderBucketCard('0.5x 抗性 (受到 50% 傷害)', buckets[0.5], '#ecfdf5', '#065f46')}
        ${renderBucketCard('0.25x 極高抗性 (受到 25% 傷害)', buckets[0.25], '#e0f2fe', '#0369a1')}
        ${renderBucketCard('0x 完全免疫 (受到 0% 傷害)', buckets[0], '#334155', '#ffffff')}
        ${renderBucketCard('1x 正常傷害 (受到 100% 傷害)', buckets[1], '#ffffff', '#334155')}
      </div>
    `;
  }

  function renderBucketCard(title, list, bg, textColor) {
    const badges = list.length > 0 ? list.map(tName => {
      const defObj = typeDefinitions.find(x => x.name === tName) || { en: 'normal' };
      return `
        <span class="type-badge type-${tName}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; margin: 3px; font-size: 0.82rem;">
          <img src="images/types/${defObj.en}.svg" style="width: 14px; height: 14px;"> ${tName}
        </span>
      `;
    }).join('') : '<span style="color: var(--text-muted); font-size: 0.85rem;">無</span>';

    return `
      <div class="result-group-card" style="background: ${bg};">
        <div style="font-weight: 800; font-size: 0.95rem; color: ${textColor}; margin-bottom: 0.5rem;">
          ${title} (${list.length})
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
          ${badges}
        </div>
      </div>
    `;
  }

  // Pokemon Search Feature
  if (pokeSearchInput) {
    pokeSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      pokeSearchResults.innerHTML = '';
      if (!q) return;

      const matches = pokeList.filter(p => {
        return (p.name && p.name.toLowerCase().includes(q)) || String(p.no) === q;
      }).slice(0, 8);

      matches.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary btn-sm';
        btn.textContent = `#${p.no} ${p.name}`;
        btn.addEventListener('click', () => {
          selectPokemon(p);
        });
        pokeSearchResults.appendChild(btn);
      });
    });
  }

  function selectPokemon(p) {
    const types = pokeTypeMap[p.name] || pokeTypeMap[String(p.no)] || ['一般'];
    defTypes = [...types];
    updateSelectionUI();

    pokeSelectedCard.style.display = 'flex';
    pokeSelectedImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.no}.png`;
    pokeSelectedName.textContent = `#${p.no} ${p.name}`;
    
    pokeSelectedTypes.innerHTML = defTypes.map(t => {
      const defObj = typeDefinitions.find(x => x.name === t) || { en: 'normal' };
      return `<span class="type-badge type-${t}" style="padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">
                <img src="images/types/${defObj.en}.svg" style="width: 16px;"> ${t}
              </span>`;
    }).join('');

    calculateAndRender();
  }

  // Initial Boot
  updateSelectionUI();
  renderAtkButtons();
  calculateAndRender();
});
