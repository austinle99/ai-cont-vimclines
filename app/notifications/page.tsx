"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";
import NotificationClient from "./NotificationClient";

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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/alerts');
        const data = await response.json();
        setAlerts(data);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex">
        <Sidebar current="notifications" />
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-xl font-semibold">Cảnh báo</h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div>Loading alerts...</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="h-screen flex">
        <Sidebar current="notifications" />
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-xl font-semibold">Cảnh báo</h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 text-center text-neutral-400">
            <div className="text-lg mb-2">🎉</div>
            <div>No active alerts</div>
            <div className="text-sm">All systems operating normally</div>
          </div>
        </main>
        <Chatbot />
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      <Sidebar current="notifications" />
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-xl font-semibold">Cảnh báo</h2>
        <NotificationClient alerts={alerts} />
      </main>
      <Chatbot />
    </div>
  );
}