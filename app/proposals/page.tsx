"use client";

import { useState, useEffect } from "react";
import { approveProposal, rejectProposal } from "@/app/action";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";

interface Proposal {
  id: string;
  route: string;
  size: string;
  qty: number;
  estCost?: number | null;
  benefit?: number | null;
  reason?: string | null;
  status: string;
  createdAt: Date;
}

interface Booking {
  id: number;
  date: Date;
  origin: string;
  destination: string;
  size: string;
  qty: number;
  customer?: string | null;
  status?: string | null;
  // Optimization fields
  containerNo?: string | null;
  emptyLaden?: string | null;
  depot?: string | null;
  optimizationSuggestion?: string | null;
  optimizationScore?: number | null;
  optimizationType?: string | null;
}

export default function Page() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [proposalsResponse, bookingsResponse] = await Promise.all([
          fetch('/api/proposals'),
          fetch('/api/bookings')
        ]);
        
        const proposalsData = await proposalsResponse.json();
        const bookingsData = await bookingsResponse.json();
        
        setProposals(proposalsData);
        setBookings(bookingsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setProposals([]);
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex">
        <Sidebar current="proposals" />
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-xl font-semibold">Các đề xuất</h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div>Loading proposals and bookings...</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      <Sidebar current="proposals" />
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-xl font-semibold">Các đề xuất</h2>

        <div className="space-y-2">
          {proposals.map((p: Proposal) => (
            <form key={p.id} className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
              <div className="text-sm">
                <div className="font-semibold">{p.route} • {p.size}</div>
                <div className="text-neutral-400">{p.qty} TEU • {p.reason || "—"} • ({p.status})</div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={async () => {
                    await approveProposal(p.id);
                    window.location.reload();
                  }}
                  className="px-3 py-1 rounded bg-green-600 hover:bg-green-500"
                  type="button"
                >
                  Yes
                </button>
                <button 
                  onClick={async () => {
                    await rejectProposal(p.id);
                    window.location.reload();
                  }}
                  className="px-3 py-1 rounded bg-red-600 hover:bg-red-500"
                  type="button"
                >
                  No
                </button>
              </div>
            </form>
          ))}
          {proposals.length === 0 && (
            <div className="text-neutral-400">Chưa có đề xuất. Hãy import Excel ở mục Báo cáo.</div>
          )}
        </div>

        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-neutral-400">Container Optimization Dashboard</div>
              {searchTerm && (
                <div className="text-xs text-blue-400">
                  {bookings.filter((b: Booking) => {
                    const containerNo = b.containerNo || '';
                    return containerNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           b.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           b.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           b.depot?.toLowerCase().includes(searchTerm.toLowerCase());
                  }).length} results found
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400">
                  🔍
                </div>
                <input
                  type="text"
                  placeholder="Search container, origin, destination, depot..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded-lg pl-10 pr-8 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-80"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-200 text-lg"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="py-2">Container</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Optimization Suggestion</th>
                </tr>
              </thead>
              <tbody>
                {bookings
                  .filter((b: Booking) => {
                    if (!searchTerm) return true;
                    const containerNo = b.containerNo || '';
                    return containerNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           b.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           b.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           b.depot?.toLowerCase().includes(searchTerm.toLowerCase());
                  })
                  .map((b: Booking) => {
                  const score = b.optimizationScore || 0;
                  const getScoreColor = (score: number) => {
                    if (score >= 80) return "text-red-400 font-bold";
                    if (score >= 60) return "text-yellow-400 font-semibold";
                    if (score >= 40) return "text-blue-400";
                    return "text-green-400";
                  };
                  
                  const getTypeIcon = (type: string) => {
                    switch (type) {
                      case 'urgent-relocation': return '🆘';
                      case 'high-priority': return '🚨';
                      case 'medium-priority': return '⚠️';
                      case 'routing-efficiency': return '🔄';
                      case 'dispatch-delay': return '⏰';
                      case 'route-optimization': return '🛣️';
                      case 'type-balance': return '⚖️';
                      default: return '✅';
                    }
                  };
                  
                  const isEmpty = b.emptyLaden?.toLowerCase().includes('empty');
                  
                  return (
                    <tr key={b.id} className="border-t border-neutral-800 hover:bg-neutral-800/30">
                      <td className="py-2 font-mono text-xs">
                        {b.containerNo ? b.containerNo.substring(0, 8) + '...' : '—'}
                      </td>
                      <td>{b.origin}</td>
                      <td>{b.destination}</td>
                      <td className="flex items-center gap-1">
                        {b.size}
                        {isEmpty && <span className="w-2 h-2 bg-orange-400 rounded-full" title="Empty"></span>}
                      </td>
                      <td className="text-xs">
                        <span className={`px-2 py-1 rounded ${isEmpty ? 'bg-orange-900 text-orange-200' : 'bg-green-900 text-green-200'}`}>
                          {isEmpty ? 'EMPTY' : 'LADEN'}
                        </span>
                      </td>
                      <td className={`font-bold ${getScoreColor(score)}`}>
                        {score > 0 ? score : '—'}
                      </td>
                      <td className="max-w-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-base">{getTypeIcon(b.optimizationType || '')}</span>
                          <span className="text-xs text-neutral-300 truncate">
                            {b.optimizationSuggestion || 'No optimization needed'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {searchTerm && bookings.filter((b: Booking) => {
              const containerNo = b.containerNo || '';
              return containerNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     b.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     b.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     b.depot?.toLowerCase().includes(searchTerm.toLowerCase());
            }).length === 0 && (
              <div className="text-center py-8 text-neutral-400">
                <div className="text-2xl mb-2">🔍</div>
                <div>No containers found matching "{searchTerm}"</div>
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
          
          {bookings.length > 0 && (
            <div className="mt-4 p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 mb-2">Optimization Legend:</div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-400 font-bold">90-100</span>
                    <span>🆘 URGENT - Empty stuck 7+ days</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-400 font-bold">80-89</span>
                    <span>🚨 HIGH - Empty at crowded depot</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-400 font-semibold">60-79</span>
                    <span>⚠️ MEDIUM - Empty buildup/High activity</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-400 font-semibold">50-59</span>
                    <span>⏰ Loaded container dispatch delay</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-400">40-49</span>
                    <span>🛣️ Route optimization opportunity</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-400">30-39</span>
                    <span>⚖️ Container type imbalance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400">15-29</span>
                    <span>✅ Standard operations</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </main>
      <Chatbot />
    </div>
  );
}
