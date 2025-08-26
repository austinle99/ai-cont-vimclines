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
}

export default function Page() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

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
          <div className="text-sm text-neutral-400 mb-2">Danh sách bookings</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="py-2">Ngày</th><th>Origin</th><th>Destination</th><th>Size</th><th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: Booking) => (
                  <tr key={b.id} className="border-t border-neutral-800">
                    <td className="py-2">{new Date(b.date).toLocaleDateString()}</td>
                    <td>{b.origin}</td><td>{b.destination}</td><td>{b.size}</td><td>{b.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
      <Chatbot />
    </div>
  );
}
