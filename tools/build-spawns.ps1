# 從 Oasis Wiki 匯出的 pokemon-spawns.json 產生圖鑑用的 data/spawns.json
# 用法： powershell -ExecutionPolicy Bypass -File tools\build-spawns.ps1 [-Source <原始檔路徑>]
param(
  [string]$Source = "$env:USERPROFILE\Downloads\pokemon-spawns.json"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pokePath = Join-Path $root 'data\poke.json'
$outPath = Join-Path $root 'data\spawns.json'

# ---- 生態域譯名對照（簡體 / 英文 -> 台灣用語；英文譯名為暫定，請對照遊戲確認）----
$nameMap = @{
  '泛滥平原' = '氾濫平原'
  'Aspen Glade' = '白楊林地'
  'Jacaranda Glade' = '藍花楹林地'
  '枫树林' = '楓樹林'
  'Moor' = '高沼地'
  'Overgrown Greens' = '蔓生綠地'
  '南瓜园' = '南瓜園'
  '裸岩灌丛地' = '裸岩灌叢地'
  '极光花园' = '極光花園'
  'Glowing Grotto' = '夜光石窟'
  'Hot Springs' = '溫泉'
  'Snowblossom Grove' = '雪花林'
  '积雪的枫树林' = '積雪的楓樹林'
  'Spider Nest' = '蜘蛛巢穴'
  'Wasteland Steppe' = '荒地草原'
  'Wintry Origin Valley' = '寒冬源谷'
  'Undergrowth' = '下界灌叢'
  'End Corruption' = '終界腐化地'
  'End Reef' = '終界礁'
  'End Wilds' = '終界荒野'
}
function Fix([string]$s) {
  if ($nameMap.ContainsKey($s)) { return $nameMap[$s] }
  return $s
}
function FixPlace([string]$p) {
  if (-not $p) { return '' }
  return (($p -split '、') | ForEach-Object { Fix $_ }) -join '、'
}

# ---- 刷新條件用語譯名（英文 -> 台灣 Minecraft 用語；暫定，請對照遊戲確認）----
$phraseMap = @{
  'Trees'='樹木'; 'Concrete Blocks'='混凝土方塊'; 'Sand'='沙子'; 'Stone Bricks'='石磚'
  'Convertable To Mud'='可轉為泥巴的方塊'; 'Trail Ruins Replaceable'='古道遺跡可替換方塊'; 'Trail Ruins Blocks'='古道遺跡方塊'
  'Double Smooth Stone Slab'='平滑石雙層半磚'; 'Wool Carpets'='羊毛地毯'; 'Wool'='羊毛'
  'Desert Well'='沙漠水井'; 'Arch'='拱門'; 'Luna Henge Ruins'='月之巨石遺跡'; 'Sol Henge Ruins'='日之巨石遺跡'
  'Stonjourner Henge Ruins'='巨石丁巨石遺跡'; 'Ruins'='遺跡'; 'Ruin'='遺跡'
  'Shipwreck Coves'='沉船海灣'; 'Lush Shipwreck Cove'='繁茂沉船海灣'; 'Submerged Shipwreck Cove'='水下沉船海灣'; 'Shipwreck Cove'='沉船海灣'
  'Woodland Mansion'='林地府邸'; 'Ancient City Blocks'='古城方塊'; 'Berries'='漿果'
  'Blue Flowers'='藍色花朵'; 'Orange Flowers'='橙色花朵'; 'Pink Flowers'='粉紅色花朵'; 'Red Flowers'='紅色花朵'
  'White Flowers'='白色花朵'; 'Yellow Flowers'='黃色花朵'; 'Flowers'='花'
  'Coal Ores'='煤礦石'; 'Large Cogwheel'='大齒輪'; 'Cogwheel'='齒輪'; 'Vertical Gearbox'='垂直齒輪箱'; 'Gearbox'='齒輪箱'
  'Dead Coral'='死珊瑚'; 'Desert Pyramid Blocks'='沙漠神殿方塊'; 'Diamond Ores'='鑽石礦石'; 'End City Blocks'='終界城方塊'
  'Gemstones'='寶石'; 'Iron Ores'='鐵礦石'; 'Jungle Pyramid Blocks'='叢林神廟方塊'; 'Lava'='熔岩'; 'Leaves'='樹葉'
  'Light Grey Carpet'='淺灰色地毯'; 'Mansion Bedroom Blocks'='府邸臥室方塊'; 'Mansion Dining Blocks'='府邸餐廳方塊'; 'Mansion Blocks'='府邸方塊'
  'Master Ball'='大師球'; 'Nether Structure Blocks'='地獄建築方塊'; 'Ocean Ruin Blocks'='海底遺跡方塊'; 'Pasture'='牧場'; 'Pc'='電腦'
  'Pillager Outpost Blocks'='掠奪者前哨站方塊'; 'Redstone Blocks'='紅石塊'; 'Redstone Ores'='紅石礦石'
  'Ruined Portal Blocks'='廢棄傳送門方塊'; 'Saccharine Trees'='甜蜜樹'; 'Ocean Monument'='海底神殿'
  'Sempiternal Sanctums'='永恆聖所'; 'Water'='水'
}
$phraseKeys = @($phraseMap.Keys | Sort-Object { $_.Length } -Descending)
function FixReq([string]$q) {
  foreach ($k in $phraseKeys) {
    $q = [regex]::Replace($q, '(?<![A-Za-z])' + [regex]::Escape($k) + '(?![A-Za-z])', $phraseMap[$k])
  }
  return $q
}

$d = Get-Content $Source -Raw -Encoding UTF8 | ConvertFrom-Json
$poke = Get-Content $pokePath -Raw -Encoding UTF8 | ConvertFrom-Json

# 圖鑑中編號重複的型態：依需求略過
$dupNo = @{}
$poke | Group-Object no | Where-Object { $_.Count -gt 1 } | ForEach-Object { $dupNo[[int]$_.Name] = $true }
$pokeNo = @{}; $poke | ForEach-Object { $pokeNo[[int]$_.no] = $true }

# 生態域名稱表與清單（只收實際用到的）
$biomeNames = New-Object System.Collections.ArrayList
$biomeIdx = @{}
function BiomeIndex([string]$id) {
  if ($biomeIdx.ContainsKey($id)) { return $biomeIdx[$id] }
  $nm = Fix $d.biomes.$id.name
  [void]$biomeNames.Add($nm)
  $biomeIdx[$id] = $biomeNames.Count - 1
  return $biomeIdx[$id]
}
$sets = New-Object System.Collections.ArrayList
$setIdx = @{}
function SetIndex([int]$i) {
  if ($setIdx.ContainsKey($i)) { return $setIdx[$i] }
  $idxs = @($d.biomeSets[$i] | ForEach-Object { BiomeIndex $_ })
  [void]$sets.Add([object[]]$idxs)
  $setIdx[$i] = $sets.Count - 1
  return $setIdx[$i]
}

$allWorlds = @($d.worlds.PSObject.Properties.Name)
$spawns = [ordered]@{}
$seenNo = @{}
$skippedDup = @(); $skippedNoPoke = @(); $skippedNoNum = @(); $skippedRepeat = @()

# Wiki 沒有編號的帕魯聯動角色 -> 圖鑑自訂編號（9000 + 帕魯圖鑑編號；需與 poke.json 一致）
$palNo = @{ 'Lamball' = 9001; 'Chikipi' = 9003; 'Depresso' = 9016; 'Pengullet' = 9017; 'Direhowl' = 9033; 'Lovander' = 9069; 'Lunaris' = 9082 }
$rowStore = @{}

foreach ($sp in $d.species) {
  $variant = $null
  if (-not $sp.no) {
    if ($palNo.ContainsKey($sp.en)) { $no = $palNo[$sp.en] } else { $skippedNoNum += $sp.en; continue }
  } elseif ($sp.en -match 'Ⓛ') {
    # Wiki 內掛在 #935 底下的 Charcadet Ⓛ 是獨立新物種 -> 自訂編號 9000 + 原編號，兩筆規則合併
    $no = 9000 + [int]$sp.no
  } else {
    $no = [int]$sp.no
    if ($dupNo.ContainsKey($no)) { $skippedDup += "$no $($sp.name)"; continue }
    if ($seenNo.ContainsKey($no)) { $skippedRepeat += "$no $($sp.name)"; continue }
  }
  if (-not $pokeNo.ContainsKey($no)) { $skippedNoPoke += "$no $($sp.name)"; continue }
  $seenNo[$no] = $true

  if ($rowStore.ContainsKey($no)) { $rows = $rowStore[$no] } else { $rows = [ordered]@{}; $rowStore[$no] = $rows }
  foreach ($r in $sp.rows) {
    $w = @($r.worlds)
    $allW = ($w.Count -eq $allWorlds.Count)
    $dim = if ($r.dimension) { [string]$r.dimension } else { '主世界' }
    $q = @($r.requirements | ForEach-Object { if ($_) { FixReq ([string]$_) } })
    $key = (@($r.rarity, $r.method, $r.level, ($w -join ','), $r.biomes, (FixPlace $r.place), $dim, ($q -join '|'), $variant) -join '#')
    if (-not $rows.Contains($key)) {
      $o = [ordered]@{ r = $r.rarity; m = $r.method; l = [string]$r.level }
      if ($variant) { $o.v = $variant }
      if (-not $allW) { $o.w = [object[]]$w }
      $pl = FixPlace $r.place
      if ($pl) { $o.p = $pl }
      if ($dim -ne '主世界') { $o.d = $dim }
      if ($q.Count -gt 0 -and $q[0]) { $o.q = [object[]]$q }
      $o.s = SetIndex ([int]$r.biomes)
      $rows[$key] = $o
    }
    if ($r.group) { $rows[$key].g = 1 }
  }
  $spawns[[string]$no] = [object[]]@($rows.Values)
}

$out = [ordered]@{
  updated = $d.updated
  worlds = $d.worlds
  biomes = [object[]]$biomeNames
  sets = [object[]]$sets
  spawns = $spawns
}
$json = ConvertTo-Json -InputObject $out -Depth 10 -Compress
[IO.File]::WriteAllText($outPath, $json, (New-Object Text.UTF8Encoding($false)))

[Console]::OutputEncoding = [Text.Encoding]::UTF8
"輸出: $outPath ($([math]::Round((Get-Item $outPath).Length/1KB)) KB)"
"寫入寶可夢數: $($spawns.Count)"
"略過（圖鑑編號重複）: $($skippedDup.Count)"
"略過（圖鑑沒有此編號）: $($skippedNoPoke.Count) $($skippedNoPoke -join ', ')"
"略過（Wiki 無編號）: $($skippedNoNum.Count) $($skippedNoNum -join ', ')"
"略過（Wiki 內重複編號）: $($skippedRepeat.Count) $($skippedRepeat -join ', ')"
"生態域數: $($biomeNames.Count)  清單組數: $($sets.Count)"
