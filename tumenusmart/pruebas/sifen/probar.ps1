# Corre las pruebas de la factura electronica (SIFEN) SIN necesitar Node: levanta un servidor local solo de lectura, abre
# Microsoft Edge sin ventana y ejecuta todo adentro (ver pruebas\sifen\LEEME.md).
#
#   powershell -ExecutionPolicy Bypass -File pruebas\sifen\probar.ps1
#
# Necesita Edge (viene con Windows) e internet (baja Babel y, la primera vez, el validador XSD a pruebas\sifen\.cache).
# Sale con codigo 0 si pasa todo y 1 si algo falla. Tarda unos cuatro minutos: valida miles de documentos.
param([int]$Puerto = 8769, [int]$EsperaSegundos = 900)

$ErrorActionPreference = "Stop"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$banco = Join-Path $PSScriptRoot "banco"
$xsd = Join-Path $PSScriptRoot "xsd"
$cache = Join-Path $PSScriptRoot ".cache"

$edge = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "  FALLA: no encontre Microsoft Edge."; exit 1 }

# 1. El validador XSD independiente (libxml2 compilado a WebAssembly). Se baja una sola vez.
$version = "4.0.2"
New-Item -ItemType Directory -Force $cache | Out-Null
foreach ($archivo in "index-browser.mjs", "xmllint-browser.mjs", "xmllint.wasm") {
  $destino = Join-Path $cache $archivo
  if (-not (Test-Path $destino)) {
    Write-Host "  bajando $archivo de xmllint-wasm $version ..."
    Invoke-WebRequest "https://cdn.jsdelivr.net/npm/xmllint-wasm@$version/$archivo" -OutFile $destino -UseBasicParsing
  }
}

function TipoDeContenido($ruta) {
  switch ([IO.Path]::GetExtension($ruta).ToLower()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".mjs" { "text/javascript; charset=utf-8" }
    ".wasm" { "application/wasm" }
    default { "text/plain; charset=utf-8" }
  }
}

# Solo se sirve lo que las pruebas necesitan: el banco, los XSD oficiales, el validador y el codigo de src/.
function ResolverRuta($ruta) {
  if ($ruta.Contains("..")) { return $null }
  if ($ruta -eq "/" -or $ruta -eq "/index.html") { return Join-Path $banco "index.html" }
  if ($ruta.StartsWith("/banco/")) { return Join-Path $banco $ruta.Substring(7).Replace("/", "\") }
  if ($ruta.StartsWith("/xsd-test/")) { return Join-Path $xsd $ruta.Substring(10).Replace("/", "\") }
  if ($ruta.StartsWith("/xmllint/")) { return Join-Path $cache $ruta.Substring(9).Replace("/", "\") }
  if ($ruta.StartsWith("/f/src/")) { return Join-Path $raiz $ruta.Substring(3).Replace("/", "\") }
  return $null
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://localhost:$Puerto/")
$servidor.Start()

$perfil = Join-Path ([IO.Path]::GetTempPath()) ("sifen-edge-" + [guid]::NewGuid().ToString("N"))
$proceso = Start-Process $edge -ArgumentList @("--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=`"$perfil`"", "http://localhost:$Puerto/") -PassThru

$resultado = $null
$limite = (Get-Date).AddSeconds($EsperaSegundos)
try {
  Write-Host "  corriendo las pruebas en Edge (unos minutos) ..."
  while (-not $resultado -and (Get-Date) -lt $limite) {
    $tarea = $servidor.GetContextAsync()
    while (-not $tarea.Wait(500)) { if ((Get-Date) -ge $limite) { break } }
    if (-not $tarea.IsCompleted) { break }
    $c = $tarea.Result
    try {
      $ruta = $c.Request.Url.LocalPath
      if ($c.Request.HttpMethod -eq "POST" -and $ruta -eq "/resultado") {
        $lector = New-Object IO.StreamReader($c.Request.InputStream, [Text.Encoding]::UTF8)
        $resultado = $lector.ReadToEnd() | ConvertFrom-Json
      } else {
        $archivo = ResolverRuta $ruta
        if ($archivo -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
          $bytes = [IO.File]::ReadAllBytes($archivo)
          $c.Response.ContentType = TipoDeContenido $archivo
          $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
          $c.Response.StatusCode = 404
        }
      }
    } catch {
      $c.Response.StatusCode = 500
    }
    $c.Response.Close()
  }
} finally {
  $servidor.Stop()
  & taskkill /PID $proceso.Id /T /F 2>&1 | Out-Null
  Start-Sleep -Milliseconds 500
  Remove-Item -LiteralPath $perfil -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $resultado) {
  Write-Host "  FALLA: las pruebas no terminaron en $EsperaSegundos segundos."
  exit 1
}
$resultado.salida -split "`n" | ForEach-Object { Write-Host $_ }
if ([int]$resultado.fallas -gt 0) { Write-Host "`n  FALLA: $($resultado.fallas) prueba(s) con falla."; exit 1 }
Write-Host "`n  OK: $($resultado.aciertos) comprobaciones, 0 fallas."
exit 0
