#!/bin/bash
# Linux/macOS setup script for Docker

set -e  # Exit on any error

echo "🐳 AI Container Docker Setup Script"
echo "===================================="

# Check if Docker is running
if ! docker version >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi
echo "✅ Docker is running"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📋 Creating .env file from template..."
    cp .env.docker .env
    echo "⚠️  Please edit .env file with your actual credentials"
    echo "    Then run this script again"
    exit 1
fi
echo "✅ Environment file exists"

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"

# Start PostgreSQL first
echo "🗄️  Starting PostgreSQL..."
docker-compose up -d postgres

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10
docker-compose exec postgres pg_isready -U postgres
echo "✅ PostgreSQL is ready"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run migrations
echo "📋 Running database migrations..."
npx prisma migrate deploy
echo "✅ Migrations completed"

# Seed database (optional)
read -p "🌱 Do you want to seed the database with sample data? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Seeding database..."
    npm run db:seed
fi

# Start all services
echo "🚀 Starting all services..."
docker-compose up -d

# Check status
echo "📊 Checking service status..."
docker-compose ps

echo ""
echo "✅ Setup complete!"
echo "🌐 Application: http://localhost:3000"
echo "🗄️  pgAdmin: http://localhost:5050 (admin@example.com / admin)"
echo ""
echo "📝 Useful commands:"
echo "  docker-compose logs -f     # View logs"
echo "  docker-compose restart app # Restart application"
echo "  docker-compose down        # Stop all services"