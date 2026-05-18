<#
.SYNOPSIS
  Export F4095 (JDE Distribution AAIs) from a customer's RR mirror to an
  analyzer-shaped .xlsx ready for the Export Analyzer's Preload card.

.DESCRIPTION
  Mirrors the column shape produced by Tools/queries/jde-dmaais-export.sql
  so the resulting workbook fingerprints as "JDE DMAAI's" in the analyzer
  and loads into SystemContext for cross-pattern AAI lookups.

  Connects via SQL auth using the same convention as
  transaction-detail-workflow.ps1 (sqlcmd at the ODBC 170 path, password
  in a plain-text file at $env:USERPROFILE\.rr-sql-pwd by default).

  Output defaults to the fixtures folder so the analyzer's auto-rehydrate
  finds it without manual setup; pass -OutFile for a different location.

.PARAMETER Database
  Customer database name (e.g. 'rrv7-acme', 'rrv7-treatt', 'rrv7-NACoal').

.PARAMETER OutFile
  Explicit output path. When omitted, writes to
    Tools/_test_corpus/fixtures/RR F4095 <Customer>.xlsx
  where <Customer> is the database suffix after 'rrv7-'.

.PARAMETER Server
  SQL Server instance. Default: localhost.

.PARAMETER User
  SQL login. Default: rruser.

.PARAMETER PasswordFile
  File containing only the SQL login password. Default:
  $env:USERPROFILE\.rr-sql-pwd.

.EXAMPLE
  .\f4095-preload-workflow.ps1 -Database rrv7-treatt

.EXAMPLE
  .\f4095-preload-workflow.ps1 -Database rrv7-NACoal -OutFile 'C:\tmp\nacoal-f4095.xlsx'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Database,
  [string]$OutFile,
  [string]$Server = 'localhost',
  [string]$User = 'rruser',
  [string]$PasswordFile = "$env:USERPROFILE\.rr-sql-pwd"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $PasswordFile)) { throw "Password file not found: $PasswordFile" }
$sqlPwd = (Get-Content $PasswordFile -Raw).TrimEnd()

# Default OutFile derives from the database name so multiple customers can
# coexist in the fixtures folder. The analyzer's auto-rehydrate prefers
# 'RR F4095 Acme.xlsx' but accepts any matching JDE-shape workbook.
if (-not $OutFile) {
  $customer = ($Database -replace '^rrv7-', '') -replace '[^A-Za-z0-9_]', ''
  # Capitalize for the filename so it reads naturally alongside the others.
  if ($customer.Length -gt 0) {
    $customer = $customer.Substring(0,1).ToUpper() + $customer.Substring(1)
  }
  # Resolve the repo root by walking up from this script's location until
  # we find Tools/_test_corpus/fixtures. Falls back to PWD-relative if
  # the script lives outside the standard repo layout.
  $scriptDir  = Split-Path -Parent $PSCommandPath
  $repoRoot   = Split-Path -Parent (Split-Path -Parent $scriptDir)
  $fixturesDir = Join-Path $repoRoot 'Tools\_test_corpus\fixtures'
  if (-not (Test-Path $fixturesDir)) {
    $fixturesDir = Join-Path (Get-Location).Path 'Tools\_test_corpus\fixtures'
    New-Item -ItemType Directory -Path $fixturesDir -Force | Out-Null
  }
  $OutFile = Join-Path $fixturesDir "RR F4095 $customer.xlsx"
} else {
  $parent = Split-Path -Parent $OutFile
  if (-not $parent) { $parent = (Get-Location).Path }
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  $OutFile = Join-Path (Resolve-Path $parent).Path (Split-Path -Leaf $OutFile)
}

Write-Host "Exporting F4095 from [$Database] -> $OutFile ..."

# ---- pull rows via SqlClient (typed values, preserves trailing spaces
# ---- on the nchar JDE columns the analyzer fingerprints by) ----
Add-Type -AssemblyName System.Data
$connStr = "Server=$Server;Database=$Database;User Id=$User;Password=$sqlPwd;TrustServerCertificate=True;"
$query = @'
SELECT
    aai.mlanum    AS [AAI Number],
    aai.mlco      AS [Co ],
    aai.mldcto    AS [Or Ty],
    aai.mldct     AS [Do Ty],
    aai.mlglpt    AS [G/L Cat],
    aai.mlcost    AS [Cost Type],
    aai.mlmcu     AS [Business Unit],
    aai.mlobj     AS [Obj Acct],
    aai.mlsub     AS [Sub ]
FROM dbo.F4095 aai
ORDER BY aai.mlanum, aai.mlco, aai.mldcto, aai.mldct, aai.mlglpt, aai.mlcost;
'@

$conn = New-Object System.Data.SqlClient.SqlConnection $connStr
$conn.Open()
try {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $query
  $cmd.CommandTimeout = 300
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
  $dt = New-Object System.Data.DataTable
  [void]$adapter.Fill($dt)
} finally {
  $conn.Close()
}

if ($dt.Rows.Count -eq 0) {
  throw "F4095 returned no rows for [$Database] -- does the customer mirror have any DMAAI configuration?"
}

$cols       = @($dt.Columns | ForEach-Object { $_.ColumnName })
$rowCount   = $dt.Rows.Count
$colCount   = $cols.Count

# Materialize into a 2-D object[,] for fast bulk write. Row 0 = headers
# (the analyzer fingerprints by header text on the first row), rows 1+
# = data. No banner row -- the JDE DMAAIs template parses from row 1.
$data = New-Object 'object[,]' -ArgumentList ($rowCount + 1), $colCount
for ($c = 0; $c -lt $colCount; $c++) { $data.SetValue($cols[$c], 0, $c) }
for ($r = 0; $r -lt $rowCount; $r++) {
  $row = $dt.Rows[$r]
  for ($c = 0; $c -lt $colCount; $c++) {
    $v = $row[$cols[$c]]
    if ($v -is [System.DBNull]) { $v = '' }
    $data.SetValue($v, $r + 1, $c)
  }
}

# ---- write via Excel COM ----
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $ws.Name = 'JDE Data'
  $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount + 1, $colCount))
  # Force every column to Text format before writing so account-shaped
  # strings (e.g. "1000000.142000") don't get auto-converted to numbers
  # by Excel's Value2 setter -- same trick as transaction-detail-workflow.ps1.
  $range.NumberFormat = '@'
  $range.Value2 = $data
  # Light header formatting that mirrors the JDE export look.
  $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item(1, $colCount)).Font.Bold = $true
  $ws.Columns.AutoFit() | Out-Null
  if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
  $wb.SaveAs($OutFile, 51) | Out-Null   # 51 = xlOpenXMLWorkbook (.xlsx)
  $wb.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

Write-Output "Wrote $OutFile ($rowCount rows)"
