/**
 * Cobblemon Type Calculator & Matrix Table
 * Supports Dual-Type Attacker with Best Coverage & STAB Bonus
 */

const BUILTIN_TYPE_MATRIX = {
  "一般":   {"岩石": 0.5, "幽靈": 0, "鋼": 0.5},
  "格鬥":   {"一般": 2, "飛行": 0.5, "毒": 0.5, "岩石": 2, "蟲": 0.5, "幽靈": 0, "鋼": 2, "超能力": 0.5, "冰": 2, "惡": 2, "妖精": 0.5},
  "飛行":   {"格鬥": 2, "岩石": 0.5, "蟲": 2, "鋼": 0.5, "草": 2, "電": 0.5},
  "毒":     {"毒": 0.5, "地面": 0.5, "岩石": 0.5, "幽靈": 0.5, "鋼": 0, "草": 2, "妖精": 2},
  "地面":   {"飛行": 0, "毒": 2, "岩石": 2, "鋼": 2, "火": 2, "草": 0.5, "電": 2, "蟲": 0.5},
  "岩石":   {"格鬥": 0.5, "飛行": 2, "地面": 0.5, "蟲": 2, "鋼": 0.5, "火": 2, "冰": 2},
  "蟲":     {"格鬥": 0.5, "飛行": 0.5, "毒": 0.5, "幽靈": 0.5, "鋼": 0.5, "火": 0.5, "草": 2, "超能力": 2, "惡": 2, "妖精": 0.5},
  "幽靈":   {"一般": 0, "幽靈": 2, "超能力": 2, "惡": 0.5},
  "鋼":     {"岩石": 2, "鋼": 0.5, "火": 0.5, "水": 0.5, "電": 0.5, "冰": 2, "妖精": 2},
  "火":     {"岩石": 0.5, "蟲": 2, "鋼": 2, "火": 0.5, "水": 0.5, "草": 2, "冰": 2, "龍": 0.5},
  "水":     {"地面": 2, "岩石": 2, "火": 2, "水": 0.5, "草": 0.5, "龍": 0.5},
  "草":     {"飛行": 0.5, "毒": 0.5, "地面": 2, "岩石": 2, "蟲": 0.5, "鋼": 0.5, "火": 0.5, "水": 2, "草": 0.5, "龍": 0.5},
  "電":     {"飛行": 2, "地面": 0, "水": 2, "草": 0.5, "電": 0.5, "龍": 0.5},
  "超能力": {"格鬥": 2, "毒": 2, "鋼": 0.5, "超能力": 0.5, "惡": 0},
  "冰":     {"飛行": 2, "地面": 2, "鋼": 0.5, "火": 0.5, "水": 0.5, "草": 2, "冰": 0.5, "龍": 2},
  "龍":     {"鋼": 0.5, "龍": 2, "妖精": 0},
  "惡":     {"格鬥": 0.5, "幽靈": 2, "超能力": 2, "惡": 0.5, "妖精": 0.5},
  "妖精":   {"格鬥": 2, "毒": 0.5, "鋼": 0.5, "火": 0.5, "龍": 2, "惡": 2}
};

const TYPE_DEFINITIONS = [
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

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabByType = document.getElementById('tab-by-type');
  const tabByPokemon = document.getElementById('tab-by-pokemon');
  const modeByType = document.getElementById('mode-by-type');
  const modeByPokemon = document.getElementById('mode-by-pokemon');

  const defGrid = document.getElementById('def-types-grid');
  const atkGrid = document.getElementById('atk-types-grid');
  const defChipsBar = document.getElementById('def-chips-bar');
  const atkChipsBar = document.getElementById('atk-chips-bar');

  const btnResetDef = document.getElementById('btn-reset-def');
  const btnShowAllAtk = document.getElementById('btn-show-all-atk');
  const chkStab = document.getElementById('chk-stab');

  const matchupContainer = document.getElementById('matchup-report-container');
  const breakdownGrid = document.getElementById('multiplier-breakdown-grid');
  const matrixTable = document.getElementById('matrix-table');

  // Pokemon Search Elements
  const pokeDefInput = document.getElementById('poke-def-input');
  const pokeDefResults = document.getElementById('poke-def-results');
  const pokeDefPreview = document.getElementById('poke-def-preview');
  const pokeDefImg = document.getElementById('poke-def-img');
  const pokeDefName = document.getElementById('poke-def-name');
  const pokeDefTypes = document.getElementById('poke-def-types');

  const pokeAtkInput = document.getElementById('poke-atk-input');
  const pokeAtkResults = document.getElementById('poke-atk-results');
  const pokeAtkPreview = document.getElementById('poke-atk-preview');
  const pokeAtkImg = document.getElementById('poke-atk-img');
  const pokeAtkName = document.getElementById('poke-atk-name');
  const pokeAtkTypes = document.getElementById('poke-atk-types');

  // State
  let defTypes = ['草'];
  let atkTypes = ['火', '飛行']; // default dual-type attacker
  let useStab = chkStab ? chkStab.checked : true;

  let matrix = BUILTIN_TYPE_MATRIX;
  let pokeTypeMap = {};
  let pokeList = [];

  try {
    const fetchedChart = await Core.loadJSON('type_chart', 'data/type_chart.json');
    if (fetchedChart && fetchedChart.matrix) matrix = fetchedChart.matrix;
  } catch(e) {}

  try {
    pokeTypeMap = await Core.loadJSON('pokemon_types', 'data/pokemon_types.json') || {};
    pokeList = await Core.loadJSON('poke', 'data/poke.json') || [];
  } catch(e) {}

  // Tab switching
  if (tabByType && tabByPokemon) {
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
  }

  if (chkStab) {
    chkStab.addEventListener('change', (e) => {
      useStab = e.target.checked;
      calculateAndRender();
    });
  }

  // Render Defense Buttons
  function renderDefButtons() {
    if (!defGrid) return;
    defGrid.innerHTML = '';
    TYPE_DEFINITIONS.forEach(t => {
      const isSelected = defTypes.includes(t.name);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `type-btn btn-type-${t.name} ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <img src="images/types/${t.en}.svg" alt="${t.name}" onerror="this.style.display='none'">
        <span>${t.name}</span>
      `;

      btn.addEventListener('click', () => {
        if (defTypes.includes(t.name)) {
          if (defTypes.length > 1) {
            defTypes = defTypes.filter(x => x !== t.name);
          }
        } else {
          if (defTypes.length >= 2) {
            defTypes.shift();
          }
          defTypes.push(t.name);
        }
        updateDefUI();
        calculateAndRender();
      });

      defGrid.appendChild(btn);
    });
  }

  // Render Attack Buttons
  function renderAtkButtons() {
    if (!atkGrid) return;
    atkGrid.innerHTML = '';
    TYPE_DEFINITIONS.forEach(t => {
      const isSelected = atkTypes.includes(t.name);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `type-btn btn-type-${t.name} ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <img src="images/types/${t.en}.svg" alt="${t.name}" onerror="this.style.display='none'">
        <span>${t.name}</span>
      `;

      btn.addEventListener('click', () => {
        if (atkTypes.includes(t.name)) {
          atkTypes = atkTypes.filter(x => x !== t.name);
        } else {
          if (atkTypes.length >= 2) {
            atkTypes.shift();
          }
          atkTypes.push(t.name);
        }
        updateAtkUI();
        calculateAndRender();
      });

      atkGrid.appendChild(btn);
    });
  }

  function updateDefUI() {
    renderDefButtons();
    if (defChipsBar) {
      if (defTypes.length === 0) {
        defChipsBar.innerHTML = '<span style="color: var(--text-muted); font-size: 0.88rem;">請在下方點選 1 或 2 個防禦屬性</span>';
      } else {
        defChipsBar.innerHTML = '<span style="font-size: 0.88rem; font-weight: 700; color: var(--text-muted);">已選防禦：</span>' +
          defTypes.map(t => {
            const defObj = TYPE_DEFINITIONS.find(x => x.name === t) || { en: 'normal' };
            return `
              <div class="chip btn-type-${t}">
                <img src="images/types/${defObj.en}.svg" style="width: 16px; height: 16px;" onerror="this.style.display='none'">
                <span>${t}</span>
                <span class="chip-remove" onclick="removeDefType('${t}')">✕</span>
              </div>
            `;
          }).join('');
      }
    }
  }

  function updateAtkUI() {
    renderAtkButtons();
    if (atkChipsBar) {
      if (atkTypes.length === 0) {
        atkChipsBar.innerHTML = '<span style="color: var(--text-muted); font-size: 0.88rem;">（目前顯示全屬性一覽，可點選 1 或 2 個進攻屬性啟用雙屬性 PK 分析）</span>';
      } else {
        atkChipsBar.innerHTML = '<span style="font-size: 0.88rem; font-weight: 700; color: var(--text-muted);">已選進攻：</span>' +
          atkTypes.map(t => {
            const defObj = TYPE_DEFINITIONS.find(x => x.name === t) || { en: 'normal' };
            return `
              <div class="chip btn-type-${t}">
                <img src="images/types/${defObj.en}.svg" style="width: 16px; height: 16px;" onerror="this.style.display='none'">
                <span>${t}</span>
                <span class="chip-remove" onclick="removeAtkType('${t}')">✕</span>
              </div>
            `;
          }).join('');
      }
    }
  }

  window.removeDefType = function(t) {
    if (defTypes.length > 1) {
      defTypes = defTypes.filter(x => x !== t);
      updateDefUI();
      calculateAndRender();
    }
  };

  window.removeAtkType = function(t) {
    atkTypes = atkTypes.filter(x => x !== t);
    updateAtkUI();
    calculateAndRender();
  };

  if (btnResetDef) {
    btnResetDef.addEventListener('click', () => {
      defTypes = ['一般'];
      updateDefUI();
      calculateAndRender();
    });
  }

  if (btnShowAllAtk) {
    btnShowAllAtk.addEventListener('click', () => {
      atkTypes = [];
      updateAtkUI();
      calculateAndRender();
    });
  }

  // Calculate effectiveness factor for one attack type against current defTypes
  function getFactor(atkName) {
    const t1 = defTypes[0];
    const t2 = defTypes[1] || null;
    let m1 = 1;
    let m2 = 1;

    if (matrix[atkName] && matrix[atkName][t1] !== undefined) {
      m1 = matrix[atkName][t1];
    }
    if (t2 && matrix[atkName] && matrix[atkName][t2] !== undefined) {
      m2 = matrix[atkName][t2];
    }
    return m1 * m2;
  }

  function calculateAndRender() {
    renderMatchupReport();
    renderBreakdownGrid();
  }

  // Render Dual-Type Attacker Analysis Report
  function renderMatchupReport() {
    if (!matchupContainer) return;

    if (atkTypes.length === 0) {
      matchupContainer.innerHTML = '';
      return;
    }

    const stabMult = useStab ? 1.5 : 1;
    const defBadges = defTypes.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ＋ ');

    if (atkTypes.length === 1) {
      const atk = atkTypes[0];
      const base = getFactor(atk);
      const total = base * stabMult;
      const { text, bg, color } = getImpactVerdict(total);

      matchupContainer.innerHTML = `
        <div class="matchup-report-card" style="border-left: 6px solid ${color};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 700;">單一屬性進攻對局：</div>
              <div style="font-size: 1.15rem; font-weight: 800; margin: 0.35rem 0;">
                攻擊方 <span class="type-badge type-${atk}">${atk}</span> ➜ 防禦方 ${defBadges}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 1.8rem; font-weight: 900; font-family: var(--font-mono); color: ${color};">
                ${formatNumber(total)}x
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">
                ${useStab ? `(基礎 ${base}x × 本系 1.5x)` : '基礎倍率'}
              </div>
            </div>
          </div>
          <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-color); font-weight: 700; color: ${color};">
            💡 戰術判定：${text}
          </div>
        </div>
      `;
      return;
    }

    // Dual-Type Attacker! (atkTypes.length === 2)
    const [atkA, atkB] = atkTypes;
    const baseA = getFactor(atkA);
    const totalA = baseA * stabMult;

    const baseB = getFactor(atkB);
    const totalB = baseB * stabMult;

    let bestChoice = null;
    let verdictText = '';

    if (totalA > totalB) {
      bestChoice = atkA;
      verdictText = `👑 推薦優先使用【${atkA}】屬性招式！傷害高出 ${formatNumber(totalA - totalB)} 倍。`;
    } else if (totalB > totalA) {
      bestChoice = atkB;
      verdictText = `👑 推薦優先使用【${atkB}】屬性招式！傷害高出 ${formatNumber(totalB - totalA)} 倍。`;
    } else {
      bestChoice = 'both';
      verdictText = `⚖️ 兩屬性威力相同（皆為 ${formatNumber(totalA)}x），可依技能威力或附加效果自由選擇！`;
    }

    const cardA = renderSubAttackCard(atkA, baseA, totalA, bestChoice === atkA || bestChoice === 'both');
    const cardB = renderSubAttackCard(atkB, baseB, totalB, bestChoice === atkB || bestChoice === 'both');

    matchupContainer.innerHTML = `
      <div class="matchup-report-card" style="border: 2px solid #0284c7; background: #f0f9ff;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
          <div style="font-size: 1.1rem; font-weight: 800; color: #0369a1;">
            ⚔️ 雙屬性打擊覆蓋 PK 分析
          </div>
          <div style="font-size: 0.85rem; color: #075985;">
            防禦方組合：${defBadges}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
          ${cardA}
          ${cardB}
        </div>

        <div style="background: #ffffff; border: 1px solid #bae6fd; border-radius: var(--radius-md); padding: 0.85rem 1rem; font-weight: 800; color: #0c4a6e; font-size: 0.95rem;">
          ${verdictText}
          ${(totalA < 1 && totalB < 1) ? '<div style="color: #b91c1c; font-size: 0.82rem; margin-top: 4px;">⚠️ 警告：雙屬性皆被對手抵抗！建議換手或使用其他補盲技能。</div>' : ''}
        </div>
      </div>
    `;
  }

  function renderSubAttackCard(atk, base, total, isRecommended) {
    const { text, color } = getImpactVerdict(total);
    const badgeBorder = isRecommended ? 'border: 2px solid #eab308; background: #fffbeb;' : 'background: #ffffff; border: 1px solid var(--border-color);';

    return `
      <div style="border-radius: var(--radius-md); padding: 1rem; ${badgeBorder} position: relative;">
        ${isRecommended ? '<span style="position: absolute; top: 6px; right: 8px; font-size: 0.75rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-weight: 800;">推薦主攻</span>' : ''}
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 0.5rem;">
          <span class="type-badge type-${atk}" style="font-size: 0.88rem; padding: 3px 8px;">${atk} 系招式</span>
        </div>
        <div style="font-size: 1.75rem; font-weight: 900; font-family: var(--font-mono); color: ${color};">
          ${formatNumber(total)}x
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          ${useStab ? `(基礎 ${base}x × STAB 1.5x)` : '基礎倍率'}
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: ${color}; margin-top: 0.5rem;">
          ${text}
        </div>
      </div>
    `;
  }

  function getImpactVerdict(factor) {
    if (factor >= 4) return { text: '極度致命重創（雙重效果絕佳）', bg: '#fee2e2', color: '#991b1b' };
    if (factor >= 2) return { text: '效果絕佳（剋制打擊）', bg: '#ffedd5', color: '#c2410c' };
    if (factor === 1) return { text: '普通傷害（無額外效果）', bg: '#ffffff', color: '#334155' };
    if (factor === 0.5) return { text: '效果不好（傷害減半）', bg: '#ecfdf5', color: '#047857' };
    if (factor > 0 && factor < 0.5) return { text: '極高抗性（傷害大幅減免）', bg: '#e0f2fe', color: '#0369a1' };
    return { text: '完全免疫（造成 0 點傷害）', bg: '#334155', color: '#475569' };
  }

  function formatNumber(num) {
    return Number(num.toFixed(2)).toString();
  }

  // Render Full Breakdown Grid for Defending Types
  function renderBreakdownGrid() {
    if (!breakdownGrid) return;
    const mults = {};
    TYPE_DEFINITIONS.forEach(atk => {
      mults[atk.name] = getFactor(atk.name);
    });

    const buckets = { 4: [], 2: [], 1: [], 0.5: [], 0.25: [], 0: [] };
    Object.entries(mults).forEach(([tName, factor]) => {
      if (buckets[factor]) buckets[factor].push(tName);
    });

    breakdownGrid.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
        ${renderBucketCard('4x 極度弱點 (受傷 400%)', buckets[4], '#fee2e2', '#991b1b')}
        ${renderBucketCard('2x 弱點 (受傷 200%)', buckets[2], '#ffedd5', '#9a3412')}
        ${renderBucketCard('0.5x 抗性 (受傷 50%)', buckets[0.5], '#ecfdf5', '#065f46')}
        ${renderBucketCard('0.25x 極高抗性 (受傷 25%)', buckets[0.25], '#e0f2fe', '#0369a1')}
        ${renderBucketCard('0x 完全免疫 (受傷 0%)', buckets[0], '#334155', '#ffffff')}
        ${renderBucketCard('1x 正常傷害 (受傷 100%)', buckets[1], '#ffffff', '#334155')}
      </div>
    `;
  }

  function renderBucketCard(title, list, bg, textColor) {
    const badges = list.length > 0 ? list.map(tName => {
      const defObj = TYPE_DEFINITIONS.find(x => x.name === tName) || { en: 'normal' };
      return `
        <span class="type-badge type-${tName}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; margin: 3px; font-size: 0.82rem;">
          <img src="images/types/${defObj.en}.svg" style="width: 14px; height: 14px;" onerror="this.style.display='none'"> ${tName}
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

  // Render Full 18x18 Comparison Matrix Table
  function renderMatrixTable() {
    if (!matrixTable) return;
    const types = TYPE_DEFINITIONS.map(x => x.name);

    let html = '<thead><tr><th style="background: var(--bg-subtle); padding: 8px 6px; border: 1px solid var(--border-color); font-size: 0.8rem;">攻 \\ 防</th>';
    types.forEach(t => {
      html += `<th style="padding: 6px 3px; border: 1px solid var(--border-color); font-size: 0.72rem; text-align: center;">
                 <span class="type-badge type-${t}" style="padding: 2px 4px; font-size: 0.7rem; white-space: nowrap;">${t}</span>
               </th>`;
    });
    html += '</tr></thead><tbody>';

    types.forEach(atk => {
      html += `<tr><th style="padding: 6px 4px; border: 1px solid var(--border-color); font-size: 0.75rem; text-align: center; white-space: nowrap;">
                 <span class="type-badge type-${atk}" style="padding: 2px 6px; font-size: 0.72rem;">${atk}</span>
               </th>`;
      types.forEach(def => {
        let val = 1;
        if (matrix[atk] && matrix[atk][def] !== undefined) {
          val = matrix[atk][def];
        }
        let cellText = val === 1 ? '' : (val === 0.5 ? '½' : (val === 2 ? '2' : (val === 0 ? '0' : val)));
        let cellStyle = 'text-align: center; border: 1px solid var(--border-color); font-size: 0.85rem; padding: 4px 2px;';
        if (val === 2) {
          cellStyle += 'background: #dcfce7; color: #166534; font-weight: bold;';
        } else if (val === 0.5) {
          cellStyle += 'background: #fee2e2; color: #991b1b; font-weight: bold;';
        } else if (val === 0) {
          cellStyle += 'background: #334155; color: #ffffff; font-weight: bold;';
        }
        html += `<td style="${cellStyle}">${cellText}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    matrixTable.innerHTML = html;
  }

  // Pokemon Search Feature for Defending Pokemon
  if (pokeDefInput && pokeDefResults) {
    pokeDefInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      pokeDefResults.innerHTML = '';
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
          const types = pokeTypeMap[p.name] || pokeTypeMap[String(p.no)] || ['一般'];
          defTypes = [...types];
          updateDefUI();

          if (pokeDefPreview) {
            pokeDefPreview.style.display = 'flex';
            pokeDefImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.no}.png`;
            pokeDefName.textContent = `#${p.no} ${p.name}`;
            pokeDefTypes.innerHTML = defTypes.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ');
          }
          calculateAndRender();
        });
        pokeDefResults.appendChild(btn);
      });
    });
  }

  // Pokemon Search Feature for Attacking Pokemon
  if (pokeAtkInput && pokeAtkResults) {
    pokeAtkInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      pokeAtkResults.innerHTML = '';
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
          const types = pokeTypeMap[p.name] || pokeTypeMap[String(p.no)] || ['一般'];
          atkTypes = [...types];
          updateAtkUI();

          if (pokeAtkPreview) {
            pokeAtkPreview.style.display = 'flex';
            pokeAtkImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.no}.png`;
            pokeAtkName.textContent = `#${p.no} ${p.name}`;
            pokeAtkTypes.innerHTML = atkTypes.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ');
          }
          calculateAndRender();
        });
        pokeAtkResults.appendChild(btn);
      });
    });
  }

  // Initial Boot
  updateDefUI();
  updateAtkUI();
  calculateAndRender();
  renderMatrixTable();
});
