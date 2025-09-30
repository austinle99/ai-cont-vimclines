#!/bin/bash

# Deploy with Docker Compose
echo "🚀 Deploying AI Container app with Docker Compose..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📋 Creating .env file from .env.docker template..."
    cp .env.docker .env
    echo "⚠️  Please update the .env file with your actual values before running again"
    exit 1
fi

# Build and start services
echo "🔨 Building and starting services..."
docker-compose down --remove-orphans
docker-compose build --no-cache
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
docker-compose exec -T postgres pg_isready -U postgres

# Check service status
echo "📊 Service status:"
docker-compose ps

echo "✅ Deployment complete!"
echo "🌐 Application: http://localhost:3000"
echo "🗄️  pgAdmin: http://localhost:5050 (admin@example.com / admin)"