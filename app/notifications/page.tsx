import { prisma } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";
import NotificationClient from "./NotificationClient";

export default async function Page() {
  const alerts = await prisma.alert.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" }
  });

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