import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "AI Container Dashboard", description: "VIMC Lines – đề xuất luân chuyển container" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
