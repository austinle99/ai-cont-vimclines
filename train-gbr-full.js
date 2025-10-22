/**
 * Full GBR Model Training Script
 * Trains GBR model with all booking data from database
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GBRPredictionService } = require('./lib/ml/gbrPredictionService');

async function trainGBRModel() {
  console.log('\n🤖 GBR Model Training');
  console.log('='.repeat(70));
  console.log('Training GBR model with full database...\n');

  try {
    // Get all bookings from database
    console.log('📊 Loading bookings from database...');
    const bookings = await prisma.booking.findMany({
      orderBy: {
        date: 'asc'
      }
    });

    console.log(`✅ Loaded ${bookings.length.toLocaleString()} bookings`);

    if (bookings.length < 100) {
      console.log('❌ Insufficient data for GBR training (need at least 100 bookings)');
      process.exit(1);
    }

    // Initialize GBR service
    console.log('\n🔧 Initializing GBR Prediction Service...');
    const gbrService = new GBRPredictionService();
    await gbrService.initialize();

    // Train the model
    console.log('\n🚀 Starting GBR model training...');
    console.log(`   Training samples: ${bookings.length.toLocaleString()}`);
    console.log('   This may take 1-2 minutes...\n');

    const startTime = Date.now();
    const trainingResults = await gbrService.trainModel(bookings);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Display results
    console.log('\n' + '='.repeat(70));
    console.log('✅ GBR TRAINING COMPLETED');
    console.log('='.repeat(70));
    console.log(`\n⏱️  Training Duration: ${duration}s`);
    console.log(`\n📊 Performance Metrics:`);
    console.log(`   Training R²:      ${trainingResults.train_r2.toFixed(4)}`);
    console.log(`   Validation R²:    ${trainingResults.val_r2.toFixed(4)}`);
    console.log(`   Training MAE:     ${trainingResults.train_mae.toFixed(2)}`);
    console.log(`   Validation MAE:   ${trainingResults.val_mae.toFixed(2)}`);
    console.log(`   CV R² Score:      ${trainingResults.cv_score.toFixed(4)} (+/- ${trainingResults.cv_std.toFixed(4)})`);

    // Check if performance meets requirements
    const meetsRequirements = trainingResults.val_r2 >= 0.7;
    console.log(`\n🎯 Performance Check: ${meetsRequirements ? '✅ PASS' : '⚠️  NEEDS IMPROVEMENT'}`);
    console.log(`   Target: Validation R² >= 0.70`);
    console.log(`   Actual: Validation R² = ${trainingResults.val_r2.toFixed(4)}`);

    // Display top feature importance
    console.log(`\n📈 Top 10 Feature Importance:`);
    const sortedFeatures = Object.entries(trainingResults.feature_importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedFeatures.forEach(([feature, importance], index) => {
      const bar = '█'.repeat(Math.round(importance * 50));
      console.log(`   ${(index + 1).toString().padStart(2)}. ${feature.padEnd(30)} ${(importance * 100).toFixed(2)}% ${bar}`);
    });

    // Display model metadata
    console.log(`\n📝 Model Metadata:`);
    console.log(`   Model Type:       ${trainingResults.metadata.model_type.toUpperCase()}`);
    console.log(`   Training Date:    ${new Date(trainingResults.metadata.train_date).toLocaleString()}`);
    console.log(`   Training Samples: ${trainingResults.metadata.train_samples.toLocaleString()}`);
    console.log(`   Val Samples:      ${trainingResults.metadata.val_samples.toLocaleString()}`);
    console.log(`   Features:         ${trainingResults.metadata.n_features}`);
    console.log(`   Model Path:       ${trainingResults.model_path}`);

    console.log('\n' + '='.repeat(70));
    console.log('🎉 GBR model successfully trained and saved!');
    console.log('='.repeat(70));
    console.log('\n📚 Next Steps:');
    console.log('   1. Review feature importance to understand predictions');
    console.log('   2. Test model with: npx tsx test-gbr-simple.js');
    console.log('   3. Use ensemble predictions via API or EnsemblePredictionService');
    console.log('');

    return {
      success: true,
      results: trainingResults,
      duration
    };

  } catch (error) {
    console.error('\n❌ GBR Training Error:', error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Run training
trainGBRModel()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
