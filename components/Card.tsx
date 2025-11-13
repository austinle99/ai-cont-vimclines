import { memo } from 'react';

function Card({ title, children, footer }:{ title?:string; children:React.ReactNode; footer?:React.ReactNode }) {
  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
      {title && <div className="text-sm text-neutral-400 mb-2">{title}</div>}
      <div>{children}</div>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

// Memoized Card component to prevent unnecessary re-renders
export default memo(Card);
