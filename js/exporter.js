/**
 * Cobblemon Exporter Engine
 * Packages all HTML, CSS, JS, updated JSON, and uploaded images into a clean ZIP ready for GitHub.
 */

const Exporter = {
  // Store uploaded image blobs in memory: { "images/pokemon/001.png": blob, ... }
  uploadedFiles: {},

  registerUploadedImage(relativePath, fileBlob) {
    this.uploadedFiles[relativePath] = fileBlob;
  },

  async exportZip(currentData) {
    if (typeof JSZip === 'undefined') {
      alert('JSZip 尚未載入，請確認 js/lib/jszip.min.js 存在。');
      return;
    }

    Core.showToast('正在封裝全站檔案，請稍候...');

    const zip = new JSZip();

    // 1. Static HTML files to fetch & bundle
    const htmlFiles = [
      'index.html',
      'commands.html',
      'pokedex.html',
      'type-chart.html',
      'guides.html',
      'donate.html',
      'admin.html'
    ];

    // 2. CSS files
    const cssFiles = [
      'css/main.css',
      'css/admin.css'
    ];

    // 3. JS files
    const jsFiles = [
      'js/core.js',
      'js/commands.js',
      'js/pokedex.js',
      'js/type-chart.js',
      'js/guides.js',
      'js/donate.js',
      'js/admin.js',
      'js/exporter.js',
      'js/lib/jszip.min.js'
    ];

    // Helper to fetch file content
    async function addFileToZip(path) {
      try {
        const res = await fetch(path + '?t=' + Date.now());
        if (res.ok) {
          const text = await res.text();
          zip.file(path, text);
        } else {
          console.warn(`Could not bundle ${path}: HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn(`Error bundling ${path}:`, err);
      }
    }

    // Add HTML, CSS, JS
    for (const file of htmlFiles) await addFileToZip(file);
    for (const file of cssFiles) await addFileToZip(file);
    for (const file of jsFiles) await addFileToZip(file);

    // 4. Add updated JSON data
    zip.file('data/config.json', JSON.stringify(currentData.config || {}, null, 2));
    zip.file('data/commands.json', JSON.stringify(currentData.commands || [], null, 2));
    zip.file('data/pokemon.json', JSON.stringify(currentData.pokemon || [], null, 2));
    try {
      const pokeRes = await fetch('data/poke.json?t=' + Date.now());
      if (pokeRes.ok) zip.file('data/poke.json', await pokeRes.text());
    } catch(e) { console.warn('Could not bundle poke.json', e); }
    zip.file('data/guides.json', JSON.stringify(currentData.guides || [], null, 2));
    zip.file('data/donate.json', JSON.stringify(currentData.donate || { packages: [] }, null, 2));

    // Also include type_chart.json
    try {
      const tcRes = await fetch('data/type_chart.json?t=' + Date.now());
      if (tcRes.ok) zip.file('data/type_chart.json', await tcRes.text());
    } catch (e) { console.warn('Could not bundle type_chart.json', e); }

    try {
      const ptRes = await fetch('data/pokemon_types.json?t=' + Date.now());
      if (ptRes.ok) zip.file('data/pokemon_types.json', await ptRes.text());
    } catch(e) {}

    try {
      const vjRes = await fetch('vercel.json?t=' + Date.now());
      if (vjRes.ok) zip.file('vercel.json', await vjRes.text());
    } catch(e) {}

    const typeIcons = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','steel','dark','fairy'];
    for (const ti of typeIcons) {
      try {
        const tiRes = await fetch('images/types/' + ti + '.svg?t=' + Date.now());
        if (tiRes.ok) zip.file('images/types/' + ti + '.svg', await tiRes.text());
      } catch(e) {}
    }
    if (false) {
        zip.file('data/type_chart.json', await tcRes.text());
      }
    } catch (e) {
      console.warn('Could not bundle type_chart.json', e);
    }

    // 5. Add all uploaded image files
    for (const [path, blob] of Object.entries(this.uploadedFiles)) {
      zip.file(path, blob);
    }

    // Generate zip and trigger download
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `cobblemon-wiki-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      Core.showToast('✅ 全站已成功打包下載！解壓後即可上傳 GitHub');
    } catch (err) {
      console.error('ZIP generation error:', err);
      alert('打包失敗：' + err.message);
    }
  }
};


