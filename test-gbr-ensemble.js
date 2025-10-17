/**
 * Test script for GBR + LSTM Ensemble System
 * Validates feature preparation, model training, and ensemble predictions
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { EnsemblePredictionService } = require('./lib/ml/ensemblePredictionService');
const { GBRFeaturePreparator } = require('./lib/ml/gbrFeaturePreparation');

async function testGBRFeaturePreparation() {
  console.log('\n🧪 Test 1: GBR Feature Preparation');
  console.log('='.repeat(60));

  try {
    // Get sample bookings
    const bookings = await prisma.booking.findMany({
      take: 100,
      orderBy: { date: 'desc' }
    });

    if (bookings.length === 0) {
      console.log('❌ No bookings found in database');
      return false;
    }

    console.log(`📊 Testing with ${bookings.length} bookings`);

    // Prepare features
    const preparator = new GBRFeaturePreparator();
    const featureSet = preparator.prepareFeatures(bookings, true);

    console.log(`✅ Generated ${featureSet.features.length} feature sets`);
    console.log(`   Categorical columns: ${featureSet.categorical_columns.join(', ')}`);
    console.log(`   Feature stats:`, featureSet.feature_stats);

    // Show sample features
    if (featureSet.features.length > 0) {
      const sampleFeature = featureSet.features[0];
      console.log('\n📋 Sample Feature:');
      console.log(`   Depot: ${sampleFeature.depot}`);
      console.log(`   Container Type: ${sampleFeature.container_type}`);
      console.log(`   Dwell Time: ${sampleFeature.dwell_time} days`);
      console.log(`   Empty/Laden: ${sampleFeature.empty_laden === 1 ? 'Empty' : 'Laden'}`);
      console.log(`   Day of Week: ${sampleFeature.day_of_week}`);
      console.log(`   Depot Empty Ratio: ${(sampleFeature.depot_empty_ratio * 100).toFixed(1)}%`);
      console.log(`   Route Frequency: ${sampleFeature.route_frequency}`);
      console.log(`   Optimization Score: ${sampleFeature.optimization_score}`);
    }

    preparator.clearCache();
    return true;

  } catch (error) {
    console.error('❌ Feature preparation test failed:', error);
    return false;
  }
}

async function testEnsembleService() {
  console.log('\n🧪 Test 2: Ensemble Prediction Service');
  console.log('='.repeat(60));

  try {
    // Initialize ensemble service
    const ensemble = new EnsemblePredictionService({
      shortTermDays: 3,
      shortTermGBRWeight: 0.7,
      longTermGBRWeight: 0.3,
      enableFallback: true
    });

    console.log('🚀 Initializing ensemble service...');
    await ensemble.initialize();

    const status = ensemble.getServiceStatus();
    console.log('\n📊 Service Status:');
    console.log(`   Initialized: ${status.isInitialized ? '✅' : '❌'}`);
    console.log(`   LSTM Available: ${status.lstm?.lastTrainingDate ? '✅' : '❌'}`);
    console.log(`   GBR Available: ${status.gbr?.isInitialized ? '✅' : '❌'}`);
    console.log(`   Capabilities: ${status.capabilities.length} features`);

    // Get bookings for prediction
    const bookings = await prisma.booking.findMany({
      take: 200,
      orderBy: { date: 'desc' }
    });

    if (bookings.length < 50) {
      console.log('⚠️  Insufficient bookings for full test (need 50+)');
      console.log(`   Found: ${bookings.length} bookings`);
      return true; // Not a failure, just insufficient data
    }

    // Test training
    console.log(`\n🤖 Training models with ${bookings.length} bookings...`);
    const trainingResults = await ensemble.trainModels(bookings);

    if (trainingResults.gbr) {
      console.log('\n✅ GBR Training Results:');
      console.log(`   Training R²: ${trainingResults.gbr.train_r2.toFixed(4)}`);
      console.log(`   Validation R²: ${trainingResults.gbr.val_r2.toFixed(4)}`);
      console.log(`   MAE: ${trainingResults.gbr.val_mae.toFixed(2)}`);

      console.log('\n📊 Top Feature Importance:');
      const importance = trainingResults.gbr.feature_importance;
      Object.entries(importance)
        .slice(0, 5)
        .forEach(([feature, score]) => {
          console.log(`   ${feature}: ${(score * 100).toFixed(2)}%`);
        });
    }

    if (trainingResults.lstm) {
      console.log('\n✅ LSTM Training Results:');
      console.log(`   Loss: ${trainingResults.lstm.final_loss?.toFixed(4) || 'N/A'}`);
      console.log(`   Val Loss: ${trainingResults.lstm.final_val_loss?.toFixed(4) || 'N/A'}`);
    }

    // Test predictions
    console.log('\n🔮 Generating ensemble predictions...');
    const predictions = await ensemble.getPredictions(bookings, 7);

    console.log(`\n✅ Generated ${predictions.length} predictions`);

    if (predictions.length > 0) {
      // Show sample predictions
      const shortTerm = predictions.filter(p => {
        const days = Math.ceil((p.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days <= 3;
      })[0];

      const longTerm = predictions.filter(p => {
        const days = Math.ceil((p.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days > 3;
      })[0];

      if (shortTerm) {
        console.log('\n📋 Short-term Prediction Sample (Day 1-3):');
        console.log(`   Port: ${shortTerm.port}`);
        console.log(`   Container Type: ${shortTerm.containerType}`);
        console.log(`   Predicted Empty Count: ${shortTerm.predictedEmptyCount}`);
        console.log(`   Confidence: ${(shortTerm.confidence * 100).toFixed(1)}%`);
        console.log(`   Method: ${shortTerm.method}`);
        console.log(`   Weights: GBR ${(shortTerm.weights.gbr * 100).toFixed(0)}%, LSTM ${(shortTerm.weights.lstm * 100).toFixed(0)}%`);
        console.log(`   Components: GBR=${shortTerm.components.gbr?.toFixed(1)}, LSTM=${shortTerm.components.lstm?.toFixed(1)}`);
      }

      if (longTerm) {
        console.log('\n📋 Long-term Prediction Sample (Day 4+):');
        console.log(`   Port: ${longTerm.port}`);
        console.log(`   Container Type: ${longTerm.containerType}`);
        console.log(`   Predicted Empty Count: ${longTerm.predictedEmptyCount}`);
        console.log(`   Confidence: ${(longTerm.confidence * 100).toFixed(1)}%`);
        console.log(`   Method: ${longTerm.method}`);
        console.log(`   Weights: GBR ${(longTerm.weights.gbr * 100).toFixed(0)}%, LSTM ${(longTerm.weights.lstm * 100).toFixed(0)}%`);
        console.log(`   Components: GBR=${longTerm.components.gbr?.toFixed(1)}, LSTM=${longTerm.components.lstm?.toFixed(1)}`);
      }

      // Statistics
      const avgPrediction = predictions.reduce((sum, p) => sum + p.predictedEmptyCount, 0) / predictions.length;
      const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
      const highRisk = predictions.filter(p => p.riskLevel === 'high').length;

      console.log('\n📊 Prediction Statistics:');
      console.log(`   Average Prediction: ${avgPrediction.toFixed(1)} containers`);
      console.log(`   Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      console.log(`   High Risk Predictions: ${highRisk} (${(highRisk / predictions.length * 100).toFixed(1)}%)`);
    }

    ensemble.dispose();
    return true;

  } catch (error) {
    console.error('❌ Ensemble service test failed:', error);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function runTests() {
  console.log('\n🧪 GBR + LSTM Ensemble System Test Suite');
  console.log('='.repeat(60));
  console.log('Testing the new ensemble prediction system...\n');

  const results = {
    featurePreparation: false,
    ensembleService: false
  };

  // Run tests
  results.featurePreparation = await testGBRFeaturePreparation();
  results.ensembleService = await testEnsembleService();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Feature Preparation: ${results.featurePreparation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Ensemble Service: ${results.ensembleService ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(60));

  const allPassed = Object.values(results).every(r => r === true);
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}\n`);

  return allPassed;
}

// Run tests and exit
runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
