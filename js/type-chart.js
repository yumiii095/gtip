/**
 * Cobblemon Type Effectiveness Calculator & Matrix
 */

document.addEventListener('DOMContentLoaded', async () => {
  const chartData = await Core.loadJSON('type_chart', 'data/type_chart.json');
  if (!chartData || !chartData.types) return;

  const types = chartData.types;
  const matrix = chartData.matrix || {};

  const type1Select = document.getElementById('calc-type-1');
  const type2Select = document.getElementById('calc-type-2');
  const resultsContainer = document.getElementById('calc-results');
  const matrixTable = document.getElementById('matrix-table');

  // Populate Dropdowns
  types.forEach(t => {
    const opt1 = new Option(t, t);
    type1Select.add(opt1);

    const opt2 = new Option(t, t);
    type2Select.add(opt2);
  });

  // Calculate effectiveness against defending types
  function calculateDefenseEffectiveness(t1, t2) {
    const multipliers = {};
    types.forEach(atk => {
      let m1 = 1;
      let m2 = 1;

      if (matrix[atk] && matrix[atk][t1] !== undefined) {
        m1 = matrix[atk][t1];
      }
      if (t2 && matrix[atk] && matrix[atk][t2] !== undefined) {
        m2 = matrix[atk][t2];
      }

      multipliers[atk] = m1 * m2;
    });
    return multipliers;
  }

  function renderCalculator() {
    const t1 = type1Select.value;
    const t2 = type2Select.value === 'none' ? null : type2Select.value;

    const mults = calculateDefenseEffectiveness(t1, t2);

    const buckets = {
      4: [],
      2: [],
      1: [],
      0.5: [],
      0.25: [],
      0: []
    };

    Object.entries(mults).forEach(([type, factor]) => {
      if (buckets[factor]) {
        buckets[factor].push(type);
      }
    });

    resultsContainer.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
        ${renderBucketCard('4x 極度弱點 (受到4倍傷害)', buckets[4], '#fee2e2', '#991b1b')}
        ${renderBucketCard('2x 弱點 (受到2倍傷害)', buckets[2], '#fef3c7', '#92400e')}
        ${renderBucketCard('0.5x 抗性 (受到半倍傷害)', buckets[0.5], '#ecfdf5', '#065f46')}
        ${renderBucketCard('0.25x 極高抗性 (受到1/4傷害)', buckets[0.25], '#dbeafe', '#1e40af')}
        ${renderBucketCard('0x 完全免疫 (受到0倍傷害)', buckets[0], '#f1f5f9', '#475569')}
        ${renderBucketCard('1x 正常傷害', buckets[1], '#ffffff', '#334155')}
      </div>
    `;
  }

  function renderBucketCard(title, typeList, bgColor, textColor) {
    const badges = typeList.length > 0 
      ? typeList.map(t => `<span class="type-badge type-${t}" style="margin: 2px;">${t}</span>`).join(' ')
      : '<span style="color: var(--text-muted); font-size: 0.85rem;">無</span>';

    return `
      <div class="card" style="background: ${bgColor}; border-color: rgba(0,0,0,0.06); padding: 1rem;">
        <div style="font-weight: 700; font-size: 0.9rem; color: ${textColor}; margin-bottom: 0.5rem;">${title} (${typeList.length})</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">${badges}</div>
      </div>
    `;
  }

  // Render Full 18x18 Matrix
  function renderMatrix() {
    if (!matrixTable) return;
    let html = '<thead><tr><th style="background: var(--bg-subtle);">攻 \\ 防</th>';
    types.forEach(t => {
      html += `<th style="padding: 6px 4px; font-size: 0.75rem;"><span class="type-badge type-${t}">${t}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    types.forEach(atk => {
      html += `<tr><th style="padding: 6px 4px; font-size: 0.75rem;"><span class="type-badge type-${atk}">${atk}</span></th>`;
      types.forEach(def => {
        let val = 1;
        if (matrix[atk] && matrix[atk][def] !== undefined) {
          val = matrix[atk][def];
        }
        let cellText = val === 1 ? '' : (val === 0.5 ? '½' : (val === 2 ? '2' : (val === 0 ? '0' : val)));
        let cellColor = val === 2 ? '#dcfce7; color: #166534; font-weight: bold;' : (val === 0.5 ? '#fee2e2; color: #991b1b;' : (val === 0 ? '#334155; color: #fff;' : ''));
        html += `<td style="text-align: center; border: 1px solid var(--border-color); font-size: 0.8rem; background: ${cellColor}">${cellText}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    matrixTable.innerHTML = html;
  }

  type1Select.addEventListener('change', renderCalculator);
  type2Select.addEventListener('change', renderCalculator);

  renderCalculator();
  renderMatrix();
});
