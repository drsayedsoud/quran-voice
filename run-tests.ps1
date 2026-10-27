# Automated Test Runner for Quran Voice PWA
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$rootDir = (Get-Location).Path.Replace('\', '/')
$testFileUrl = "file:///$rootDir/tests.html"

# 1. Locate Chrome or Edge
$browserPath = $null
$possiblePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

foreach ($p in $possiblePaths) {
    if (Test-Path $p) {
        $browserPath = $p
        break
    }
}

if (-not $browserPath) {
    Write-Host "ERROR: Chrome or Edge executable not found." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   Automated Test Suite for Quran Voice PWA (447 Tests)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Executing tests via headless browser: $browserPath" -ForegroundColor Yellow

$tempUserData = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "quran_test_profile_" + [System.Guid]::NewGuid().ToString())
$dumpFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "quran_test_dump.html")

$cmdArgs = @(
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--disable-web-security",
    "--user-data-dir=`"$tempUserData`"",
    "--virtual-time-budget=25000",
    "--run-all-compositor-stages-before-draw",
    "--dump-dom",
    "`"$testFileUrl`""
) -join " "

try {
    Start-Process -FilePath $browserPath -ArgumentList $cmdArgs -RedirectStandardOutput $dumpFile -Wait -NoNewWindow
    $domOutput = Get-Content $dumpFile -Raw -Encoding UTF8
} finally {
    Remove-Item -Path $tempUserData -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
    Remove-Item -Path $dumpFile -Force -ErrorAction SilentlyContinue | Out-Null
}

$match = [regex]::Match($domOutput, '<div id="testOutputSummary"[^>]*>(.*?)</div>', [System.Text.RegularExpressions.RegexOptions]::Singleline)

if ($match.Success -and -not [string]::IsNullOrWhiteSpace($match.Groups[1].Value)) {
    $rawJson = $match.Groups[1].Value.Trim()
    try {
        $res = $rawJson | ConvertFrom-Json
        Write-Host ""
        Write-Host "RESULTS SUMMARY:" -ForegroundColor White
        Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
        Write-Host ("  TOTAL EXECUTED : " + $res.total) -ForegroundColor Cyan
        Write-Host ("  PASSED (SUCCESS): " + $res.passed) -ForegroundColor Green
        if ($res.failed -gt 0) {
            Write-Host ("  FAILED (ERRORS) : " + $res.failed) -ForegroundColor Red
        } else {
            Write-Host ("  FAILED (ERRORS) : 0") -ForegroundColor Green
        }
        Write-Host ("  EXECUTION TIME  : " + $res.durationMs + " ms") -ForegroundColor Yellow
        Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

        if ($res.failed -eq 0 -and $res.total -gt 0) {
            Write-Host "`nSUCCESS: All $($res.total) tests passed 100%! (ALL TESTS PASSED)`n" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "`nFAILURE: $($res.failed) test(s) failed:`n" -ForegroundColor Red
            if ($res.failures) {
                foreach ($f in $res.failures) {
                    Write-Host "  -> [$($f.suite)] $($f.test)" -ForegroundColor Red
                    Write-Host "     Error: $($f.error)" -ForegroundColor Yellow
                }
            }
            Write-Host ""
            exit 1
        }
    } catch {
        Write-Host "ERROR: Could not parse test summary JSON: $rawJson" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "ERROR: Could not find #testOutputSummary in browser DOM output. DOM length: $($domOutput.Length)" -ForegroundColor Red
    $statusMatch = [regex]::Match($domOutput, '<span id="progressStatus"[^>]*>(.*?)</span>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if ($statusMatch.Success) {
        Write-Host "Current Progress Status: $($statusMatch.Groups[1].Value)" -ForegroundColor Magenta
    }
    if ($match.Success) {
        Write-Host "Match succeeded but group value was empty: [$($match.Groups[1].Value)]" -ForegroundColor Yellow
        $divMatch = [regex]::Match($domOutput, '<div id="testOutputSummary"[^>]*>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($divMatch.Success) {
            Write-Host "Div tag: $($divMatch.Value)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Regex match did not succeed. Preview of DOM: $($domOutput.Substring(0, [Math]::Min(500, $domOutput.Length)))" -ForegroundColor Yellow
    }
    exit 1
}
