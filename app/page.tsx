import { prisma } from "@/lib/db";
import Card from "@/components/Card";
import ProgressBar from "@/components/ProgressBar";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";
import Link from "next/link";

export default async function Page() {
  const inv = await prisma.inventory.findMany({ orderBy: [{ port:"asc" }, { type:"asc" }] });
  const max = Math.max(100, ...inv.map((i: any)=>i.stock||0));

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
          {inv.map((i: any)=>(
            <Card key={i.id} title={`${i.port} • ${i.type}`}>
              <div className="text-3xl font-bold mb-2">{i.stock} TEU</div>
              <ProgressBar value={i.stock} max={max}/>
            </Card>
          ))}
        </div>
      </main>
      <Chatbot />
    </div>
  );
}
