import { SuggestionFeatures, SuggestionCandidate, MLTrainingData } from './types';

export class SuggestionMLModel {
  private weights: number[] = [];
  private isTrained = false;
  private featureNames = [
    'approvalRate', 'stockLevel', 'demandTrend', 'seasonality',
    'historicalSuccess', 'urgencyScore', 'businessImpact', 
    'portEfficiency', 'containerTurnover'
  ];
  private trainingHistory: { features: number[]; outcome: number }[] = [];

  constructor() {
    // Initialize with reasonable default weights
    this.weights = [0.1, 0.2, 0.15, 0.1, 0.25, 0.3, 0.25, 0.1, 0.1];
  }

  async trainModel(trainingData: MLTrainingData[]) {
    if (trainingData.length < 3) {
      console.log('Insufficient training data, using default weights');
      return;
    }

    try {
      // Store training history
      this.trainingHistory = trainingData.map(d => ({
        features: this.extractFeatureVector(d.features),
        outcome: d.outcome
      }));

      // Simple weighted learning approach
      if (trainingData.length >= 5) {
        this.updateWeights(this.trainingHistory);
        this.isTrained = true;
      }
      
      console.log(`ML model updated with ${trainingData.length} examples`);
    } catch (error) {
      console.error('Model training failed:', error);
      this.isTrained = false;
    }
  }

  private updateWeights(history: { features: number[]; outcome: number }[]) {
    // Simple adaptive weight update based on feature correlation with outcomes
    const featureCount = this.weights.length;
    const newWeights = [...this.weights];
    
    for (let i = 0; i < featureCount; i++) {
      let correlation = 0;
      let validSamples = 0;
      
      // Calculate correlation between feature[i] and outcomes
      for (const sample of history) {
        if (sample.features[i] !== undefined && !isNaN(sample.features[i])) {
          correlation += sample.features[i] * sample.outcome;
          validSamples++;
        }
      }
      
      if (validSamples > 0) {
        correlation /= validSamples;
        // Adjust weight based on correlation (simple learning rate = 0.1)
        newWeights[i] = Math.max(0.01, Math.min(0.5, this.weights[i] + correlation * 0.1));
      }
    }
    
    // Normalize weights
    const sum = newWeights.reduce((acc, w) => acc + w, 0);
    this.weights = newWeights.map(w => w / sum);
  }

  predictSuggestionValue(features: SuggestionFeatures): number {
    try {
      const featureVector = this.extractFeatureVector(features);
      
      // Weighted sum prediction
      let prediction = 0;
      for (let i = 0; i < featureVector.length; i++) {
        prediction += featureVector[i] * this.weights[i];
      }
      
      // Add some learning from historical data if available
      if (this.isTrained && this.trainingHistory.length > 0) {
        prediction = this.adjustWithHistory(prediction, featureVector);
      }
      
      // Ensure prediction is between 0 and 1
      return Math.max(0, Math.min(1, prediction));
    } catch (error) {
      console.error('Prediction failed:', error);
      return this.fallbackScore(features);
    }
  }

  private adjustWithHistory(basePrediction: number, currentFeatures: number[]): number {
    // Find similar historical cases and adjust prediction
    let adjustment = 0;
    let similarCases = 0;
    
    for (const history of this.trainingHistory) {
      const similarity = this.calculateSimilarity(currentFeatures, history.features);
      if (similarity > 0.7) { // Only use very similar cases
        adjustment += (history.outcome - basePrediction) * similarity;
        similarCases++;
      }
    }
    
    if (similarCases > 0) {
      adjustment /= similarCases;
      return basePrediction + adjustment * 0.3; // 30% adjustment from history
    }
    
    return basePrediction;
  }

  private calculateSimilarity(features1: number[], features2: number[]): number {
    let similarity = 0;
    let validFeatures = 0;
    
    for (let i = 0; i < Math.min(features1.length, features2.length); i++) {
      if (!isNaN(features1[i]) && !isNaN(features2[i])) {
        similarity += 1 - Math.abs(features1[i] - features2[i]);
        validFeatures++;
      }
    }
    
    return validFeatures > 0 ? similarity / validFeatures : 0;
  }

  private extractFeatureVector(features: SuggestionFeatures): number[] {
    return [
      features.approvalRate / 100,
      Math.min(1, features.stockLevel),
      Math.max(-1, Math.min(1, features.demandTrend)),
      Math.max(-1, Math.min(1, features.seasonality)),
      features.historicalSuccess,
      features.urgencyScore,
      features.businessImpact,
      features.portEfficiency,
      features.containerTurnover
    ];
  }

  private fallbackScore(features: SuggestionFeatures): number {
    // Rule-based fallback when ML model isn't available
    let score = 0.5; // Base score
    
    // Urgency contributes most to score
    score += features.urgencyScore * 0.3;
    
    // Business impact is second most important
    score += features.businessImpact * 0.2;
    
    // Historical success affects confidence
    score += features.historicalSuccess * 0.2;
    
    // Demand trend adjustment
    score += features.demandTrend * 0.1;
    
    // Stock level adjustment (both low and high stock can be important)
    if (features.stockLevel < 0.5) {
      score += (0.5 - features.stockLevel) * 0.1; // Boost for low stock
    } else if (features.stockLevel > 2) {
      score += 0.1; // Boost for excess stock
    }
    
    // Approval rate penalty for unrealistic suggestions
    if (features.approvalRate < 50) {
      score *= 0.8; // Reduce score for poor approval context
    }
    
    return Math.max(0, Math.min(1, score));
  }

  getModelInfo() {
    return {
      isTrained: this.isTrained,
      featureNames: this.featureNames,
      modelType: 'WeightedLinearModel',
      weights: this.weights,
      trainingDataCount: this.trainingHistory.length
    };
  }
}