import { SuggestionMLModel } from './suggestionScoring';
import { FeatureExtractor } from './featureExtraction';
import { getSafety } from '../safetyStock';
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
  private isInitialized = false;
  
  constructor() {
    this.scoringModel = new SuggestionMLModel();
    this.featureExtractor = new FeatureExtractor();
  }

  async initialize(historicalData?: MLTrainingData[]) {
    if (historicalData && historicalData.length > 0) {
      await this.scoringModel.trainModel(historicalData);
    }
    this.isInitialized = true;
  }

  async generateSmartSuggestions(context: SystemContext): Promise<EnhancedSuggestion[]> {
    if (!this.isInitialized) {
      await this.initialize(context.historical);
    }

    const candidates = await this.generateSuggestionCandidates(context);
    const scoredSuggestions = await this.scoreSuggestions(candidates, context);
    
    return scoredSuggestions
      .sort((a, b) => b.mlScore - a.mlScore)
      .slice(0, 6) // Top 6 suggestions
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