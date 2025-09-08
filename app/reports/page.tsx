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
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

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

  const handleExcelUpload = async () => {
    const fileInput = document.getElementById('excel-file') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    
    if (!file) {
      setUploadMessage("Please select a file first");
      return;
    }

    setUploading(true);
    setUploadMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadMessage(`✅ ${result.message}\n📊 Data processed successfully!\n🤖 AI suggestions generated and ready in chatbot`);
        
        // Refresh the page data to show new suggestions
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setUploadMessage(`❌ Error: ${result.error}${result.details ? '\nDetails: ' + result.details : ''}`);
      }
    } catch (error) {
      setUploadMessage(`❌ Upload failed: ${error}`);
    } finally {
      setUploading(false);
    }
  };

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

        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
          <h3 className="text-lg font-semibold mb-3">📊 Upload Excel Data</h3>
          <div className="flex items-center gap-4 mb-4">
            <input 
              id="excel-file" 
              type="file" 
              accept=".xlsx,.xls" 
              className="text-sm"
            />
            <button 
              onClick={handleExcelUpload}
              disabled={uploading}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 text-white font-medium"
            >
              {uploading ? 'Processing...' : 'Upload & Generate Suggestions'}
            </button>
          </div>
          <div className="text-xs text-neutral-400 mb-2">Supported Excel formats:</div>
          <div className="text-xs text-neutral-500">
            <strong>Option 1 - Standard sheets:</strong><br/>
            • <strong>inventory</strong> sheet: port, type, stock<br/>
            • <strong>booking</strong> sheet: date, origin, destination, size, qty<br/>
            • <strong>kpi</strong> sheet: utilization, storageCost, dwellTime, approvalRate<br/>
            <strong>Option 2 - Container movement data:</strong><br/>
            • <strong>GridViewExport</strong> sheet: container no., type size, movement, port, depot, etc.<br/>
            • System will automatically extract inventory, bookings, and KPIs from movement data
          </div>
          
          {uploadMessage && (
            <div className={`mt-3 p-3 rounded-md text-sm ${
              uploadMessage.includes('✅') 
                ? 'bg-green-900/30 text-green-200 border border-green-700/50' 
                : 'bg-red-900/30 text-red-200 border border-red-700/50'
            }`}>
              <div className="whitespace-pre-wrap">{uploadMessage}</div>
            </div>
          )}
        </div>
        
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
          <h3 className="text-lg font-semibold mb-3">🔄 Manual Actions</h3>
          <div className="flex items-center gap-4">
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
          </div>
        </div>

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
