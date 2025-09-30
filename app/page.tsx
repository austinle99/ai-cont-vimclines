"use client";

import { useState, useEffect } from "react";
import Card from "@/components/Card";
import ProgressBar from "@/components/ProgressBar";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";
import SystemHealthWidget from "@/components/SystemHealthWidget";
import Link from "next/link";

interface InventoryItem {
  id: number;
  port: string;
  type: string;
  stock: number;
}

interface Proposal {
  id: string;
  route: string;
  size: string;
  qty: number;
  reason?: string | null;
  status: string;
}

interface Alert {
  id: string;
  level: string;
  message: string;
  location?: string | null;
  status: string;
}

interface SystemHealth {
  ml_system: boolean;
  lstm_system: boolean;
  or_tools_system: boolean;
  python_env: boolean;
  last_check: Date;
}

export default function Page() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [inventoryResponse, proposalsResponse, alertsResponse] = await Promise.all([
          fetch('/api/inventory'),
          fetch('/api/proposals'),
          fetch('/api/alerts')
        ]);
        
        const inventoryData = await inventoryResponse.json();
        const proposalsData = await proposalsResponse.json();
        const alertsData = await alertsResponse.json();
        
        setInventory(inventoryData);
        setProposals(proposalsData);
        setAlerts(alertsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setInventory([]);
        setProposals([]);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const max = Math.max(100, ...inventory.map((i: InventoryItem) => i.stock || 0));

  if (loading) {
    return (
      <div className="h-screen flex">
        <Sidebar current="inventory" />
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tồn kho cont</h2>
            <div className="text-sm text-neutral-400 space-x-3">
              <Link className="underline" href="/proposals">Đề xuất</Link>
              <Link className="underline" href="/reports">Báo cáo</Link>
              <Link className="underline" href="/notifications">Noti</Link>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div>Loading inventory...</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  if (inventory.length === 0) {
    return (
      <div className="h-screen flex">
        <Sidebar current="inventory" />
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tồn kho cont</h2>
            <div className="text-sm text-neutral-400 space-x-3">
              <Link className="underline" href="/proposals">Đề xuất</Link>
              <Link className="underline" href="/reports">Báo cáo</Link>
              <Link className="underline" href="/notifications">Noti</Link>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div className="text-lg mb-2">📦</div>
            <div>No inventory data available</div>
            <div className="text-sm">Please check database connection</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      <Sidebar current="inventory" />
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">AI Container Management Dashboard</h2>
          <div className="text-sm text-neutral-400 space-x-3">
            <Link className="underline" href="/proposals">Đề xuất</Link>
            <Link className="underline" href="/reports">Upload Data</Link>
            <Link className="underline" href="/notifications">Cảnh báo</Link>
          </div>
        </div>

        {/* AI Suggestions Section */}
        {(proposals.length > 0 || alerts.length > 0) && (
          <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-xl border border-blue-700/30 p-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              🤖 AI Generated Suggestions
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Smart Proposals */}
              {proposals.filter(p => p.status === "draft").length > 0 && (
                <div className="bg-neutral-900/50 rounded-lg p-3">
                  <div className="text-sm font-medium text-green-400 mb-2">
                    📋 Smart Proposals ({proposals.filter(p => p.status === "draft").length})
                  </div>
                  {proposals.filter(p => p.status === "draft").slice(0, 3).map(p => (
                    <div key={p.id} className="text-xs text-neutral-300 mb-1">
                      • {p.route} - {p.qty} TEU {p.size} | {p.reason}
                    </div>
                  ))}
                  <Link href="/proposals" className="text-xs text-blue-400 hover:underline">
                    View all proposals →
                  </Link>
                </div>
              )}
              
              {/* Critical Alerts */}
              {alerts.filter(a => a.status === "active").length > 0 && (
                <div className="bg-neutral-900/50 rounded-lg p-3">
                  <div className="text-sm font-medium text-orange-400 mb-2">
                    ⚠️ Active Alerts ({alerts.filter(a => a.status === "active").length})
                  </div>
                  {alerts.filter(a => a.status === "active").slice(0, 3).map(alert => (
                    <div key={alert.id} className="text-xs text-neutral-300 mb-1">
                      • {alert.level} - {alert.message}
                    </div>
                  ))}
                  <Link href="/notifications" className="text-xs text-orange-400 hover:underline">
                    View all alerts →
                  </Link>
                </div>
              )}
            </div>
            
            <div className="mt-3 text-xs text-neutral-400">
              💡 Use the chatbot (right side) for intelligent analysis and actions
            </div>
          </div>
        )}

        {/* No data message */}
        {inventory.length === 0 && proposals.length === 0 && alerts.length === 0 && (
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center">
            <div className="text-lg mb-2">🚀</div>
            <div className="text-lg font-medium mb-2">Welcome to AI Container Management</div>
            <div className="text-neutral-400 mb-4">Upload your Excel data to get started with AI suggestions</div>
            <Link 
              href="/reports" 
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium"
            >
              📊 Upload Excel Data
            </Link>
          </div>
        )}

        {/* System Health Widget */}
        <SystemHealthWidget />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inventory.map((i: InventoryItem) => (
            <Card key={i.id} title={`${i.port} • ${i.type}`}>
              <div className="text-3xl font-bold mb-2">{i.stock} TEU</div>
              <ProgressBar value={i.stock} max={max} />
            </Card>
          ))}
        </div>
      </main>
      <Chatbot />
    </div>
  );
}
