@echo off
REM Clean and safe Docker Desktop update script for Windows
echo 🔄 Docker Desktop Clean Update Script
echo ===================================

echo 📊 Current Docker version:
docker --version
echo.

REM Check if Docker is running
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Docker is not running. Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo ⏳ Waiting for Docker to start...
    timeout /t 30 /nobreak > nul
)

echo ✅ Docker is running

REM Stop running containers to prevent conflicts
echo 🛑 Stopping all running containers...
for /f "tokens=1" %%i in ('docker ps -q') do docker stop %%i
echo ✅ All containers stopped

REM Check if winget is available
winget --version >nul 2>&1
if %errorlevel% equ 0 (
    echo 📦 Using winget to update Docker Desktop...
    echo 🔍 Checking for Docker Desktop updates...
    winget upgrade --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
    if %errorlevel% equ 0 (
        echo ✅ Docker Desktop updated successfully via winget
        goto :verify
    ) else (
        echo ⚠️  Winget update failed, trying alternative method...
    )
) else (
    echo ⚠️  Winget not available, using manual download method...
)

REM Alternative: Download latest version manually
echo 📥 Downloading latest Docker Desktop installer...
powershell -Command "& {
    $url = 'https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe'
    $output = 'DockerDesktopInstaller.exe'
    Write-Host 'Downloading Docker Desktop...'
    try {
        Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
        Write-Host 'Download completed successfully'
        exit 0
    } catch {
        Write-Host 'Download failed:' $_.Exception.Message
        exit 1
    }
}"

if %errorlevel% neq 0 (
    echo ❌ Download failed. Please manually download from https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo 🔧 Installing Docker Desktop update...
echo ⚠️  This will close Docker Desktop temporarily
DockerDesktopInstaller.exe install --quiet
if %errorlevel% neq 0 (
    echo ❌ Installation failed
    pause
    exit /b 1
)

echo 🧹 Cleaning up installer file...
del DockerDesktopInstaller.exe

:verify
echo ⏳ Waiting for Docker to restart...
timeout /t 30 /nobreak > nul

REM Wait for Docker to be ready
:wait_loop
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo 🔄 Waiting for Docker to be ready...
    timeout /t 5 /nobreak > nul
    goto :wait_loop
)

echo ✅ Docker is ready!

echo 📊 Updated Docker version:
docker --version
docker-compose --version
echo.

REM Clean up Docker system
echo 🧹 Cleaning up Docker system...
docker system prune -f
echo ✅ Docker system cleaned

echo.
echo ✅ Docker Desktop update completed successfully!
echo 📝 Summary:
echo   - Old version: (check terminal output above)
echo   - New version:
docker --version
echo   - Docker Compose:
docker-compose --version
echo.
echo 🚀 You can now run your Docker setup:
echo   scripts\setup-docker.bat
echo.
pause