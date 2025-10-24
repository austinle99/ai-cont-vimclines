"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";

interface Prediction {
  date: string;
  port: string;
  containerType: string;
  predictedEmpty: number;
  confidence: number;
  confidenceLabel: string;
  riskLevel: 'low' | 'medium' | 'high';
  method: string;
  trend: string;
  breakdown: {
    gbr: number | null;
    lstm: number | null;
    ensemble: number | null;
  };
  weights: {
    gbr: number;
    lstm: number;
  };
}

interface PredictionMetadata {
  totalPredictions: number;
  avgConfidence: number;
  avgConfidenceLabel: string;
  horizon: string;
  trainingDataSize: number;
  riskBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  filters: {
    port: string;
    containerType: string;
  };
  generatedAt: string;
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [metadata, setMetadata] = useState<PredictionMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    days: 7,
    port: 'all',
    type: 'all'
  });

  useEffect(() => {
    fetchPredictions();
  }, [filters]);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        days: filters.days.toString(),
        ...(filters.port !== 'all' && { port: filters.port }),
        ...(filters.type !== 'all' && { type: filters.type })
      });

      const res = await fetch(`/api/predictions?${params}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch predictions');
      }

      setPredictions(data.predictions || []);
      setMetadata(data.metadata);
    } catch (err) {
      console.error('Error fetching predictions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setPredictions([]);
      setMetadata(null);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'low':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      default:
        return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="h-screen flex">
      <Sidebar current="predictions" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Empty Container Predictions</h1>
            <p className="text-neutral-400 text-sm mt-1">
              AI-powered forecasting using GBR + LSTM ensemble models
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-2">Forecast Horizon</label>
              <select
                value={filters.days}
                onChange={(e) => setFilters({...filters, days: parseInt(e.target.value)})}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="3">3 Days</option>
                <option value="7">7 Days</option>
                <option value="14">14 Days</option>
                <option value="30">30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-2">Port</label>
              <select
                value={filters.port}
                onChange={(e) => setFilters({...filters, port: e.target.value})}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Ports</option>
                <option value="VNHPH">Hai Phong (VNHPH)</option>
                <option value="VNSGN">Ho Chi Minh (VNSGN)</option>
                <option value="VNDAN">Da Nang (VNDAN)</option>
                <option value="MYPKG">Port Klang (MYPKG)</option>
                <option value="INCCU">Cochin (INCCU)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-2">Container Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="20GP">20GP</option>
                <option value="40GP">40GP</option>
                <option value="40HC">40HC</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={fetchPredictions}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Metadata Summary */}
        {metadata && !loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 text-sm">Total Predictions</div>
              <div className="text-2xl font-bold mt-1">{metadata.totalPredictions}</div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 text-sm">Avg Confidence</div>
              <div className={`text-2xl font-bold mt-1 ${getConfidenceColor(metadata.avgConfidence)}`}>
                {metadata.avgConfidenceLabel}
              </div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 text-sm">High Risk</div>
              <div className="text-2xl font-bold mt-1 text-red-400">{metadata.riskBreakdown.high}</div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 text-sm">Training Data</div>
              <div className="text-2xl font-bold mt-1">{metadata.trainingDataSize} bookings</div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <div className="text-red-400 font-semibold mb-2">Error Loading Predictions</div>
            <div className="text-neutral-400 text-sm">{error}</div>
            <button
              onClick={fetchPredictions}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
            <div className="text-neutral-400">Loading predictions...</div>
          </div>
        )}

        {/* Predictions Grid */}
        {!loading && !error && predictions.length > 0 && (
          <div className="space-y-3">
            {predictions.map((pred, idx) => (
              <div
                key={idx}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="font-bold text-lg">{new Date(pred.date).toLocaleDateString()}</div>
                      <div className="text-neutral-400">•</div>
                      <div className="text-neutral-300">{pred.port}</div>
                      <div className="text-neutral-400">•</div>
                      <div className="text-neutral-300">{pred.containerType}</div>
                    </div>
                    <div className="text-sm text-neutral-400">
                      Method: {pred.method} ({pred.weights.gbr}% GBR, {pred.weights.lstm}% LSTM)
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-3xl font-bold">{pred.predictedEmpty}</div>
                      <div className="text-xs text-neutral-400">containers</div>
                    </div>

                    <div className="text-right">
                      <div className={`text-sm font-semibold ${getConfidenceColor(pred.confidence)}`}>
                        {pred.confidenceLabel}
                      </div>
                      <div className="text-xs text-neutral-400">confidence</div>
                    </div>

                    <div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskColor(pred.riskLevel)}`}>
                        {pred.riskLevel.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Model Breakdown */}
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-neutral-400">GBR Model</div>
                      <div className="font-semibold text-blue-400">
                        {pred.breakdown.gbr !== null ? pred.breakdown.gbr : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">LSTM Model</div>
                      <div className="font-semibold text-purple-400">
                        {pred.breakdown.lstm !== null ? pred.breakdown.lstm : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Ensemble Result</div>
                      <div className="font-semibold text-green-400">
                        {pred.breakdown.ensemble !== null ? Math.round(pred.breakdown.ensemble) : pred.predictedEmpty}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && predictions.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
            <div className="text-neutral-400 mb-2">No predictions available</div>
            <div className="text-neutral-500 text-sm">
              Try adjusting your filters or upload historical data first
            </div>
          </div>
        )}
      </main>
      <Chatbot />
    </div>
  );
}
