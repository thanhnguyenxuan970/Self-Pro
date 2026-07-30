$maxAttempts = 15
$logDir = "$env:TEMP\claude\gradle-retry"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

for ($i = 1; $i -le $maxAttempts; $i++) {
    Write-Output "===== ATTEMPT $i of $maxAttempts ====="
    $logFile = "$logDir\attempt-$i.log"
    & .\gradlew.bat app:assembleDebug --console=plain *> $logFile
    $exitCode = $LASTEXITCODE
    Write-Output "Attempt $i exit code: $exitCode"
    if ($exitCode -eq 0) {
        Write-Output "BUILD SUCCEEDED on attempt $i"
        exit 0
    }
    $tailLines = Get-Content $logFile -Tail 5
    Write-Output "Last lines: $tailLines"
}

Write-Output "All $maxAttempts attempts failed"
exit 1
