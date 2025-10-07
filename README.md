# AI Container Management System

An intelligent container inventory and optimization platform powered by machine learning and AI-driven decision-making. This system helps logistics companies optimize empty container management, predict demand patterns, and generate actionable recommendations for container repositioning.

## 🚀 Features

### Core Functionality
- **Real-time Container Inventory Tracking** - Monitor container stock levels across multiple ports and types
- **AI-Powered Optimization** - Machine learning models for container positioning and route optimization
- **Smart Proposals System** - Automated suggestions for container movements based on historical data and predictions
- **Intelligent Alerts** - Proactive notifications for inventory issues, anomalies, and optimization opportunities
- **Interactive Dashboard** - Modern UI for visualizing inventory, proposals, and system health
- **AI Chatbot Assistant** - Conversational interface for querying data and performing actions

### Machine Learning Components
- **LSTM Forecasting** - Time-series prediction for container demand using TensorFlow.js
- **Feature Extraction & Scoring** - ML-based suggestion ranking and optimization scoring
- **Feedback Loop** - Continuous learning from user actions to improve recommendations
- **OR-Tools Integration** - Advanced optimization algorithms for route planning

### Data Management
- **Excel Upload** - Bulk import of inventory, booking, and operational data
- **PostgreSQL Database** - Robust data storage with Prisma ORM
- **Data Analysis Tools** - Built-in scripts for debugging and testing predictions

## 🏗️ Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS
- **Backend**: Next.js API Routes, TypeScript
- **Database**: PostgreSQL 15 with Prisma ORM
- **ML/AI**: TensorFlow.js, ml-matrix, simple-statistics
- **Containerization**: Docker, Docker Compose
- **File Processing**: ExcelJS for Excel file parsing

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 15+ (or use Docker Compose)
- npm or yarn package manager
- NVIDIA GPU with CUDA 12.1-compatible drivers (required for the RAG microservice)

## 🔧 Installation

### Option 1: Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-cont-noapi
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_cont_db"
   DIRECT_URL="postgresql://postgres:postgres@localhost:5432/ai_cont_db"
   ```

4. **Set up the database**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option 2: Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-cont-noapi
   ```

2. **Create environment file** (optional, uses defaults if not provided)
   ```bash
   cp .env.example .env
   ```

3. **Build GPU-enabled RAG image** (requires NVIDIA drivers on the host)
   ```bash
   docker compose build rag-service
   ```

4. **Start all services**
   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL database on port 5432
   - Next.js application on port 3000
   - pgAdmin on port 5050 (optional, for database management)
   - Python RAG service on port 8000 (requires GPU access)

5. **Start only the RAG microservice** (after the build step above)
   ```bash
   docker compose up -d rag-service
   ```

4. **Access the application**
   - Main App: [http://localhost:3000](http://localhost:3000)
   - pgAdmin: [http://localhost:5050](http://localhost:5050) (admin@example.com / admin)

## 📊 Usage

### Uploading Data
1. Navigate to **Reports** → **Upload Data**
2. Upload Excel files containing:
   - Inventory data (port, type, stock)
   - Booking data (origin, destination, size, quantity)
   - KPI metrics
3. System automatically processes and generates AI suggestions

### Viewing Proposals
- Go to **Proposals** page to review AI-generated recommendations
- Each proposal includes route, container size, quantity, estimated cost/benefit
- Accept, reject, or modify proposals based on business logic

### Managing Alerts
- Check **Notifications** for active alerts and warnings
- System alerts you to inventory shortages, overstocking, and optimization opportunities
- Mark alerts as resolved once addressed

### Using the AI Chatbot
- Chat interface available on the right side of every page
- Ask questions about inventory, proposals, and system status
- Execute actions through natural language commands

## 🧪 Testing & Debugging

Run built-in test scripts:

```bash
# Test prediction models
node test-predictions.js

# Debug empty container optimization
node debug-empty-optimization.js

# Test proposal generation
node test-empty-proposals.js

# Analyze existing data
node analyze-existing-data.js
```

## 🧠 Retrieval-Augmented Generation Service

- **Code**: `python_optimization/rag_service.py`
- **Runtime**: FastAPI served via Uvicorn (GPU accelerated with CUDA 12.1)
- **Endpoints**:
  - `POST /embed` – generate embeddings and optionally persist to PostgreSQL
  - `POST /query` – perform FAISS similarity search over stored vectors
  - `POST /chat` – retrieve relevant context and stream an answer from the configured LLM
- **Environment**: set `LLM_MODEL_NAME`, `EMBED_MODEL_NAME`, and PostgreSQL connection variables as needed.

Build and run locally with Docker Compose:

```bash
docker compose build rag-service
docker compose up -d rag-service
```

Kubernetes manifests are available under `k8s/` (`rag-service-deployment.yaml` and `rag-service-service.yaml`) with GPU requests (`nvidia.com/gpu: 1`).

## 🗂️ Project Structure

```
ai-cont-noapi/
├── app/                    # Next.js app directory (pages & components)
│   ├── api/               # API routes
│   ├── comments/          # Comments management
│   ├── notifications/     # Alerts & notifications
│   ├── proposals/         # AI-generated proposals
│   ├── reports/           # Data upload & reports
│   └── upload/            # File upload interface
├── lib/                   # Core libraries
│   ├── ml/               # Machine learning modules
│   │   ├── lstmModel.ts           # LSTM neural network
│   │   ├── featureExtraction.ts   # Feature engineering
│   │   ├── suggestionScoring.ts   # Scoring algorithms
│   │   └── integratedOptimizationEngine.ts
│   ├── optimization/     # OR-Tools optimization
│   └── testing/          # Test utilities
├── prisma/               # Database schema & migrations
├── components/           # React components
├── Dockerfile            # Multi-stage production build
├── docker-compose.yml    # Docker orchestration
└── package.json          # Dependencies & scripts
```

## 🔄 Development Workflow

```bash
# Run development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database operations
npm run db:migrate    # Run migrations
npm run db:studio     # Open Prisma Studio
npm run db:seed       # Seed database
```

## 🌐 API Endpoints

- `GET /api/inventory` - Retrieve container inventory
- `GET /api/proposals` - Fetch AI proposals
- `GET /api/alerts` - Get active alerts
- `POST /api/upload` - Upload Excel data
- `GET /api/kpi` - Fetch KPI metrics
- `POST /api/ml/train` - Trigger ML model training
- `GET /api/system/health` - System health check

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 📧 Support

For issues and questions, please contact the development team or create an issue in the repository.

---

**Built with ❤️ using Next.js and AI/ML technologies**
