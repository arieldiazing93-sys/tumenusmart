# Revisa los TIPOS de todo src/ SIN necesitar Node: baja TypeScript al navegador (Microsoft Edge sin ventana) y compila el proyecto contra
# un Prisma "de mentira" armado desde prisma/schema.prisma.
#
#   powershell -ExecutionPolicy Bypass -File pruebas\verificar-tipos.ps1
#
# Para qué sirve: el build de Vercel frena en el PRIMER error de tipos y muestra uno solo. Esto muestra todos los de golpe, antes de
# publicar. verificar-sintaxis.ps1 solo mira que el codigo se pueda leer; esto mira que los tipos cierren.
#
# Lo que SI detecta del Prisma de mentira: campos que no existen o con el tipo equivocado en where/data/create/update, campos
# obligatorios que faltan al crear, y pasar el cliente de prismaDelLocal() donde se espera el cliente comun (PrismaClient o la
# transaccion), que es un error que Vercel nos mostro y que parece inofensivo.
# Lo que NO detecta: el resultado exacto de un select/include (ahi vale "todo el modelo") ni los tipos de Next/Node (valen "cualquier cosa").
#
# En src/ hay unos errores de siempre que NO son reales (el Prisma de mentira no conoce _count, el crypto de mentira no tiene scrypt...):
# quedan anotados en pruebas\tipos\base.json y solo se avisa de lo NUEVO. Si se arregla algo de esa lista o aparece otro falso aviso
# confirmado: -ActualizarBase.
#
# Necesita Edge e internet (baja TypeScript y los tipos de React de jsdelivr). Tarda un minuto. Sale con 1 si hay errores nuevos.
param([int]$Puerto = 8770, [int]$EsperaSegundos = 400, [switch]$ActualizarBase)

$ErrorActionPreference = "Stop"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pagina = Join-Path $PSScriptRoot "tipos\index.html"
$archivoBase = Join-Path $PSScriptRoot "tipos\base.json"

$edge = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "  FALLA: no encontre Microsoft Edge."; exit 1 }

function Enviar($c, [byte[]]$bytes, [string]$tipo) {
  $c.Response.ContentType = $tipo
  $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://localhost:$Puerto/")
$servidor.Start()

$perfil = Join-Path ([IO.Path]::GetTempPath()) ("tipos-edge-" + [guid]::NewGuid().ToString("N"))
$proceso = Start-Process $edge -ArgumentList @("--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=`"$perfil`"", "http://localhost:$Puerto/") -PassThru

$resultado = $null
$limite = (Get-Date).AddSeconds($EsperaSegundos)
try {
  Write-Host "  revisando los tipos de src/ en Edge (un minuto) ..."
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
      } elseif ($ruta -eq "/" -or $ruta -eq "/index.html") {
        Enviar $c ([IO.File]::ReadAllBytes($pagina)) "text/html; charset=utf-8"
      } elseif ($ruta -eq "/__lista") {
        $src = (Resolve-Path (Join-Path $raiz "src")).Path
        $lista = Get-ChildItem -Recurse -Path $src -Include *.ts,*.tsx -File | ForEach-Object { $_.FullName.Substring($raiz.Length + 1).Replace("\", "/") }
        Enviar $c ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($lista) -Compress))) "application/json; charset=utf-8"
      } elseif ($ruta.StartsWith("/f/") -and -not $ruta.Contains("..")) {
        $rel = [Uri]::UnescapeDataString($ruta.Substring(3))
        if ($rel.StartsWith("src/") -or $rel -eq "prisma/schema.prisma") {
          $p = Join-Path $raiz $rel.Replace("/", "\")
          if (Test-Path -LiteralPath $p -PathType Leaf) { Enviar $c ([IO.File]::ReadAllBytes($p)) "text/plain; charset=utf-8" } else { $c.Response.StatusCode = 404 }
        } else { $c.Response.StatusCode = 403 }
      } else {
        $c.Response.StatusCode = 404
      }
    } catch {
      $c.Response.StatusCode = 500
    }
    $c.Response.Close()
  }
} finally {
  $servidor.Stop()
  # Si Edge (o alguno de sus procesos hijos) ya termino, taskkill se queja: no es un problema.
  try { & taskkill /PID $proceso.Id /T /F 2>&1 | Out-Null } catch { }
  Start-Sleep -Milliseconds 500
  Remove-Item -LiteralPath $perfil -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $resultado) {
  Write-Host "  FALLA: la revision no termino en $EsperaSegundos segundos."
  exit 1
}
if ($resultado.globales.Count -gt 0) { $resultado.globales | ForEach-Object { Write-Host "  AVISO global: $_" } }
if ($resultado.stub.Count -gt 0) {
  Write-Host "  FALLA: el Prisma de mentira generado tiene errores (hay que arreglar pruebas\tipos\index.html):"
  $resultado.stub | ForEach-Object { Write-Host "    $_" }
  exit 1
}

$clave = { param($d) "{0}|{1}|{2}" -f $d.f, $d.code, $d.m.Substring(0, [Math]::Min(100, $d.m.Length)) }
$actuales = @($resultado.diags | ForEach-Object { & $clave $_ })

if ($ActualizarBase) {
  ConvertTo-Json -InputObject @($actuales | Sort-Object -Unique) | Set-Content -LiteralPath $archivoBase -Encoding UTF8
  Write-Host "  base actualizada: $($actuales.Count) avisos conocidos en pruebas\tipos\base.json"
  exit 0
}

$conocidos = @{}
if (Test-Path $archivoBase) { (Get-Content -LiteralPath $archivoBase -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $conocidos[$_] = $true } }
$nuevos = @($resultado.diags | Where-Object { -not $conocidos.ContainsKey((& $clave $_)) })

Write-Host "  errores en src/: $($resultado.diags.Count) (de siempre, anotados en base.json: $($resultado.diags.Count - $nuevos.Count); nuevos: $($nuevos.Count))"
if ($nuevos.Count -gt 0) {
  foreach ($d in $nuevos) {
    Write-Host ("  NUEVO {0}:{1}:{2}  TS{3}" -f $d.f, $d.l, $d.c, $d.code)
    Write-Host ("        " + ($d.m -replace "`r?`n", " | "))
  }
  Write-Host "`n  FALLA: $($nuevos.Count) error(es) de tipos nuevo(s). Vercel los mostraria de a uno y frenaria el deploy."
  exit 1
}
Write-Host "`n  OK: sin errores de tipos nuevos."
exit 0
