import { mean, standardDeviation } from 'simple-statistics';
import { getSafety } from '../safetyStock';
import { SystemContext, SuggestionFeatures } from './types';

export class FeatureExtractor {
  
  extractSystemFeatures(context: SystemContext): SuggestionFeatures {
    return {
      approvalRate: this.extractApprovalRate(context),
      stockLevel: this.extractStockLevel(context),
      demandTrend: this.extractDemandTrend(context),
      seasonality: this.extractSeasonality(),
      historicalSuccess: this.extractHistoricalSuccess(context),
      urgencyScore: this.extractUrgencyScore(context),
      businessImpact: this.extractBusinessImpact(context),
      portEfficiency: this.extractPortEfficiency(context),
      containerTurnover: this.extractContainerTurnover(context)
    };
  }

  extractInventoryFeatures(inventory: any, context: SystemContext): SuggestionFeatures {
    const safety = getSafety(inventory.port, inventory.type);
    const stockRatio = safety > 0 ? inventory.stock / safety : 1;
    
    return {
      approvalRate: this.extractApprovalRate(context),
      stockLevel: stockRatio,
      demandTrend: this.extractPortDemandTrend(inventory.port, inventory.type, context),
      seasonality: this.extractSeasonality(),
      historicalSuccess: this.extractHistoricalSuccessForPort(inventory.port, context),
      urgencyScore: this.calculateStockUrgency(stockRatio),
      businessImpact: this.calculateInventoryBusinessImpact(inventory, context),
      portEfficiency: this.extractPortEfficiency(context, inventory.port),
      containerTurnover: this.extractContainerTurnover(context, inventory.type)
    };
  }

  private extractApprovalRate(context: SystemContext): number {
    if (!context.kpi?.approvalRate) return 75; // Default assumption
    return parseInt(context.kpi.approvalRate.replace('%', '')) || 75;
  }

  private extractStockLevel(context: SystemContext): number {
    if (!context.inventory.length) return 0.5;
    
    const stockRatios = context.inventory.map(inv => {
      const safety = getSafety(inv.port, inv.type);
      return safety > 0 ? inv.stock / safety : 1;
    });
    
    return mean(stockRatios);
  }

  private extractDemandTrend(context: SystemContext): number {
    if (!context.bookings || context.bookings.length < 2) return 0;
    
    // Calculate week-over-week demand change
    const sortedBookings = context.bookings.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    const recentDemand = sortedBookings.slice(-7).reduce((sum, b) => sum + b.qty, 0);
    const previousDemand = sortedBookings.slice(-14, -7).reduce((sum, b) => sum + b.qty, 0);
    
    if (previousDemand === 0) return 0;
    return (recentDemand - previousDemand) / previousDemand;
  }

  private extractPortDemandTrend(port: string, type: string, context: SystemContext): number {
    if (!context.bookings) return 0;
    
    const portBookings = context.bookings.filter(b => 
      b.destination === port && b.size === type
    );
    
    if (portBookings.length < 2) return 0;
    
    const sortedBookings = portBookings.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    const recent = sortedBookings.slice(-3).reduce((sum, b) => sum + b.qty, 0);
    const previous = sortedBookings.slice(-6, -3).reduce((sum, b) => sum + b.qty, 0);
    
    if (previous === 0) return 0;
    return (recent - previous) / previous;
  }

  private extractSeasonality(): number {
    const month = new Date().getMonth();
    const seasonalFactors = {
      0: 0.8,   // January - Low season
      1: 0.9,   // February
      2: 1.1,   // March - Spring pickup
      3: 1.2,   // April
      4: 1.1,   // May
      5: 1.0,   // June
      6: 0.9,   // July
      7: 0.8,   // August - Summer lull
      8: 1.2,   // September - Peak season start
      9: 1.3,   // October - Peak
      10: 1.4,  // November - Peak
      11: 1.1   // December - Holiday season
    };
    
    return seasonalFactors[month as keyof typeof seasonalFactors] - 1; // Normalize around 0
  }

  private extractHistoricalSuccess(context: SystemContext): number {
    if (!context.historical) return 0.5; // Default neutral score
    
    if (context.historical.length === 0) return 0.5;
    
    const successScores = context.historical.map(h => h.outcome);
    return mean(successScores);
  }

  private extractHistoricalSuccessForPort(port: string, context: SystemContext): number {
    if (!context.historical) return 0.5;
    
    const portSuggestions = context.historical.filter(h => 
      h.suggestion.metadata?.port === port
    );
    
    if (portSuggestions.length === 0) return 0.5;
    
    const successScores = portSuggestions.map(h => h.outcome);
    return mean(successScores);
  }

  private extractUrgencyScore(context: SystemContext): number {
    let urgencyScore = 0;
    
    // Critical alerts increase urgency
    const criticalAlerts = context.alerts.filter(a => a.level === "Cao").length;
    urgencyScore += Math.min(0.4, criticalAlerts * 0.1);
    
    // Low approval rate increases urgency
    const approvalRate = this.extractApprovalRate(context);
    if (approvalRate < 70) {
      urgencyScore += 0.3;
    } else if (approvalRate < 80) {
      urgencyScore += 0.2;
    }
    
    // High pending proposals increase urgency
    const pendingCount = context.proposals.filter(p => p.status === "draft").length;
    urgencyScore += Math.min(0.3, pendingCount * 0.02);
    
    return Math.min(1, urgencyScore);
  }

  private calculateStockUrgency(stockRatio: number): number {
    if (stockRatio < 0.5) return 0.9; // Critical shortage
    if (stockRatio < 0.8) return 0.7; // Low stock
    if (stockRatio > 3) return 0.6;   // Excess stock
    if (stockRatio > 2) return 0.3;   // High stock
    return 0.2; // Normal stock
  }

  private extractBusinessImpact(context: SystemContext): number {
    let impact = 0.5; // Base impact
    
    // High volume operations have higher impact
    const totalVolume = context.inventory.reduce((sum, inv) => sum + inv.stock, 0);
    if (totalVolume > 1000) impact += 0.2;
    else if (totalVolume > 500) impact += 0.1;
    
    // Multiple alerts indicate systemic issues (higher impact)
    const alertCount = context.alerts.length;
    impact += Math.min(0.3, alertCount * 0.05);
    
    return Math.min(1, impact);
  }

  private calculateInventoryBusinessImpact(inventory: any, context: SystemContext): number {
    let impact = 0.5;
    
    // High-volume ports have higher impact
    const portVolume = context.inventory
      .filter(inv => inv.port === inventory.port)
      .reduce((sum, inv) => sum + inv.stock, 0);
    
    if (portVolume > 200) impact += 0.3;
    else if (portVolume > 100) impact += 0.2;
    
    // Demand for this specific container type
    const containerDemand = context.bookings
      .filter(b => b.destination === inventory.port && b.size === inventory.type)
      .reduce((sum, b) => sum + b.qty, 0);
    
    if (containerDemand > 50) impact += 0.2;
    
    return Math.min(1, impact);
  }

  private extractPortEfficiency(context: SystemContext, specificPort?: string): number {
    const ports = specificPort ? [specificPort] : 
      [...new Set(context.inventory.map(inv => inv.port))];
    
    const efficiencies = ports.map(port => {
      const portProposals = context.proposals.filter(p => 
        p.route.includes(port)
      );
      
      if (portProposals.length === 0) return 0.5;
      
      const approved = portProposals.filter(p => p.status === "approved").length;
      return approved / portProposals.length;
    });
    
    return efficiencies.length > 0 ? mean(efficiencies) : 0.5;
  }

  private extractContainerTurnover(context: SystemContext, specificType?: string): number {
    const types = specificType ? [specificType] : 
      [...new Set(context.inventory.map(inv => inv.type))];
    
    const turnovers = types.map(type => {
      const typeInventory = context.inventory.filter(inv => inv.type === type);
      const typeDemand = context.bookings.filter(b => b.size === type);
      
      if (typeInventory.length === 0 || typeDemand.length === 0) return 0.5;
      
      const totalStock = typeInventory.reduce((sum, inv) => sum + inv.stock, 0);
      const totalDemand = typeDemand.reduce((sum, b) => sum + b.qty, 0);
      
      // Higher ratio = better turnover
      return totalStock > 0 ? Math.min(1, totalDemand / totalStock) : 0;
    });
    
    return turnovers.length > 0 ? mean(turnovers) : 0.5;
  }
}