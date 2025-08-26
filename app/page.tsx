"use client";

import { useState, useEffect } from "react";
import Card from "@/components/Card";
import ProgressBar from "@/components/ProgressBar";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";
import Link from "next/link";

interface InventoryItem {
  id: number;
  port: string;
  type: string;
  stock: number;
}

export default function Page() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const response = await fetch('/api/inventory');
        const data = await response.json();
        setInventory(data);
      } catch (error) {
        console.error('Error fetching inventory:', error);
        setInventory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
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
          <h2 className="text-xl font-semibold">Tồn kho cont</h2>
          <div className="text-sm text-neutral-400 space-x-3">
            <Link className="underline" href="/proposals">Đề xuất</Link>
            <Link className="underline" href="/reports">Báo cáo</Link>
            <Link className="underline" href="/notifications">Noti</Link>
          </div>
        </div>
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
