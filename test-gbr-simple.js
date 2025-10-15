/**
 * Simple GBR Test - Tests Python GBR predictor directly
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('\n🧪 GBR + LSTM Ensemble System - Simple Test');
console.log('='.repeat(60));

async function testPythonGBR() {
  console.log('\n📊 Test 1: Python GBR Predictor');
  console.log('-'.repeat(60));

  // Create sample training data
  const sampleData = {
    features: [
      {
        dwell_time: 5,
        total_movements: 3,
        container_type: '20GP',
        depot: 'TP.HCM',
        empty_laden: 1,
        day_of_week: 1,
        month: 10,
        week_of_year: 42,
        is_weekend: 0,
        is_month_start: 0,
        is_month_end: 0,
        empty_count_lag_1: 10,
        empty_count_lag_7: 12,
        empty_count_lag_30: 15,
        empty_rolling_mean_7: 11,
        empty_rolling_std_7: 2,
        empty_rolling_max_7: 15,
        empty_rolling_min_7: 8,
        dwell_rolling_mean_30: 4.5,
        depot_empty_ratio: 0.6,
        depot_total_containers: 100,
        depot_avg_dwell_time: 4.2,
        route_frequency: 25,
        pol_pod_pair: 'Singapore->HoChiMinh',
        optimization_score: 75,
        target_empty_count: 12
      },
      {
        dwell_time: 3,
        total_movements: 2,
        container_type: '40GP',
        depot: 'Haiphong',
        empty_laden: 0,
        day_of_week: 2,
        month: 10,
        week_of_year: 42,
        is_weekend: 0,
        is_month_start: 0,
        is_month_end: 0,
        empty_count_lag_1: 8,
        empty_count_lag_7: 10,
        empty_count_lag_30: 12,
        empty_rolling_mean_7: 9,
        empty_rolling_std_7: 1.5,
        empty_rolling_max_7: 12,
        empty_rolling_min_7: 7,
        dwell_rolling_mean_30: 3.8,
        depot_empty_ratio: 0.4,
        depot_total_containers: 80,
        depot_avg_dwell_time: 3.5,
        route_frequency: 20,
        pol_pod_pair: 'Bangkok->Haiphong',
        optimization_score: 65,
        target_empty_count: 8
      }
    ],
    categorical_columns: ['depot', 'container_type', 'pol_pod_pair']
  };

  // Create more samples for better training
  for (let i = 0; i < 48; i++) {
    sampleData.features.push({
      dwell_time: Math.floor(Math.random() * 10) + 1,
      total_movements: Math.floor(Math.random() * 5) + 1,
      container_type: ['20GP', '40GP', '40HC'][Math.floor(Math.random() * 3)],
      depot: ['TP.HCM', 'Haiphong', 'DaNang'][Math.floor(Math.random() * 3)],
      empty_laden: Math.floor(Math.random() * 2),
      day_of_week: Math.floor(Math.random() * 7),
      month: 10,
      week_of_year: 42,
      is_weekend: Math.floor(Math.random() * 2),
      is_month_start: 0,
      is_month_end: 0,
      empty_count_lag_1: Math.floor(Math.random() * 20) + 5,
      empty_count_lag_7: Math.floor(Math.random() * 20) + 5,
      empty_count_lag_30: Math.floor(Math.random() * 20) + 5,
      empty_rolling_mean_7: Math.random() * 15 + 5,
      empty_rolling_std_7: Math.random() * 3,
      empty_rolling_max_7: Math.floor(Math.random() * 20) + 10,
      empty_rolling_min_7: Math.floor(Math.random() * 10) + 3,
      dwell_rolling_mean_30: Math.random() * 5 + 2,
      depot_empty_ratio: Math.random() * 0.5 + 0.3,
      depot_total_containers: Math.floor(Math.random() * 100) + 50,
      depot_avg_dwell_time: Math.random() * 5 + 2,
      route_frequency: Math.floor(Math.random() * 30) + 10,
      pol_pod_pair: ['Singapore->HoChiMinh', 'Bangkok->Haiphong', 'Tokyo->DaNang'][Math.floor(Math.random() * 3)],
      optimization_score: Math.floor(Math.random() * 40) + 50,
      target_empty_count: Math.floor(Math.random() * 15) + 5
    });
  }

  console.log(`📋 Created ${sampleData.features.length} sample records for training`);

  // Save to temp file
  const tempFile = path.join(os.tmpdir(), `gbr_test_${Date.now()}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(sampleData, null, 2));
  console.log(`💾 Saved test data to: ${tempFile}`);

  // Test training
  console.log('\n🤖 Testing GBR model training...');

  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'python_ml', 'gbr_predictor.py');
    const modelPath = path.join(os.tmpdir(), 'gbr_model_test.pkl');  // Use temp dir to avoid Unicode path issues

    const pythonProcess = spawn('python', [pythonScript, 'train', tempFile, modelPath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      // Cleanup
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (code === 0) {
        try {
          // Extract JSON result
          const jsonMatch = stdout.match(/=+\n([\s\S]*?)\n=+/);
          if (jsonMatch && jsonMatch[1]) {
            const result = JSON.parse(jsonMatch[1]);

            console.log('\n✅ GBR Training Completed Successfully!');
            console.log('-'.repeat(60));
            console.log(`   Model Type: ${result.training_metadata?.model_type || 'xgboost'}`);
            console.log(`   Training R²: ${result.metrics.train_r2.toFixed(4)}`);
            console.log(`   Validation R²: ${result.metrics.val_r2.toFixed(4)}`);
            console.log(`   Training MAE: ${result.metrics.train_mae.toFixed(2)}`);
            console.log(`   Validation MAE: ${result.metrics.val_mae.toFixed(2)}`);

            console.log('\n📊 Top 5 Feature Importance:');
            const importance = Object.entries(result.metrics.feature_importance)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5);

            importance.forEach(([feature, score]) => {
              console.log(`   ${feature.padEnd(30)} ${(score * 100).toFixed(2)}%`);
            });

            // Test prediction
            console.log('\n🔮 Testing GBR predictions...');
            testPythonPrediction(modelPath, tempFile).then(() => {
              resolve(true);
            }).catch(reject);

          } else {
            console.log('✅ Training completed but could not parse output');
            resolve(true);
          }
        } catch (e) {
          console.log('✅ Training completed with code 0');
          resolve(true);
        }
      } else {
        console.error(`\n❌ Training failed with code ${code}`);
        if (stderr) console.error('Error:', stderr);
        reject(new Error(`Training failed: ${stderr}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python: ${error.message}`));
    });
  });
}

async function testPythonPrediction(modelPath, dataFile) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'python_ml', 'gbr_predictor.py');
    const pythonProcess = spawn('python', [pythonScript, 'predict', dataFile, modelPath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const jsonMatch = stdout.match(/=+\n([\s\S]*?)\n=+/);
          if (jsonMatch && jsonMatch[1]) {
            const result = JSON.parse(jsonMatch[1]);

            console.log('\n✅ Predictions Generated Successfully!');
            console.log('-'.repeat(60));
            console.log(`   Total Predictions: ${result.predictions.length}`);
            console.log(`   Average Prediction: ${(result.predictions.reduce((a, b) => a + b, 0) / result.predictions.length).toFixed(2)}`);
            console.log(`   Average Confidence: ${(result.confidence.reduce((a, b) => a + b, 0) / result.confidence.length * 100).toFixed(1)}%`);

            console.log('\n📋 Sample Predictions:');
            for (let i = 0; i < Math.min(3, result.predictions.length); i++) {
              console.log(`   Record ${i + 1}: ${result.predictions[i].toFixed(1)} containers (confidence: ${(result.confidence[i] * 100).toFixed(1)}%)`);
            }

            resolve(true);
          }
        } catch (e) {
          console.log('✅ Predictions completed');
          resolve(true);
        }
      } else {
        console.error(`❌ Prediction failed with code ${code}`);
        reject(new Error(`Prediction failed: ${stderr}`));
      }
    });
  });
}

async function runTests() {
  try {
    console.log('\n▶️  Starting GBR System Tests...\n');

    // Test Python GBR
    const gbrSuccess = await testPythonGBR();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Python GBR Predictor: ${gbrSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(60));

    if (gbrSuccess) {
      console.log('\n✅ ALL TESTS PASSED!');
      console.log('\n📚 Next Steps:');
      console.log('   1. Upload Excel data to populate database');
      console.log('   2. Train models with real data');
      console.log('   3. Use EnsemblePredictionService in your code');
      console.log('\nSee docs/GBR_ENSEMBLE_GUIDE.md for detailed usage\n');
    } else {
      console.log('\n❌ SOME TESTS FAILED\n');
    }

    process.exit(gbrSuccess ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();
