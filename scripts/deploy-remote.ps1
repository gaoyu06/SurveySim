param(
  [string]$RemoteHost = "155.117.82.8",
  [string]$User = "root",
  [string]$TargetDir = "/home/disk/formagents",
  [string]$ProcessName = "formagents",
  [switch]$SkipEnvSync
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sshTarget = "$User@$RemoteHost"
$localEnvPath = Join-Path $repoRoot "backend/.env"

function Invoke-RemoteCommand {
  param([string]$Command)

  & ssh -o StrictHostKeyChecking=accept-new $sshTarget $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Remote command failed: $Command"
  }
}

Write-Host "==> Preparing remote directories on ${sshTarget}:${TargetDir}" -ForegroundColor Cyan
Invoke-RemoteCommand @"
set -e
mkdir -p $TargetDir
mkdir -p /home/disk/deploy-backups
mkdir -p $TargetDir/backend/storage/runtime
mkdir -p $TargetDir/backend/storage/uploads
mkdir -p $TargetDir/backend/storage/exports
mkdir -p $TargetDir/backend/storage/reports
if [ -f $TargetDir/backend/.env ]; then
  cp $TargetDir/backend/.env /home/disk/deploy-backups/formagents-backend.env.`$(date +%Y%m%d-%H%M%S)
fi
"@

Write-Host "==> Syncing source code" -ForegroundColor Cyan
Push-Location $repoRoot
$tempArchive = $null
try {
  $tempArchive = Join-Path ([System.IO.Path]::GetTempPath()) ("formagents-deploy-" + [System.Guid]::NewGuid().ToString("N") + ".tgz")

  & tar -czf $tempArchive `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=frontend/dist `
    --exclude=backend/dist `
    --exclude=shared/dist `
    --exclude=backend/.env `
    --exclude=backend/storage/runtime `
    --exclude=backend/storage/uploads `
    --exclude=backend/storage/exports `
    --exclude=backend/storage/reports `
    --exclude=backend_survey_refs.csv `
    .

  if ($LASTEXITCODE -ne 0) {
    throw "Archive creation failed"
  }

  & scp $tempArchive "${sshTarget}:${TargetDir}/.deploy-package.tgz"
  if ($LASTEXITCODE -ne 0) {
    throw "Archive upload failed"
  }

  Invoke-RemoteCommand "cd $TargetDir && tar -xzf .deploy-package.tgz && rm -f .deploy-package.tgz"
}
finally {
  if ($tempArchive -and (Test-Path $tempArchive)) {
    Remove-Item -LiteralPath $tempArchive -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}

if (-not $SkipEnvSync -and (Test-Path $localEnvPath)) {
  Write-Host "==> Uploading backend/.env" -ForegroundColor Cyan
  & scp $localEnvPath "${sshTarget}:${TargetDir}/backend/.env"
  if ($LASTEXITCODE -ne 0) {
    throw "backend/.env upload failed"
  }
}
elseif (-not (Test-Path $localEnvPath)) {
  Write-Warning "Local backend/.env not found, keeping remote env as-is."
}

Write-Host "==> Installing dependencies, migrating database, building, and restarting PM2" -ForegroundColor Cyan
Invoke-RemoteCommand @"
set -e
cd $TargetDir
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:push
pnpm build
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 delete $ProcessName >/dev/null 2>&1 || true
pm2 start dist/index.js --name $ProcessName --cwd $TargetDir/backend
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
curl -fsS http://127.0.0.1:3123/api/health
echo
"@

Write-Host "==> Deployment completed successfully" -ForegroundColor Green
Write-Host "Target: ${sshTarget}:${TargetDir}" -ForegroundColor Green
Write-Host "PM2 process: $ProcessName" -ForegroundColor Green
