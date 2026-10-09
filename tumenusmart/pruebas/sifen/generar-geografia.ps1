# Genera src/lib/sifen/geografia.generated.ts a partir del CODIGO DE REFERENCIA GEOGRAFICA oficial de e-Kuatia
# (departamentos, distritos y ciudades/localidades con los codigos que usa SIFEN en dDesDepEmi, cDisEmi, cCiuEmi...).
#
#   powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-geografia.ps1
#
# Fuente: https://www.dnit.gov.py/web/e-kuatia/tablas-y-codificaciones (documentacion tecnica > Tablas y Codificaciones).
# El .xlsx es un zip de XML: no hace falta Excel ni Node. Los barrios no se usan en SIFEN y se descartan.
param(
  [string]$Xlsx = (Join-Path $PSScriptRoot "tablas\CODIGO_DE_REFERENCIA_GEOGRAFICA_NOVIEMBRE_2025.xlsx"),
  [string]$Salida = (Join-Path $PSScriptRoot "..\..\src\lib\sifen\geografia.generated.ts")
)
$ErrorActionPreference = "Stop"

$temporal = Join-Path ([IO.Path]::GetTempPath()) ("geo-" + [guid]::NewGuid().ToString("N"))
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($Xlsx, $temporal)
try {
  [xml]$ss = Get-Content -Raw -Encoding UTF8 (Join-Path $temporal "xl\sharedStrings.xml")
  $cadenas = New-Object System.Collections.Generic.List[string]
  foreach ($si in $ss.sst.si) {
    $t = ""
    if ($si.t) { $t = if ($si.t -is [string]) { $si.t } else { $si.t.'#text' } }
    else { foreach ($r in $si.r) { $t += if ($r.t -is [string]) { $r.t } else { $r.t.'#text' } } }
    $cadenas.Add($t)
  }

  [xml]$hoja = Get-Content -Raw -Encoding UTF8 (Join-Path $temporal "xl\worksheets\sheet1.xml")
  $ns = New-Object System.Xml.XmlNamespaceManager($hoja.NameTable)
  $ns.AddNamespace("m", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $fechaActualizacion = ""
  $departamentos = [ordered]@{}
  $distritos = [ordered]@{}
  $ciudades = [ordered]@{}
  foreach ($fila in $hoja.SelectNodes("//m:sheetData/m:row", $ns)) {
    $c = @{}
    foreach ($x in $fila.SelectNodes("m:c", $ns)) {
      $v = $x.SelectSingleNode("m:v", $ns)
      if ($v -eq $null) { continue }
      $c[($x.r -replace "\d", "")] = if ($x.t -eq "s") { $cadenas[[int]$v.InnerText] } else { $v.InnerText }
    }
    if ($c.ContainsKey("B") -and $c["B"] -like "Fecha de Actual*" -and $c.ContainsKey("C")) { $fechaActualizacion = $c["C"] }
    # Una fila de datos tiene el codigo del departamento, del distrito y de la ciudad como numeros.
    if (-not ($c.ContainsKey("B") -and $c["B"] -match '^\d+$' -and $c.ContainsKey("D") -and $c.ContainsKey("F"))) { continue }
    $dep = [int]$c["B"]; $dis = [int]$c["D"]; $ciu = [int]$c["F"]
    $departamentos["$dep"] = $c["C"].Trim()
    if ($distritos.Contains("$dis") -and $distritos["$dis"].dep -ne $dep) { throw "El distrito $dis aparece en dos departamentos distintos" }
    $distritos["$dis"] = [pscustomobject]@{ dep = $dep; nombre = $c["E"].Trim() }
    if ($ciudades.Contains("$ciu") -and ($ciudades["$ciu"].dis -ne $dis)) { throw "La ciudad $ciu aparece en dos distritos distintos" }
    $ciudades["$ciu"] = [pscustomobject]@{ dis = $dis; nombre = $c["G"].Trim() }
  }
  if ($departamentos.Count -eq 0 -or $distritos.Count -eq 0 -or $ciudades.Count -eq 0) { throw "No se leyeron datos: cambio el formato del Excel?" }

  function Texto($s) { ConvertTo-Json -InputObject $s -Compress }
  $md5 = (Get-FileHash -Algorithm MD5 -LiteralPath $Xlsx).Hash.ToLower()

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("// GENERADO por pruebas/sifen/generar-geografia.ps1 a partir del CODIGO DE REFERENCIA GEOGRAFICA oficial de e-Kuatia")
  [void]$sb.AppendLine("// (https://www.dnit.gov.py/web/e-kuatia/tablas-y-codificaciones). Actualizacion de la tabla: $fechaActualizacion. MD5 del .xlsx: $md5")
  [void]$sb.AppendLine("// NO EDITAR A MANO: si la DNIT publica una tabla nueva se reemplaza el .xlsx de pruebas/sifen/tablas y se vuelve a generar.")
  [void]$sb.AppendLine("// Solo para el servidor: pesa unos 300 KB y no debe importarse desde un componente de cliente.")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("export const GEOGRAFIA_ACTUALIZACION = $(Texto $fechaActualizacion);")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("/** [codigo, nombre] */")
  [void]$sb.AppendLine("export const DEPARTAMENTOS_GEO: readonly (readonly [number, string])[] = [")
  foreach ($k in $departamentos.Keys) { [void]$sb.AppendLine("  [$k, $(Texto $departamentos[$k])],") }
  [void]$sb.AppendLine("];")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("/** [codigo, codigo del departamento, nombre] */")
  [void]$sb.AppendLine("export const DISTRITOS_GEO: readonly (readonly [number, number, string])[] = [")
  foreach ($k in $distritos.Keys) { [void]$sb.AppendLine("  [$k, $($distritos[$k].dep), $(Texto $distritos[$k].nombre)],") }
  [void]$sb.AppendLine("];")
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("/** [codigo, codigo del distrito, nombre] */")
  [void]$sb.AppendLine("export const CIUDADES_GEO: readonly (readonly [number, number, string])[] = [")
  foreach ($k in $ciudades.Keys) { [void]$sb.AppendLine("  [$k, $($ciudades[$k].dis), $(Texto $ciudades[$k].nombre)],") }
  [void]$sb.AppendLine("];")

  $destino = [IO.Path]::GetFullPath($Salida)
  [IO.File]::WriteAllText($destino, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
  $largos = @($ciudades.Values | Where-Object { $_.nombre.Length -gt 30 }).Count
  "listo: $($departamentos.Count) departamentos, $($distritos.Count) distritos, $($ciudades.Count) ciudades -> $destino ($([math]::Round((Get-Item $destino).Length / 1024)) KB). Actualizacion: $fechaActualizacion."
  "ciudades con nombre de mas de 30 caracteres: $largos"
} finally {
  Remove-Item -LiteralPath $temporal -Recurse -Force -ErrorAction SilentlyContinue
}
