"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";

interface ContainerTracking {
  containerNo: string;
  containerType: string;
  emptyLaden: string;
  currentLocation: string;
  lastMovementDate: Date;
  firstSeenDate: Date;
  dwellDays: number;
  status: string;
}

interface LongstayAnalysis {
  id: string;
  containerNo: string;
  currentDwellDays: number;
  predictedDwellDays: number | null;
  longstayRiskScore: number;
  riskLevel: string;
  recommendedAction: string | null;
  suggestedDestination: string | null;
  estimatedCost: number | null;
  potentialSavings: number | null;
  analysisDate: Date;
  status: string;
  containerTracking: ContainerTracking;
}

interface Stats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  averageRiskScore: number;
  averageDwellDays: number;
  totalEstimatedCost: number;
  totalPotentialSavings: number;
}

interface LocationData {
  count: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  averageRiskScore: number;
  containers: string[];
}

export default function LongstayDashboard() {
  const [analyses, setAnalyses] = useState<LongstayAnalysis[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [byLocation, setByLocation] = useState<Record<string, LocationData>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [searchContainer, setSearchContainer] = useState<string>('');

  useEffect(() => {
    fetchAnalyses();
  }, [selectedRiskLevel, selectedLocation, searchContainer]);

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedRiskLevel) params.append('riskLevel', selectedRiskLevel);
      if (selectedLocation) params.append('location', selectedLocation);
      if (searchContainer) params.append('containerNo', searchContainer);

      const response = await fetch(`/api/longstay-analysis?${params}`);
      const data = await response.json();

      if (data.success) {
        setAnalyses(data.data || []);
        setStats(data.stats || null);
        setByLocation(data.byLocation || {});
      }
    } catch (error) {
      console.error('Error fetching longstay analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/20';
      default: return 'text-neutral-400 bg-neutral-500/10 border-neutral-500/20';
    }
  };

  const getRiskBadge = (riskLevel: string) => {
    const color = getRiskColor(riskLevel);
    return (
      <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${color}`}>
        {riskLevel.toUpperCase()}
      </span>
    );
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'N/A';
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="h-screen flex bg-black">
        <Sidebar current="longstay" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Phân tích Longstay Empty Containers</h1>
            <p className="text-neutral-400">Dự đoán và quản lý containers có nguy cơ longstay cao</p>
          </div>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div>Đang tải dữ liệu...</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-black">
      <Sidebar current="longstay" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-2">Phân tích Longstay Empty Containers</h1>
          <p className="text-neutral-400">Dự đoán và quản lý containers có nguy cơ longstay cao</p>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 text-sm mb-1">Tổng số containers</div>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-xs text-neutral-500 mt-2">
                Trung bình: {stats.averageDwellDays.toFixed(1)} ngày
              </div>
            </div>

            <div className="bg-neutral-900 border border-red-500/20 rounded-xl p-4">
              <div className="text-neutral-400 text-sm mb-1">Mức độ nghiêm trọng</div>
              <div className="text-3xl font-bold text-red-500">{stats.critical}</div>
              <div className="text-xs text-neutral-500 mt-2">
                Cao: {stats.high} | Trung bình: {stats.medium}
              </div>
            </div>

            <div className="bg-neutral-900 border border-orange-500/20 rounded-xl p-4">
              <div className="text-neutral-400 text-sm mb-1">Chi phí ước tính</div>
              <div className="text-2xl font-bold text-orange-500">
                ${stats.totalEstimatedCost.toFixed(0)}
              </div>
              <div className="text-xs text-neutral-500 mt-2">
                Tổng chi phí lưu kho hiện tại
              </div>
            </div>

            <div className="bg-neutral-900 border border-green-500/20 rounded-xl p-4">
              <div className="text-neutral-400 text-sm mb-1">Tiết kiệm tiềm năng</div>
              <div className="text-2xl font-bold text-green-500">
                ${stats.totalPotentialSavings.toFixed(0)}
              </div>
              <div className="text-xs text-neutral-500 mt-2">
                Nếu thực hiện đề xuất
              </div>
            </div>
          </div>
        )}

        {/* Location Breakdown */}
        {Object.keys(byLocation).length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Phân bố theo địa điểm</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(byLocation).map(([location, data]) => (
                <div key={location} className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
                  <div className="font-semibold mb-2">{location}</div>
                  <div className="text-2xl font-bold mb-2">{data.count} containers</div>
                  <div className="flex gap-2 text-xs mb-2">
                    {data.critical > 0 && (
                      <span className="text-red-500">{data.critical} Critical</span>
                    )}
                    {data.high > 0 && (
                      <span className="text-orange-500">{data.high} High</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400">
                    Điểm rủi ro TB: {data.averageRiskScore.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-neutral-400 mb-2 block">Mức độ rủi ro</label>
              <select
                value={selectedRiskLevel}
                onChange={(e) => setSelectedRiskLevel(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Tất cả</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-neutral-400 mb-2 block">Địa điểm</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Tất cả</option>
                {Object.keys(byLocation).map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-neutral-400 mb-2 block">Tìm kiếm Container</label>
              <input
                type="text"
                placeholder="Nhập số container..."
                value={searchContainer}
                onChange={(e) => setSearchContainer(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Analysis Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-800 border-b border-neutral-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Loại</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Địa điểm</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Dwell Days</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Dự đoán</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Risk Score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Mức độ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Đề xuất</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Chi phí</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-400">Tiết kiệm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {analyses.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-neutral-400">
                      <div className="text-lg mb-2">🎉</div>
                      <div>Không có containers rủi ro longstay</div>
                      <div className="text-sm mt-1">Thử thay đổi bộ lọc để xem thêm</div>
                    </td>
                  </tr>
                ) : (
                  analyses.map((analysis) => (
                    <tr key={analysis.id} className="hover:bg-neutral-800/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono">
                        {analysis.containerNo}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-neutral-800 rounded text-xs">
                          {analysis.containerTracking?.containerType || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {analysis.containerTracking?.currentLocation || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="font-semibold">{analysis.currentDwellDays}</span> ngày
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-400">
                        {analysis.predictedDwellDays || 'N/A'} ngày
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-neutral-700 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${
                                analysis.longstayRiskScore >= 80 ? 'bg-red-500' :
                                analysis.longstayRiskScore >= 60 ? 'bg-orange-500' :
                                analysis.longstayRiskScore >= 40 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${analysis.longstayRiskScore}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold w-8">
                            {analysis.longstayRiskScore.toFixed(0)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {getRiskBadge(analysis.riskLevel)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="text-blue-400 text-xs">
                          {analysis.recommendedAction || 'monitor'}
                        </span>
                        {analysis.suggestedDestination && (
                          <div className="text-xs text-neutral-500 mt-1">
                            → {analysis.suggestedDestination}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-orange-400">
                        {formatCurrency(analysis.estimatedCost)}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-400 font-semibold">
                        {formatCurrency(analysis.potentialSavings)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Note */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-400">
          <strong>💡 Lưu ý:</strong> Dữ liệu được cập nhật tự động từ iShip thông qua Power Automate Desktop.
          Các dự đoán sử dụng ML models để phân tích historical patterns và seasonal trends.
        </div>
      </main>
      <Chatbot />
    </div>
  );
}
