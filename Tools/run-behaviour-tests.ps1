<#
    run-behaviour-tests.ps1 -- run every Tools/test-*.js the way CI runs them.

    WHY THIS EXISTS (UI-195, 2026-09-14).

    The behaviour suite was already wired: check-js-syntax.yml carries a step
    "Behaviour tests (Tools/test-*.js)" that globs the directory, runs each file
    with node, fails on the first non-zero exit, and refuses to pass vacuously
    when the glob matches nothing. Measured on run 34863020982 (main ea99ced):
    "ran 32 behaviour test file(s)", 32 distinct files in the log, conclusion
    success. So CI was never the gap.

    The gap was LOCAL. Node is not on this box's PATH -- it exists only inside
    the Actions runner's bundled toolchain -- so running the suite before a push
    meant remembering a 55-character path. A gate you can only exercise by
    pushing is a gate with a feedback loop measured in minutes.

    WHAT IT ASSERTS, AND WHY EACH GUARD IS HERE

    * A glob that matches nothing must FAIL, not pass. A suite that has vanished
      is a failure, not an absence of failures. CI's step says the same thing in
      the same words; this is the local half of that rule.
    * It runs EVERY file and reports all failures, rather than stopping at the
      first. The CI step stops at the first by design (fast signal on a shared
      runner); locally the useful thing is the whole picture in one pass.
    * The exit code is the product. Piping a command whose status you are
      gating on is how HK-8 shipped a merge past a red check, so nothing here
      is piped -- $LASTEXITCODE is read immediately after each invocation.

    ASCII ONLY, DELIBERATELY. PowerShell 5.1 reads script files as cp1252; an
    em-dash in a string literal breaks parsing. Same reason start-all.ps1 is
    pure ASCII.

    USAGE
        powershell -ExecutionPolicy Bypass -File Tools\run-behaviour-tests.ps1
        powershell -ExecutionPolicy Bypass -File Tools\run-behaviour-tests.ps1 -Filter tools-grant

    EXIT CODES
        0  every test file exited 0
        1  at least one test failed, or the glob matched nothing, or no node
#>

[CmdletBinding()]
param(
    # Substring match against the file name, so -Filter txv runs the three
    # test-txv-*.js files. Omit to run everything.
    [string] $Filter = '',

    # Explicit node path, for a box whose layout differs from this one.
    [string] $NodeExe = ''
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- find node
# Order matters: an explicit argument wins, then a real PATH entry (a box that
# has node installed properly should use it), then the runner's bundled copy.
# The bundled path is globbed rather than hard-coded because the runner version
# moves on its own schedule and a hard-coded 2.337.0 would rot silently.
function Resolve-NodeExe {
    param([string] $Explicit)

    if ($Explicit) {
        if (Test-Path $Explicit) { return (Resolve-Path $Explicit).Path }
        throw "-NodeExe was given as '$Explicit' but nothing is there."
    }

    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $bundled = Get-ChildItem -Path 'C:\actions-runner\externals.*\node*\bin\node.exe' `
                             -ErrorAction SilentlyContinue |
               Sort-Object FullName -Descending |
               Select-Object -First 1
    if ($bundled) { return $bundled.FullName }

    return $null
}

$node = Resolve-NodeExe -Explicit $NodeExe
if (-not $node) {
    Write-Host 'FAIL  no node found.' -ForegroundColor Red
    Write-Host '      Not on PATH, and nothing matched C:\actions-runner\externals.*\node*\bin\node.exe'
    Write-Host '      Pass one explicitly:  -NodeExe C:\path\to\node.exe'
    exit 1
}

$nodeVersion = & $node --version
Write-Host ("node {0}  ({1})" -f $nodeVersion, $node) -ForegroundColor DarkGray

# ------------------------------------------------------------- collect tests
# Anchored to this script's own directory so the suite runs the same whatever
# the caller's working directory is. The tests themselves resolve their targets
# relative to their own location, so the process working directory is set to
# Tools/ for the same reason CI's `node Tools/test-x.js` works from the root:
# each test builds paths from __dirname, not from cwd.
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tests = Get-ChildItem -Path (Join-Path $toolsDir 'test-*.js') -File -ErrorAction SilentlyContinue |
         Sort-Object Name

if ($Filter) {
    $tests = $tests | Where-Object { $_.Name -like "*$Filter*" }
}

# A glob matching nothing is a failure, not a pass. Without this the script
# would print a cheerful green zero and exit 0 on a directory that had been
# emptied or renamed, which is precisely the shape of fake-green this suite
# exists to prevent.
if (-not $tests -or $tests.Count -eq 0) {
    if ($Filter) {
        Write-Host ("FAIL  no Tools/test-*.js matched filter '{0}'." -f $Filter) -ForegroundColor Red
    } else {
        Write-Host 'FAIL  no Tools/test-*.js found. The suite has vanished, which is itself a failure.' -ForegroundColor Red
    }
    exit 1
}

# ------------------------------------------------------------------ run them
$failed = @()
$passed = 0

foreach ($t in $tests) {
    # Not piped. $LASTEXITCODE after a pipeline carries the LAST element's
    # status, which is how a red gate reported green once already.
    $output = & $node $t.FullName 2>&1
    $code = $LASTEXITCODE

    if ($code -eq 0) {
        $passed++
        Write-Host ("  ok    {0}" -f $t.Name) -ForegroundColor Green
    } else {
        $failed += $t.Name
        Write-Host ("  FAIL  {0}  (exit {1})" -f $t.Name, $code) -ForegroundColor Red
        # Only a failing test gets its output printed. Thirty-two passing
        # suites of chatter is noise; the one that broke is the signal.
        $output | ForEach-Object { Write-Host ("        {0}" -f $_) }
    }
}

# ------------------------------------------------------------------- verdict
Write-Host ''
Write-Host ("ran {0} behaviour test file(s): {1} passed, {2} failed" -f $tests.Count, $passed, $failed.Count)

if ($failed.Count -gt 0) {
    Write-Host ('FAILED: ' + ($failed -join ' ')) -ForegroundColor Red
    exit 1
}

exit 0
