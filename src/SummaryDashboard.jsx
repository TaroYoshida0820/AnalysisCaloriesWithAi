import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingDown } from 'lucide-react';
import { supabase } from './supabaseClient';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#121D33';
const TEAL = '#00B8A9';
const ICE = '#E8EDF5';
const MUTED = '#6B7280';

export default function SummaryDashboard() {
  const [weightLogs, setWeightLogs] = useState([]);
  const [foodLogs, setFoodLogs] = useState([]);
  const [exerciseLogs, setExerciseLogs] = useState([]);
  const [bmrLogs, setBmrLogs] = useState([]);
  const [days, setDays] = useState(14); // 表示する直近日数

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [w, f, e, b] = await Promise.all([
      supabase.from('weight_logs').select('*').order('logged_date', { ascending: true }),
      supabase.from('food_logs').select('logged_date, kcal'),
      supabase.from('exercise_logs').select('logged_date, burned_kcal'),
      supabase.from('bmr_logs').select('*'),
    ]);
    if (w.data) setWeightLogs(w.data);
    if (f.data) setFoodLogs(f.data);
    if (e.data) setExerciseLogs(e.data);
    if (b.data) setBmrLogs(b.data);
  }

  // 体重・体脂肪率(折れ線グラフ用)
  const weightChartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return weightLogs
      .filter((l) => l.logged_date >= cutoffStr)
      .map((l) => ({ date: l.logged_date.slice(5), weight: Number(l.weight_kg) }));
  }, [weightLogs, days]);

  const latestWeight = weightLogs[weightLogs.length - 1];
  const firstInRange = weightChartData[0];
  const weightChangeInRange = firstInRange && latestWeight
    ? Number(latestWeight.weight_kg) - firstInRange.weight
    : null;

  const latestFat = latestWeight?.body_fat_percent != null ? Number(latestWeight.body_fat_percent) : null;
  const firstFatInRange = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const inRange = weightLogs.filter((l) => l.logged_date >= cutoffStr && l.body_fat_percent != null);
    return inRange.length > 0 ? Number(inRange[0].body_fat_percent) : null;
  }, [weightLogs, days]);
  const fatChange = latestFat != null && firstFatInRange != null ? latestFat - firstFatInRange : null;

  // 摂取 vs 消費(基礎代謝+アクティブ)を日別に集計し、同じ0を基準にした2本の棒で比較する
  const balanceChartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const dateSet = new Set();
    [...foodLogs, ...exerciseLogs, ...bmrLogs].forEach((l) => {
      if (l.logged_date >= cutoffStr) dateSet.add(l.logged_date);
    });

    return Array.from(dateSet)
      .sort()
      .map((date) => {
        const intake = foodLogs
          .filter((l) => l.logged_date === date)
          .reduce((sum, l) => sum + l.kcal, 0);
        const active = exerciseLogs
          .filter((l) => l.logged_date === date)
          .reduce((sum, l) => sum + l.burned_kcal, 0);
        const bmrRow = bmrLogs.find((l) => l.logged_date === date);
        const bmr = bmrRow ? bmrRow.bmr_kcal : 0;
        return {
          date: date.slice(5),
          摂取: intake,
          消費: bmr + active,
        };
      });
  }, [foodLogs, exerciseLogs, bmrLogs, days]);

  return (
    <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto', fontFamily: 'Calibri, sans-serif' }}>
      {/* 体重推移 */}
      <div style={{ background: NAVY_DARK, borderRadius: 16, padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: TEAL, opacity: 0.15 }} />
        <p style={{ color: '#B8C2D9', fontSize: 13, margin: 0 }}>体重の推移(直近{days}日)</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
          <p style={{ color: '#fff', fontSize: 32, fontWeight: 700, margin: 0, fontFamily: 'Cambria, serif' }}>
            {latestWeight ? Number(latestWeight.weight_kg).toFixed(1) : '--'}
            <span style={{ fontSize: 15, fontWeight: 400, color: '#B8C2D9', marginLeft: 4 }}>kg</span>
          </p>
          {weightChangeInRange != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 600, color: weightChangeInRange < 0 ? '#7FE3D6' : '#FFB4A2' }}>
              <TrendingDown size={14} />
              {weightChangeInRange.toFixed(1)}kg
            </span>
          )}
          {/* 体脂肪率は体重と軸を共有せず、独立した数値バッジとして表示する */}
          {latestFat != null && (
            <span style={{ fontSize: 12, color: '#B8C2D9', background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '2px 8px' }}>
              体脂肪 {latestFat.toFixed(1)}%
              {fatChange != null && (
                <span style={{ color: fatChange < 0 ? '#7FE3D6' : '#FFB4A2', marginLeft: 4 }}>
                  ({fatChange > 0 ? '+' : ''}{fatChange.toFixed(1)})
                </span>
              )}
            </span>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={weightChartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8492AD' }} interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#8492AD' }} width={30} />
              <Tooltip formatter={(v) => [`${v} kg`, '体重']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="weight" stroke={TEAL} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 摂取 vs 消費(同じ0を基準に並べて、差が一目で分かる形) */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 8px 8px', marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 8px 8px' }}>摂取カロリー vs 消費カロリー</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={balanceChartData} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
            <CartesianGrid stroke={ICE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={40} />
            <Tooltip formatter={(v) => [`${v} kcal`, '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="消費" fill={NAVY} radius={[3, 3, 0, 0]} />
            <Bar dataKey="摂取" fill={TEAL} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* AIコメント */}
      <div style={{ background: ICE, borderRadius: 14, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>AIコメント</p>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          {/* ここに、体重・カロリー収支を踏まえたコメントを表示する予定 */}
          コメント欄(今後実装)
        </p>
      </div>
    </div>
  );
}
