# Llama a la Management API de Supabase con el token de supabase-token.txt (no se sube a git).
# Uso: powershell -File tools\supa.ps1 GET /v1/projects
#      powershell -File tools\supa.ps1 POST /v1/projects/REF/database/query -sql archivo.sql
#      powershell -File tools\supa.ps1 PATCH /v1/projects/REF/config/auth -json archivo.json
param([Parameter(Mandatory)][string]$metodo, [Parameter(Mandatory)][string]$ruta, [string]$sql, [string]$json)
$raiz = Split-Path $PSScriptRoot -Parent
$token = [System.IO.File]::ReadAllText((Join-Path $raiz 'supabase-token.txt')).Trim()
$body = $null
if ($sql) { $body = @{ query = [System.IO.File]::ReadAllText((Resolve-Path $sql), [System.Text.Encoding]::UTF8) } | ConvertTo-Json -Compress }
if ($json) { $body = [System.IO.File]::ReadAllText((Resolve-Path $json), [System.Text.Encoding]::UTF8) }
$p = @{ Method = $metodo; Uri = "https://api.supabase.com$ruta"; Headers = @{ Authorization = "Bearer $token" } }
if ($body) { $p.ContentType = 'application/json; charset=utf-8'; $p.Body = [System.Text.Encoding]::UTF8.GetBytes($body) }
try { Invoke-RestMethod @p | ConvertTo-Json -Depth 8 } catch { Write-Output ("ERROR " + $_.Exception.Response.StatusCode.value__ + ": " + $_.ErrorDetails.Message); exit 1 }
