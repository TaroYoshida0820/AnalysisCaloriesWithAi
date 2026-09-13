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
const BMR_COLOR = '#9FB4E0'; // 基礎代謝(淡い青)
const ACTIVE_COLOR = '#00B8A9'; // アクティブ(ティール、頑張りが目立つ色)
const INTAKE_COLOR = NAVY; // 摂取(ネイビー)

export default function SummaryDashboard() {
  const [weightLogs, setWeightLogs] = useState([]);
  const [foodLogs, setFoodLogs] = useState([]);
  const [exerciseLogs, setExerciseLogs] = useState([]);
  const [bmrLogs, setBmrLogs] = useState([]);
  const [days, setDays] = useState(14);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [w, f, e, b] = await Promise.all([
      supabase.from('weight_logs').select('*').order('logged_date', { ascending: true }),
      supabase.from('food_logs').select('logged_date, kcal'),
      supabase.from('exercise_logs').select('logged_date, burned_kcal'),
      supabase.from('bmr_logs').select('*').order('logged_date', { ascending: true }),
    ]);
    if (w.data) setWeightLogs(w.data);
    if (f.data) setFoodLogs(f.data);
    if (e.data) setExerciseLogs(e.data);
    if (b.data) setBmrLogs(b.data);
  }

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

  // 基礎代謝は毎日自動計測されているわけではないため、記録が無い日は
  // 直近の既知の値を繰り越して使う(0扱いにしない)
  function bmrOnOrBefore(dateStr) {
    let result = null;
    for (const row of bmrLogs) {
      if (row.logged_date <= dateStr) {
        result = row.bmr_kcal;
      } else {
        break;
      }
    }
    return result;
  }

  const balanceChartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const dateSet = new Set();
    [...foodLogs, ...exerciseLogs].forEach((l) => {
      if (l.logged_date >= cutoffStr) dateSet.add(l.logged_date);
    });
    // 期間内の日付は、食事/運動の記録が無い日も含めて連続で表示する
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      if (dStr >= cutoffStr) dateSet.add(dStr);
    }

    return Array.from(dateSet)
      .sort()
      .map((date) => {
        const intake = foodLogs
          .filter((l) => l.logged_date === date)
          .reduce((sum, l) => sum + l.kcal, 0);
        const active = exerciseLogs
          .filter((l) => l.logged_date === date)
          .reduce((sum, l) => sum + l.burned_kcal, 0);
        const bmr = bmrOnOrBefore(date) || 0;
        return {
          date: date.slice(5),
          摂取: intake,
          基礎代謝: bmr,
          アクティブ: active,
        };
      });
  }, [foodLogs, exerciseLogs, bmrLogs, days]);

  return (
    <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto', fontFamily: 'Calibri, sans-serif' }}>
      {/* 期間切り替え(体重・カロリー収支どちらにも共通で適用) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          [7, '7日'],
          [14, '14日'],
          [30, '30日'],
        ].map(([r, label]) => (
          <button
            key={r}
            onClick={() => setDays(r)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: days === r ? 'none' : '1px solid #D1D5DB',
              background: days === r ? NAVY : '#fff',
              color: days === r ? '#fff' : MUTED,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 体重推移 */}
      <div style={{ background: NAVY_DARK, borderRadius: 16, padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: TEAL, opacity: 0.15 }} />
        <p style={{ color: '#B8C2D9', fontSize: 13, margin: 0 }}>体重の推移(直近{days}日)</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
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
            <LineChart data={weightChartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8492AD' }} interval="preserveStartEnd" />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#8492AD' }} width={36} />
              <Tooltip formatter={(v) => [`${v} kg`, '体重']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="weight" stroke={TEAL} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 摂取カロリー vs 消費カロリー(基礎代謝+アクティブの内訳付き) */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 8px 8px', marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 8px 8px' }}>摂取カロリー vs 消費カロリー</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={balanceChartData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
            <CartesianGrid stroke={ICE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={44} />
            <Tooltip formatter={(v, name) => [`${v} kcal`, name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* 摂取カロリー(単独の棒) */}
            <Bar dataKey="摂取" fill={INTAKE_COLOR} radius={[3, 3, 0, 0]} />
            {/* 消費カロリー = 基礎代謝 + アクティブ(同じstackIdで積み上げ、内訳が見える) */}
            <Bar dataKey="基礎代謝" stackId="expenditure" fill={BMR_COLOR} radius={[0, 0, 0, 0]} />
            <Bar dataKey="アクティブ" stackId="expenditure" fill={ACTIVE_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* AIコメント */}
      <div style={{ background: ICE, borderRadius: 14, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>AIコメント</p>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          コメント欄(今後実装)
        </p>
      </div>
    </div>
  );
}
