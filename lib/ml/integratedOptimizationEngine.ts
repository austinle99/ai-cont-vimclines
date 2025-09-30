import { MLSuggestionEngine } from './enhancedSuggestions';
import { LSTMPredictionService, EmptyContainerPrediction } from './lstmPredictionService';
import { ORToolsService, OptimizationResult, PortData, ContainerData, RouteData, DemandData } from '../optimization/orToolsService';
import { SystemContext, EnhancedSuggestion } from './types';

export interface IntegratedOptimization {
  ml_suggestions: EnhancedSuggestion[];
  lstm_predictions: EmptyContainerPrediction[];
  or_tools_optimization: OptimizationResult | ComprehensiveOptimization;
  integrated_recommendations: IntegratedRecommendation[];
  confidence_score: number;
  execution_summary: ExecutionSummary;
}

export interface IntegratedRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: 'ML' | 'LSTM' | 'OR-Tools' | 'Integrated';
  type: 'immediate_action' | 'planned_action' | 'monitoring' | 'strategic';
  title: string;
  description: string;
  action_steps: string[];
  expected_impact: {
    cost_savings: number;
    efficiency_gain: number;
    risk_reduction: number;
  };
  timeline: {
    start: Date;
    completion: Date;
    review: Date;
  };
  success_metrics: string[];
  fallback_plan: string[];
}

export interface ComprehensiveOptimization {
  redistribution: OptimizationResult;
  assignment: OptimizationResult;
  routing?: OptimizationResult;
  combined_recommendations: string[];
  total_estimated_cost: number;
}

export interface ExecutionSummary {
  total_execution_time: number;
  services_used: string[];
  data_quality_score: number;
  optimization_success_rate: number;
  recommendations_count: number;
  estimated_roi: number;
}

export class IntegratedOptimizationEngine {
  private mlEngine: MLSuggestionEngine;
  private lstmService: LSTMPredictionService;
  private orToolsService: ORToolsService;
  private isInitialized: boolean = false;

  constructor() {
    this.mlEngine = new MLSuggestionEngine();
    this.lstmService = new LSTMPredictionService();
    this.orToolsService = new ORToolsService();
  }

  /**
   * Initialize all optimization services
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Integrated Optimization Engine...');
      
      // Initialize all services in parallel
      await Promise.all([
        this.mlEngine.initialize(),
        this.lstmService.initialize(),
        this.orToolsService.initialize()
      ]);

      this.isInitialized = true;
      console.log('✅ Integrated Optimization Engine ready');

    } catch (error) {
      console.error('❌ Failed to initialize Integrated Optimization Engine:', error);
      throw error;
    }
  }

  /**
   * Run complete integrated optimization
   */
  async runIntegratedOptimization(
    context: SystemContext,
    options: {
      include_or_tools?: boolean;
      optimization_horizon?: number; // days
      max_execution_time?: number; // seconds
      cost_weight?: number;
      efficiency_weight?: number;
      risk_weight?: number;
    } = {}
  ): Promise<IntegratedOptimization> {
    
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const {
      include_or_tools = true,
      optimization_horizon = 7,
      max_execution_time = 120,
      cost_weight = 0.4,
      efficiency_weight = 0.35,
      risk_weight = 0.25
    } = options;

    try {
      console.log('🧠 Running integrated optimization...');

      // Step 1: Traditional ML Suggestions (Fast)
      console.log('   📊 Step 1: ML suggestions...');
      const mlSuggestions = await this.mlEngine.generateSmartSuggestions(context);

      // Step 2: LSTM Predictions (Medium speed)
      console.log('   🔮 Step 2: LSTM predictions...');
      let lstmPredictions: EmptyContainerPrediction[] = [];
      
      try {
        if (context.bookings && context.bookings.length >= 30) {
          lstmPredictions = await this.lstmService.getPredictions(
            context.bookings, 
            optimization_horizon
          );
        }
      } catch (lstmError) {
        console.log('   ⚠️  LSTM predictions failed, continuing without:', lstmError);
      }

      // Step 3: OR-Tools Optimization (Slow but powerful)
      let orToolsResult: OptimizationResult | ComprehensiveOptimization | null = null;
      
      if (include_or_tools) {
        console.log('   🎯 Step 3: OR-Tools optimization...');
        try {
          // Convert system context to OR-Tools format
          const { ports, containers, routes, demands } = this.convertContextToORToolsFormat(
            context, 
            lstmPredictions
          );

          if (ports.length > 0 && containers.length > 0) {
            orToolsResult = await this.orToolsService.optimizeComprehensive(
              ports, 
              containers, 
              routes, 
              demands,
              this.convertLSTMPredictionsForORTools(lstmPredictions)
            );
          }
        } catch (orError) {
          console.log('   ⚠️  OR-Tools optimization failed, continuing without:', orError);
        }
      }

      // Step 4: Integrate all results
      console.log('   🔗 Step 4: Integrating results...');
      const integratedRecommendations = await this.integrateRecommendations(
        mlSuggestions,
        lstmPredictions,
        orToolsResult,
        { cost_weight, efficiency_weight, risk_weight }
      );

      // Step 5: Calculate confidence and summary
      const executionTime = Date.now() - startTime;
      const confidenceScore = this.calculateConfidenceScore(
        mlSuggestions,
        lstmPredictions,
        orToolsResult
      );

      const executionSummary: ExecutionSummary = {
        total_execution_time: executionTime,
        services_used: [
          'ML Engine',
          ...(lstmPredictions.length > 0 ? ['LSTM Service'] : []),
          ...(orToolsResult ? ['OR-Tools'] : [])
        ],
        data_quality_score: this.assessDataQuality(context),
        optimization_success_rate: this.calculateSuccessRate(
          mlSuggestions.length,
          lstmPredictions.length,
          orToolsResult ? 1 : 0
        ),
        recommendations_count: integratedRecommendations.length,
        estimated_roi: this.calculateEstimatedROI(integratedRecommendations)
      };

      console.log(`✅ Integrated optimization completed in ${executionTime}ms`);

      return {
        ml_suggestions: mlSuggestions,
        lstm_predictions: lstmPredictions,
        or_tools_optimization: orToolsResult || this.createFallbackOptimization(),
        integrated_recommendations: integratedRecommendations,
        confidence_score: confidenceScore,
        execution_summary: executionSummary
      };

    } catch (error) {
      console.error('❌ Integrated optimization failed:', error);
      throw error;
    }
  }

  private async integrateRecommendations(
    mlSuggestions: EnhancedSuggestion[],
    lstmPredictions: EmptyContainerPrediction[],
    orToolsResult: OptimizationResult | ComprehensiveOptimization | null,
    weights: { cost_weight: number; efficiency_weight: number; risk_weight: number }
  ): Promise<IntegratedRecommendation[]> {
    
    const recommendations: IntegratedRecommendation[] = [];
    let recommendationId = 1;

    // 1. Critical Actions from OR-Tools (if available)
    if (orToolsResult && 'relocations' in orToolsResult && orToolsResult.relocations) {
      const urgentRelocations = orToolsResult.relocations.filter(r => r.priority === 'high');
      
      if (urgentRelocations.length > 0) {
        recommendations.push({
          id: `INTEGRATED_${recommendationId++}`,
          priority: 'critical',
          source: 'OR-Tools',
          type: 'immediate_action',
          title: '🚨 Urgent Container Relocations Required',
          description: `OR-Tools identified ${urgentRelocations.length} critical container movements needed within 3 days to prevent bottlenecks.`,
          action_steps: [
            'Execute high-priority relocations immediately',
            'Monitor capacity at source and destination ports',
            'Coordinate with logistics partners for transport',
            'Track relocation progress and adjust if needed'
          ],
          expected_impact: {
            cost_savings: orToolsResult.total_cost ? orToolsResult.total_cost * 0.15 : 5000,
            efficiency_gain: 0.25,
            risk_reduction: 0.4
          },
          timeline: {
            start: new Date(),
            completion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            review: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          success_metrics: [
            'All high-priority relocations completed on time',
            'Port utilization balanced within target ranges',
            'No storage capacity exceeded'
          ],
          fallback_plan: [
            'Emergency external storage arrangements',
            'Expedited transport if delays occur',
            'Alternative routing options'
          ]
        });
      }
    }

    // 2. LSTM Predictive Actions
    const highRiskPredictions = lstmPredictions.filter(p => p.riskLevel === 'high');
    if (highRiskPredictions.length > 0) {
      const avgPredicted = highRiskPredictions.reduce((sum, p) => sum + p.predictedEmptyCount, 0) / highRiskPredictions.length;
      const affectedPorts = [...new Set(highRiskPredictions.map(p => p.port))];

      recommendations.push({
        id: `INTEGRATED_${recommendationId++}`,
        priority: 'high',
        source: 'LSTM',
        type: 'planned_action',
        title: '📈 Proactive Empty Container Management',
        description: `LSTM forecasts ${Math.round(avgPredicted)} excess empty containers at ${affectedPorts.join(', ')} within 7 days.`,
        action_steps: [
          'Prepare redistribution plan for predicted surplus',
          'Identify export booking opportunities',
          'Arrange additional storage capacity if needed',
          'Set up monitoring alerts for trend changes'
        ],
        expected_impact: {
          cost_savings: avgPredicted * 5 * 7, // $5 per container per day saved
          efficiency_gain: 0.2,
          risk_reduction: 0.3
        },
        timeline: {
          start: new Date(Date.now() + 24 * 60 * 60 * 1000),
          completion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          review: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        },
        success_metrics: [
          'Empty container levels stay within capacity limits',
          'Successful redistribution to demand areas',
          'LSTM prediction accuracy maintained above 80%'
        ],
        fallback_plan: [
          'Emergency repositioning program',
          'Temporary external depot arrangements',
          'Accelerated export booking campaigns'
        ]
      });
    }

    // 3. ML System Operational Improvements
    const highPriorityML = mlSuggestions.filter(s => s.priority === 'high').slice(0, 3);
    for (const mlSuggestion of highPriorityML) {
      recommendations.push({
        id: `INTEGRATED_${recommendationId++}`,
        priority: mlSuggestion.priority as 'critical' | 'high' | 'medium' | 'low',
        source: 'ML',
        type: 'immediate_action',
        title: `⚡ ${mlSuggestion.type.replace(/_/g, ' ').toUpperCase()}`,
        description: mlSuggestion.message,
        action_steps: mlSuggestion.actionSteps,
        expected_impact: {
          cost_savings: this.extractCostSavings(mlSuggestion.expectedImpact),
          efficiency_gain: mlSuggestion.confidence * 0.3,
          risk_reduction: mlSuggestion.mlScore * 0.2
        },
        timeline: {
          start: new Date(),
          completion: new Date(Date.now() + this.parseTimeline(mlSuggestion.timeline)),
          review: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        success_metrics: [
          'Implementation completed on schedule',
          'Target metrics achieved',
          'No negative side effects observed'
        ],
        fallback_plan: [
          'Revert to previous configuration if needed',
          'Alternative implementation approach',
          'Manual oversight until automation stable'
        ]
      });
    }

    // 4. Integrated Strategic Recommendation
    if (orToolsResult && lstmPredictions.length > 0 && mlSuggestions.length > 0) {
      const totalCost = 'total_estimated_cost' in orToolsResult ? orToolsResult.total_estimated_cost : 0;
      const avgConfidence = lstmPredictions.reduce((sum, p) => sum + p.confidence, 0) / lstmPredictions.length;

      recommendations.push({
        id: `INTEGRATED_${recommendationId++}`,
        priority: 'medium',
        source: 'Integrated',
        type: 'strategic',
        title: '🎯 Comprehensive Container Strategy',
        description: `Integrated analysis suggests a coordinated approach combining immediate ML actions, LSTM-guided planning, and OR-Tools optimization for maximum efficiency.`,
        action_steps: [
          'Implement immediate ML recommendations',
          'Execute OR-Tools relocation plan',
          'Monitor LSTM predictions for plan adjustments',
          'Review integrated performance weekly'
        ],
        expected_impact: {
          cost_savings: totalCost * 0.2,
          efficiency_gain: 0.35,
          risk_reduction: 0.5
        },
        timeline: {
          start: new Date(),
          completion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          review: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        },
        success_metrics: [
          'Overall system efficiency improved by 20%+',
          'Container utilization optimized across all ports',
          'Predictive accuracy maintained above 75%',
          'Cost reduction targets achieved'
        ],
        fallback_plan: [
          'Revert to individual system optimizations',
          'Increase manual oversight and intervention',
          'Adjust weights and parameters based on performance'
        ]
      });
    }

    // Sort by priority and impact
    return recommendations.sort((a, b) => {
      const priorityScore = {
        'critical': 4,
        'high': 3,
        'medium': 2,
        'low': 1
      };
      
      const aScore = priorityScore[a.priority] * 1000 + a.expected_impact.cost_savings;
      const bScore = priorityScore[b.priority] * 1000 + b.expected_impact.cost_savings;
      
      return bScore - aScore;
    }).slice(0, 8); // Top 8 integrated recommendations
  }

  private convertContextToORToolsFormat(
    context: SystemContext,
    lstmPredictions: EmptyContainerPrediction[]
  ): {
    ports: PortData[];
    containers: ContainerData[];
    routes: RouteData[];
    demands: DemandData[];
  } {
    // Convert inventory to ports
    const ports: PortData[] = context.inventory.map(inv => {
      const portPredictions = lstmPredictions.filter(p => p.port === inv.port);
      const forecast = portPredictions.length > 0 ? 
        portPredictions.map(p => p.predictedEmptyCount) :
        Array(7).fill(Math.floor(inv.stock * 0.1)); // Default forecast

      return {
        name: inv.port,
        current_empty: Math.floor(inv.stock * 0.3), // Estimate empty containers
        capacity: inv.stock * 3, // Estimate total capacity
        lstm_forecast: forecast,
        storage_cost: 2.5, // Default cost
        handling_cost: 5.0, // Default cost
        lat: 0, // Would need real coordinates
        lng: 0
      };
    });

    // Convert bookings to containers
    const containers: ContainerData[] = context.bookings
      ?.filter(b => b.emptyLaden?.toLowerCase().includes('empty'))
      .slice(0, 100) // Limit for performance
      .map((b, index) => ({
        id: b.containerNo || `CONT_${index.toString().padStart(4, '0')}`,
        type: b.size || '20GP',
        current_port: b.origin,
        dwell_time: Math.floor((Date.now() - b.date.getTime()) / (1000 * 60 * 60 * 24)),
        next_booking_port: b.destination !== b.origin ? b.destination : undefined,
        priority: Math.floor((b.optimizationScore || 50) / 10)
      })) || [];

    // Generate basic routes between ports
    const routes: RouteData[] = [];
    ports.forEach(fromPort => {
      ports.forEach(toPort => {
        if (fromPort.name !== toPort.name) {
          routes.push({
            from: fromPort.name,
            to: toPort.name,
            distance: 100 + Math.random() * 500, // Estimated distance
            cost: 50 + Math.random() * 100, // Estimated cost
            transit_time: 24 + Math.random() * 48, // 1-3 days
            capacity: 50 + Math.floor(Math.random() * 50) // 50-100 TEU
          });
        }
      });
    });

    // Convert proposals to demands
    const demands: DemandData[] = context.proposals
      ?.filter(p => p.status === 'draft' || p.status === 'pending')
      .slice(0, 50) // Limit for performance
      .map(p => {
        const routeParts = p.route.split('-');
        const destinationPort = routeParts[1] || routeParts[0];
        
        return {
          id: p.id,
          port: destinationPort,
          required_type: p.size || '20GP',
          quantity: p.qty,
          priority: 5, // Default priority
          deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 2 weeks from now
        };
      }) || [];

    return { ports, containers, routes, demands };
  }

  private convertLSTMPredictionsForORTools(predictions: EmptyContainerPrediction[]) {
    return predictions.map(pred => ({
      port: pred.port,
      container_type: pred.containerType,
      predictions: Array(7).fill(pred.predictedEmptyCount),
      confidence: Array(7).fill(pred.confidence)
    }));
  }

  private calculateConfidenceScore(
    mlSuggestions: EnhancedSuggestion[],
    lstmPredictions: EmptyContainerPrediction[],
    orToolsResult: OptimizationResult | ComprehensiveOptimization | null
  ): number {
    let totalScore = 0;
    let components = 0;

    // ML confidence
    if (mlSuggestions.length > 0) {
      const avgMLConfidence = mlSuggestions.reduce((sum, s) => sum + s.confidence, 0) / mlSuggestions.length;
      totalScore += avgMLConfidence * 0.3;
      components++;
    }

    // LSTM confidence
    if (lstmPredictions.length > 0) {
      const avgLSTMConfidence = lstmPredictions.reduce((sum, p) => sum + p.confidence, 0) / lstmPredictions.length;
      totalScore += avgLSTMConfidence * 0.4;
      components++;
    }

    // OR-Tools success
    if (orToolsResult && 'redistribution' in orToolsResult && orToolsResult.redistribution.status !== 'error') {
      totalScore += 0.9 * 0.3; // High confidence for OR-Tools when it works
      components++;
    } else if (orToolsResult && 'status' in orToolsResult && orToolsResult.status !== 'error') {
      totalScore += 0.9 * 0.3; // High confidence for OR-Tools when it works
      components++;
    }

    return components > 0 ? totalScore / components : 0.5;
  }

  private assessDataQuality(context: SystemContext): number {
    let score = 0;
    let factors = 0;

    // Inventory data quality
    if (context.inventory.length > 0) {
      score += Math.min(context.inventory.length / 10, 1) * 20;
      factors++;
    }

    // Booking data quality
    if (context.bookings && context.bookings.length > 0) {
      const recentBookings = context.bookings.filter(b => 
        (Date.now() - b.date.getTime()) < 30 * 24 * 60 * 60 * 1000
      );
      score += Math.min(recentBookings.length / 50, 1) * 30;
      factors++;
    }

    // Proposals data
    if (context.proposals.length > 0) {
      score += Math.min(context.proposals.length / 20, 1) * 20;
      factors++;
    }

    // KPI data
    if (context.kpi) {
      score += 30;
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  private calculateSuccessRate(mlCount: number, lstmCount: number, orToolsSuccess: number): number {
    let successfulServices = 0;
    let totalServices = 3;

    if (mlCount > 0) successfulServices++;
    if (lstmCount > 0) successfulServices++;
    if (orToolsSuccess > 0) successfulServices++;

    return successfulServices / totalServices;
  }

  private calculateEstimatedROI(recommendations: IntegratedRecommendation[]): number {
    const totalSavings = recommendations.reduce((sum, r) => sum + r.expected_impact.cost_savings, 0);
    const implementationCost = totalSavings * 0.2; // Assume 20% implementation cost
    
    return implementationCost > 0 ? (totalSavings - implementationCost) / implementationCost : 0;
  }

  private extractCostSavings(expectedImpact: string): number {
    // Try to extract cost savings from expected impact text
    const match = expectedImpact.match(/\$?([\d,]+)/);
    return match ? parseInt(match[1].replace(',', '')) : 1000; // Default
  }

  private parseTimeline(timeline: string): number {
    // Convert timeline to milliseconds
    if (timeline.includes('immediate')) return 0;
    if (timeline.includes('day')) {
      const match = timeline.match(/(\d+)\s*day/);
      return match ? parseInt(match[1]) * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    }
    if (timeline.includes('week')) {
      const match = timeline.match(/(\d+)\s*week/);
      return match ? parseInt(match[1]) * 7 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    }
    return 7 * 24 * 60 * 60 * 1000; // Default 1 week
  }

  private createFallbackOptimization(): OptimizationResult {
    return {
      status: 'fallback',
      recommendations: [
        'OR-Tools optimization not available',
        'Using ML and LSTM recommendations only',
        'Consider setting up Python OR-Tools environment for enhanced optimization'
      ]
    };
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      initialized: this.isInitialized,
      ml_engine: 'ready',
      lstm_service: this.lstmService.getTrainingStatus(),
      or_tools_service: this.orToolsService.getServiceStatus(),
      capabilities: [
        'Traditional ML Suggestions',
        'LSTM Time Series Predictions', 
        'OR-Tools Mathematical Optimization',
        'Integrated Multi-System Recommendations',
        'Risk Assessment and Mitigation',
        'ROI Calculation and Planning'
      ]
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.lstmService.dispose();
    this.orToolsService.dispose();
    console.log('🧹 Integrated Optimization Engine disposed');
  }
}