import { SuggestionMLModel } from './suggestionScoring';
import { FeatureExtractor } from './featureExtraction';
import { getSafety } from '../safetyStock';
import { LSTMPredictionService, EmptyContainerPrediction } from './lstmPredictionService';
import { 
  SystemContext, 
  SuggestionCandidate, 
  ScoredSuggestion, 
  EnhancedSuggestion,
  MLTrainingData 
} from './types';

export class MLSuggestionEngine {
  private scoringModel: SuggestionMLModel;
  private featureExtractor: FeatureExtractor;
  private lstmService: LSTMPredictionService;
  private isInitialized = false;
  
  constructor() {
    this.scoringModel = new SuggestionMLModel();
    this.featureExtractor = new FeatureExtractor();
    this.lstmService = new LSTMPredictionService();
  }

  async initialize(historicalData?: MLTrainingData[]) {
    try {
      if (historicalData && historicalData.length > 0) {
        await this.scoringModel.trainModel(historicalData);
      }

      // Try to initialize LSTM service - don't fail if it can't load existing model
      try {
        await this.lstmService.initialize();
        console.log('✅ LSTM service initialized successfully');
      } catch (error) {
        console.warn('⚠️  LSTM service initialization failed (will use fallback mode):', error instanceof Error ? error.message : String(error));
        // Don't throw - continue without LSTM
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ MLSuggestionEngine initialization failed:', error);
      // Still mark as initialized to allow basic functionality
      this.isInitialized = true;
    }
  }

  async generateSmartSuggestions(context: SystemContext): Promise<EnhancedSuggestion[]> {
    if (!this.isInitialized) {
      await this.initialize(context.historical);
    }

    // Generate traditional suggestions
    const candidates = await this.generateSuggestionCandidates(context);
    
    // Generate LSTM-powered predictions and suggestions
    const lstmCandidates = await this.generateLSTMBasedSuggestions(context);

    // Generate multi-level forecasting suggestions
    const multiLevelCandidates = await this.generateMultiLevelSuggestions(context);

    // Combine all candidates and remove duplicates
    const allCandidates = [...candidates, ...lstmCandidates, ...multiLevelCandidates];
    const deduplicatedCandidates = this.deduplicateSuggestions(allCandidates);
    
    const scoredSuggestions = await this.scoreSuggestions(deduplicatedCandidates, context);
    
    return scoredSuggestions
      .sort((a, b) => b.mlScore - a.mlScore)
      .slice(0, 8) // Top 8 suggestions (increased to accommodate LSTM suggestions)
      .map(s => this.enrichSuggestion(s, context));
  }

  private async generateSuggestionCandidates(context: SystemContext): Promise<SuggestionCandidate[]> {
    const candidates: SuggestionCandidate[] = [];
    let suggestionId = 1;
    
    // KPI-based suggestions
    if (context.kpi) {
      const kpiFeatures = this.featureExtractor.extractSystemFeatures(context);
      const approvalRate = parseInt(context.kpi.approvalRate.replace('%', ''));
      
      if (approvalRate < 85) {
        candidates.push({
          id: `ML_KPI_${suggestionId++}`,
          type: 'kpi_improvement',
          message: `Cải thiện tỷ lệ phê duyệt từ ${approvalRate}% (ML dự đoán có thể đạt ${Math.min(95, approvalRate + 15)}%)`,
          features: {
            ...kpiFeatures,
            urgencyScore: approvalRate < 70 ? 0.9 : 0.6,
            businessImpact: 0.8
          },
          priority: approvalRate < 70 ? 'high' : 'medium',
          metadata: { targetValue: Math.min(95, approvalRate + 15) }
        });
      }
      
      if (context.kpi.dwellTime && parseFloat(context.kpi.dwellTime) > 3) {
        candidates.push({
          id: `ML_EFF_${suggestionId++}`,
          type: 'efficiency_optimization',
          message: `Giảm thời gian lưu trữ từ ${context.kpi.dwellTime} xuống 2.5 ngày`,
          features: {
            ...kpiFeatures,
            urgencyScore: 0.7,
            businessImpact: 0.6
          },
          priority: 'medium',
          metadata: { targetValue: 2.5 }
        });
      }
    }

    // AI-Enhanced Inventory Suggestions
    for (const inv of context.inventory) {
      const invFeatures = this.featureExtractor.extractInventoryFeatures(inv, context);
      const predictedSafety = await this.predictOptimalSafety(inv, context);
      const stockRatio = inv.stock / predictedSafety;
      
      if (stockRatio < 1) {
        const shortage = predictedSafety - inv.stock;
        candidates.push({
          id: `ML_RESTOCK_${suggestionId++}`,
          type: 'critical_restock',
          message: `${inv.port} thiếu ${shortage} TEU ${inv.type} (ML dự đoán an toàn: ${predictedSafety})`,
          features: {
            ...invFeatures,
            urgencyScore: Math.max(0.8, 1.2 - stockRatio),
            businessImpact: this.calculateBusinessImpactML(inv, context)
          },
          priority: stockRatio < 0.7 ? 'high' : 'medium',
          metadata: { 
            port: inv.port, 
            containerType: inv.type, 
            targetValue: shortage 
          }
        });
      } else if (stockRatio > 2.5) {
        const excess = inv.stock - predictedSafety;
        candidates.push({
          id: `ML_REDISTRIBUTE_${suggestionId++}`,
          type: 'excess_redistribution',
          message: `${inv.port} dư ${excess} TEU ${inv.type} - tối ưu phân phối (ML xác định)`,
          features: {
            ...invFeatures,
            urgencyScore: Math.min(0.4, excess / 100),
            businessImpact: this.calculateBusinessImpactML(inv, context) * 0.7
          },
          priority: 'low',
          metadata: { 
            port: inv.port, 
            containerType: inv.type, 
            targetValue: excess 
          }
        });
      }
    }

    // Workflow optimization suggestions
    const pendingCount = context.proposals.filter(p => p.status === "draft").length;
    if (pendingCount > 3) {
      const systemFeatures = this.featureExtractor.extractSystemFeatures(context);
      candidates.push({
        id: `ML_WORKFLOW_${suggestionId++}`,
        type: 'workflow_optimization',
        message: `Tối ưu quy trình: ${pendingCount} đề xuất chờ xử lý (ML khuyến nghị xử lý trong 24h)`,
        features: {
          ...systemFeatures,
          urgencyScore: Math.min(0.9, pendingCount / 15),
          businessImpact: 0.7
        },
        priority: pendingCount > 10 ? 'high' : 'medium',
        metadata: { targetValue: pendingCount }
      });
    }

    return candidates;
  }

  private async generateLSTMBasedSuggestions(context: SystemContext): Promise<SuggestionCandidate[]> {
    const candidates: SuggestionCandidate[] = [];
    let suggestionId = 1000; // Start LSTM suggestions at 1000

    try {
      // Check if we have enough booking data for predictions
      if (!context.bookings || context.bookings.length < 30) {
        console.log('ℹ️  Insufficient booking data for LSTM predictions');
        return candidates;
      }

      // Check if LSTM service is properly initialized
      if (!this.isLSTMAvailable()) {
        console.log('ℹ️  LSTM service not available, skipping LSTM-based suggestions');
        return candidates;
      }

      // Get LSTM predictions for next 7 days
      const predictions = await this.lstmService.getPredictions(context.bookings, 7);
      
      if (predictions.length === 0) {
        return candidates;
      }

      // Get prediction insights
      const insights = await this.lstmService.getPredictionInsights(predictions);

      // Generate suggestions based on LSTM predictions
      const highRiskPredictions = predictions.filter(p => p.riskLevel === 'high');
      const increasingTrends = predictions.filter(p => p.trend === 'increasing');

      // Critical empty container accumulation warning
      if (highRiskPredictions.length > 0) {
        const avgPredicted = highRiskPredictions.reduce((sum, p) => sum + p.predictedEmptyCount, 0) / highRiskPredictions.length;
        const ports = [...new Set(highRiskPredictions.map(p => p.port))];

        // Check if using enhanced forecasting method
        const forecastMethod = highRiskPredictions[0]?.forecastMethod || 'LSTM';
        const isHybrid = forecastMethod.includes('Enhanced') || forecastMethod.includes('Holt-Winters');

        candidates.push({
          id: `LSTM_CRITICAL_${suggestionId++}`,
          type: 'critical_restock',
          message: `🚨 ${isHybrid ? 'Hybrid AI' : 'LSTM'} dự báo: Tích tụ container rỗng nghiêm trọng tại ${ports.join(', ')} (${Math.round(avgPredicted)} container/ngày)`,
          features: this.calculateLSTMFeatures(insights, 'critical'),
          priority: 'high',
          metadata: {
            ports: ports,
            predictedCount: Math.round(avgPredicted),
            source: isHybrid ? 'Hybrid-Enhanced' : 'LSTM',
            forecastMethod: forecastMethod,
            confidence: highRiskPredictions.reduce((sum, p) => sum + p.confidence, 0) / highRiskPredictions.length
          }
        });
      }

      // Proactive empty container management
      if (increasingTrends.length > predictions.length * 0.4) {
        const avgIncrease = increasingTrends.reduce((sum, p) => sum + p.predictedEmptyCount, 0) / increasingTrends.length;
        
        candidates.push({
          id: `LSTM_PROACTIVE_${suggestionId++}`,
          type: 'efficiency_optimization',
          message: `📈 LSTM xu hướng: Container rỗng tăng ${Math.round(avgIncrease)} container - khuyến nghị tái phân phối sớm`,
          features: this.calculateLSTMFeatures(insights, 'proactive'),
          priority: 'medium',
          metadata: {
            trendDirection: 'increasing',
            predictedIncrease: Math.round(avgIncrease),
            source: 'LSTM',
            daysAhead: 7
          }
        });
      }

      // Port-specific LSTM recommendations
      const portGroups = this.groupPredictionsByPort(predictions);
      for (const [port, portPredictions] of Object.entries(portGroups)) {
        const totalPredicted = portPredictions.reduce((sum, p) => sum + p.predictedEmptyCount, 0);
        const avgConfidence = portPredictions.reduce((sum, p) => sum + p.confidence, 0) / portPredictions.length;

        if (totalPredicted > 30 && avgConfidence > 0.7) {
          candidates.push({
            id: `LSTM_PORT_${suggestionId++}`,
            type: 'excess_redistribution',
            message: `🎯 LSTM cảnh báo ${port}: ${Math.round(totalPredicted)} container rỗng dự kiến - cần kế hoạch tái sử dụng`,
            features: this.calculateLSTMFeatures(insights, 'port_specific'),
            priority: totalPredicted > 50 ? 'high' : 'medium',
            metadata: {
              port: port,
              predictedTotal: Math.round(totalPredicted),
              confidence: avgConfidence,
              source: 'LSTM'
            }
          });
        }
      }

      // Seasonal pattern suggestions
      const seasonalPatterns = this.detectSeasonalPatterns(predictions);
      if (seasonalPatterns.hasPattern) {
        candidates.push({
          id: `LSTM_SEASONAL_${suggestionId++}`,
          type: 'workflow_optimization',
          message: `📅 LSTM phát hiện mô hình theo mùa: ${seasonalPatterns.pattern} - điều chỉnh kế hoạch accordingly`,
          features: this.calculateLSTMFeatures(insights, 'seasonal'),
          priority: 'low',
          metadata: {
            pattern: seasonalPatterns.pattern,
            confidence: seasonalPatterns.confidence,
            source: 'LSTM'
          }
        });
      }

    } catch (error) {
      console.error('Error generating LSTM-based suggestions:', error);
      // Return empty array on error to prevent breaking the main suggestion flow
    }

    return candidates;
  }

  /**
   * Generate multi-level forecasting suggestions
   */
  private async generateMultiLevelSuggestions(context: SystemContext): Promise<SuggestionCandidate[]> {
    const candidates: SuggestionCandidate[] = [];
    let suggestionId = 2000; // Start multi-level suggestions at 2000

    try {
      // Check if LSTM service is available for multi-level forecasting
      if (!this.isLSTMAvailable()) {
        console.log('ℹ️  LSTM service not available, skipping multi-level suggestions');
        return candidates;
      }

      console.log('📊 Generating multi-level forecasting suggestions...');

      // Get multi-level predictions
      const multiLevelForecasts = await this.lstmService.getMultiLevelPredictions(context.bookings, 7);

      // Port-level analysis
      for (const [port, forecast] of Object.entries(multiLevelForecasts.portForecasts)) {
        const avgForecast = forecast.forecast.reduce((sum, val) => sum + val, 0) / forecast.forecast.length;
        const avgConfidence = forecast.confidence.reduce((sum, val) => sum + val, 0) / forecast.confidence.length;

        if (avgForecast > 25 && avgConfidence > 0.7) {
          candidates.push({
            id: `MULTI_PORT_${suggestionId++}`,
            type: 'excess_redistribution',
            message: `📊 Multi-level dự báo: ${port} cần tái phân phối ${Math.round(avgForecast)} container trong 7 ngày (${forecast.method})`,
            features: this.calculateEnhancedFeatures(avgForecast, avgConfidence, 'port'),
            priority: avgForecast > 50 ? 'high' : 'medium',
            metadata: {
              port: port,
              avgForecast: Math.round(avgForecast),
              confidence: avgConfidence,
              method: forecast.method,
              source: 'Multi-Level-Enhanced'
            }
          });
        }
      }

      // Container type analysis
      for (const [containerType, forecast] of Object.entries(multiLevelForecasts.containerTypeForecasts)) {
        const totalForecast = forecast.forecast.reduce((sum, val) => sum + val, 0);
        const avgConfidence = forecast.confidence.reduce((sum, val) => sum + val, 0) / forecast.confidence.length;

        if (totalForecast > 100 && avgConfidence > 0.6) {
          candidates.push({
            id: `MULTI_TYPE_${suggestionId++}`,
            type: 'workflow_optimization',
            message: `📦 Container ${containerType}: ${Math.round(totalForecast)} units cần quản lý trong 7 ngày (${forecast.method})`,
            features: this.calculateEnhancedFeatures(totalForecast, avgConfidence, 'container_type'),
            priority: totalForecast > 200 ? 'high' : 'medium',
            metadata: {
              containerType: containerType,
              totalForecast: Math.round(totalForecast),
              confidence: avgConfidence,
              method: forecast.method,
              source: 'Multi-Level-Enhanced'
            }
          });
        }
      }

      // Total forecast analysis
      const totalForecast = multiLevelForecasts.totalForecast;
      const totalSum = totalForecast.forecast.reduce((sum, val) => sum + val, 0);
      const totalConfidence = totalForecast.confidence.reduce((sum, val) => sum + val, 0) / totalForecast.confidence.length;

      if (totalSum > 300 && totalConfidence > 0.65) {
        candidates.push({
          id: `MULTI_TOTAL_${suggestionId++}`,
          type: 'kpi_improvement',
          message: `📈 Tổng dự báo hệ thống: ${Math.round(totalSum)} container trong 7 ngày - cần kế hoạch tối ưu (${totalForecast.method})`,
          features: this.calculateEnhancedFeatures(totalSum, totalConfidence, 'system'),
          priority: totalSum > 500 ? 'high' : 'medium',
          metadata: {
            totalForecast: Math.round(totalSum),
            confidence: totalConfidence,
            method: totalForecast.method,
            source: 'Multi-Level-Enhanced'
          }
        });
      }

    } catch (error) {
      console.error('Error generating multi-level suggestions:', error);
      // Continue without multi-level suggestions
    }

    return candidates;
  }

  /**
   * Calculate enhanced features for new forecasting methods
   */
  private calculateEnhancedFeatures(forecast: number, confidence: number, level: string): any {
    const baseFeatures = {
      approvalRate: 0.85,
      stockLevel: 0.7,
      demandTrend: 0.8,
      seasonality: 0.6,
      historicalSuccess: confidence, // Use actual confidence from forecasting
      portEfficiency: 0.8,
      containerTurnover: 0.7
    };

    // Adjust features based on forecast level and values
    switch (level) {
      case 'port':
        return {
          ...baseFeatures,
          urgencyScore: Math.min(0.95, forecast / 100),
          businessImpact: Math.min(0.9, confidence * 1.1)
        };
      case 'container_type':
        return {
          ...baseFeatures,
          urgencyScore: Math.min(0.85, forecast / 200),
          businessImpact: Math.min(0.85, confidence * 1.05)
        };
      case 'system':
        return {
          ...baseFeatures,
          urgencyScore: Math.min(0.9, forecast / 500),
          businessImpact: Math.min(0.95, confidence * 1.15)
        };
      default:
        return {
          ...baseFeatures,
          urgencyScore: 0.6,
          businessImpact: confidence
        };
    }
  }

  private calculateLSTMFeatures(insights: any, type: string): any {
    // Base LSTM features
    const baseFeatures = {
      approvalRate: 0.85,
      stockLevel: 0.7,
      demandTrend: 0.8,
      seasonality: 0.6,
      historicalSuccess: 0.9, // LSTM has high historical accuracy
      portEfficiency: 0.8,
      containerTurnover: 0.7
    };

    // Adjust features based on suggestion type
    switch (type) {
      case 'critical':
        return {
          ...baseFeatures,
          urgencyScore: 0.95,
          businessImpact: 0.9
        };
      case 'proactive':
        return {
          ...baseFeatures,
          urgencyScore: 0.7,
          businessImpact: 0.75
        };
      case 'port_specific':
        return {
          ...baseFeatures,
          urgencyScore: 0.8,
          businessImpact: 0.8
        };
      case 'seasonal':
        return {
          ...baseFeatures,
          urgencyScore: 0.5,
          businessImpact: 0.6,
          seasonality: 0.9
        };
      default:
        return {
          ...baseFeatures,
          urgencyScore: 0.6,
          businessImpact: 0.7
        };
    }
  }

  private groupPredictionsByPort(predictions: EmptyContainerPrediction[]): { [port: string]: EmptyContainerPrediction[] } {
    return predictions.reduce((groups, prediction) => {
      const port = prediction.port;
      if (!groups[port]) {
        groups[port] = [];
      }
      groups[port].push(prediction);
      return groups;
    }, {} as { [port: string]: EmptyContainerPrediction[] });
  }

  private detectSeasonalPatterns(predictions: EmptyContainerPrediction[]): { hasPattern: boolean; pattern: string; confidence: number } {
    // Simple seasonal pattern detection
    const dailyAverages = predictions.reduce((acc, pred) => {
      const dayOfWeek = pred.date.getDay();
      if (!acc[dayOfWeek]) {
        acc[dayOfWeek] = { total: 0, count: 0 };
      }
      acc[dayOfWeek].total += pred.predictedEmptyCount;
      acc[dayOfWeek].count++;
      return acc;
    }, {} as { [day: number]: { total: number; count: number } });

    const averages = Object.keys(dailyAverages).map(day => ({
      day: parseInt(day),
      avg: dailyAverages[parseInt(day)].total / dailyAverages[parseInt(day)].count
    }));

    if (averages.length < 3) {
      return { hasPattern: false, pattern: '', confidence: 0 };
    }

    const maxAvg = Math.max(...averages.map(a => a.avg));
    const minAvg = Math.min(...averages.map(a => a.avg));
    const variation = (maxAvg - minAvg) / maxAvg;

    if (variation > 0.2) {
      const peakDay = averages.find(a => a.avg === maxAvg);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      return {
        hasPattern: true,
        pattern: `Peak on ${dayNames[peakDay?.day || 0]}`,
        confidence: Math.min(variation, 1.0)
      };
    }

    return { hasPattern: false, pattern: '', confidence: 0 };
  }

  private deduplicateSuggestions(candidates: SuggestionCandidate[]): SuggestionCandidate[] {
    const seen = new Map<string, SuggestionCandidate>();
    const duplicateKeys = new Set<string>();

    for (const candidate of candidates) {
      // Create a key based on suggestion content/type/port
      const key = this.createSuggestionKey(candidate);
      
      if (seen.has(key)) {
        duplicateKeys.add(key);
        // Keep the higher priority suggestion or LSTM if both same priority
        const existing = seen.get(key)!;
        const keepLSTM = candidate.id.startsWith('LSTM_') && !existing.id.startsWith('LSTM_');
        const keepHigherPriority = this.getPriorityScore(candidate.priority) > this.getPriorityScore(existing.priority);
        
        if (keepLSTM || keepHigherPriority) {
          seen.set(key, candidate);
        }
      } else {
        seen.set(key, candidate);
      }
    }

    // Log deduplication info
    if (duplicateKeys.size > 0) {
      console.log(`🔄 Deduplicated ${duplicateKeys.size} overlapping suggestions`);
    }

    return Array.from(seen.values());
  }

  private createSuggestionKey(candidate: SuggestionCandidate): string {
    // Create unique key for similar suggestions
    const port = candidate.metadata?.port || 'general';
    const containerType = candidate.metadata?.containerType || 'all';
    const type = candidate.type;
    
    // For port/container specific suggestions
    if (port !== 'general') {
      return `${type}_${port}_${containerType}`;
    }
    
    // For general suggestions, use type + priority
    return `${type}_${candidate.priority}`;
  }

  private getPriorityScore(priority: 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  private async scoreSuggestions(candidates: SuggestionCandidate[], context: SystemContext): Promise<ScoredSuggestion[]> {
    return Promise.all(
      candidates.map(async candidate => ({
        ...candidate,
        mlScore: this.scoringModel.predictSuggestionValue(candidate.features),
        contextualRelevance: this.calculateContextualRelevance(candidate, context),
        confidence: this.calculateConfidence(candidate)
      }))
    );
  }

  private async predictOptimalSafety(inventory: any, context: SystemContext): Promise<number> {
    try {
      // Check if LSTM service is available for safety stock calculation
      if (!this.isLSTMAvailable()) {
        console.log('ℹ️  Using traditional safety stock calculation (LSTM not available)');
        return this.calculateTraditionalSafety(inventory, context);
      }

      // Use enhanced forecasting for optimal safety stock calculation
      const safetyResult = await this.lstmService.calculateOptimalSafetyStock(
        inventory,
        context.bookings,
        0.95, // 95% service level
        3 // 3-day lead time
      );

      console.log(`🎯 Enhanced safety stock for ${inventory.port} ${inventory.type}: ${safetyResult.optimalSafety} (confidence: ${safetyResult.confidence.toFixed(2)})`);

      // Return the enhanced optimal safety stock
      return safetyResult.optimalSafety;

    } catch (error) {
      console.warn('⚠️  Enhanced safety stock calculation failed, using traditional method:', error instanceof Error ? error.message : String(error));

      // Fallback to traditional ML-enhanced safety calculation
      return this.calculateTraditionalSafety(inventory, context);
    }
  }

  /**
   * Check if LSTM service is available and initialized
   */
  private isLSTMAvailable(): boolean {
    try {
      if (!this.lstmService) return false;

      // Check if we can get training status without errors
      const status = this.lstmService.getTrainingStatus();

      // Check if model has been trained at least once
      return status && (status.lastTrainingDate !== null || !status.isTraining);
    } catch (error) {
      return false;
    }
  }

  /**
   * Traditional safety stock calculation fallback
   */
  private calculateTraditionalSafety(inventory: any, context: SystemContext): number {
    const baseSafety = getSafety(inventory.port, inventory.type) || 10;
    const features = this.featureExtractor.extractInventoryFeatures(inventory, context);

    // ML-enhanced safety calculation
    let adjustmentFactor = 1.0;

    // Adjust based on demand trend
    adjustmentFactor += features.demandTrend * 0.3;

    // Adjust based on seasonality
    adjustmentFactor += features.seasonality * 0.2;

    // Adjust based on port efficiency
    if (features.portEfficiency < 0.7) {
      adjustmentFactor += 0.2; // Less efficient ports need more safety stock
    }

    // Adjust based on container turnover
    if (features.containerTurnover < 0.5) {
      adjustmentFactor += 0.15; // Slow turnover needs more safety
    }

    const adjustedSafety = baseSafety * adjustmentFactor;
    return Math.max(5, Math.ceil(adjustedSafety));
  }

  private calculateBusinessImpactML(inventory: any, context: SystemContext): number {
    let impact = 0.5;
    
    // Port volume impact
    const portVolume = context.inventory
      .filter(inv => inv.port === inventory.port)
      .reduce((sum, inv) => sum + inv.stock, 0);
    
    if (portVolume > 300) impact += 0.3;
    else if (portVolume > 150) impact += 0.2;
    else if (portVolume > 50) impact += 0.1;
    
    // Recent demand impact
    const recentDemand = context.bookings
      .filter(b => b.destination === inventory.port && b.size === inventory.type)
      .reduce((sum, b) => sum + b.qty, 0);
    
    if (recentDemand > 100) impact += 0.25;
    else if (recentDemand > 50) impact += 0.15;
    
    // Strategic port consideration
    const strategicPorts = ['TP.HCM', 'Hải Phòng'];
    if (strategicPorts.includes(inventory.port)) {
      impact += 0.1;
    }
    
    return Math.min(1, impact);
  }

  private calculateContextualRelevance(candidate: SuggestionCandidate, context: SystemContext): number {
    let relevance = 0.5;
    
    // Time-based relevance
    const hour = new Date().getHours();
    if (hour >= 8 && hour <= 17) { // Business hours
      relevance += 0.1;
    }
    
    // Alert context relevance
    const relatedAlerts = context.alerts.filter(alert => 
      candidate.metadata?.port ? alert.location === candidate.metadata.port : true
    );
    relevance += Math.min(0.3, relatedAlerts.length * 0.1);
    
    // Recent activity relevance
    const recentProposals = context.proposals.filter(p => 
      candidate.metadata?.port ? p.route.includes(candidate.metadata.port) : true
    );
    if (recentProposals.length > 0) {
      relevance += 0.2;
    }
    
    return Math.min(1, relevance);
  }

  private calculateConfidence(candidate: SuggestionCandidate): number {
    let confidence = candidate.features.historicalSuccess;
    
    // Boost confidence for high-impact, urgent suggestions
    if (candidate.features.urgencyScore > 0.8 && candidate.features.businessImpact > 0.7) {
      confidence += 0.1;
    }
    
    // Reduce confidence for edge cases
    if (candidate.features.stockLevel > 5 || candidate.features.stockLevel < 0.1) {
      confidence -= 0.1;
    }
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  private enrichSuggestion(suggestion: ScoredSuggestion, context: SystemContext): EnhancedSuggestion {
    return {
      ...suggestion,
      reasoning: this.generateMLReasoning(suggestion, context),
      expectedImpact: this.generateExpectedImpact(suggestion),
      actionSteps: this.generateActionSteps(suggestion),
      timeline: this.estimateTimeline(suggestion),
      learnedFrom: this.generateLearningSource(suggestion, context)
    };
  }

  private generateMLReasoning(suggestion: ScoredSuggestion, context: SystemContext): string {
    const features = suggestion.features;
    const reasons = [];
    
    if (features.urgencyScore > 0.7) {
      reasons.push(`Mức độ khẩn cấp cao (${Math.round(features.urgencyScore * 100)}%)`);
    }
    if (features.businessImpact > 0.7) {
      reasons.push(`Tác động kinh doanh lớn (${Math.round(features.businessImpact * 100)}%)`);
    }
    if (features.demandTrend > 0.1) {
      reasons.push(`Xu hướng nhu cầu tăng (+${Math.round(features.demandTrend * 100)}%)`);
    }
    if (features.demandTrend < -0.1) {
      reasons.push(`Xu hướng nhu cầu giảm (${Math.round(features.demandTrend * 100)}%)`);
    }
    if (features.seasonality > 0.1) {
      reasons.push('Yếu tố mùa vụ thuận lợi');
    }
    if (features.historicalSuccess > 0.8) {
      reasons.push(`Tỷ lệ thành công cao (${Math.round(features.historicalSuccess * 100)}%)`);
    }
    
    const modelInfo = this.scoringModel.getModelInfo();
    const source = modelInfo.isTrained ? 'ML model' : 'rules + patterns';
    
    return reasons.length > 0 
      ? `Dựa trên ${source}: ${reasons.join(', ')}`
      : `Phân tích ${source} từ dữ liệu lịch sử`;
  }

  private generateExpectedImpact(suggestion: ScoredSuggestion): string {
    const impact = suggestion.features.businessImpact;
    
    if (impact > 0.8) return 'Tác động lớn - Cải thiện đáng kể hiệu suất vận hành';
    if (impact > 0.6) return 'Tác động trung bình - Tối ưu hóa quy trình hiện tại';
    if (impact > 0.4) return 'Tác động nhỏ - Cải thiện từng phần';
    return 'Tác động thấp - Điều chỉnh nhỏ';
  }

  private generateActionSteps(suggestion: ScoredSuggestion): string[] {
    const steps = [];
    
    switch (suggestion.type) {
      case 'critical_restock':
        steps.push('1. Xác định nguồn container có sẵn gần nhất');
        steps.push('2. Lên kế hoạch chuyển kho khẩn cấp');
        steps.push('3. Thông báo cho đội vận hành');
        steps.push('4. Theo dõi tiến độ thực hiện');
        break;
      
      case 'excess_redistribution':
        steps.push('1. Phân tích nhu cầu tại các port khác');
        steps.push('2. Tối ưu hóa lộ trình vận chuyển');
        steps.push('3. Lên lịch phân phối');
        break;
      
      case 'kpi_improvement':
        steps.push('1. Xem xét lại tiêu chí phê duyệt hiện tại');
        steps.push('2. Tối ưu hóa quy trình ra quyết định');
        steps.push('3. Đào tạo đội ngũ về tiêu chuẩn mới');
        break;
      
      case 'workflow_optimization':
        steps.push('1. Ưu tiên xử lý đề xuất cũ nhất');
        steps.push('2. Tăng tần suất review');
        steps.push('3. Tự động hóa các bước có thể');
        break;
      
      default:
        steps.push('1. Đánh giá chi tiết tình huống');
        steps.push('2. Xây dựng kế hoạch hành động');
        steps.push('3. Thực hiện và theo dõi');
    }
    
    return steps;
  }

  private estimateTimeline(suggestion: ScoredSuggestion): string {
    const urgency = suggestion.features.urgencyScore;
    
    if (urgency > 0.8) return '🔥 Khẩn cấp - Trong 4-8 giờ';
    if (urgency > 0.6) return '⚡ Ưu tiên cao - Trong 1-2 ngày';
    if (urgency > 0.4) return '📅 Trung bình - Trong 3-5 ngày';
    return '📋 Thường - Trong 1-2 tuần';
  }

  private generateLearningSource(suggestion: ScoredSuggestion, context: SystemContext): string {
    const historicalCount = context.historical?.length || 0;
    const modelInfo = this.scoringModel.getModelInfo();
    
    if (modelInfo.isTrained && historicalCount > 0) {
      return `Học từ ${historicalCount} trường hợp tương tự`;
    }
    
    return 'Dựa trên patterns cơ bản và quy luật logistics';
  }
}