import React, { useState, useEffect } from 'react';
import { listTechnicians } from '../lib/admin';

interface TimeEntry {
  id: number;
  technicianId: string;
  technicianName: string;
  clockIn: string;
  clockOut?: string;
  date: string;
  totalHours?: number;
  notes?: string;
  status: 'clocked-in' | 'clocked-out';
}

const ClockInWindow: React.FC = () => {
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTech, setSelectedTech] = useState<string>('');
  const [currentEntries, setCurrentEntries] = useState<TimeEntry[]>([]);
  const [todaysEntries, setTodaysEntries] = useState<TimeEntry[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  
  const today = new Date().toISOString().slice(0, 10);
  const currentTime = new Date().toLocaleTimeString();

  useEffect(() => {
    loadTechnicians();
    loadTimeEntries();
    
    // Set up real-time updates for time entries
    const cleanup = (window as any).api.onTimeEntriesChanged(() => {
      loadTimeEntries();
    });
    
    return cleanup;
  }, []);

  async function loadTechnicians() {
    try {
      const techs = await listTechnicians();
      setTechnicians(techs);
    } catch (error) {
      console.error('Failed to load technicians:', error);
    }
  }

  async function loadTimeEntries() {
    try {
      const entries = await (window as any).api.dbGet('timeEntries') || [];
      const todayEntries = entries.filter((e: TimeEntry) => e.date === today);
      const activeEntries = todayEntries.filter((e: TimeEntry) => e.status === 'clocked-in');
      
      setCurrentEntries(activeEntries);
      setTodaysEntries(todayEntries);
    } catch (error) {
      console.error('Failed to load time entries:', error);
    }
  }

  async function handleClockIn() {
    if (!selectedTech) {
      setMessage('❌ Please select a technician');
      return;
    }

    const tech = technicians.find(t => t.id === selectedTech);
    if (!tech) return;

    // Check if already clocked in
    const existingEntry = currentEntries.find(e => e.technicianId === selectedTech);
    if (existingEntry) {
      setMessage('❌ Already clocked in');
      return;
    }

    setIsLoading(true);
    try {
      const timeEntry: TimeEntry = {
        id: Date.now(), // Simple ID generation
        technicianId: tech.id,
        technicianName: tech.nickname || `${tech.firstName} ${tech.lastName}`,
        clockIn: new Date().toISOString(),
        date: today,
        status: 'clocked-in',
        notes: notes.trim() || undefined
      };

      await (window as any).api.dbAdd('timeEntries', timeEntry);
      await loadTimeEntries();
      
      setMessage(`✅ ${timeEntry.technicianName} clocked in at ${new Date().toLocaleTimeString()}`);
      setSelectedTech('');
      setNotes('');
    } catch (error) {
      console.error('Clock in failed:', error);
      setMessage('❌ Clock in failed');
    }
    setIsLoading(false);
  }

  async function handleClockOut(entry: TimeEntry) {
    setIsLoading(true);
    try {
      const clockOutTime = new Date();
      const clockInTime = new Date(entry.clockIn);
      const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      const updatedEntry = {
        ...entry,
        clockOut: clockOutTime.toISOString(),
        totalHours: Number(totalHours.toFixed(2)),
        status: 'clocked-out' as const
      };

      await (window as any).api.dbUpdate('timeEntries', entry.id, updatedEntry);
      await loadTimeEntries();
      
      setMessage(`✅ ${entry.technicianName} clocked out - ${totalHours.toFixed(2)} hours worked`);
    } catch (error) {
      console.error('Clock out failed:', error);
      setMessage('❌ Clock out failed');
    }
    setIsLoading(false);
  }

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString();
  };

  const getTotalHoursToday = () => {
    return todaysEntries
      .filter(e => e.totalHours)
      .reduce((sum, e) => sum + (e.totalHours || 0), 0)
      .toFixed(2);
  };

  return (
    <div className="p-6 bg-zinc-900 text-gray-100 h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          🕐 Employee Time Clock
        </h2>
        <div className="text-right">
          <div className="text-sm text-zinc-400">Today: {new Date().toLocaleDateString()}</div>
          <div className="text-lg font-mono">{currentTime}</div>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-zinc-800 border border-zinc-700 rounded text-center">
          {message}
        </div>
      )}

      {/* Clock In Section */}
      <div className="bg-zinc-800 border border-zinc-700 rounded p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Clock In</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Select Technician</label>
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2"
              disabled={isLoading}
            >
              <option value="">Choose technician...</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>
                  {tech.nickname || `${tech.firstName} ${tech.lastName}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Shift notes, project, etc."
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2"
              disabled={isLoading}
            />
          </div>
          <button
            onClick={handleClockIn}
            disabled={isLoading || !selectedTech}
            className="w-full px-4 py-3 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '⏳ Processing...' : '✅ Clock In'}
          </button>
        </div>
      </div>

      {/* Currently Clocked In */}
      <div className="bg-zinc-800 border border-zinc-700 rounded p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Currently Clocked In</h3>
        {currentEntries.length === 0 ? (
          <p className="text-zinc-400 text-center py-4">No one is currently clocked in</p>
        ) : (
          <div className="space-y-2">
            {currentEntries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded border border-zinc-600">
                <div>
                  <div className="font-medium">{entry.technicianName}</div>
                  <div className="text-sm text-zinc-400">
                    Clocked in at {formatTime(entry.clockIn)}
                    {entry.notes && ` • ${entry.notes}`}
                  </div>
                </div>
                <button
                  onClick={() => handleClockOut(entry)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:bg-zinc-600 transition-colors"
                >
                  Clock Out
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Summary */}
      <div className="bg-zinc-800 border border-zinc-700 rounded p-4 flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Today's Time Log</h3>
          <div className="text-sm text-zinc-400">
            Total Hours Today: <span className="font-mono text-[#39FF14]">{getTotalHoursToday()}</span>
          </div>
        </div>
        
        {todaysEntries.length === 0 ? (
          <p className="text-zinc-400 text-center py-4">No time entries for today</p>
        ) : (
          <div className="space-y-2">
            {todaysEntries
              .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())
              .map(entry => (
                <div key={entry.id} className="p-3 bg-zinc-900 rounded border border-zinc-600">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{entry.technicianName}</div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      entry.status === 'clocked-in' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-zinc-600 text-zinc-200'
                    }`}>
                      {entry.status === 'clocked-in' ? '🟢 Active' : '🔴 Completed'}
                    </div>
                  </div>
                  <div className="text-sm text-zinc-400 mt-1">
                    In: {formatTime(entry.clockIn)}
                    {entry.clockOut && ` • Out: ${formatTime(entry.clockOut)}`}
                    {entry.totalHours && ` • ${entry.totalHours}h`}
                    {entry.notes && ` • ${entry.notes}`}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClockInWindow;