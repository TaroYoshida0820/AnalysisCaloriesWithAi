import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from './supabaseClient';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#121D33';
const TEAL = '#00B8A9';
const AMBER = '#FFB454';
const MUTED = '#6B7280';
const ICE = '#E8EDF5';

export default function WeightDashboard() {
  const [logs, setLogs] = useState([]);
  const [range, setRange] = useState(30); // 表示期間(日数): 7 / 30 / 90 / 365
  const [showFat, setShowFat] = useState(true);

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
        date: range > 90 ? l.logged_date.slice(2) : l.logged_date.slice(5), // 長期間は年も表示(YY-MM-DD)
        weight: Number(l.weight_kg),
        fat: l.body_fat_percent != null ? Number(l.body_fat_percent) : null,
      }));
  }, [logs, range]);

  const latest = logs[logs.length - 1];
  const previous = logs.length > 1 ? logs[logs.length - 2] : null;
  const diff = latest && previous ? (Number(latest.weight_kg) - Number(previous.weight_kg)) : null;

  const periodDiff =
    chartData.length > 1 ? (chartData[chartData.length - 1].weight - chartData[0].weight) : null;

  const weightDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const values = chartData.map((d) => d.weight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.15, 0.5);
    return [Math.floor((min - padding) * 10) / 10, Math.ceil((max + padding) * 10) / 10];
  }, [chartData]);

  const fatDomain = useMemo(() => {
    const values = chartData.map((d) => d.fat).filter((v) => v != null);
    if (values.length === 0) return ['auto', 'auto'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.15, 1);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  const hasFatData = chartData.some((d) => d.fat != null);

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
          {latest?.body_fat_percent != null && (
            <span style={{ fontSize: 13, color: AMBER, fontWeight: 600 }}>
              体脂肪 {Number(latest.body_fat_percent).toFixed(1)}%
            </span>
          )}
        </div>
        {latest && <p style={{ color: '#8492AD', fontSize: 11, margin: '6px 0 0' }}>{latest.logged_date} 測定</p>}
      </div>

      {/* 期間切り替え */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[
          [7, '7日'],
          [30, '30日'],
          [90, '90日'],
          [365, '1年'],
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

      {/* 体脂肪率の表示切り替え */}
      {hasFatData && (
        <button
          onClick={() => setShowFat((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', marginBottom: 10, padding: 0,
          }}
        >
          <span
            style={{
              width: 14, height: 14, borderRadius: 4, border: `2px solid ${AMBER}`,
              background: showFat ? AMBER : 'transparent',
            }}
          />
          <span style={{ fontSize: 12, color: MUTED }}>体脂肪率を表示</span>
        </button>
      )}

      {/* グラフ */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 8px 8px' }}>
        {chartData.length === 0 ? (
          <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: '40px 0' }}>
            まだこの期間のデータがありません
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 12, left: -10, bottom: 5 }}>
                <CartesianGrid stroke={ICE} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} interval="preserveStartEnd" />
                <YAxis yAxisId="weight" domain={weightDomain} tick={{ fontSize: 11, fill: MUTED }} width={40} />
                {showFat && hasFatData && (
                  <YAxis yAxisId="fat" orientation="right" domain={fatDomain} tick={{ fontSize: 11, fill: MUTED }} width={36} />
                )}
                <Tooltip
                  formatter={(value, name) => [
                    name === '体重' ? `${value} kg` : `${value} %`,
                    name,
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="weight" type="monotone" dataKey="weight" name="体重" stroke={TEAL} strokeWidth={2.5} dot={false} />
                {showFat && hasFatData && (
                  <Line yAxisId="fat" type="monotone" dataKey="fat" name="体脂肪率" stroke={AMBER} strokeWidth={2} dot={false} />
                )}
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
