/**
 * Cobblemon Exporter Engine
 * Packages all HTML, CSS, JS, updated JSON, and uploaded images into a clean ZIP ready for GitHub/Vercel.
 */

const Exporter = {
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

    // 1. Static HTML files
    const htmlFiles = [
      'index.html',
      'commands.html',
      'pokedex.html',
      'type-chart.html',
      'guides.html',
      'donate.html',
      'beginner.html',
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

    async function addFileToZip(path) {
      try {
        const res = await fetch(path + '?t=' + Date.now());
        if (res.ok) {
          const text = await res.text();
          zip.file(path, text);
        }
      } catch (err) {}
    }

    for (const file of htmlFiles) await addFileToZip(file);
    for (const file of cssFiles) await addFileToZip(file);
    for (const file of jsFiles) await addFileToZip(file);

    // 4. JSON Data
    zip.file('data/config.json', JSON.stringify(currentData.config || {}, null, 2));
    zip.file('data/announcements.json', JSON.stringify(currentData.announcements || [], null, 2));
    zip.file('data/commands.json', JSON.stringify(currentData.commands || [], null, 2));
    zip.file('data/pokemon.json', JSON.stringify(currentData.pokemon || [], null, 2));
    zip.file('data/guides.json', JSON.stringify(currentData.guides || [], null, 2));
    zip.file('data/donate.json', JSON.stringify(currentData.donate || { packages: [] }, null, 2));
    zip.file('data/beginner.json', JSON.stringify(currentData.beginner || {}, null, 2));

    try {
      const dbRes = await fetch('data/database.js?t=' + Date.now());
      if (dbRes.ok) zip.file('data/database.js', await dbRes.text());
    } catch(e) {}

    try {
      const pokeRes = await fetch('data/poke.json?t=' + Date.now());
      if (pokeRes.ok) zip.file('data/poke.json', await pokeRes.text());
    } catch(e) {}

    try {
      const spRes = await fetch('data/spawns.json?t=' + Date.now());
      if (spRes.ok) zip.file('data/spawns.json', await spRes.text());
    } catch(e) {}

    try {
      const tcRes = await fetch('data/type_chart.json?t=' + Date.now());
      if (tcRes.ok) zip.file('data/type_chart.json', await tcRes.text());
    } catch (e) {}

    try {
      const ptRes = await fetch('data/pokemon_types.json?t=' + Date.now());
      if (ptRes.ok) zip.file('data/pokemon_types.json', await ptRes.text());
    } catch(e) {}

    try {
      const vjRes = await fetch('vercel.json?t=' + Date.now());
      if (vjRes.ok) zip.file('vercel.json', await vjRes.text());
    } catch(e) {}

    // Type SVGs
    const typeIcons = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','steel','dark','fairy'];
    for (const ti of typeIcons) {
      try {
        const tiRes = await fetch('images/types/' + ti + '.svg?t=' + Date.now());
        if (tiRes.ok) zip.file('images/types/' + ti + '.svg', await tiRes.text());
      } catch(e) {}
    }

    // Hero background image
    try {
      const bgRes = await fetch('images/banners/hero-bg.jpg?t=' + Date.now());
      if (bgRes.ok) {
        const bgBlob = await bgRes.blob();
        zip.file('images/banners/hero-bg.jpg', bgBlob);
      }
    } catch(e) {}

    // Uploaded Images
    for (const [path, blob] of Object.entries(this.uploadedFiles)) {
      zip.file(path, blob);
    }

    // Trigger download
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

      Core.showToast('✅ 全站已成功打包下載！');
    } catch (err) {
      alert('打包失敗：' + err.message);
    }
  }
};

