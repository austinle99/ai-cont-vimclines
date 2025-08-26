export default function ProgressBar({ value=0, max=100 }:{ value?:number; max?:number }) {
  const pct = Math.min(100, Math.round((value/(max||1))*100));
  return <div className="w-full bg-neutral-800 rounded-full h-3">
    <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
  </div>;
}
