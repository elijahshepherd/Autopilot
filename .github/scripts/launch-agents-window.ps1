$exe = Join-Path $PSScriptRoot 'Agents.exe'
if (-not (Test-Path $exe)) {
	$fallback = Join-Path $PSScriptRoot 'Autopilot.exe'
	if (Test-Path $fallback) {
		$exe = $fallback
	} else {
		Write-Error 'Agents.exe not found'
		exit 1
	}
}
$argList = @('--agents')
Start-Process -FilePath $exe -ArgumentList $argList -Verb RunAs
