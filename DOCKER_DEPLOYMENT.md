# 🐳 Docker Deployment Guide cho Mini Server

## Bước 1: Backup Data Hiện Tại (Quan trọng!)

```bash
# SSH vào mini server
ssh user@your-server-ip

# Navigate to project directory
cd /path/to/ai-cont-vimclines

# Backup database
docker exec ai-cont-postgres pg_dump -U postgres ai_cont_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup .env file
cp .env .env.backup

# Optional: Backup entire postgres volume
docker run --rm -v ai-cont-vimclines_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_volume_backup.tar.gz /data
```

## Bước 2: Pull Latest Code

```bash
# Pull latest changes from git
git pull origin main

# Hoặc nếu không dùng git, upload files mới lên server:
# scp -r ./app/api/iship-data user@server:/path/to/ai-cont-vimclines/app/api/
# scp -r ./app/api/longstay-analysis user@server:/path/to/ai-cont-vimclines/app/api/
# scp -r ./app/longstay user@server:/path/to/ai-cont-vimclines/app/
# scp -r ./lib/ml/longstayPredictionService.ts user@server:/path/to/ai-cont-vimclines/lib/ml/
# scp ./prisma/schema.prisma user@server:/path/to/ai-cont-vimclines/prisma/
# scp ./components/Sidebar.tsx user@server:/path/to/ai-cont-vimclines/components/

# Verify files updated
ls -la app/api/iship-data/
ls -la app/api/longstay-analysis/
ls -la app/longstay/
```

## Bước 3: Stop Containers

```bash
# Stop running containers (giữ nguyên data)
docker-compose down

# Verify stopped
docker ps
```

## Bước 4: Rebuild Docker Image

```bash
# Rebuild app container với code mới
docker-compose build --no-cache app

# Nếu có issues, rebuild tất cả:
# docker-compose build --no-cache
```

**Output mong đợi:**
```
[+] Building 120.5s (18/18) FINISHED
 => [internal] load build definition
 => [internal] load .dockerignore
 => [deps 1/3] RUN apk add --no-cache libc6-compat
 => [deps 2/3] COPY package.json package-lock.json* ./
 => [deps 3/3] COPY prisma ./prisma
 => [deps 4/3] RUN npm ci
 => [builder 1/4] COPY --from=deps /app/node_modules ./node_modules
 => [builder 2/4] COPY . .
 => [builder 3/4] RUN npx prisma generate    # ← Schema mới được generate
 => [builder 4/4] RUN npm run build
 => exporting to image
 => => naming to docker.io/library/ai-cont-vimclines-app
```

## Bước 5: Start Containers

```bash
# Start all containers
docker-compose up -d

# -d: detached mode (chạy background)
```

**Prisma migration sẽ tự động chạy** khi container start (config trong docker-compose.yml line 42):
```yaml
command: >
  sh -c "
    npx prisma migrate deploy &&    # ← Apply migrations
    npx prisma db seed &&
    node server.js
  "
```

## Bước 6: Monitor Logs

```bash
# Xem logs real-time
docker-compose logs -f app

# Hoặc chỉ xem 50 dòng cuối
docker-compose logs --tail=50 app
```

**Tìm những dòng này để verify success:**
```
✅ Prisma migration completed
✅ Applied migration: 20251124040230_add_longstay_iship_features
✅ Database connected
🚀 Server running on port 3000
```

Nếu thấy error, dừng và fix issue trước khi tiếp tục.

## Bước 7: Verify Database Tables

```bash
# Check new tables created
docker exec -it ai-cont-postgres psql -U postgres -d ai_cont_db -c "
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
"
```

**Expected tables:**
```
        tablename
------------------------
 Alert
 Booking
 Comment
 ContainerTracking       ← NEW
 Inventory
 IShipData               ← NEW
 KPI
 LongstayAnalysis        ← NEW
 LongstayMLData          ← NEW
 MLTrainingData
 Proposal
 SuggestionFeedback
 _prisma_migrations
```

## Bước 8: Test API Endpoints

### Test 1: Health Check
```bash
curl http://localhost:3000/api/iship-data
```

**Expected:**
```json
{
  "status": "ok",
  "message": "iShip Data API is accessible",
  "endpoint": "/api/iship-data",
  "method": "POST",
  "description": "Accepts container data scraped from iShip via Power Automate Desktop"
}
```

### Test 2: POST Sample Data
```bash
curl -X POST http://localhost:3000/api/iship-data \
  -H "Content-Type: application/json" \
  -d '[
    {
      "containerNo": "DEMO0001",
      "containerType": "40HC",
      "emptyLaden": "empty",
      "depot": "Cat Lai Depot",
      "gateInDate": "2025-01-10T08:00:00Z",
      "currentStatus": "In Storage"
    },
    {
      "containerNo": "DEMO0002",
      "containerType": "20GP",
      "emptyLaden": "empty",
      "depot": "Hai Phong Depot",
      "gateInDate": "2025-01-05T10:00:00Z",
      "currentStatus": "Awaiting Pickup"
    }
  ]'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "iShip data processed successfully",
  "results": {
    "success": 2,
    "updated": 0,
    "failed": 0,
    "errors": [],
    "containerIds": ["clx...", "clx..."],
    "longstayAlerts": []
  },
  "processingTime": 1250,
  "timestamp": "2025-01-24T..."
}
```

### Test 3: Query Longstay Analysis
```bash
curl http://localhost:3000/api/longstay-analysis
```

**Expected:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "containerNo": "DEMO0001",
      "currentDwellDays": 14,
      "longstayRiskScore": 45.5,
      "riskLevel": "medium",
      "containerTracking": {
        "containerType": "40HC",
        "currentLocation": "Cat Lai Depot"
      }
    }
  ],
  "stats": {
    "total": 2,
    "critical": 0,
    "high": 0,
    "medium": 1,
    "low": 1
  }
}
```

## Bước 9: Test Dashboard

### From Server (curl)
```bash
curl -I http://localhost:3000/longstay
```

**Expected:**
```
HTTP/1.1 200 OK
Content-Type: text/html
...
```

### From Browser (External Access)

**Option A: SSH Tunnel**
```bash
# Từ máy local
ssh -L 3000:localhost:3000 user@your-server-ip

# Sau đó mở browser:
http://localhost:3000/longstay
```

**Option B: Server Public IP** (nếu đã config firewall)
```
http://your-server-ip:3000/longstay
```

**Dashboard phải hiển thị:**
- ✅ Statistics cards (Total containers, Critical, Costs, Savings)
- ✅ Location breakdown
- ✅ Filters (Risk Level, Location, Search)
- ✅ Container table với 2 demo containers
- ✅ Không có console errors (F12)

## Bước 10: Production Configuration

### Update Environment Variables

```bash
# Edit .env
nano .env
```

Thêm/update những settings này:

```bash
# Node Environment
NODE_ENV=production

# Database
DATABASE_URL="postgresql://postgres:your_secure_password@postgres:5432/ai_cont_db"
DIRECT_URL="postgresql://postgres:your_secure_password@postgres:5432/ai_cont_db"

# API Security
ISHIP_API_KEY=your_random_secure_key_here_32chars

# Longstay Settings
LONGSTAY_THRESHOLD_DAYS=14
LONGSTAY_CRITICAL_DAYS=21
DAILY_STORAGE_COST=5
RELOCATION_COST=200
URGENT_PICKUP_COST=150

# Email Alerts (optional)
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_FROM=noreply@your-domain.com
ALERT_EMAIL_TO=ops@your-domain.com,manager@your-domain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Performance
MAX_CONTAINERS_PER_REQUEST=100
CACHE_TTL_SECONDS=300

# Logging
LOG_LEVEL=info
LOG_FILE=/app/logs/app.log
```

### Restart với new env vars

```bash
docker-compose down
docker-compose up -d
```

## Bước 11: Setup Auto-restart

```bash
# Ensure containers restart on server reboot
docker-compose up -d

# Verify restart policy
docker inspect ai-cont-app | grep -A 3 RestartPolicy
```

**Expected:**
```json
"RestartPolicy": {
  "Name": "unless-stopped",
  "MaximumRetryCount": 0
}
```

## Bước 12: Setup Log Rotation (Optional)

```bash
# Create log config
sudo nano /etc/logrotate.d/docker-containers

# Add:
/var/lib/docker/containers/*/*.log {
  rotate 7
  daily
  compress
  missingok
  delaycompress
  copytruncate
}

# Test
sudo logrotate -f /etc/logrotate.d/docker-containers
```

## Bước 13: Monitoring Setup

### Create monitoring script

```bash
nano ~/monitor-containers.sh
```

```bash
#!/bin/bash
# Container Health Monitor

CONTAINERS=("ai-cont-app" "ai-cont-postgres" "ai-cont-pgadmin")
WEBHOOK_URL="your-slack-webhook-url"  # Optional

for container in "${CONTAINERS[@]}"; do
  if ! docker ps | grep -q $container; then
    echo "⚠️ $container is DOWN!"
    # Send alert
    curl -X POST $WEBHOOK_URL \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"Container $container is DOWN on $(hostname)\"}"

    # Try to restart
    docker start $container
  else
    echo "✅ $container is running"
  fi
done

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
  echo "⚠️ Disk usage is ${DISK_USAGE}%"
fi

# Check memory
FREE_MEM=$(free -m | awk 'NR==2 {print $7}')
if [ $FREE_MEM -lt 500 ]; then
  echo "⚠️ Low memory: ${FREE_MEM}MB free"
fi
```

```bash
# Make executable
chmod +x ~/monitor-containers.sh

# Add to crontab (chạy mỗi 5 phút)
crontab -e

# Add line:
*/5 * * * * ~/monitor-containers.sh >> ~/monitor.log 2>&1
```

## Bước 14: Performance Tuning

### PostgreSQL Optimization

```bash
# Edit postgres config (optional)
docker exec -it ai-cont-postgres bash

# Inside container:
echo "max_connections = 100" >> /var/lib/postgresql/data/postgresql.conf
echo "shared_buffers = 256MB" >> /var/lib/postgresql/data/postgresql.conf
echo "effective_cache_size = 1GB" >> /var/lib/postgresql/data/postgresql.conf
echo "maintenance_work_mem = 64MB" >> /var/lib/postgresql/data/postgresql.conf

exit

# Restart postgres
docker-compose restart postgres
```

### Limit Docker Resources (if mini server has limited RAM)

Edit `docker-compose.yml`:

```yaml
services:
  postgres:
    # ... existing config
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  app:
    # ... existing config
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

## Troubleshooting Common Issues

### Issue 1: Migration Fails

**Symptoms:**
```
Error: P3009: migrate found failed migrations in the target database
```

**Solution:**
```bash
# Enter app container
docker exec -it ai-cont-app sh

# Check migration status
npx prisma migrate status

# If needed, resolve manually
npx prisma migrate resolve --applied "20251124040230_add_longstay_iship_features"

# Or force reset (⚠️ ONLY if database is empty or you have backup)
npx prisma migrate reset --force

exit
```

### Issue 2: Container Keeps Restarting

```bash
# Check logs
docker-compose logs --tail=100 app

# Common causes:
# - Database connection failed
# - Port already in use
# - Migration error
# - Prisma generate failed

# Check if postgres is ready
docker exec ai-cont-postgres pg_isready -U postgres
```

### Issue 3: Cannot Access Dashboard from Browser

```bash
# Check if app is listening
docker exec ai-cont-app netstat -tuln | grep 3000

# Check firewall
sudo ufw status

# Open port if needed
sudo ufw allow 3000/tcp

# Or use nginx reverse proxy (recommended)
```

### Issue 4: Out of Disk Space

```bash
# Check disk usage
df -h

# Clean Docker images
docker image prune -a

# Clean stopped containers
docker container prune

# Clean volumes (⚠️ CAREFUL!)
docker volume prune

# Clean build cache
docker builder prune
```

## Bước 15: Setup Nginx Reverse Proxy (Recommended)

```bash
# Install nginx
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/ai-container
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or server IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ai-container /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Now access via:
# http://your-domain.com/longstay
```

## Bước 16: SSL Certificate (Optional)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run

# Now access via HTTPS:
# https://your-domain.com/longstay
```

## Daily Operations

### View Logs
```bash
docker-compose logs -f app
```

### Restart Services
```bash
docker-compose restart app
```

### Update Code
```bash
git pull origin main
docker-compose build --no-cache app
docker-compose up -d
```

### Backup Database
```bash
docker exec ai-cont-postgres pg_dump -U postgres ai_cont_db > backup_$(date +%Y%m%d).sql
```

### Check Status
```bash
docker-compose ps
docker stats
```

## Quick Reference Commands

```bash
# Start all
docker-compose up -d

# Stop all
docker-compose down

# Restart app only
docker-compose restart app

# View logs
docker-compose logs -f app

# Rebuild and restart
docker-compose up -d --build

# Enter app container
docker exec -it ai-cont-app sh

# Enter postgres container
docker exec -it ai-cont-postgres psql -U postgres -d ai_cont_db

# Check container stats
docker stats

# Cleanup
docker system prune -a
```

---

**Deployment Complete! 🎉**

Dashboard URL: http://your-server-ip:3000/longstay
