# Corre un script .mjs de pruebas/ SIN necesitar Node: lo ejecuta dentro de Microsoft Edge sin ventana.
#
# Sirve para las auditorias que solo leen archivos (auditoria-esquema, auditoria-aislamiento, auditoria-vercel-json):
# reemplaza `node:fs` por una lectura de archivos del navegador y `process.exit` por un aviso. NO sirve para los que
# listan carpetas (auditoria-permisos) ni para los que importan otros modulos.
#
#   powershell -ExecutionPolicy Bypass -File pruebas\correr-mjs.ps1 pruebas\auditoria-esquema.mjs
#
# Sale con el mismo codigo que habria dado el script.
param([Parameter(Mandatory = $true)][string]$Archivo)

$ErrorActionPreference = "Stop"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$edge = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "  FALLA: no encontre Microsoft Edge."; exit 1 }

$ruta = $Archivo.Replace("\", "/")
$base = "file:///" + $raiz.Replace("\", "/") + "/"

$plantilla = @'
<!doctype html>
<meta charset="utf-8">
<body><pre id="out">sin ejecutar</pre>
<script>
var BASE = "__BASE__";
function leer(p) {
  var x = new XMLHttpRequest();
  x.open("GET", BASE + encodeURI(p), false);
  x.overrideMimeType("text/plain; charset=utf-8");
  x.send();
  return x.responseText;
}
var lineas = [], codigo = "";
try {
  var fuente = leer("__RUTA__");
  var src = fuente.replace(/^import .*$/gm, "").replace(/^export /gm, "");
  var consola = { log: function () { lineas.push(Array.prototype.slice.call(arguments).join(" ")); } };
  var proceso = { exit: function (c) { throw { exitCode: c }; } };
  var leerArchivo = function (p) { return leer(p); };
  var existe = function (p) { try { return leer(p).length >= 0; } catch (e) { return false; } };
  try {
    new Function("console", "process", "readFileSync", "existsSync", src)(consola, proceso, leerArchivo, existe);
    codigo = "0";
  } catch (e) {
    codigo = (e && e.exitCode !== undefined) ? String(e.exitCode) : "ERROR: " + e;
  }
} catch (e) { codigo = "ERROR: " + e; }
document.getElementById("out").textContent = lineas.join("\n") + "\n@@CODIGO@@" + codigo;
</script>
'@

$tmp = Join-Path $env:TEMP "correr-mjs-tumenusmart"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pagina = Join-Path $tmp "pagina.html"
$salida = Join-Path $tmp "salida.html"
Set-Content -Path $pagina -Value $plantilla.Replace("__BASE__", $base).Replace("__RUTA__", $ruta) -Encoding UTF8

$argumentos = @(
  "--headless=new", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
  "--user-data-dir=`"$(Join-Path $tmp 'perfil')`"", "--virtual-time-budget=20000", "--dump-dom",
  ("file:///" + $pagina.Replace("\", "/"))
)
$proceso = Start-Process -FilePath $edge -ArgumentList $argumentos -RedirectStandardOutput $salida `
  -RedirectStandardError (Join-Path $tmp "error.txt") -PassThru -WindowStyle Hidden
if (-not $proceso.WaitForExit(90000)) { $proceso.Kill(); Write-Host "  FALLA: Edge tardo demasiado."; exit 1 }

$dom = Get-Content $salida -Raw -Encoding UTF8
if ($dom -notmatch '(?s)<pre id="out">(.*?)</pre>') { Write-Host "  FALLA: no pude leer la salida de Edge."; exit 1 }
$texto = [System.Net.WebUtility]::HtmlDecode($Matches[1])
$partes = $texto -split "@@CODIGO@@"
Write-Host $partes[0].TrimEnd()
$codigo = $partes[1].Trim()
if ($codigo -match '^\d+$') { exit [int]$codigo }
Write-Host "  $codigo"
exit 1
