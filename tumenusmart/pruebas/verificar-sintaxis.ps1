# Revisa la SINTAXIS de todo src/ (.ts y .tsx) sin necesitar Node.
#
# Usa el analizador de Babel dentro de Microsoft Edge sin ventana. Encuentra justo lo que rompe un deploy en Vercel
# y no se ve a ojo: un const repetido, una llave de mas, una etiqueta JSX sin cerrar, un import mal escrito.
# NO revisa tipos (eso lo hace `next build`): un campo mal escrito de Prisma o un tipo que no coincide pasan este control.
#
# Necesita Microsoft Edge (viene con Windows) e internet (baja Babel de unpkg.com).
#
#   powershell -ExecutionPolicy Bypass -File pruebas\verificar-sintaxis.ps1
#
# Sale con codigo 0 si todo pasa y 1 si algo falla.

$ErrorActionPreference = "Stop"

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$edge = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Host "  FALLA: no encontre Microsoft Edge en esta computadora."
  exit 1
}

$archivos = Get-ChildItem -Path (Join-Path $raiz "src") -Recurse -File -Include *.ts, *.tsx |
  ForEach-Object { $_.FullName.Substring($raiz.Length + 1).Replace("\", "/") }
$base = "file:///" + $raiz.Replace("\", "/") + "/"

$plantilla = @'
<!doctype html>
<meta charset="utf-8">
<body><pre id="out">sin ejecutar</pre>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
var BASE = "__BASE__";
var ARCHIVOS = __ARCHIVOS__;
var fallas = [], revisados = 0, texto = "";
if (typeof Babel === "undefined") {
  texto = "NO SE PUDO CARGAR BABEL (sin internet?)\nfallas: 1";
} else {
  ARCHIVOS.forEach(function (p) {
    var src;
    try {
      var x = new XMLHttpRequest();
      x.open("GET", BASE + encodeURI(p), false);
      x.overrideMimeType("text/plain; charset=utf-8");
      x.send();
      src = x.responseText;
    } catch (e) { fallas.push(p + " :: no se pudo leer: " + e); return; }
    if (!src) { fallas.push(p + " :: vacio o ilegible"); return; }
    try {
      Babel.transform(src, {
        filename: p,
        sourceType: "module",
        presets: [["typescript", { isTSX: /\.tsx$/.test(p), allExtensions: true }], ["react", {}]]
      });
      revisados++;
    } catch (e) {
      fallas.push(p + " :: " + String(e && e.message ? e.message : e).split("\n")[0]);
    }
  });
  texto = "revisados sin error: " + revisados + " de " + ARCHIVOS.length + "\nfallas: " + fallas.length + "\n" + fallas.join("\n");
}
document.getElementById("out").textContent = texto;
</script>
'@

$tmp = Join-Path $env:TEMP "verificar-sintaxis-tumenusmart"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pagina = Join-Path $tmp "pagina.html"
$salida = Join-Path $tmp "salida.html"
$html = $plantilla.Replace("__BASE__", $base).Replace("__ARCHIVOS__", (ConvertTo-Json -InputObject @($archivos) -Compress))
Set-Content -Path $pagina -Value $html -Encoding UTF8

$argumentos = @(
  "--headless=new", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
  "--user-data-dir=`"$(Join-Path $tmp 'perfil')`"", "--virtual-time-budget=60000", "--dump-dom",
  ("file:///" + $pagina.Replace("\", "/"))
)
$proceso = Start-Process -FilePath $edge -ArgumentList $argumentos -RedirectStandardOutput $salida `
  -RedirectStandardError (Join-Path $tmp "error.txt") -PassThru -WindowStyle Hidden
if (-not $proceso.WaitForExit(170000)) {
  $proceso.Kill()
  Write-Host "  FALLA: Edge tardo demasiado."
  exit 1
}

$dom = Get-Content $salida -Raw -Encoding UTF8
if ($dom -notmatch '(?s)<pre id="out">(.*?)</pre>') {
  Write-Host "  FALLA: no pude leer la salida de Edge."
  exit 1
}
$resultado = [System.Net.WebUtility]::HtmlDecode($Matches[1])
Write-Host $resultado
if ($resultado -match "fallas: 0") {
  Write-Host "  OK: la sintaxis de todo src/ esta bien."
  exit 0
}
exit 1
