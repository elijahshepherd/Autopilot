# Joins split parts back into the original archives.
# Run: powershell -File join.ps1

$files = @(
    @{base="autopilot-win32-x64"; parts=4; ext="zip"},
    @{base="autopilot-darwin-arm64"; parts=4; ext="zip"},
    @{base="autopilot-darwin-x64"; parts=4; ext="zip"},
    @{base="autopilot-linux-x64"; parts=4; ext="tar.gz"}
)

foreach ($f in $files) {
    $out = "$($f.base).$($f.ext)"
    if (Test-Path $out) { Write-Host "$out exists, skipping" -ForegroundColor Yellow; continue }
    Write-Host "Joining $out..."
    $stream = [System.IO.File]::Create($out)
    foreach ($i in 1..$f.parts) {
        $part = "$($f.base).part$('{0:d3}' -f $i).$($f.ext)"
        $data = [System.IO.File]::ReadAllBytes($part)
        $stream.Write($data, 0, $data.Length)
    }
    $stream.Close()
    $size = (Get-Item $out).Length
    Write-Host "  Done ($size bytes)"
}

Write-Host "`nAll joined! Extract and run:"
Write-Host "  Windows: Expand-Archive autopilot-win32-x64.zip, run Autopilot.exe"
Write-Host "  macOS:   unzip autopilot-darwin-arm64.zip (or -x64), open Autopilot.app"
Write-Host "  Linux:   tar -xzf autopilot-linux-x64.tar.gz, ./autopilot"
