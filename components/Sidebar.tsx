import Link from "next/link";
import Image from "next/image";

export default function Sidebar({ current }: { current: string }) {
  const items = [
    { id: "inventory", label: "Tồn kho", href: "/" },
    { id: "proposals", label: "Đề xuất", href: "/proposals" },
    { id: "reports", label: "Báo cáo", href: "/reports" },
    { id: "notifications", label: "Noti", href: "/notifications" }
  ];
  return (
    <aside className="w-56 border-r border-neutral-800 p-3">
      <div className="mb-4">
        <img 
          src="/logo.png" 
          alt="Company Logo" 
          className="h-10 w-auto"
        />
      </div>
      <nav className="space-y-2">
        {items.map(it=>(
          <Link key={it.id} href={it.href}
            className={`block w-full text-left px-3 py-2 rounded-md transition ${current===it.id?"bg-neutral-800":"hover:bg-neutral-900"}`}>
            {it.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
