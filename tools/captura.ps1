# Prueba la app en Chrome headless vía DevTools: navega, espera, ejecuta JS opcional y saca captura.
# Uso: .\captura.ps1 -pasos pasos.json -salida carpeta
#   pasos.json = [ { "url": "http://localhost:8770/#/inicio", "esperar": 4000, "js": "...", "foto": "inicio.png", "ancho": 412, "alto": 900 }, ... ]
param([string]$pasos, [string]$salida, [int]$puerto = 9333)
$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$perfil = Join-Path $env:TEMP 'pn-cdp'
$proc = Start-Process $chrome -ArgumentList "--headless=new","--disable-gpu","--remote-debugging-port=$puerto","--user-data-dir=$perfil","--hide-scrollbars","about:blank" -PassThru
Start-Sleep -Milliseconds 1500
$tabs = Invoke-RestMethod "http://127.0.0.1:$puerto/json"
$ws = ($tabs | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
$cli = New-Object System.Net.WebSockets.ClientWebSocket
$cli.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
$cli.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).Wait()
$script:id = 0
$script:logs = New-Object System.Collections.ArrayList

function Recibir() {
  $buf = New-Object byte[] 1048576
  $ms = New-Object System.IO.MemoryStream
  do {
    $seg = New-Object ArraySegment[byte] -ArgumentList (, $buf)
    $r = $cli.ReceiveAsync($seg, [Threading.CancellationToken]::None).Result
    $ms.Write($buf, 0, $r.Count)
  } while (-not $r.EndOfMessage)
  return [Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json
}
function Cdp($metodo, $params = @{}) {
  $script:id++
  $msg = @{ id = $script:id; method = $metodo; params = $params } | ConvertTo-Json -Depth 10 -Compress
  $b = [Text.Encoding]::UTF8.GetBytes($msg)
  $cli.SendAsync((New-Object ArraySegment[byte] -ArgumentList (, $b)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
  while ($true) {
    $m = Recibir
    if ($m.id -eq $script:id) { return $m }
    if ($m.method -eq 'Runtime.exceptionThrown') { [void]$script:logs.Add('EXC: ' + $m.params.exceptionDetails.exception.description) }
    if ($m.method -eq 'Runtime.consoleAPICalled' -and $m.params.type -eq 'error') { [void]$script:logs.Add('ERR: ' + (($m.params.args | ForEach-Object { if ($null -ne $_.value) { $_.value } else { $_.description } }) -join ' ')) }
  }
}
try {
  [void](Cdp 'Runtime.enable'); [void](Cdp 'Page.enable')
  New-Item -ItemType Directory -Force $salida | Out-Null
  foreach ($p in (Get-Content $pasos -Raw -Encoding UTF8 | ConvertFrom-Json)) {
    $ancho = if ($p.ancho) { $p.ancho } else { 412 }; $alto = if ($p.alto) { $p.alto } else { 900 }
    [void](Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $ancho; height = $alto; deviceScaleFactor = 1; mobile = ($ancho -lt 700) })
    if ($p.url) { [void](Cdp 'Page.navigate' @{ url = $p.url }) }
    if ($p.esperar) { Start-Sleep -Milliseconds $p.esperar }
    if ($p.js) {
      $r = Cdp 'Runtime.evaluate' @{ expression = $p.js; awaitPromise = $true; returnByValue = $true }
      if ($r.result.result.value) { Write-Output ("JS> " + ($r.result.result.value | ConvertTo-Json -Compress -Depth 5)) }
      if ($r.result.exceptionDetails) { Write-Output ("JS EXC> " + $r.result.exceptionDetails.exception.description) }
      if ($p.esperarJs) { Start-Sleep -Milliseconds $p.esperarJs }
    }
    if ($p.foto) {
      $completa = [bool]$p.completa
      $r = Cdp 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $completa }
      [IO.File]::WriteAllBytes((Join-Path $salida $p.foto), [Convert]::FromBase64String($r.result.data))
      Write-Output "foto: $($p.foto)"
    }
  }
  [void](Cdp 'Runtime.evaluate' @{ expression = '1' })
  $script:logs | ForEach-Object { Write-Output $_ }
} finally {
  $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
