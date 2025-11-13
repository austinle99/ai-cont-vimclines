"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { resolveAlert, ignoreAlert } from "@/app/action";

interface Alert {
  id: string;
  level: string;
  message: string;
  createdAt: Date;
  location?: string | null;
  severity?: string | null;
  description?: string | null;
  status: string;
  resolvedAt?: Date | null;
}

function NotificationClient({ alerts }: { alerts: Alert[] }) {
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAlert(null);
      }
    };

    if (selectedAlert) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [selectedAlert]);

  const color = useCallback((lv: string) =>
    lv === "Cao" ? "text-red-400" : lv === "TB" ? "text-yellow-400" : "text-neutral-300"
  , []);

  const handleMoreInfo = useCallback((alert: Alert) => {
    setSelectedAlert(alert);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedAlert(null);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setSelectedAlert(null);
    }
  }, []);

  const handleResolve = useCallback(async (alertId: string) => {
    const formData = new FormData();
    formData.append('id', alertId);
    await resolveAlert(formData);
    window.location.reload();
  }, []);

  const handleIgnore = useCallback(async (alertId: string) => {
    const formData = new FormData();
    formData.append('id', alertId);
    await ignoreAlert(formData);
    window.location.reload();
  }, []);

  return (
    <>
      <div className="space-y-3">
        {alerts.map((a: Alert) => (
          <div key={a.id} className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex items-center justify-between">
            <div>
              <div className={`text-sm ${color(a.level)}`}>Caution level: <b>{a.level}</b></div>
              <div className="text-neutral-300">{a.message}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {new Date(a.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => handleMoreInfo(a)}
                className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                More info
              </button>
              <button
                onClick={() => handleResolve(a.id)}
                className="px-3 py-1 rounded bg-green-600 hover:bg-green-500"
              >
                Resolve
              </button>
              <button
                onClick={() => handleIgnore(a.id)}
                className="px-3 py-1 rounded bg-neutral-600 hover:bg-neutral-500"
              >
                Ignore
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {selectedAlert && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleBackdropClick}
        >
          <div 
            className="bg-neutral-800 rounded-xl border border-neutral-700 p-6 max-w-md w-full mx-4 max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-white">Alert Details</h3>
              <button
                onClick={closeModal}
                className="text-neutral-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <span className="text-neutral-400 text-sm">Alert ID:</span>
                <div className="text-white">{selectedAlert.id}</div>
              </div>
              
              <div>
                <span className="text-neutral-400 text-sm">Level:</span>
                <div className={`${color(selectedAlert.level)} font-semibold`}>{selectedAlert.level}</div>
              </div>
              
              <div>
                <span className="text-neutral-400 text-sm">Location:</span>
                <div className="text-white">{selectedAlert.location || 'N/A'}</div>
              </div>
              
              <div>
                <span className="text-neutral-400 text-sm">Severity:</span>
                <div className="text-white">{selectedAlert.severity || 'N/A'}</div>
              </div>
              
              <div>
                <span className="text-neutral-400 text-sm">Message:</span>
                <div className="text-white">{selectedAlert.message}</div>
              </div>
              
              <div>
                <span className="text-neutral-400 text-sm">Detailed Description:</span>
                <div className="text-neutral-300 text-sm leading-relaxed mt-1">
                  {selectedAlert.description || 'No additional details available.'}
                </div>
              </div>
              
              <div>
                <span className="text-neutral-400 text-sm">Created At:</span>
                <div className="text-white">{new Date(selectedAlert.createdAt).toLocaleString()}</div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Wrap component in React.memo to prevent unnecessary re-renders
export default memo(NotificationClient);