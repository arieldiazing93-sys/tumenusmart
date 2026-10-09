# Genera src/lib/sifen/esquema-de.generated.ts a partir de los XSD OFICIALES de la DNIT (carpeta pruebas/sifen/xsd).
#
# Por que existe: el ORDEN de los campos del XML, cuales son obligatorios y que valores admite cada uno lo define el esquema
# oficial. En vez de copiarlo a mano (y equivocarse en un campo que la DNIT rechaza), se lee del propio XSD. Cuando la DNIT
# publique una version nueva, se bajan los XSD a pruebas/sifen/xsd y se vuelve a correr este script:
#
#   powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-esquema.ps1
#
# Fuente: https://ekuatia.set.gov.py/sifen/xsd/  (DE_v150.xsd y los que incluye). No necesita Node.
param(
  [string]$Xsd = (Join-Path $PSScriptRoot "xsd"),
  [string]$Salida = (Join-Path $PSScriptRoot "..\..\src\lib\sifen\esquema-de.generated.ts")
)
$ErrorActionPreference = "Stop"
$inv = [Globalization.CultureInfo]::InvariantCulture

function Hijos($nodo, $nombreLocal) {
  # La coma delante evita que PowerShell "desenrolle" un resultado de un solo elemento y pierda el .Count.
  $lista = @($nodo.ChildNodes | Where-Object { $_.NodeType -eq "Element" -and $_.LocalName -eq $nombreLocal })
  return ,$lista
}

# Un numero, o el texto tal cual si es otra cosa (hay un minInclusive de tipo fecha: "2018-05-01").
function Numero($texto) {
  $n = 0.0
  if ([double]::TryParse($texto, [Globalization.NumberStyles]::Float, $inv, [ref]$n)) { return $n }
  return $texto
}

# Un simpleType del XSD -> una tabla con sus restricciones (o la lista de tipos de una union).
function LeerSimple($st, [string]$etiqueta) {
  $r = [ordered]@{}
  $res = Hijos $st "restriction"
  if ($res.Count -gt 0) {
    $res = $res[0]
    $r["base"] = $res.GetAttribute("base")
    $enum = New-Object System.Collections.Generic.List[string]
    $pat = New-Object System.Collections.Generic.List[string]
    foreach ($f in $res.ChildNodes) {
      if ($f.NodeType -ne "Element") { continue }
      $v = $f.GetAttribute("value")
      switch ($f.LocalName) {
        "enumeration" { $enum.Add($v) }
        "pattern" { $pat.Add($v) }
        "length" { $r["len"] = [int]$v }
        "minLength" { $r["minLen"] = [int]$v }
        "maxLength" { $r["maxLen"] = [int]$v }
        "totalDigits" { $r["total"] = [int]$v }
        "fractionDigits" { $r["frac"] = [int]$v }
        "minInclusive" { $r["minInc"] = Numero $v }
        "maxInclusive" { $r["maxInc"] = Numero $v }
        "minExclusive" { $r["minExc"] = Numero $v }
        "maxExclusive" { $r["maxExc"] = Numero $v }
        "whiteSpace" { }
        "annotation" { }
        default { throw "Faceta no soportada en ${etiqueta}: $($f.LocalName)" }
      }
    }
    if ($enum.Count -gt 0) { $r["enum"] = $enum.ToArray() }
    if ($pat.Count -gt 0) { $r["pat"] = $pat.ToArray() }
    return $r
  }
  $un = Hijos $st "union"
  if ($un.Count -gt 0) {
    $miembros = New-Object System.Collections.ArrayList
    foreach ($m in (Hijos $un[0] "simpleType")) { [void]$miembros.Add((LeerSimple $m $etiqueta)) }
    if ($un[0].GetAttribute("memberTypes")) { throw "union con memberTypes no soportada en $etiqueta" }
    $r["union"] = $miembros.ToArray()
    return $r
  }
  throw "simpleType no soportado en $etiqueta"
}

$simples = [ordered]@{}
$complejos = [ordered]@{}
$raices = New-Object System.Collections.Generic.List[string]

foreach ($archivo in "DE_v150.xsd", "DE_Types_v150.xsd", "Unidades_Medida_v141.xsd", "Paises_v100.xsd", "Departamentos_v141.xsd", "Monedas_v150.xsd") {
  [xml]$doc = Get-Content -Raw -Encoding UTF8 (Join-Path $Xsd $archivo)
  $esquema = $doc.DocumentElement

  foreach ($st in (Hijos $esquema "simpleType")) {
    $simples[$st.GetAttribute("name")] = LeerSimple $st $st.GetAttribute("name")
  }

  foreach ($ct in (Hijos $esquema "complexType")) {
    $nombre = $ct.GetAttribute("name")
    $entrada = [ordered]@{}
    $seq = Hijos $ct "sequence"
    if ($seq.Count -eq 0) {
      # Solo ocurre con CurrencyCodeType (Monedas_v150.xsd), que ningun elemento del DE usa.
      Write-Host "  (se omite $nombre : no tiene sequence)"
      continue
    }
    $elementos = New-Object System.Collections.ArrayList
    foreach ($e in (Hijos $seq[0] "element")) {
      $o = [ordered]@{}
      $ref = $e.GetAttribute("ref")
      if ($ref) {
        $o["n"] = ($ref -split ":")[-1]
        $o["t"] = $ref
      } else {
        $o["n"] = $e.GetAttribute("name")
        $tipo = $e.GetAttribute("type")
        if ($tipo) {
          $o["t"] = $tipo
        } else {
          $inline = Hijos $e "simpleType"
          if ($inline.Count -eq 0) {
            # Sin tipo en el XSD (dNumCuoDocAso y dImpCuoDocAso): XSD lo toma como texto libre.
            $o["t"] = "xs:anyType"
          } else {
            $nom = "$nombre.$($o['n'])"
            $simples[$nom] = LeerSimple $inline[0] $nom
            $o["t"] = $nom
          }
        }
      }
      $min = $e.GetAttribute("minOccurs")
      $max = $e.GetAttribute("maxOccurs")
      $o["min"] = $(if ($min -eq "") { 1 } else { [int]$min })
      $o["max"] = $(if ($max -eq "") { 1 } elseif ($max -eq "unbounded") { -1 } else { [int]$max })
      [void]$elementos.Add($o)
    }
    $entrada["el"] = $elementos.ToArray()
    $atributos = New-Object System.Collections.ArrayList
    foreach ($a in (Hijos $ct "attribute")) {
      [void]$atributos.Add([ordered]@{ n = $a.GetAttribute("name"); t = $a.GetAttribute("type"); req = ($a.GetAttribute("use") -eq "required") })
    }
    if ($atributos.Count -gt 0) { $entrada["attr"] = $atributos.ToArray() }
    $complejos[$nombre] = $entrada
  }
}

function Json($objeto) { ConvertTo-Json -InputObject $objeto -Depth 30 -Compress }

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("// GENERADO por pruebas/sifen/generar-esquema.ps1 a partir de los XSD oficiales de la DNIT")
[void]$sb.AppendLine("// (https://ekuatia.set.gov.py/sifen/xsd/ - DE_v150.xsd, DE_Types_v150.xsd, Unidades_Medida, Paises, Departamentos, Monedas).")
[void]$sb.AppendLine("// NO EDITAR A MANO: si la DNIT publica una version nueva, se bajan los XSD a pruebas/sifen/xsd y se vuelve a generar.")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("export type ElementoXsd = { n: string; t: string; min: number; max: number };")
[void]$sb.AppendLine("export type SimpleXsd = {")
[void]$sb.AppendLine("  base?: string; enum?: string[]; pat?: string[]; len?: number; minLen?: number; maxLen?: number;")
[void]$sb.AppendLine("  total?: number; frac?: number; minInc?: number | string; maxInc?: number | string; minExc?: number | string; maxExc?: number | string; union?: SimpleXsd[];")
[void]$sb.AppendLine("};")
[void]$sb.AppendLine("export type ComplejoXsd = { el: ElementoXsd[]; attr?: { n: string; t: string; req: boolean }[] };")
[void]$sb.AppendLine("")
[void]$sb.AppendLine('export const RAIZ_DE = "rDE";')
[void]$sb.AppendLine("")
[void]$sb.AppendLine("export const COMPLEJOS: Record<string, ComplejoXsd> = {")
foreach ($k in $complejos.Keys) { [void]$sb.AppendLine("  `"$k`": " + (Json $complejos[$k]) + ",") }
[void]$sb.AppendLine("};")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("export const SIMPLES: Record<string, SimpleXsd> = {")
foreach ($k in $simples.Keys) { [void]$sb.AppendLine("  `"$k`": " + (Json $simples[$k]) + ",") }
[void]$sb.AppendLine("};")

$destino = [System.IO.Path]::GetFullPath($Salida)
[System.IO.File]::WriteAllText($destino, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
"listo: $($complejos.Count) tipos complejos, $($simples.Count) tipos simples -> $destino ($([math]::Round((Get-Item $destino).Length / 1024)) KB)"
