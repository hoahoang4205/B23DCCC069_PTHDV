$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot

function Stop-All {
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
}

function Wait-Url($url, $timeoutSec = 10) {
  $end = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $end) {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null; return $true }
    catch { Start-Sleep -Milliseconds 200 }
  }
  return $false
}

function Start-Bank($envStr) {
  Start-Process powershell -ArgumentList "-NoExit","-Command","$envStr node bank/index.js" -WorkingDirectory $root | Out-Null
  Wait-Url "http://localhost:4002/stats" | Out-Null
}

function Start-Fee {
  Start-Process powershell -ArgumentList "-NoExit","-Command","node fee-service/index.js" -WorkingDirectory $root | Out-Null
  Wait-Url "http://localhost:4001/debug/students" | Out-Null
}

function Post-Payment($amount) {
  $t = Measure-Command {
    $script:r = try {
      Invoke-WebRequest -Uri "http://localhost:4001/students/1/payments" -Method POST `
        -Body "{`"amount`":$amount}" -ContentType "application/json" -UseBasicParsing
    } catch { $_.Exception.Response }
  }
  $code = if ($script:r.StatusCode) { $script:r.StatusCode } else { $script:r.Status }
  return @{ Status = $code; Ms = [math]::Round($t.TotalMilliseconds) }
}

Write-Host "`n===== T1: Bank down =====" -ForegroundColor Cyan
Stop-All; Start-Fee
$r = Post-Payment 100000
Write-Host "Payment bank down: status=$($r.Status) ms=$($r.Ms)  (ky vong 503 <1500)"
$t = Measure-Command { Invoke-WebRequest "http://localhost:4001/students/1/fees" -UseBasicParsing | Out-Null }
Write-Host "GET /fees: $([math]::Round($t.TotalMilliseconds))ms (ky vong <300)"
Start-Bank ""; $r = Post-Payment 100000
Write-Host "Sau khi bat bank: status=$($r.Status)  (ky vong 201)"

Write-Host "`n===== T2: DELAY_MS=5000 =====" -ForegroundColor Cyan
Stop-All; Start-Bank "`$env:DELAY_MS=5000;"; Start-Fee
$r = Post-Payment 100000
Write-Host "Payment delay: status=$($r.Status) ms=$($r.Ms)  (ky vong 504 ~4500)"
node scripts/burst-20.js

Write-Host "`n===== T3: Keep-alive =====" -ForegroundColor Cyan
Stop-All; Start-Bank ""; Start-Fee
node scripts/load-200.js
Start-Sleep -Seconds 6
1..3 | ForEach-Object {
  $r = Post-Payment 1000
  Write-Host "  Sau idle: status=$($r.Status)"
}

Write-Host "`n===== T4a: DROP_RATE=0.3 =====" -ForegroundColor Cyan
Stop-All; Start-Bank "`$env:DROP_RATE=0.3;"; Start-Fee
node scripts/run-60.js

Write-Host "`n===== T4b: FAIL_RATE=0.3 =====" -ForegroundColor Cyan
Stop-All; Start-Bank "`$env:FAIL_RATE=0.3;"; Start-Fee
node scripts/run-60.js

Write-Host "`n===== T4c: 25 trieu =====" -ForegroundColor Cyan
Stop-All; Start-Bank ""; Start-Fee
$r = Post-Payment 25000000
Write-Host "Payment 25tr: status=$($r.Status)  (ky vong 402)"
$stats = Invoke-WebRequest "http://localhost:4002/stats" -UseBasicParsing | ConvertFrom-Json
Write-Host "Bank stats: requests=$($stats.requests) charges=$($stats.charges) duplicates=$($stats.duplicates)"

Write-Host "`nXONG. Stop: Get-Process node | Stop-Process -Force" -ForegroundColor Yellow