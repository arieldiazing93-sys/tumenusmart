param($dir, $proyecto)
# Servidor local de SOLO LECTURA para el banco de pruebas (puerto 8768, solo esta computadora):
#   /f/<ruta>  → un archivo de src/ (o prisma/schema.prisma, tailwind.config.ts) del proyecto, como texto
#   el resto   → los archivos de la carpeta del banco (banco.html, cargador.js, las pruebas)
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File pruebas\banco\servir.ps1 -dir pruebas\banco -proyecto .
$dir = (Resolve-Path $dir).Path
$proyecto = (Resolve-Path $proyecto).Path
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:8768/")
$l.Start()
while ($l.IsListening) {
  $c = $l.GetContext()
  $ruta = $c.Request.Url.LocalPath
  try {
    if ($ruta.StartsWith("/f/") -and -not $ruta.Contains("..")) {
      $rel = [System.Uri]::UnescapeDataString($ruta.Substring(3))
      if ($rel.StartsWith("src/") -or $rel -eq "prisma/schema.prisma" -or $rel -eq "tailwind.config.ts") {
        $p = Join-Path $proyecto $rel.Replace("/", "\")
        if (Test-Path -LiteralPath $p -PathType Leaf) {
          $b = [IO.File]::ReadAllBytes($p)
          $c.Response.ContentType = "text/plain; charset=utf-8"
          $c.Response.OutputStream.Write($b, 0, $b.Length)
        } else { $c.Response.StatusCode = 404 }
      } else { $c.Response.StatusCode = 403 }
    } else {
      $p = Join-Path $dir ([System.Uri]::UnescapeDataString($ruta).TrimStart('/').Replace("/", "\"))
      if (-not $p.StartsWith($dir)) { $c.Response.StatusCode = 403 }
      elseif (Test-Path -LiteralPath $p -PathType Leaf) {
        $b = [IO.File]::ReadAllBytes($p)
        $c.Response.ContentType = if ($p.EndsWith(".html")) { "text/html; charset=utf-8" } elseif ($p.EndsWith(".js")) { "text/javascript; charset=utf-8" } else { "text/plain; charset=utf-8" }
        $c.Response.OutputStream.Write($b, 0, $b.Length)
      } else { $c.Response.StatusCode = 404 }
    }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
