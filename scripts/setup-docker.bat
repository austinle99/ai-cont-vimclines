@echo off
REM Windows batch script for Docker setup
echo 🐳 AI Container Docker Setup Script
echo ====================================

REM Check if Docker is running
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker is running

REM Check if .env exists
if not exist .env (
    echo 📋 Creating .env file from template...
    copy .env.docker .env
    echo ⚠️  Please edit .env file with your actual credentials
    echo    Then run this script again
    pause
    exit /b 1
)

echo ✅ Environment file exists

REM Install dependencies
echo 📦 Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed

REM Start PostgreSQL first
echo 🗄️  Starting PostgreSQL...
docker-compose up -d postgres

REM Wait for PostgreSQL
echo ⏳ Waiting for PostgreSQL to be ready...
timeout /t 10 /nobreak > nul
docker-compose exec postgres pg_isready -U postgres
if %errorlevel% neq 0 (
    echo ❌ PostgreSQL failed to start
    pause
    exit /b 1
)

echo ✅ PostgreSQL is ready

REM Generate Prisma client
echo 🔧 Generating Prisma client...
npx prisma generate

REM Run migrations
echo 📋 Running database migrations...
npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo ❌ Migration failed
    pause
    exit /b 1
)

echo ✅ Migrations completed

REM Seed database (optional)
set /p seed="🌱 Do you want to seed the database with sample data? (y/n): "
if /i "%seed%"=="y" (
    echo 🌱 Seeding database...
    npm run db:seed
)

REM Start all services
echo 🚀 Starting all services...
docker-compose up -d

REM Check status
echo 📊 Checking service status...
docker-compose ps

echo.
echo ✅ Setup complete!
echo 🌐 Application: http://localhost:3000
echo 🗄️  pgAdmin: http://localhost:5050 (admin@example.com / admin)
echo.
echo 📝 Useful commands:
echo   docker-compose logs -f     # View logs
echo   docker-compose restart app # Restart application
echo   docker-compose down        # Stop all services
echo.
pause