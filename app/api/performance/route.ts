/**
 * Performance Dashboard API
 * Provides real-time performance metrics and statistics
 */

import { performanceMonitor } from '@/lib/monitoring/performanceMonitor';
import { predictionCache } from '@/lib/cache/predictionCache';
import EnsembleServiceSingleton from '@/lib/ml/ensembleServiceSingleton';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Get performance stats
    if (action === 'stats') {
      const stats = performanceMonitor.getStats();
      const breakdown = performanceMonitor.getEndpointBreakdown();

      return Response.json({
        success: true,
        overall: stats,
        breakdown,
        timestamp: new Date().toISOString()
      });
    }

    // Get cache stats
    if (action === 'cache') {
      const cacheStats = predictionCache.getStats();
      return Response.json({
        success: true,
        cache: cacheStats,
        timestamp: new Date().toISOString()
      });
    }

    // Get ensemble service status
    if (action === 'ensemble') {
      const status = await EnsembleServiceSingleton.getStatus();
      return Response.json({
        success: true,
        ensemble: status,
        timestamp: new Date().toISOString()
      });
    }

    // Get recent metrics
    if (action === 'recent') {
      const count = parseInt(url.searchParams.get('count') || '20');
      const recent = performanceMonitor.getRecentMetrics(count);
      return Response.json({
        success: true,
        recent,
        timestamp: new Date().toISOString()
      });
    }

    // Clear performance metrics
    if (action === 'clear') {
      performanceMonitor.clear();
      return Response.json({
        success: true,
        message: 'Performance metrics cleared',
        timestamp: new Date().toISOString()
      });
    }

    // Export all metrics
    if (action === 'export') {
      const exported = performanceMonitor.exportMetrics();
      return new Response(exported, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="performance-metrics-${Date.now()}.json"`
        }
      });
    }

    // Default: return comprehensive dashboard
    const stats = performanceMonitor.getStats();
    const breakdown = performanceMonitor.getEndpointBreakdown();
    const cacheStats = predictionCache.getStats();
    const ensembleStatus = await EnsembleServiceSingleton.getStatus();
    const recent = performanceMonitor.getRecentMetrics(10);

    return Response.json({
      success: true,
      dashboard: {
        performance: {
          overall: stats,
          breakdown
        },
        cache: cacheStats,
        ensemble: ensembleStatus,
        recentRequests: recent
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Performance API error:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}