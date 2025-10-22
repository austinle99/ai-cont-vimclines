/**
 * Test script for LSTM model file-system storage
 * This tests the new file-based storage implementation
 */

const { LSTMEmptyContainerModel } = require('./lib/ml/lstmModel.ts');
const fs = require('fs');
const path = require('path');

async function testLSTMStorage() {
  console.log('🧪 Testing LSTM Model File-System Storage\n');
  console.log('=' .repeat(60));

  // Test 1: Check if models directory exists
  console.log('\n📁 Test 1: Checking models directory...');
  const modelsDir = path.join(process.cwd(), 'models', 'lstm_empty_containers');

  if (fs.existsSync(modelsDir)) {
    console.log('✅ Models directory exists:', modelsDir);
    const files = fs.readdirSync(modelsDir);
    console.log('   Files in directory:', files.length > 0 ? files : '(empty)');
  } else {
    console.log('⚠️  Models directory does not exist (will be created on first save)');
  }

  // Test 2: Create a simple model
  console.log('\n🔧 Test 2: Creating LSTM model...');
  try {
    const model = new LSTMEmptyContainerModel({
      sequenceLength: 10,
      featureCount: 7,
      lstmUnits: 32,
      epochs: 5, // Small number for testing
      batchSize: 16
    });

    console.log('✅ Model instance created');
    console.log('   Config:', model.getConfig());
  } catch (error) {
    console.error('❌ Failed to create model:', error.message);
    return;
  }

  // Test 3: Build the model architecture
  console.log('\n🏗️  Test 3: Building model architecture...');
  try {
    const model = new LSTMEmptyContainerModel({
      sequenceLength: 10,
      featureCount: 7,
      lstmUnits: 32
    });

    model.buildModel();
    console.log('✅ Model architecture built');
    console.log('\nModel Summary:');
    console.log(model.getModelSummary());
  } catch (error) {
    console.error('❌ Failed to build model:', error.message);
    return;
  }

  // Test 4: Create dummy training data
  console.log('\n📊 Test 4: Creating dummy training data...');
  try {
    const numSamples = 50;
    const sequenceLength = 10;
    const featureCount = 7;

    // Generate synthetic data
    const features = Array(numSamples).fill(0).map(() =>
      Array(sequenceLength).fill(0).map(() =>
        Array(featureCount).fill(0).map(() => Math.random())
      )
    );

    const targets = Array(numSamples).fill(0).map(() => Math.random());

    const processedData = {
      features: features,
      targets: targets,
      scalingParams: {
        featureMin: Array(featureCount).fill(0),
        featureMax: Array(featureCount).fill(1),
        targetMin: 0,
        targetMax: 100
      }
    };

    console.log('✅ Dummy training data created');
    console.log(`   Samples: ${numSamples}`);
    console.log(`   Sequence length: ${sequenceLength}`);
    console.log(`   Features: ${featureCount}`);

    // Test 5: Train the model (quick test)
    console.log('\n🚀 Test 5: Training model (this may take 1-2 minutes)...');
    const model = new LSTMEmptyContainerModel({
      sequenceLength: sequenceLength,
      featureCount: featureCount,
      lstmUnits: 32,
      epochs: 5,
      batchSize: 16
    });

    await model.trainModel(processedData, (progress) => {
      if (progress.epoch % 1 === 0) {
        console.log(`   Epoch ${progress.epoch}/5 - Loss: ${progress.loss?.toFixed(4)}`);
      }
    });

    console.log('✅ Model training completed');

    // Test 6: Save the model
    console.log('\n💾 Test 6: Saving model to file system...');
    await model.saveModel('test-lstm-model');
    console.log('✅ Model saved successfully');

    // Check if files were created
    const savedFiles = fs.readdirSync(modelsDir);
    console.log('   Files created:', savedFiles);

    // Test 7: Load the model
    console.log('\n📂 Test 7: Loading model from file system...');
    const loadedModel = new LSTMEmptyContainerModel({
      sequenceLength: sequenceLength,
      featureCount: featureCount
    });

    await loadedModel.loadModel('test-lstm-model');
    console.log('✅ Model loaded successfully');

    // Test 8: Make a prediction
    console.log('\n🔮 Test 8: Testing predictions...');
    const testInput = [features[0]]; // Use first sample
    const predictions = await loadedModel.predict(testInput, 3);

    console.log('✅ Predictions generated');
    console.log('   Predicted values:', predictions.denormalizedPredictions);
    console.log('   Confidence scores:', predictions.confidence.map(c => c.toFixed(3)));
    console.log('   Future dates:', predictions.timestamps.map(d => d.toISOString().split('T')[0]));

    // Cleanup
    console.log('\n🧹 Cleaning up test files...');
    loadedModel.dispose();
    model.dispose();

    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All tests completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Train the model with real booking data');
  console.log('2. Test via API: POST http://localhost:3000/api/lstm-predictions');
  console.log('3. Check training status: GET http://localhost:3000/api/lstm-training-status');
  console.log('=' .repeat(60));
}

// Run the test
testLSTMStorage().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
