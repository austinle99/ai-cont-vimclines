#!/usr/bin/env node

/**
 * Standalone prediction testing script
 * Run with: node test-predictions.js
 */

const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3000';
const API_ENDPOINT = '/api/test-predictions';

// ANSI color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

function log(message, color = 'white') {
  console.log(colors[color] + message + colors.reset);
}

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: { error: 'Invalid JSON response', raw: responseData }
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTest(testName, testFunction) {
  log(`\n🧪 ${testName}`, 'cyan');
  log('─'.repeat(50), 'cyan');
  
  try {
    const startTime = Date.now();
    await testFunction();
    const duration = Date.now() - startTime;
    log(`✅ ${testName} completed in ${duration}ms`, 'green');
  } catch (error) {
    log(`❌ ${testName} failed: ${error.message}`, 'red');
  }
}

async function testQuickTest() {
  const response = await makeRequest(`${API_ENDPOINT}?action=quick-test`);
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const { summary, results } = response.data.data;
  
  log(`📊 Quick Test Results:`, 'bright');
  log(`   Total systems: ${summary.total_systems}`, 'white');
  log(`   Passed: ${summary.passed}`, summary.passed > 0 ? 'green' : 'yellow');
  log(`   Failed: ${summary.failed}`, summary.failed > 0 ? 'red' : 'green');
  log(`   Warnings: ${summary.warnings}`, summary.warnings > 0 ? 'yellow' : 'green');

  // Show individual system results
  Object.entries(results).forEach(([system, result]) => {
    const status = result.overall_status;
    const statusColor = status === 'passed' ? 'green' : status === 'failed' ? 'red' : 'yellow';
    log(`   ${system.toUpperCase()}: ${status}`, statusColor);
    
    if (result.issues && result.issues.length > 0) {
      result.issues.forEach(issue => {
        log(`     ⚠️  ${issue}`, 'yellow');
      });
    }
  });
}

async function testMLSystem() {
  const response = await makeRequest(`${API_ENDPOINT}?action=test-system&system=ml&scenario=Medium Scale Test`);
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const result = response.data.data;
  const mlTest = result.results.ml_test;

  if (mlTest) {
    log(`📊 ML System Results:`, 'bright');
    log(`   Status: ${mlTest.status}`, mlTest.status === 'passed' ? 'green' : 'red');
    log(`   Suggestions generated: ${mlTest.suggestions_generated}`, 'white');
    log(`   Average confidence: ${mlTest.average_confidence.toFixed(2)}`, 'white');
    log(`   Execution time: ${mlTest.execution_time}ms`, 'white');
    
    if (mlTest.issues.length > 0) {
      log(`   Issues:`, 'yellow');
      mlTest.issues.forEach(issue => {
        log(`     • ${issue}`, 'yellow');
      });
    }
  } else {
    log(`   No ML test results available`, 'yellow');
  }
}

async function testLSTMSystem() {
  const response = await makeRequest(`${API_ENDPOINT}?action=test-system&system=lstm&scenario=Medium Scale Test`);
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const result = response.data.data;
  const lstmTest = result.results.lstm_test;

  if (lstmTest) {
    log(`🔮 LSTM System Results:`, 'bright');
    log(`   Status: ${lstmTest.status}`, lstmTest.status === 'passed' ? 'green' : 'red');
    log(`   Predictions generated: ${lstmTest.predictions_generated}`, 'white');
    log(`   Average confidence: ${lstmTest.average_confidence.toFixed(2)}`, 'white');
    log(`   Prediction range: ${lstmTest.prediction_range.min} - ${lstmTest.prediction_range.max}`, 'white');
    log(`   Execution time: ${lstmTest.execution_time}ms`, 'white');
    
    if (lstmTest.issues.length > 0) {
      log(`   Issues:`, 'yellow');
      lstmTest.issues.forEach(issue => {
        log(`     • ${issue}`, 'yellow');
      });
    }
  } else {
    log(`   No LSTM test results available`, 'yellow');
  }
}

async function testORToolsSystem() {
  const response = await makeRequest(`${API_ENDPOINT}?action=test-system&system=or-tools&scenario=Small Scale Test`);
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const result = response.data.data;
  const orTest = result.results.or_tools_test;

  if (orTest) {
    log(`🎯 OR-Tools System Results:`, 'bright');
    log(`   Status: ${orTest.status}`, orTest.status === 'passed' ? 'green' : 'red');
    log(`   Optimization status: ${orTest.optimization_status}`, 'white');
    log(`   Python available: ${orTest.python_available}`, orTest.python_available ? 'green' : 'red');
    log(`   Relocations suggested: ${orTest.relocations_suggested}`, 'white');
    if (orTest.total_cost) {
      log(`   Total cost: $${orTest.total_cost.toLocaleString()}`, 'white');
    }
    log(`   Execution time: ${orTest.execution_time}ms`, 'white');
    
    if (orTest.issues.length > 0) {
      log(`   Issues:`, 'yellow');
      orTest.issues.forEach(issue => {
        log(`     • ${issue}`, 'yellow');
      });
    }
  } else {
    log(`   No OR-Tools test results available`, 'yellow');
  }
}

async function testIntegratedSystem() {
  const response = await makeRequest(`${API_ENDPOINT}?action=test-system&system=integrated&scenario=Medium Scale Test`);
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const result = response.data.data;
  const integratedTest = result.results.integrated_test;

  if (integratedTest) {
    log(`🤖 Integrated System Results:`, 'bright');
    log(`   Status: ${integratedTest.status}`, integratedTest.status === 'passed' ? 'green' : 'red');
    log(`   Recommendations generated: ${integratedTest.recommendations_generated}`, 'white');
    log(`   Confidence score: ${integratedTest.confidence_score.toFixed(2)}`, 'white');
    log(`   Services used: ${integratedTest.services_used.join(', ')}`, 'white');
    log(`   Estimated ROI: ${integratedTest.estimated_roi.toFixed(2)}`, 'white');
    log(`   Execution time: ${integratedTest.execution_time}ms`, 'white');
    
    if (integratedTest.issues.length > 0) {
      log(`   Issues:`, 'yellow');
      integratedTest.issues.forEach(issue => {
        log(`     • ${issue}`, 'yellow');
      });
    }
  } else {
    log(`   No Integrated test results available`, 'yellow');
  }
}

async function testPerformanceBenchmarks() {
  log(`⚡ Running performance benchmarks (this may take a while)...`, 'yellow');
  
  const response = await makeRequest(`${API_ENDPOINT}?action=benchmarks`);
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const benchmarks = response.data.data;
  
  log(`📈 Performance Benchmarks:`, 'bright');
  log(`   ML System:`, 'cyan');
  log(`     Average time: ${benchmarks.ml_performance.avg_time.toFixed(0)}ms`, 'white');
  log(`     Suggestions/second: ${benchmarks.ml_performance.suggestions_per_second.toFixed(1)}`, 'white');
  
  log(`   LSTM System:`, 'cyan');
  if (benchmarks.lstm_performance.avg_time > 0) {
    log(`     Average time: ${benchmarks.lstm_performance.avg_time.toFixed(0)}ms`, 'white');
    log(`     Predictions/second: ${benchmarks.lstm_performance.predictions_per_second.toFixed(1)}`, 'white');
  } else {
    log(`     Not available (insufficient training data or service not ready)`, 'yellow');
  }
  
  log(`   OR-Tools System:`, 'cyan');
  if (benchmarks.or_tools_performance.avg_time > 0) {
    log(`     Average time: ${benchmarks.or_tools_performance.avg_time.toFixed(0)}ms`, 'white');
    log(`     Optimizations/minute: ${benchmarks.or_tools_performance.optimizations_per_minute.toFixed(1)}`, 'white');
  } else {
    log(`     Not available (Python environment or OR-Tools not configured)`, 'yellow');
  }
  
  log(`   Integrated System:`, 'cyan');
  if (benchmarks.integrated_performance.avg_time > 0) {
    log(`     Average time: ${benchmarks.integrated_performance.avg_time.toFixed(0)}ms`, 'white');
    log(`     Recommendations/second: ${benchmarks.integrated_performance.recommendations_per_second.toFixed(1)}`, 'white');
  } else {
    log(`     Not available (dependent services not ready)`, 'yellow');
  }
}

async function runCustomStressTest() {
  log(`💪 Running custom stress test...`, 'yellow');
  
  const response = await makeRequest(`${API_ENDPOINT}`, 'POST', {
    action: 'stress-test',
    config: {
      system: 'ml',
      iterations: 3
    }
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.data.error || 'Unknown error'}`);
  }

  const { summary, results } = response.data.data;
  
  log(`💪 Stress Test Results:`, 'bright');
  log(`   Iterations completed: ${summary.iterations_completed}`, 'white');
  log(`   Successful: ${summary.successful_iterations}`, summary.successful_iterations > 0 ? 'green' : 'red');
  log(`   Average time: ${summary.average_time.toFixed(0)}ms`, 'white');
  log(`   Min time: ${summary.min_time.toFixed(0)}ms`, 'white');
  log(`   Max time: ${summary.max_time.toFixed(0)}ms`, 'white');
  log(`   Performance stable: ${summary.performance_stable}`, summary.performance_stable ? 'green' : 'yellow');
}

async function main() {
  log('🚀 Starting Prediction System Tests', 'bright');
  log(`Target: ${BASE_URL}`, 'white');
  log('═'.repeat(60), 'cyan');

  // Run individual tests
  await runTest('Quick Test (All Systems)', testQuickTest);
  await runTest('ML System Detailed Test', testMLSystem);
  await runTest('LSTM System Detailed Test', testLSTMSystem);
  await runTest('OR-Tools System Test', testORToolsSystem);
  await runTest('Integrated System Test', testIntegratedSystem);
  await runTest('Performance Benchmarks', testPerformanceBenchmarks);
  await runTest('Custom Stress Test', runCustomStressTest);

  log('\n🎉 All tests completed!', 'bright');
  log('═'.repeat(60), 'cyan');
  log('💡 Tips:', 'yellow');
  log('  • If LSTM tests fail, make sure you have sufficient booking data (100+ records)', 'white');
  log('  • If OR-Tools tests fail, check Python environment: pip install ortools', 'white');
  log('  • For better performance, ensure your database has recent data', 'white');
  log('  • Run tests regularly to monitor system health', 'white');
}

// Check if server is running
async function checkServerHealth() {
  try {
    const response = await makeRequest('/api/test-predictions?action=quick-test');
    if (response.statusCode === 200) {
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

// Run the tests
(async () => {
  log('🔍 Checking server health...', 'blue');
  
  const serverHealthy = await checkServerHealth();
  if (!serverHealthy) {
    log('❌ Server not responding. Make sure your Next.js server is running:', 'red');
    log('   npm run dev', 'yellow');
    log('   Then try again.', 'yellow');
    process.exit(1);
  }
  
  log('✅ Server is running!', 'green');
  
  await main();
})().catch(error => {
  log(`💥 Fatal error: ${error.message}`, 'red');
  process.exit(1);
});