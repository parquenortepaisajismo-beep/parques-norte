# Arma el JSON {query: <contenido del .sql>} en UTF-8 sin BOM para la Management API.
param([string]$sql, [string]$salida)
$q = [IO.File]::ReadAllText((Resolve-Path $sql), [Text.Encoding]::UTF8)
$j = @{ query = $q } | ConvertTo-Json -Compress
[IO.File]::WriteAllText($salida, $j, (New-Object Text.UTF8Encoding $false))
