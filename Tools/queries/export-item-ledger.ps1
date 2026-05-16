<#
.SYNOPSIS
  Export one JDE item's F4111 rows to an Export-Analyzer-shaped .xlsx.

.DESCRIPTION
  Mirrors the column order and aliases in Tools/queries/item-ledger-export.sql
  (including the JDE-quirky duplicate "Document Number" header). Connects via
  SQL auth, dumps to TSV, then uses Excel COM to write a real .xlsx with
  the headers verbatim. The duplicate-header trick is why this script
  bypasses Invoke-Sqlcmd / Export-Csv (DataTable column names must be
  unique).

  Requires:
    - sqlcmd at C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE
    - Excel desktop (uses COM automation)
    - Password in a plain-text file (default: $env:USERPROFILE\.rr-sql-pwd)

.PARAMETER LongItem
  Long item number to filter on (F4101.imlitm). Required.

.PARAMETER OutFile
  Output .xlsx path. Defaults to .\Tools\_test\F4111_<sanitized-item>.xlsx.

.PARAMETER Server
  SQL Server instance. Default: localhost.

.PARAMETER Database
  Database name. Default: rrv7-JDELab.

.PARAMETER User
  SQL login. Default: rruser.

.PARAMETER PasswordFile
  File containing only the login password. Default: $env:USERPROFILE\.rr-sql-pwd.

.EXAMPLE
  .\export-item-ledger.ps1 DEFIBRILLATOR

.EXAMPLE
  .\export-item-ledger.ps1 -LongItem '7160' -Database 'rrv7-acme' -OutFile 'C:\tmp\acme-7160.xlsx'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$LongItem,
  [string]$OutFile,
  [string]$Server = 'localhost',
  [string]$Database = 'rrv7-JDELab',
  [string]$User = 'rruser',
  [string]$PasswordFile = "$env:USERPROFILE\.rr-sql-pwd"
)

$ErrorActionPreference = 'Stop'

$sqlcmdExe = 'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE'
if (-not (Test-Path $sqlcmdExe)) { throw "sqlcmd not found at $sqlcmdExe" }
if (-not (Test-Path $PasswordFile)) { throw "Password file not found: $PasswordFile" }

if (-not $OutFile) {
  $safe = ($LongItem -replace '[^A-Za-z0-9_-]', '_').Trim('_')
  $outDir = Join-Path (Get-Location).Path 'Tools\_test'
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  $OutFile = Join-Path $outDir "F4111_$safe.xlsx"
} else {
  # Excel COM SaveAs requires an absolute path; resolve before use.
  $parent = Split-Path -Parent $OutFile
  if (-not $parent) { $parent = (Get-Location).Path }
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  $OutFile = Join-Path (Resolve-Path $parent).Path (Split-Path -Leaf $OutFile)
}

# Column aliases & order must match Tools/queries/item-ledger-export.sql.
# The two "Document Number" entries are intentional (JDE quirk — second one
# is the order number; analyzer parses by header order, not by column name).
$headers = @(
  'Document Number','Doc Type','Doc Co','Transaction Date','Branch/ Plant',
  'Quantity Primary UoM','Primary UoM','Unit Cost','Extended Cost',
  'Lot/Serial','Location','Lot Status Code','Document Number','Doc Ty',
  'Order Co','Class Code','G/L Date','Unique Key ID'
)

$sqlPwd = (Get-Content $PasswordFile -Raw).TrimEnd()
$safeItem = $LongItem -replace "'", "''"

$sql = @"
SET NOCOUNT ON;
SELECT
    il.ildoc, il.ildct, il.ilkco,
    CONVERT(varchar(10), il.ilcrdj, 23) AS TxDate,
    il.ilmcu, il.iltrqt, il.primaryuom, il.iluncs, il.ilpaid,
    il.illotn, il.illocn,
    CAST('' AS nvarchar(3)) AS LotStatus,
    il.ildoco, il.ildcto, il.ilkcoo, il.ilglpt,
    CONVERT(varchar(10), il.ildgl, 23) AS GLDate,
    il.ilukid
FROM dbo.F4111 il
INNER JOIN dbo.F4101 im ON im.imitm = il.ilitm
WHERE im.imlitm = '$safeItem'
ORDER BY il.ilukid DESC;
"@

$tmp = [System.IO.Path]::GetTempFileName()
try {
  & $sqlcmdExe -S $Server -d $Database -U $User -P $sqlPwd -C -h -1 -W -s "`t" -Q $sql -o $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed (exit $LASTEXITCODE). See $tmp for output." }
  $lines = @(Get-Content $tmp | Where-Object { $_.Trim() -ne '' })
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}

if ($lines.Count -eq 0) {
  throw "No F4111 rows found for item '$LongItem' in [$Database]."
}

$rowCount = $lines.Count + 1
$colCount = $headers.Count
$data = New-Object 'object[,]' -ArgumentList $rowCount, $colCount
for ($c = 0; $c -lt $colCount; $c++) { $data.SetValue($headers[$c], 0, $c) }
for ($r = 0; $r -lt $lines.Count; $r++) {
  $cols = $lines[$r] -split "`t"
  for ($c = 0; $c -lt $colCount -and $c -lt $cols.Length; $c++) {
    $val = $cols[$c].Trim()
    if ($val -eq 'NULL') { $val = '' }
    $cellVal = $val
    $date = [datetime]::MinValue
    $num = 0.0
    if ([datetime]::TryParseExact($val, 'yyyy-MM-dd', $null, [System.Globalization.DateTimeStyles]::None, [ref]$date)) {
      $cellVal = $date
    } elseif ($val -match '^-?\d+(\.\d+)?$' -and [double]::TryParse($val, [ref]$num)) {
      $cellVal = $num
    }
    $data.SetValue($cellVal, $r + 1, $c)
  }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount, $colCount))
  $range.Value2 = $data
  $ws.Columns.Item(4).NumberFormat = 'yyyy-mm-dd'   # Transaction Date
  $ws.Columns.Item(17).NumberFormat = 'yyyy-mm-dd'  # G/L Date
  $ws.Columns.AutoFit() | Out-Null
  $wb.SaveAs($OutFile, 51) | Out-Null  # 51 = xlOpenXMLWorkbook (.xlsx)
  $wb.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

Write-Output "Wrote $OutFile ($($lines.Count) rows)"
