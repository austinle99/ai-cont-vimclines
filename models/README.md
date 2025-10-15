# Machine Learning Models Directory

This directory stores trained ML models for the container optimization system.

## 📁 Directory Structure

```
models/
├── gbr_model.pkl          # Gradient Boosting Regressor model (Python)
├── lstm_model/            # LSTM TensorFlow.js model
│   ├── model.json
│   └── weights.bin
└── README.md              # This file
```

## 🤖 Models

### 1. GBR Model (`gbr_model.pkl`)

**Type:** Gradient Boosting Regressor (XGBoost/LightGBM)
**Format:** Python Pickle (joblib)
**Size:** ~100 KB - 1 MB
**Best For:** Short-term predictions (1-3 days)

**Contents:**
- Trained XGBoost/LightGBM model
- Feature columns and categorical encoders
- Label encoders for categorical variables
- Training metadata (R² scores, feature importance)

**How to Load:**
```python
import joblib
model_data = joblib.load('models/gbr_model.pkl')
model = model_data['model']
feature_columns = model_data['feature_columns']
```

**Training Command:**
```bash
python python_ml/gbr_predictor.py train input.json models/gbr_model.pkl
```

### 2. LSTM Model (`lstm_model/`)

**Type:** Long Short-Term Memory Neural Network
**Format:** TensorFlow.js
**Size:** ~5 MB
**Best For:** Long-term predictions (4-7 days), trend detection

**Contents:**
- `model.json` - Model architecture
- `weights.bin` - Trained weights

**How to Load:**
```typescript
import * as tf from '@tensorflow/tfjs-node';
const model = await tf.loadLayersModel('file://models/lstm_model/model.json');
```

**Training:** Automatic via `LSTMPredictionService.trainModel()`

## 🔄 Model Retraining

Models should be retrained regularly to maintain accuracy:

### Recommended Schedule

| Model | Retraining Frequency | Trigger |
|-------|---------------------|---------|
| **GBR** | Weekly | Every Monday |
| **LSTM** | Bi-weekly | Every other Monday |
| **Both** | After major data changes | Manual trigger |

### Retraining Process

```typescript
import { EnsemblePredictionService } from './lib/ml/ensemblePredictionService';

// Initialize service
const ensemble = new EnsemblePredictionService();
await ensemble.initialize();

// Get recent bookings
const bookings = await prisma.booking.findMany({
  where: {
    date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
  },
  orderBy: { date: 'desc' }
});

// Retrain both models
const results = await ensemble.trainModels(bookings);

console.log('GBR R² Score:', results.gbr.val_r2);
console.log('LSTM Loss:', results.lstm.final_loss);
```

## 📊 Model Performance Tracking

### Current Performance (as of training date)

**GBR Model:**
- Training R²: _To be filled after training_
- Validation R²: _To be filled after training_
- MAE: _To be filled after training_
- Training Date: _To be filled after training_
- Training Samples: _To be filled after training_

**LSTM Model:**
- Training Loss: _To be filled after training_
- Validation Loss: _To be filled after training_
- Training Date: _To be filled after training_
- Training Samples: _To be filled after training_

**Ensemble:**
- Short-term Accuracy (1-3 days): _To be evaluated_
- Long-term Accuracy (4-7 days): _To be evaluated_
- Overall Accuracy: _To be evaluated_

### How to Check Performance

```bash
# Run test suite
node test-gbr-ensemble.js

# View model info
node -e "
const { GBRPredictionService } = require('./lib/ml/gbrPredictionService');
const gbr = new GBRPredictionService();
gbr.initialize().then(() => {
  console.log(gbr.getModelInfo());
});
"
```

## 🔐 Model Versioning

Models are versioned by training date stored in metadata:

```python
# In gbr_model.pkl
metadata = {
  'train_date': '2025-10-15T10:30:00',
  'version': '1.0.0',
  'model_type': 'xgboost',
  'metrics': {...}
}
```

### Rollback to Previous Version

1. Backup current model:
   ```bash
   cp models/gbr_model.pkl models/gbr_model_backup_$(date +%Y%m%d).pkl
   ```

2. Restore previous version:
   ```bash
   cp models/gbr_model_backup_20251001.pkl models/gbr_model.pkl
   ```

## 🗑️ Model Cleanup

Old model backups should be cleaned periodically:

```bash
# Keep only last 5 backups
cd models
ls -t gbr_model_backup_*.pkl | tail -n +6 | xargs rm -f
```

## ⚠️ Important Notes

1. **Do not delete `models/` directory** - it's required for model storage
2. **Models are .gitignored** - they must be trained on your server
3. **First run requires training** - see Quick Start guide
4. **Models are machine-specific** - TensorFlow.js models may need retraining on different architectures

## 🚀 Quick Start

First time setup:

```bash
# 1. Install Python dependencies
cd python_ml
pip install -r requirements.txt

# 2. Run test to train models
cd ..
node test-gbr-ensemble.js

# 3. Verify models exist
ls -lh models/
```

You should see:
- `gbr_model.pkl` (GBR model)
- `lstm_model/` directory (LSTM model)

## 📚 Additional Resources

- [GBR + LSTM Ensemble Guide](../docs/GBR_ENSEMBLE_GUIDE.md)
- [Main README](../README.md)
- [System Requirements](../SYSTEM_REQUIREMENTS.md)
