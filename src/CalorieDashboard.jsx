import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { supabase } from './supabaseClient';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#121D33';
const TEAL = '#00B8A9';
const MUTED = '#6B7280';
const ICE = '#E8EDF5';

export default function CalorieDashboard() {
  const [foodLogs, setFoodLogs] = useState([]);
  const [range, setRange] = useState(30);

  useEffect(() => {
    loadFoodLogs();
  }, []);

  async function loadFoodLogs() {
    const { data, error } = await supabase.from('food_logs').select('logged_date, kcal');
    if (!error && data) setFoodLogs(data);
  }

  const chartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const byDate = {};
    for (const log of foodLogs) {
      if (log.logged_date < cutoffStr) continue;
      byDate[log.logged_date] = (byDate[log.logged_date] || 0) + log.kcal;
    }

    return Object.keys(byDate)
      .sort()
      .map((date) => ({
        date: range > 90 ? date.slice(2) : date.slice(5),
        kcal: byDate[date],
      }));
  }, [foodLogs, range]);

  const avgKcal = chartData.length > 0
    ? Math.round(chartData.reduce((sum, d) => sum + d.kcal, 0) / chartData.length)
    : null;

  return (
    <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ background: NAVY_DARK, borderRadius: 16, padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: TEAL, opacity: 0.15 }} />
        <p style={{ color: '#B8C2D9', fontSize: 13, margin: 0 }}>期間内の平均摂取カロリー</p>
        <p style={{ color: '#fff', fontSize: 36, fontWeight: 700, margin: '4px 0 0', fontFamily: 'Cambria, serif' }}>
          {avgKcal != null ? avgKcal.toLocaleString() : '--'}
          <span style={{ fontSize: 16, fontWeight: 400, color: '#B8C2D9', marginLeft: 4 }}>kcal/日</span>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          [7, '7日'],
          [30, '30日'],
          [90, '90日'],
        ].map(([r, label]) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: range === r ? 'none' : '1px solid #D1D5DB',
              background: range === r ? NAVY : '#fff',
              color: range === r ? '#fff' : MUTED,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 8px 8px' }}>
        {chartData.length === 0 ? (
          <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: '40px 0' }}>
            まだこの期間のデータがありません
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 5, right: 12, left: -10, bottom: 5 }}>
              <CartesianGrid stroke={ICE} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: MUTED }} width={40} />
              <Tooltip formatter={(value) => [`${value} kcal`, '摂取カロリー']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {avgKcal != null && (
                <ReferenceLine y={avgKcal} stroke={MUTED} strokeDasharray="4 4" label={{ value: '平均', fontSize: 10, fill: MUTED, position: 'insideTopRight' }} />
              )}
              <Bar dataKey="kcal" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
