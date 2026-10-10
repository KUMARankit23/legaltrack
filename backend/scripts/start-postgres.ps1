$data = Join-Path $env:LOCALAPPDATA 'provakil-pg'
$pg = 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
if (-not (Test-Path $data)) {
  Write-Error "Database directory not found: $data"
  exit 1
}
& $pg -D $data status | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Postgres already running on 127.0.0.1:5434"
  exit 0
}
& $pg -D $data -l (Join-Path $data 'server.log') -o "-p 5434 -h 127.0.0.1" start
exit $LASTEXITCODE
