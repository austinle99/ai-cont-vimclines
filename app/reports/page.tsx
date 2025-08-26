import { prisma } from "@/lib/db";
import { importExcel, recomputeProposals, generateAlerts } from "@/app/action";
import { revalidatePath } from "next/cache";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";

export default async function Page() {
  const [kpi, alerts] = await Promise.all([
    prisma.kPI.findFirst(),
    prisma.alert.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" } })
  ]);

  return (
    <div className="h-screen flex">
      <Sidebar current="reports" />
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-xl font-semibold">Báo cáo</h2>

        <form action={importExcel} className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex items-center gap-4">
          <input required name="file" type="file" accept=".xlsx,.xls" className="text-sm" />
          <button type="submit" className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700">Upload Excel</button>
          <button formAction={async()=>{ "use server"; await recomputeProposals(); }} className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700">Recompute</button>
          <button formAction={async()=>{ "use server"; await generateAlerts(); revalidatePath("/notifications"); revalidatePath("/reports"); }} className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-500">Generate Alerts</button>
        </form>

        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
          <div className="text-sm text-neutral-400 mb-2">Tổng hợp KPI báo cáo</div>
          {kpi && (
            <ul className="space-y-1 text-sm">
              <li>Utilization: <b>{kpi.utilization}</b></li>
              <li>Storage cost: <b>{kpi.storageCost}</b></li>
              <li>Dwell time: <b>{kpi.dwellTime}</b></li>
              <li>Approval rate: <b>{kpi.approvalRate}</b></li>
            </ul>
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
