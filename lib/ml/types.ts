export interface SuggestionFeatures {
  approvalRate: number;
  stockLevel: number;
  demandTrend: number;
  seasonality: number;
  historicalSuccess: number;
  urgencyScore: number;
  businessImpact: number;
  portEfficiency: number;
  containerTurnover: number;
}

export interface SuggestionCandidate {
  id: string;
  type: 'kpi_improvement' | 'critical_restock' | 'excess_redistribution' | 'workflow_optimization' | 'efficiency_optimization';
  message: string;
  features: SuggestionFeatures;
  priority: 'high' | 'medium' | 'low';
  metadata?: {
    port?: string;
    containerType?: string;
    targetValue?: number;
  };
}

export interface ScoredSuggestion extends SuggestionCandidate {
  mlScore: number;
  contextualRelevance: number;
  confidence: number;
}

export interface EnhancedSuggestion extends ScoredSuggestion {
  reasoning: string;
  expectedImpact: string;
  actionSteps: string[];
  timeline: string;
  learnedFrom: string;
}

export interface MLTrainingData {
  id: string;
  timestamp: Date;
  features: SuggestionFeatures;
  suggestion: SuggestionCandidate;
  outcome: number; // 0-1 score based on user action
  context: {
    inventorySnapshot: any[];
    demandData: any[];
    kpiMetrics: any;
    alertsActive: any[];
    proposalsStatus: Array<{id: string; status: string}>;
    seasonalContext: string;
    timestamp: string;
  };
}

export interface SystemContext {
  kpi: any;
  inventory: any[];
  proposals: any[];
  alerts: any[];
  bookings: any[];
  historical?: MLTrainingData[];
}