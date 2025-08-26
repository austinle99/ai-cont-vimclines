"use client";

import { useState, useEffect } from "react";
import { importExcel, recomputeProposals, generateAlerts } from "@/app/action";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";

interface KPI {
  id: number;
  utilization: string;
  storageCost: string;
  dwellTime: string;
  approvalRate: string;
}

interface Alert {
  id: string;
  level: string;
  message: string;
  createdAt: Date;
  location?: string | null;
  severity?: string | null;
  description?: string | null;
  status: string;
  resolvedAt?: Date | null;
}

export default function Page() {
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [kpiResponse, alertsResponse] = await Promise.all([
          fetch('/api/kpi'),
          fetch('/api/alerts')
        ]);
        
        const kpiData = await kpiResponse.json();
        const alertsData = await alertsResponse.json();
        
        setKpi(kpiData);
        setAlerts(alertsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setKpi(null);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex">
        <Sidebar current="reports" />
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-xl font-semibold">Báo cáo</h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div>Loading reports data...</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      <Sidebar current="reports" />
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-xl font-semibold">Báo cáo</h2>

        <form action={importExcel} className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex items-center gap-4">
          <input required name="file" type="file" accept=".xlsx,.xls" className="text-sm" />
          <button type="submit" className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700">Upload Excel</button>
          <button 
            onClick={async () => {
              await recomputeProposals();
              window.location.reload();
            }}
            className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
            type="button"
          >
            Recompute
          </button>
          <button 
            onClick={async () => {
              await generateAlerts();
              window.location.reload();
            }}
            className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-500"
            type="button"
          >
            Generate Alerts
          </button>
        </form>

        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
          <div className="text-sm text-neutral-400 mb-2">Tổng hợp KPI báo cáo</div>
          {kpi ? (
            <ul className="space-y-1 text-sm">
              <li>Utilization: <b>{kpi.utilization}</b></li>
              <li>Storage cost: <b>{kpi.storageCost}</b></li>
              <li>Dwell time: <b>{kpi.dwellTime}</b></li>
              <li>Approval rate: <b>{kpi.approvalRate}</b></li>
            </ul>
          ) : (
            <div className="text-neutral-400 text-sm">No KPI data available</div>
          )}
        </div>

        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
          <div className="text-sm text-neutral-400 mb-2">Trạng thái cảnh báo</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">
                {alerts.filter(a => a.level === "Cao").length}
              </div>
              <div className="text-neutral-300">Critical</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {alerts.filter(a => a.level === "TB").length}
              </div>
              <div className="text-neutral-300">Medium</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-neutral-300">
                {alerts.filter(a => a.level === "Thấp").length}
              </div>
              <div className="text-neutral-300">Low</div>
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-700">
              <div className="text-xs text-neutral-400 mb-2">Latest Alerts:</div>
              {alerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="text-xs text-neutral-300 mb-1">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${alert.level === "Cao" ? "bg-red-400" : alert.level === "TB" ? "bg-yellow-400" : "bg-neutral-400"}`}></span>
                  {alert.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Chatbot />
    </div>
  );
}
