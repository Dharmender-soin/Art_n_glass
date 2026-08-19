# ============================================
# Art N Glass - APK Build Script
# Run karo: .\build-apk.ps1
# Codex se changes ke baad yeh script chalao
# ============================================

$ErrorActionPreference = "Stop"
$JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:JAVA_HOME = $JAVA_HOME
$env:PATH = "$JAVA_HOME\bin;$env:PATH"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Art N Glass - APK Builder" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Web Build
Write-Host "[1/3] Web build chal raha hai (Vite)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web build fail ho gaya!" -ForegroundColor Red
    exit 1
}
Write-Host "[1/3] Web build DONE!" -ForegroundColor Green
Write-Host ""

# Step 2: Capacitor Sync
Write-Host "[2/3] Capacitor sync ho raha hai..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Capacitor sync fail ho gaya!" -ForegroundColor Red
    exit 1
}
Write-Host "[2/3] Capacitor sync DONE!" -ForegroundColor Green
Write-Host ""

# Step 3: APK Build
Write-Host "[3/3] APK build ho raha hai (Gradle)..." -ForegroundColor Yellow
Set-Location android
.\gradlew assembleDebug
if ($LASTEXITCODE -ne 0) {
    Set-Location ..
    Write-Host "ERROR: APK build fail ho gaya!" -ForegroundColor Red
    exit 1
}
Set-Location ..

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "APK yahan hai:" -ForegroundColor Cyan
Write-Host "  android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor White
Write-Host ""

# APK ka size dikhao
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 2)
    Write-Host "APK Size: $size MB" -ForegroundColor Cyan
    Write-Host "Build Time: $(Get-Date -Format 'dd-MM-yyyy HH:mm:ss')" -ForegroundColor Cyan
}
Write-Host ""
