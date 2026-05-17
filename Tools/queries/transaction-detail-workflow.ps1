<#
.SYNOPSIS
  Transaction Detail workflow — pull one (Company, Doc, DocType) through
  dbo.usp6compare2 and write an analyzer-shaped .xlsx to disk.

.DESCRIPTION
  Mirrors the on-screen Transaction Detail report a user would see in
  RapidReconciler, packaged as an .xlsx that the Export Analyzer can
  consume directly. The shape is:

    Sheet name: "Transaction Details"
    Row 1:      banner ("Transaction Details Generated <pretty date>")
    Row 2:      column headers (Period .. Comment) -- matches the
                live RR export verbatim
    Row 3+:     data rows (the sproc's internal "Sort" column is
                stripped on the way out)

  Connects via SQL auth using the same convention as
  export-item-ledger.ps1 (sqlcmd at the ODBC 170 path, password in a
  plain-text file at $env:USERPROFILE\.rr-sql-pwd by default).

  Output defaults to $env:USERPROFILE\Downloads with a filename keyed
  by company / doc / doc-type / timestamp so repeat runs don't
  clobber each other.

.PARAMETER Company
  JDE company number on the rcardexledgercompare2 row (e.g. '00010').
  Padded automatically to 5 chars if you pass a short value.

.PARAMETER Doc
  Document number on the row (rcardexledgercompare2.DocNumber).

.PARAMETER DocType
  Document type on the row (rcardexledgercompare2.DocType, e.g. 'IM').
  Padded to 2 chars (the JDE convention).

.PARAMETER Database
  SQL Server database. Defaults to rrv7-acme. Change this when
  switching customers.

.PARAMETER Server
  SQL Server instance. Default: localhost.

.PARAMETER User
  SQL login. Default: rruser.

.PARAMETER PasswordFile
  File containing only the SQL login password. Default:
  $env:USERPROFILE\.rr-sql-pwd.

.PARAMETER OutDir
  Output directory for the intermediate Transaction Detail .xlsx (the
  one that gets dropped onto the analyzer). Defaults to the user's
  TEMP folder so Downloads stays uncluttered — only the analyzer's
  final output workbook lands in Downloads.

.PARAMETER OutFile
  Explicit output path. Overrides OutDir/auto-name when supplied.

.EXAMPLE
  .\transaction-detail-workflow.ps1 -Company 00010 -Doc 1324740 -DocType IM

.EXAMPLE
  .\transaction-detail-workflow.ps1 -Company 50 -Doc 1019255 -DocType RI -Database rrv7-acme
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Company,
  [Parameter(Mandatory)][int]$Doc,
  [Parameter(Mandatory)][string]$DocType,
  [string]$Database = 'rrv7-acme',
  [string]$Server = 'localhost',
  [string]$User = 'rruser',
  [string]$PasswordFile = "$env:USERPROFILE\.rr-sql-pwd",
  [string]$OutDir = "$env:TEMP\rr-transaction-detail",
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'

# ---- credentials + paths ----
if (-not (Test-Path $PasswordFile)) { throw "Password file not found: $PasswordFile" }
$sqlPwd = (Get-Content $PasswordFile -Raw).TrimEnd()

# JDE-shaped padding so callers can pass loose values
$Company = ($Company.PadLeft(5, '0'))
$DocType = ($DocType.PadRight(2, ' ').Substring(0, 2))

if (-not $OutFile) {
  if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
  $stamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
  $safeDt = $DocType.Trim() -replace '[^A-Za-z0-9]', ''
  $OutFile = Join-Path $OutDir "TransactionDetail_${Company}_${Doc}_${safeDt}_${stamp}.xlsx"
} else {
  $parent = Split-Path -Parent $OutFile
  if (-not $parent) { $parent = (Get-Location).Path }
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  $OutFile = Join-Path (Resolve-Path $parent).Path (Split-Path -Leaf $OutFile)
}

Write-Host "Running usp6compare2 for [$Database] Co=$Company Doc=$Doc DT=$DocType ..."

# ---- pull the rowset via SqlClient (typed values, no TSV escaping headaches) ----
Add-Type -AssemblyName System.Data
$connStr = "Server=$Server;Database=$Database;User Id=$User;Password=$sqlPwd;TrustServerCertificate=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection $connStr
$conn.Open()
try {
  $cmd = $conn.CreateCommand()
  $cmd.CommandType = [System.Data.CommandType]::StoredProcedure
  $cmd.CommandText = 'dbo.usp6compare2'
  [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@company', [System.Data.SqlDbType]::NChar, 6)))
  [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@doc',     [System.Data.SqlDbType]::Int)))
  [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@type',    [System.Data.SqlDbType]::NChar, 2)))
  $cmd.Parameters['@company'].Value = $Company
  $cmd.Parameters['@doc'].Value     = $Doc
  $cmd.Parameters['@type'].Value    = $DocType
  $cmd.CommandTimeout = 120
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
  $dt = New-Object System.Data.DataTable
  [void]$adapter.Fill($dt)
} finally {
  $conn.Close()
}

if ($dt.Rows.Count -eq 0) {
  throw "usp6compare2 returned no rows for Co=$Company Doc=$Doc DT=$DocType in [$Database]."
}

# ---- column shape ----
# Drop the sproc's internal "Sort" column (sequence key). The analyzer
# parses by column name, but the live RR export doesn't carry it, so
# match the on-screen shape verbatim.
$allCols = @($dt.Columns | ForEach-Object { $_.ColumnName })
$exportCols = $allCols | Where-Object { $_ -ne 'Sort' }

# Column-name fidelity with the RR-on-screen export: "SubType" -> "Sub Type"
$displayHeader = $exportCols | ForEach-Object {
  if ($_ -eq 'SubType') { 'Sub Type' } else { $_ }
}

$rowCount = $dt.Rows.Count
$colCount = $exportCols.Count
$bannerText = "Transaction Details Generated $(Get-Date -Format 'dddd, MMMM d, yyyy hh:mm tt')"

# ---- materialize into a 2-D object[,] for fast Excel COM bulk write ----
# Layout: row 0 = banner across all columns; row 1 = headers; row 2+ = data.
$data = New-Object 'object[,]' -ArgumentList ($rowCount + 2), $colCount
for ($c = 0; $c -lt $colCount; $c++) {
  $data.SetValue($bannerText,        0, $c)
  $data.SetValue($displayHeader[$c], 1, $c)
}
for ($r = 0; $r -lt $rowCount; $r++) {
  $row = $dt.Rows[$r]
  for ($c = 0; $c -lt $colCount; $c++) {
    $v = $row[$exportCols[$c]]
    if ($v -is [System.DBNull]) { $v = '' }
    # Excel COM SetValue handles real types fine — let it cast.
    $data.SetValue($v, $r + 2, $c)
  }
}

# ---- write via Excel COM ----
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $ws.Name = 'Transaction Details'
  $range = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($rowCount + 2, $colCount))
  # Force every column to Text format BEFORE we write data. The sproc
  # returns account values like "1000000.142000" (string nchar) but
  # Excel's Value2 setter happily auto-converts those to numbers,
  # which silently drops trailing zeros after the decimal. Set "@"
  # (text format) on the full range first to preserve the strings.
  # The analyzer reads values as text anyway, so this doesn't break
  # downstream parsing.
  $range.NumberFormat = '@'
  $range.Value2 = $data
  # Light formatting that mirrors the RR export
  $ws.Range($ws.Cells.Item(2, 1), $ws.Cells.Item(2, $colCount)).Font.Bold = $true
  $ws.Columns.AutoFit() | Out-Null
  $wb.SaveAs($OutFile, 51) | Out-Null   # 51 = xlOpenXMLWorkbook (.xlsx)
  $wb.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

Write-Output "Wrote $OutFile ($rowCount data rows)"
