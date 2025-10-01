#!/bin/bash

# Production Deployment Script
# Run this on your company server

set -e  # Exit on error

echo "🏢 AI Container App - Production Deployment"
echo "=========================================="

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
   echo "⚠️  This script should not be run as root directly"
   echo "Please run as regular user with sudo privileges"
   exit 1
fi

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. Please log out and back in, then run this script again."
    exit 0
fi

if ! command -v git &> /dev/null; then
    echo "❌ Git not found. Installing Git..."
    sudo apt-get update && sudo apt-get install -y git
fi

echo "✅ Prerequisites met"

# Get deployment directory
read -p "📁 Enter deployment directory [/opt/ai-cont-noapi]: " DEPLOY_DIR
DEPLOY_DIR=${DEPLOY_DIR:-/opt/ai-cont-noapi}

# Create directory if doesn't exist
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "📁 Creating deployment directory: $DEPLOY_DIR"
    sudo mkdir -p $DEPLOY_DIR
    sudo chown $USER:$USER $DEPLOY_DIR
fi

cd $DEPLOY_DIR

# Clone or pull repository
if [ ! -d ".git" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/austinle99/ai-cont-noapi.git .
else
    echo "🔄 Updating repository..."
    git pull origin main
fi

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "⚙️  Creating production environment file..."
    cp .env.docker .env.production

    # Generate secure password
    SECURE_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

    # Update .env.production
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$SECURE_PASSWORD/" .env.production
    sed -i "s/your-secure-password/$SECURE_PASSWORD/g" .env.production

    echo "✅ Generated secure database password"
    echo "⚠️  IMPORTANT: Save this password: $SECURE_PASSWORD"
    echo "⚠️  Environment file created at: $DEPLOY_DIR/.env.production"
    echo ""
    read -p "Press Enter to continue after you've saved the password..."
fi

# Create production docker-compose if doesn't exist
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "📝 Creating production docker-compose..."
    cp docker-compose.yml docker-compose.prod.yml

    # Modify for production (remove pgadmin, change ports)
    sed -i 's/0.0.0.0:3000:3000/80:3000/' docker-compose.prod.yml
    sed -i '/pgadmin:/,/^$/d' docker-compose.prod.yml
fi

# Load environment
export $(cat .env.production | grep -v '^#' | xargs)

echo "🔨 Building application..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for services to be ready..."
sleep 15

# Check if services are running
if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo "✅ Services started successfully!"
else
    echo "❌ Some services failed to start. Checking logs..."
    docker-compose -f docker-compose.prod.yml logs
    exit 1
fi

# Run database migrations
echo "📋 Running database migrations..."
docker-compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

# Set up automatic startup
echo "🔧 Setting up automatic startup..."
sudo tee /etc/systemd/system/ai-container-app.service > /dev/null <<EOF
[Unit]
Description=AI Container Management Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.prod.yml down
User=$USER
Group=$USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-container-app
echo "✅ Auto-start configured"

# Set up backup cron job
echo "💾 Setting up automatic backups..."
BACKUP_SCRIPT="$DEPLOY_DIR/backup.sh"

cat > $BACKUP_SCRIPT <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/ai-cont"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

cd /opt/ai-cont-noapi
docker-compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres ai_cont_db > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.sql"
EOF

chmod +x $BACKUP_SCRIPT

# Add to crontab if not already there
(crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT"; echo "0 2 * * * $BACKUP_SCRIPT") | crontab -
echo "✅ Daily backups configured (2 AM)"

# Configure firewall
echo "🔥 Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    echo "✅ UFW rules added"
elif command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
    echo "✅ Firewalld rules added"
fi

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "============================================"
echo "🎉 Deployment Complete!"
echo "============================================"
echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose.prod.yml ps
echo ""
echo "🌐 Access your application at:"
echo "   http://$SERVER_IP"
echo "   http://$(hostname)"
echo ""
echo "📝 Important Files:"
echo "   Configuration: $DEPLOY_DIR/.env.production"
echo "   Logs: docker-compose -f docker-compose.prod.yml logs -f app"
echo "   Backup script: $BACKUP_SCRIPT"
echo ""
echo "🔧 Useful Commands:"
echo "   Start:   docker-compose -f docker-compose.prod.yml up -d"
echo "   Stop:    docker-compose -f docker-compose.prod.yml down"
echo "   Logs:    docker-compose -f docker-compose.prod.yml logs -f"
echo "   Backup:  $BACKUP_SCRIPT"
echo ""
echo "✅ Application is now running in production mode!"
