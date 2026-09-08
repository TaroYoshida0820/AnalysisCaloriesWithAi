import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from './supabaseClient';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#121D33';
const TEAL = '#00B8A9';
const MUTED = '#6B7280';
const ICE = '#E8EDF5';

export default function WeightDashboard() {
  const [logs, setLogs] = useState([]);
  const [range, setRange] = useState(30); // 表示期間(日数): 7 / 30 / 90

  useEffect(() => {
    loadWeightLogs();
  }, []);

  async function loadWeightLogs() {
    const { data, error } = await supabase
      .from('weight_logs')
      .select('*')
      .order('logged_date', { ascending: true });

    if (!error && data) setLogs(data);
  }

  const chartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return logs
      .filter((l) => l.logged_date >= cutoffStr)
      .map((l) => ({
        date: l.logged_date.slice(5), // "MM-DD" だけ表示
        weight: Number(l.weight_kg),
      }));
  }, [logs, range]);

  const latest = logs[logs.length - 1];
  const previous = logs.length > 1 ? logs[logs.length - 2] : null;
  const diff = latest && previous ? (Number(latest.weight_kg) - Number(previous.weight_kg)) : null;

  // 期間内の増減(表示期間の最初と最後を比較)
  const periodDiff =
    chartData.length > 1 ? (chartData[chartData.length - 1].weight - chartData[0].weight) : null;

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const values = chartData.map((d) => d.weight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.2, 0.5);
    return [Math.floor((min - padding) * 10) / 10, Math.ceil((max + padding) * 10) / 10];
  }, [chartData]);

  return (
    <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
      {/* 最新値カード */}
      <div style={{ background: NAVY_DARK, borderRadius: 16, padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: TEAL, opacity: 0.15 }} />
        <p style={{ color: '#B8C2D9', fontSize: 13, margin: 0 }}>最新の体重</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
          <p style={{ color: '#fff', fontSize: 36, fontWeight: 700, margin: 0, fontFamily: 'Cambria, serif' }}>
            {latest ? Number(latest.weight_kg).toFixed(2) : '--'}
            <span style={{ fontSize: 16, fontWeight: 400, color: '#B8C2D9', marginLeft: 4 }}>kg</span>
          </p>
          {diff != null && (
            <span
              style={{
                display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 600,
                color: diff < 0 ? '#7FE3D6' : diff > 0 ? '#FFB4A2' : '#B8C2D9',
              }}
            >
              {diff < 0 ? <TrendingDown size={14} /> : diff > 0 ? <TrendingUp size={14} /> : <Minus size={14} />}
              {Math.abs(diff).toFixed(2)}kg
            </span>
          )}
        </div>
        {latest && <p style={{ color: '#8492AD', fontSize: 11, margin: '6px 0 0' }}>{latest.logged_date} 測定</p>}
      </div>

      {/* 期間切り替え */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[7, 30, 90].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: range === r ? 'none' : '1px solid #D1D5DB',
              background: range === r ? NAVY : '#fff',
              color: range === r ? '#fff' : MUTED,
            }}
          >
            {r}日間
          </button>
        ))}
      </div>

      {/* グラフ */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 8px 8px' }}>
        {chartData.length === 0 ? (
          <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: '40px 0' }}>
            まだこの期間のデータがありません
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 12, left: -10, bottom: 5 }}>
                <CartesianGrid stroke={ICE} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: MUTED }} />
                <YAxis domain={yDomain} tick={{ fontSize: 11, fill: MUTED }} width={40} />
                <Tooltip
                  formatter={(value) => [`${value} kg`, '体重']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="weight" stroke={TEAL} strokeWidth={2.5} dot={{ r: 3, fill: TEAL }} />
              </LineChart>
            </ResponsiveContainer>
            {periodDiff != null && (
              <p style={{ textAlign: 'center', fontSize: 12, color: MUTED, margin: '4px 0 12px' }}>
                この期間で{' '}
                <span style={{ fontWeight: 700, color: periodDiff < 0 ? TEAL : periodDiff > 0 ? '#E07856' : MUTED }}>
                  {periodDiff > 0 ? '+' : ''}
                  {periodDiff.toFixed(2)}kg
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
