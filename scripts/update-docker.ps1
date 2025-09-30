# PowerShell script for clean Docker Desktop update
param(
    [switch]$Force = $false
)

Write-Host "🔄 Docker Desktop Clean Update Script" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Check current version
Write-Host "📊 Current Docker version:" -ForegroundColor Yellow
try {
    $currentVersion = docker --version
    Write-Host $currentVersion -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found or not running" -ForegroundColor Red
}

# Function to stop Docker services safely
function Stop-DockerServices {
    Write-Host "🛑 Stopping Docker services..." -ForegroundColor Yellow

    # Stop all running containers
    $containers = docker ps -q
    if ($containers) {
        Write-Host "Stopping running containers..." -ForegroundColor Gray
        docker stop $containers | Out-Null
    }

    # Stop Docker Desktop
    $dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if ($dockerProcess) {
        Write-Host "Stopping Docker Desktop..." -ForegroundColor Gray
        $dockerProcess | Stop-Process -Force
        Start-Sleep -Seconds 5
    }
}

# Function to update using winget
function Update-WithWinget {
    Write-Host "📦 Attempting update with winget..." -ForegroundColor Yellow
    try {
        # Check if winget is available
        $wingetVersion = winget --version
        Write-Host "Winget version: $wingetVersion" -ForegroundColor Gray

        # Update Docker Desktop
        $result = winget upgrade --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Docker Desktop updated successfully via winget" -ForegroundColor Green
            return $true
        } else {
            Write-Host "⚠️ Winget update failed" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "⚠️ Winget not available or failed: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

# Function to download and install manually
function Update-Manually {
    Write-Host "📥 Downloading latest Docker Desktop..." -ForegroundColor Yellow

    $url = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
    $output = "DockerDesktopInstaller.exe"

    try {
        # Download installer
        Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
        Write-Host "✅ Download completed" -ForegroundColor Green

        # Run installer
        Write-Host "🔧 Installing Docker Desktop..." -ForegroundColor Yellow
        $process = Start-Process -FilePath $output -ArgumentList "install", "--quiet" -Wait -PassThru

        if ($process.ExitCode -eq 0) {
            Write-Host "✅ Installation completed successfully" -ForegroundColor Green
            Remove-Item $output -Force
            return $true
        } else {
            Write-Host "❌ Installation failed with exit code $($process.ExitCode)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Manual update failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to wait for Docker to be ready
function Wait-ForDocker {
    Write-Host "⏳ Waiting for Docker to be ready..." -ForegroundColor Yellow

    $maxAttempts = 12
    $attempt = 0

    do {
        $attempt++
        Start-Sleep -Seconds 5

        try {
            docker version | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Docker is ready!" -ForegroundColor Green
                return $true
            }
        } catch {
            # Continue waiting
        }

        Write-Host "🔄 Attempt $attempt/$maxAttempts - Still waiting..." -ForegroundColor Gray
    } while ($attempt -lt $maxAttempts)

    Write-Host "❌ Docker failed to start after $maxAttempts attempts" -ForegroundColor Red
    return $false
}

# Main execution
try {
    # Stop Docker services
    Stop-DockerServices

    # Try winget first
    $wingetSuccess = Update-WithWinget

    # If winget failed, try manual download
    if (-not $wingetSuccess) {
        Write-Host "🔄 Falling back to manual download..." -ForegroundColor Yellow
        $manualSuccess = Update-Manually

        if (-not $manualSuccess) {
            Write-Host "❌ All update methods failed" -ForegroundColor Red
            Write-Host "Please manually download from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
            exit 1
        }
    }

    # Wait for Docker to be ready
    if (-not (Wait-ForDocker)) {
        Write-Host "❌ Docker failed to start after update" -ForegroundColor Red
        exit 1
    }

    # Show new version
    Write-Host "📊 Updated Docker version:" -ForegroundColor Yellow
    $newVersion = docker --version
    $composeVersion = docker-compose --version
    Write-Host $newVersion -ForegroundColor Green
    Write-Host $composeVersion -ForegroundColor Green

    # Clean up Docker system
    Write-Host "🧹 Cleaning up Docker system..." -ForegroundColor Yellow
    docker system prune -f | Out-Null
    Write-Host "✅ Docker system cleaned" -ForegroundColor Green

    Write-Host ""
    Write-Host "✅ Docker Desktop update completed successfully!" -ForegroundColor Green
    Write-Host "🚀 You can now run your Docker setup:" -ForegroundColor Cyan
    Write-Host "   .\scripts\setup-docker.bat" -ForegroundColor White

} catch {
    Write-Host "❌ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}