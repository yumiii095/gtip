# Local static server for the wiki (no install needed, uses built-in .NET HttpListener).
# Usage: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8080] [-Open admin.html]
param([int]$Port = 8080, [string]$Open = 'admin.html')

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'
  '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.webp'='image/webp'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'
  '.woff2'='font/woff2'; '.woff'='font/woff'
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "Cannot start on port $Port (already in use?). Try: -Port 8081" -ForegroundColor Red
  exit 1
}

Write-Host "Server running: $prefix" -ForegroundColor Green
Write-Host "Folder: $root"
Write-Host "Close this window to stop the server."
if ($Open) { Start-Process ($prefix + $Open) }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($p -eq '/') { $p = '/index.html' }
    $f = [IO.Path]::GetFullPath((Join-Path $root $p.TrimStart('/').Replace('/', '\')))
    if (-not $f.StartsWith($root)) { $res.StatusCode = 403 }
    else {
      if (-not (Test-Path $f -PathType Leaf) -and (Test-Path ($f + '.html') -PathType Leaf)) { $f += '.html' }
      if (Test-Path $f -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($f).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $bytes = [IO.File]::ReadAllBytes($f)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    }
  } catch { $res.StatusCode = 500 }
  finally { $res.Close() }
}
