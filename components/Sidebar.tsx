'use client';

import Link from "next/link";
import { useState, useCallback } from "react";

export default function Sidebar({ current }: { current: string }) {
  const [clickCount, setClickCount] = useState(0);
  const [showHint, setShowHint] = useState(false);

  const items = [
    { id: "inventory", label: "Tồn kho", href: "/" },
    { id: "proposals", label: "Đề xuất", href: "/proposals" },
    { id: "predictions", label: "Dự đoán", href: "/predictions" },
    { id: "reports", label: "Báo cáo", href: "/reports" },
    { id: "notifications", label: "Noti", href: "/notifications" }
  ];

  const handleLogoClick = useCallback(() => {
    const newCount = clickCount + 1;
    console.log('🖱️ Logo clicked! Count:', newCount);
    setClickCount(newCount);

    // Show hint after 3 clicks
    if (newCount === 3) {
      console.log('💡 Showing hint...');
      setShowHint(true);
      setTimeout(() => setShowHint(false), 2000);
    }

    // Open pgAdmin in new tab after 5 clicks
    if (newCount === 5) {
      console.log('🔓 Opening pgAdmin!');
      window.open('http://localhost:5050', '_blank');
      setClickCount(0); // Reset counter
      setShowHint(false);
    }

    // Reset counter after 3 seconds of inactivity
    const resetTimer = setTimeout(() => {
      if (newCount < 5) {
        console.log('⏰ Resetting counter due to inactivity');
        setClickCount(0);
        setShowHint(false);
      }
    }, 3000);

    return () => clearTimeout(resetTimer);
  }, [clickCount]);

  return (
    <aside className="w-56 border-r border-neutral-800 p-3">
      <div className="mb-4 relative">
        <img
          src="/logo.png"
          alt="Company Logo"
          className="h-10 w-auto cursor-pointer transition-transform hover:scale-105 active:scale-95"
          onClick={handleLogoClick}
          title="VIMC Lines"
        />
        {showHint && (
          <div className="absolute top-12 left-0 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg animate-pulse">
            {5 - clickCount} more clicks... 🔓
          </div>
        )}
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
