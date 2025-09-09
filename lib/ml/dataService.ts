import { MLTrainingData, SystemContext, SuggestionCandidate, EnhancedSuggestion, SuggestionFeatures } from './types';

// Dynamic prisma import to avoid build issues
async function getPrisma() {
  const { prisma } = await import("../db");
  return prisma as any; // Type assertion to work around generated type issues
}

export class MLDataService {
  
  async storeTrainingData(
    suggestions: EnhancedSuggestion[], 
    context: SystemContext, 
    sessionId: string
  ): Promise<void> {
    if (!suggestions?.length) {
      throw new Error('No suggestions provided');
    }
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    try {
      const prisma = await getPrisma();
      
      const trainingRecords = suggestions.map(suggestion => {
        if (!suggestion.id || !suggestion.type) {
          throw new Error('Invalid suggestion: missing required fields');
        }
        
        return {
          id: suggestion.id,
          features: suggestion.features,
          suggestion: {
            id: suggestion.id,
            type: suggestion.type,
            message: suggestion.message,
            priority: suggestion.priority,
            metadata: suggestion.metadata
          },
          context: {
            inventorySnapshot: context.inventory || [],
            demandData: context.bookings || [],
            kpiMetrics: context.kpi || {},
            alertsActive: context.alerts || [],
            proposalsStatus: (context.proposals || []).map(p => ({ id: p.id, status: p.status })),
            seasonalContext: this.getSeasonalContext(),
            timestamp: new Date().toISOString()
          },
          sessionId,
          outcome: null
        };
      });

      await prisma.mLTrainingData.createMany({
        data: trainingRecords,
        skipDuplicates: true
      });
    } catch (error) {
      console.error('Error storing training data:', error);
      throw new Error(`Failed to store training data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async recordSuggestionFeedback(
    suggestionId: string, 
    action: 'accepted' | 'rejected' | 'modified' | 'ignored',
    notes?: string
  ): Promise<void> {
    if (!suggestionId) {
      throw new Error('Suggestion ID is required');
    }
    if (!action) {
      throw new Error('Action is required');
    }

    try {
      const prisma = await getPrisma();
      
      // Check if training data exists
      const existingData = await prisma.mLTrainingData.findUnique({
        where: { id: suggestionId }
      });
      
      if (!existingData) {
        throw new Error(`Training data not found for suggestion ID: ${suggestionId}`);
      }
      
      // Record the feedback
      await prisma.suggestionFeedback.create({
        data: {
          suggestionId,
          action,
          notes,
          context: {
            timestamp: new Date().toISOString(),
            userAgent: 'web-interface'
          }
        }
      });

      // Update the training data with outcome score
      const outcomeScore = this.actionToScore(action);
      await prisma.mLTrainingData.update({
        where: { id: suggestionId },
        data: { 
          outcome: outcomeScore,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error recording suggestion feedback:', error);
      throw new Error(`Failed to record feedback: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getHistoricalTrainingData(limit = 1000): Promise<MLTrainingData[]> {
    try {
      const prisma = await getPrisma();
      
      const records = await prisma.mLTrainingData.findMany({
        where: {
          outcome: { not: null }
        },
        orderBy: { timestamp: 'desc' },
        take: Math.max(1, Math.min(limit, 10000)), // Clamp limit between 1 and 10000
        include: {
          feedback: true
        }
      });

      return records.map((record: any) => ({
        id: record.id,
        timestamp: record.timestamp,
        features: record.features as SuggestionFeatures,
        suggestion: record.suggestion as SuggestionCandidate,
        outcome: record.outcome || 0,
        context: record.context as MLTrainingData['context']
      }));
    } catch (error) {
      console.error('Error fetching historical training data:', error);
      throw new Error(`Failed to fetch training data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSessionTrainingData(sessionId: string): Promise<MLTrainingData[]> {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    try {
      const prisma = await getPrisma();
      
      const records = await prisma.mLTrainingData.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'desc' },
        include: {
          feedback: true
        }
      });

      return records.map((record: any) => ({
        id: record.id,
        timestamp: record.timestamp,
        features: record.features as SuggestionFeatures,
        suggestion: record.suggestion as SuggestionCandidate,
        outcome: record.outcome || 0,
        context: record.context as MLTrainingData['context']
      }));
    } catch (error) {
      console.error('Error fetching session training data:', error);
      throw new Error(`Failed to fetch session data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMLInsights(): Promise<{
    totalSuggestions: number;
    feedbackRate: number;
    acceptanceRate: number;
    topPerformingSuggestionTypes: Array<{type: string; successRate: number}>;
    recentTrends: {
      weeklyAcceptance: number;
      improvementTrend: number;
    };
  }> {
    const prisma = await getPrisma();
    
    const totalSuggestions = await prisma.mLTrainingData.count();
    const suggestionsWithFeedback = await prisma.mLTrainingData.count({
      where: { outcome: { not: null } }
    });
    
    const feedbackRate = totalSuggestions > 0 ? suggestionsWithFeedback / totalSuggestions : 0;
    
    // Get suggestions with feedback to calculate acceptance rate
    const feedbackData = await prisma.suggestionFeedback.findMany({
      include: { trainingData: true }
    });
    
    const acceptedCount = feedbackData.filter((f: any) => f.action === 'accepted').length;
    const acceptanceRate = feedbackData.length > 0 ? acceptedCount / feedbackData.length : 0;
    
    // Analyze by suggestion type
    const typePerformance = await this.analyzeSuggestionTypePerformance(feedbackData);
    
    // Weekly trends
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const recentFeedback = feedbackData.filter((f: any) => 
      new Date(f.timestamp) > weekAgo
    );
    const weeklyAcceptance = recentFeedback.length > 0 ? 
      recentFeedback.filter((f: any) => f.action === 'accepted').length / recentFeedback.length : 0;
    
    return {
      totalSuggestions,
      feedbackRate,
      acceptanceRate,
      topPerformingSuggestionTypes: typePerformance,
      recentTrends: {
        weeklyAcceptance,
        improvementTrend: weeklyAcceptance - acceptanceRate
      }
    };
  }

  private async analyzeSuggestionTypePerformance(feedbackData: any[]): Promise<Array<{type: string; successRate: number}>> {
    const typeStats = new Map<string, {total: number; accepted: number}>();
    
    for (const feedback of feedbackData) {
      // Safety check for nested properties
      if (!feedback?.trainingData?.suggestion?.type) {
        console.warn('Invalid feedback data structure:', feedback);
        continue;
      }
      
      const suggestionType = feedback.trainingData.suggestion.type;
      const stats = typeStats.get(suggestionType) || {total: 0, accepted: 0};
      
      stats.total++;
      if (feedback.action === 'accepted') {
        stats.accepted++;
      }
      
      typeStats.set(suggestionType, stats);
    }
    
    return Array.from(typeStats.entries())
      .map(([type, stats]) => ({
        type,
        successRate: stats.total > 0 ? stats.accepted / stats.total : 0
      }))
      .sort((a, b) => b.successRate - a.successRate);
  }

  private actionToScore(action: string): number {
    switch (action) {
      case 'accepted': return 1.0;
      case 'modified': return 0.7;
      case 'rejected': return 0.1;
      case 'ignored': return 0.3;
      default: return 0.5;
    }
  }

  private getSeasonalContext(): string {
    const month = new Date().getMonth();
    const seasonMap = {
      0: 'winter-low', 1: 'winter-low', 2: 'spring-start',
      3: 'spring-peak', 4: 'spring-end', 5: 'summer-start',
      6: 'summer-mid', 7: 'summer-low', 8: 'autumn-start',
      9: 'autumn-peak', 10: 'autumn-peak', 11: 'winter-holiday'
    };
    return seasonMap[month as keyof typeof seasonMap];
  }

  async cleanupOldData(daysToKeep = 180): Promise<void> {
    if (daysToKeep < 1) {
      throw new Error('Days to keep must be at least 1');
    }

    try {
      const prisma = await getPrisma();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      // Delete old training data (this will cascade to feedback due to relation)
      const result = await prisma.mLTrainingData.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
          outcome: null // Only delete data without feedback
        }
      });
      
      console.log(`Cleaned up ${result.count} old training records`);
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      throw new Error(`Failed to cleanup old data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}