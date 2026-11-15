# 產生 data/offline-pokedex.js：直接用 file:// 開啟 pokedex.html 時，瀏覽器不能讀取 JSON，改讀這個檔。
# 內容來自 data/poke.json 與 data/spawns.json，兩者有更新時請重新執行：
#   powershell -ExecutionPolicy Bypass -File tools\build-offline.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding($false)

$poke = [IO.File]::ReadAllText((Join-Path $root 'data\poke.json'), $utf8) | ConvertFrom-Json
$pokeMin = ConvertTo-Json -InputObject @($poke) -Depth 8 -Compress
$spawnsMin = ([IO.File]::ReadAllText((Join-Path $root 'data\spawns.json'), $utf8)).Trim()

$js = "// 由 tools/build-offline.ps1 自動產生，請勿手動編輯（file:// 離線備援用）`r`n" +
      "window.INITIAL_DATABASE = window.INITIAL_DATABASE || {};`r`n" +
      "window.INITIAL_DATABASE.poke = $pokeMin;`r`n" +
      "window.INITIAL_DATABASE.spawns = $spawnsMin;`r`n"
$out = Join-Path $root 'data\offline-pokedex.js'
[IO.File]::WriteAllText($out, $js, $utf8)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
"離線檔: $out ($([math]::Round((Get-Item $out).Length/1KB)) KB)，寶可夢 $(@($poke).Count) 筆"
