'use client';

import { useState, useEffect } from 'react';

interface SystemHealth {
  ml_system: boolean;
  lstm_system: boolean;
  or_tools_system: boolean;
  python_env: boolean;
  last_check: Date;
}

export default function SystemHealthWidget() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkHealth = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/test-predictions?action=quick-test');
      const data = await response.json();
      
      if (data.success) {
        const results = data.data.results;
        setHealth({
          ml_system: results.ml?.overall_status === 'passed',
          lstm_system: results.lstm?.overall_status === 'passed', 
          or_tools_system: results.or_tools?.overall_status === 'passed',
          python_env: results.or_tools?.results?.or_tools_test?.python_available || false,
          last_check: new Date()
        });
      }
    } catch (error) {
      setHealth({
        ml_system: false,
        lstm_system: false,
        or_tools_system: false,
        python_env: false,
        last_check: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Auto-refresh every 5 minutes
    const interval = setInterval(checkHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  const systems = [
    { name: 'ML', healthy: health.ml_system, icon: '🧠' },
    { name: 'LSTM', healthy: health.lstm_system, icon: '🔮' },
    { name: 'OR-Tools', healthy: health.or_tools_system, icon: '🎯' },
    { name: 'Python', healthy: health.python_env, icon: '🐍' }
  ];

  const healthyCount = systems.filter(s => s.healthy).length;
  const overallHealth = healthyCount === systems.length ? 'healthy' : 
                       healthyCount >= 2 ? 'warning' : 'critical';

  return (
    <div className="bg-white p-4 rounded-lg shadow border">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-900">
          🤖 AI System Status
        </h3>
        <button 
          onClick={checkHealth}
          disabled={isLoading}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {isLoading ? '🔄' : '🔄 Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {systems.map((system) => (
          <div 
            key={system.name}
            className={`flex items-center p-2 rounded text-sm ${
              system.healthy 
                ? 'bg-green-50 text-green-700' 
                : 'bg-red-50 text-red-700'
            }`}
          >
            <span className="mr-1">{system.icon}</span>
            <span className="font-medium">{system.name}</span>
            <div className={`w-2 h-2 rounded-full ml-auto ${
              system.healthy ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center text-sm text-gray-600">
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${
            overallHealth === 'healthy' ? 'bg-green-500' :
            overallHealth === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
          }`}></div>
          <span>
            {overallHealth === 'healthy' ? 'All Systems Operational' :
             overallHealth === 'warning' ? 'Some Issues Detected' : 'Critical Issues'}
          </span>
        </div>
        <span>
          {health.last_check.toLocaleTimeString()}
        </span>
      </div>

      {overallHealth !== 'healthy' && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          💡 <strong>Quick fixes:</strong>
          {!health.lstm_system && ' Need 30+ recent bookings for LSTM. '}
          {!health.or_tools_system && ' Install Python + OR-Tools. '}
          {!health.python_env && ' Add Python to PATH. '}
        </div>
      )}
    </div>
  );
}