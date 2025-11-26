# 🚀 Các bước tiếp theo để triển khai Longstay Feature

## ✅ Đã hoàn thành

### 1. Database Schema ✓
- Thêm 4 models mới vào [prisma/schema.prisma](prisma/schema.prisma):
  - `ContainerTracking`: Theo dõi container từ iShip
  - `LongstayAnalysis`: Kết quả phân tích và dự đoán
  - `IShipData`: Raw data từ iShip
  - `LongstayMLData`: Training data cho ML models
- Migration file đã được tạo: `prisma/migrations/20251124040230_add_longstay_iship_features/`

### 2. API Endpoints ✓
- **POST [/api/iship-data](app/api/iship-data/route.ts)**: Nhận dữ liệu từ PAD
- **GET/POST [/api/longstay-analysis](app/api/longstay-analysis/route.ts)**: Query và trigger analysis

### 3. ML Service ✓
- [lib/ml/longstayPredictionService.ts](lib/ml/longstayPredictionService.ts): Prediction service với 15+ features

### 4. Dashboard ✓
- [app/longstay/page.tsx](app/longstay/page.tsx): Interactive dashboard
- Đã thêm menu "Longstay" vào [Sidebar](components/Sidebar.tsx)

### 5. Documentation ✓
- [ISHIP_PAD_INTEGRATION.md](docs/ISHIP_PAD_INTEGRATION.md): Hướng dẫn PAD chi tiết
- [LONGSTAY_FEATURE_README.md](docs/LONGSTAY_FEATURE_README.md): Tài liệu tổng quan

---

## 📋 Cần làm ngay (Production Deployment)

### Bước 1: Apply Database Migration

```bash
cd "c:\Users\LêNgọcMinh\Downloads\ai-cont-vimclines"

# Option A: Development (tạo và apply migration)
npx prisma migrate dev

# Option B: Production (chỉ apply migration đã tạo)
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

**⚠️ Quan trọng:** Backup database trước khi chạy migration!

```bash
# Backup PostgreSQL database
pg_dump -U postgres -d ai_cont_db > backup_before_longstay_$(date +%Y%m%d).sql
```

### Bước 2: Restart Development Server

```bash
# Stop current server (Ctrl+C)

# Clear Next.js cache
rm -rf .next

# Reinstall dependencies (nếu cần)
npm install

# Start development server
npm run dev
```

### Bước 3: Verify Installation

Mở browser và kiểm tra:

1. **Dashboard**: http://localhost:3000/longstay
   - Xem có load được không (ban đầu sẽ trống)

2. **API Health Check**:
   ```bash
   # Test iShip data endpoint
   curl http://localhost:3000/api/iship-data
   # Should return: {"status":"ok","message":"iShip Data API is accessible"...}

   # Test longstay analysis endpoint
   curl http://localhost:3000/api/longstay-analysis
   # Should return: {"success":true,"data":[]...}
   ```

3. **Database Tables**:
   ```bash
   npx prisma studio
   # Verify new tables: ContainerTracking, LongstayAnalysis, IShipData, LongstayMLData
   ```

### Bước 4: Test với Dummy Data

Tạo test data để verify flow hoạt động:

```bash
# Test POST data
curl -X POST http://localhost:3000/api/iship-data \
  -H "Content-Type: application/json" \
  -d '[
    {
      "containerNo": "TEST0001",
      "containerType": "40HC",
      "emptyLaden": "empty",
      "depot": "Cat Lai Depot",
      "gateInDate": "2025-01-05T08:00:00Z",
      "currentStatus": "In Storage"
    },
    {
      "containerNo": "TEST0002",
      "containerType": "20GP",
      "emptyLaden": "empty",
      "depot": "Hai Phong Depot",
      "gateInDate": "2025-01-10T10:00:00Z",
      "currentStatus": "Awaiting Pickup"
    }
  ]'
```

Sau đó refresh dashboard: http://localhost:3000/longstay

**Expected Result:**
- 2 containers hiển thị trong table
- Risk scores được tính
- Statistics cards cập nhật
- Location breakdown hiển thị 2 locations

---

## 🔧 Setup Power Automate Desktop

### Bước 1: Cài đặt PAD

1. Download từ: https://powerautomate.microsoft.com/desktop/
2. Cài đặt và đăng nhập bằng Microsoft account
3. Install browser extension (Edge hoặc Chrome)

### Bước 2: Tạo Flow Cơ Bản

**Quick Start Flow** (test đơn giản):

```plaintext
1. Set Variable
   Name: APIEndpoint
   Value: http://localhost:3000/api/iship-data

2. Set Variable
   Name: TestData
   Value: [{"containerNo":"PAD001","containerType":"40HC","emptyLaden":"empty","depot":"Test Depot"}]

3. Invoke Web Service
   URL: %APIEndpoint%
   Method: POST
   Content Type: application/json
   Request Body: %TestData%
   Output: Response

4. Display Message
   Message: %Response%
```

**Chạy flow** → Nếu thành công, bạn sẽ thấy response message!

### Bước 3: Tạo Full iShip Scraper

Follow chi tiết trong: [ISHIP_PAD_INTEGRATION.md](docs/ISHIP_PAD_INTEGRATION.md)

Các bước chính:
1. Launch browser → iShip URL
2. Login với credentials
3. Navigate to containers page
4. Filter empty containers
5. Loop và extract data
6. POST to API endpoint
7. Handle response và errors

### Bước 4: Schedule Automation

**Recommended Schedule:**

- **Development/Testing**: Manual trigger
- **Production**: Mỗi 4-6 giờ
- **Peak season**: Mỗi 2 giờ

**Cấu hình:**

1. Right-click flow trong PAD console
2. Properties → Schedule
3. Set: Repeat every **4 hours**
4. Days: Monday - Sunday
5. Start time: 00:00

---

## 🧪 Testing Checklist

### ✅ Database
- [ ] Migration applied successfully
- [ ] All 4 new tables exist in Prisma Studio
- [ ] Indexes created (check in pgAdmin or DBeaver)

### ✅ API Endpoints
- [ ] GET `/api/iship-data` returns OK
- [ ] POST `/api/iship-data` with test data succeeds
- [ ] GET `/api/longstay-analysis` returns data
- [ ] Response includes stats, byLocation, pagination

### ✅ Dashboard
- [ ] `/longstay` page loads without errors
- [ ] Statistics cards display correctly
- [ ] Filters work (risk level, location, search)
- [ ] Container table shows data
- [ ] Color coding correct (red=critical, orange=high, etc.)

### ✅ ML Prediction
- [ ] LongstayPredictionService can be imported
- [ ] Risk scores calculated (0-100)
- [ ] Risk levels assigned correctly
- [ ] Recommendations generated

### ✅ PAD Integration
- [ ] PAD can connect to API endpoint
- [ ] POST request from PAD succeeds
- [ ] Data appears in dashboard after PAD run

---

## 🎯 Production Considerations

### 1. Environment Variables

Thêm vào `.env`:

```bash
# iShip API Settings
ISHIP_API_KEY=your_secure_api_key_here
ISHIP_SCRAPING_ENABLED=true

# Longstay Thresholds
LONGSTAY_THRESHOLD_DAYS=14
LONGSTAY_CRITICAL_DAYS=21

# Storage Costs (USD per day)
DAILY_STORAGE_COST=5
RELOCATION_COST=200
URGENT_PICKUP_COST=150

# Email Alerts
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_RECIPIENTS=ops@company.com,manager@company.com
```

### 2. API Security (Recommended)

Thêm authentication cho API endpoint:

```typescript
// app/api/iship-data/route.ts
export async function POST(req: NextRequest) {
  // Verify API key
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey !== process.env.ISHIP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Continue with normal processing...
}
```

Update PAD flow để thêm header:

```plaintext
Invoke Web Service
  URL: %APIEndpoint%
  Method: POST
  Custom Headers: {"X-API-Key": "your_api_key_here"}
  Request Body: %JSONPayload%
```

### 3. Performance Optimization

```typescript
// Add caching for heavy queries
import { cache } from 'react';

export const getCachedLongstayAnalyses = cache(async () => {
  return await prisma.longstayAnalysis.findMany({
    // ...
  });
});
```

### 4. Monitoring

Setup log monitoring:

```bash
# Create log directory
mkdir -p logs

# Add to .gitignore
echo "logs/" >> .gitignore
```

Update API endpoints to log important events:

```typescript
console.log(`[${new Date().toISOString()}] iShip data received: ${containers.length} containers`);
```

### 5. Error Handling

Thêm error notification (example với email):

```typescript
// lib/notifications/emailService.ts
export async function sendErrorAlert(error: Error, context: string) {
  // Send email to ops team
  // Log to external service (Sentry, DataDog, etc.)
}
```

---

## 📊 Monitoring Dashboard Setup (Optional)

### Option 1: Built-in Monitoring

Thêm vào existing `/reports` page:

```typescript
// Longstay health metrics
const longstayHealth = {
  lastUpdateTime: await getLastIShipUpdate(),
  containerCount: await getActiveContainersCount(),
  criticalCount: await getCriticalContainersCount(),
  apiStatus: await checkAPIHealth()
};
```

### Option 2: External Tools

- **Grafana**: Visualize metrics from PostgreSQL
- **DataDog**: Application monitoring
- **Sentry**: Error tracking

---

## 🔄 Regular Maintenance

### Daily
- [ ] Check PAD logs for errors
- [ ] Review longstay alerts dashboard
- [ ] Verify API is responding

### Weekly
- [ ] Review prediction accuracy
- [ ] Check for duplicate data
- [ ] Clean up old IShipData records (>30 days)

### Monthly
- [ ] Analyze longstay trends
- [ ] Update thresholds based on data
- [ ] Review and optimize ML model
- [ ] Database performance check

---

## 🆘 Troubleshooting

### Issue: Migration fails

**Error:** `relation already exists`

**Solution:**
```bash
# Reset database (⚠️ data loss!)
npx prisma migrate reset

# Or manually drop tables
psql -U postgres -d ai_cont_db -c "DROP TABLE IF EXISTS \"ContainerTracking\" CASCADE;"
# ...then re-run migration
```

### Issue: API returns 500 error

**Check:**
1. Database connection (`.env` file)
2. Prisma Client generated: `npx prisma generate`
3. Console logs in Next.js terminal

### Issue: Dashboard shows no data

**Verify:**
1. Database has data: `npx prisma studio`
2. API endpoint works: `curl http://localhost:3000/api/longstay-analysis`
3. Browser console for errors (F12)

### Issue: PAD cannot connect to API

**Check:**
1. API URL correct (localhost:3000 vs actual server IP)
2. Firewall settings
3. PAD has network access

---

## 📚 Next Features to Implement

### Phase 2 (Recommend within 1-2 months)

1. **Email Alerts**
   - Daily digest of critical containers
   - Immediate alerts for new high-risk

2. **Historical Trends**
   - Graph showing longstay trends over time
   - Seasonal pattern analysis

3. **Custom Thresholds**
   - Per-customer longstay definitions
   - Per-location risk adjustments

4. **Automated Actions**
   - Auto-create relocation proposals
   - Integration with booking system

5. **Mobile Notifications**
   - Push notifications to operations team
   - Mobile-friendly dashboard

### Phase 3 (Advanced)

- LSTM time-series prediction
- Multi-objective optimization
- Blockchain container tracking
- Real-time WebSocket updates

---

## 🎓 Training Materials

### For Operations Team

**Topics to cover:**
1. Understanding longstay risk scores
2. How to use the dashboard
3. Interpreting recommendations
4. When to escalate

**Training doc**: Create `OPERATIONS_GUIDE.md`

### For IT Team

**Topics:**
1. PAD flow maintenance
2. API troubleshooting
3. Database queries
4. Performance monitoring

**Training doc**: Create `IT_ADMIN_GUIDE.md`

---

## 📞 Support Contacts

**Development Issues:**
- Backend Team: backend@company.com
- Frontend Team: frontend@company.com

**Business/Operations:**
- Operations Manager: ops-manager@company.com
- Container Depot Coordinator: depot@company.com

**Emergency (Production Down):**
- On-call Engineer: +84-xxx-xxx-xxxx
- Slack: #ai-container-alerts

---

## 🎉 Success Criteria

Feature is **successfully deployed** when:

✅ Database migration applied
✅ All API endpoints working
✅ Dashboard accessible and functional
✅ PAD can send data successfully
✅ Test containers appear in dashboard
✅ Risk scores calculated correctly
✅ Recommendations generated
✅ No console errors
✅ Documentation reviewed by team

**Estimated time to deploy:** 2-4 hours

---

**Ready to start?** Begin with **Bước 1: Apply Database Migration** above! 🚀

Good luck! 🍀
