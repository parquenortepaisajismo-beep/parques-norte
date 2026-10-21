# Servidor estatico minimo para probar la app localmente: http://localhost:8770/
param([int]$puerto = 8770)
$raiz = Join-Path $PSScriptRoot 'app'
$tipos = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.sql'='text/plain; charset=utf-8'; '.wasm'='application/wasm';
  '.webmanifest'='application/manifest+json' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$puerto/")
$l.Start()
Write-Output "Sirviendo $raiz en http://localhost:$puerto/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($ruta -eq '' -or $ruta.EndsWith('/')) { $ruta = $ruta + 'index.html' }
  $archivo = Join-Path $raiz $ruta
  if (Test-Path $archivo -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($archivo)
    $ext = [IO.Path]::GetExtension($archivo).ToLower()
    $ctx.Response.ContentType = $(if ($tipos[$ext]) { $tipos[$ext] } else { 'application/octet-stream' })
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}

