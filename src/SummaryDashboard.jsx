import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingDown, Sparkles, Loader2 } from 'lucide-react';
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
  const [goalValue, setGoalValue] = useState('');
  const [goalMetric, setGoalMetric] = useState('weight_kg');
  const [goalSaving, setGoalSaving] = useState(false);
  const [toneInstruction, setToneInstruction] = useState('');
  const [toneSaving, setToneSaving] = useState(false);
  const [iconUrl, setIconUrl] = useState('');
  const [iconUploading, setIconUploading] = useState(false);
  const [aiComment, setAiComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState('');

  useEffect(() => {
    loadAll();
    loadGoal();
    loadToneInstruction();
  }, []);

  async function loadToneInstruction() {
    const { data } = await supabase.from('ai_comment_settings').select('*').eq('id', 1).single();
    if (data?.tone_instruction) setToneInstruction(data.tone_instruction);
    if (data?.icon_url) setIconUrl(data.icon_url);
  }

  async function handleIconUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIconUploading(true);
    try {
      // ファイル名は固定にして、毎回同じ場所を上書きする(古い画像がストレージに溜まらないようにするため)
      const ext = file.name.split('.').pop();
      const filePath = `icon.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('ai-comment-icons')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('ai-comment-icons').getPublicUrl(filePath);
      // キャッシュ対策のため、末尾にタイムスタンプを付けて毎回新しいURLとして扱う
      const publicUrlWithCacheBust = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from('ai_comment_settings').upsert({
        id: 1,
        icon_url: publicUrlWithCacheBust,
        updated_at: new Date().toISOString(),
      });

      setIconUrl(publicUrlWithCacheBust);
    } catch (err) {
      console.error(err);
      alert('アイコンのアップロードに失敗しました。');
    } finally {
      setIconUploading(false);
    }
  }

  async function saveToneInstruction() {
    setToneSaving(true);
    await supabase.from('ai_comment_settings').upsert({
      id: 1,
      tone_instruction: toneInstruction,
      updated_at: new Date().toISOString(),
    });
    setToneSaving(false);
  }

  async function loadGoal() {
    const { data } = await supabase.from('user_goals').select('*').eq('id', 1).single();
    if (data) {
      setGoalMetric(data.metric);
      setGoalValue(String(data.target_value));
    }
  }

  async function saveGoal() {
    if (!goalValue) return;
    setGoalSaving(true);
    await supabase.from('user_goals').upsert({
      id: 1,
      metric: goalMetric,
      target_value: Number(goalValue),
      updated_at: new Date().toISOString(),
    });
    setGoalSaving(false);
  }

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

    // 当日はまだ食事・運動データが出揃っていないことが多く、
    // 中途半端な数字がグラフに出てしまうため、集計対象からは除外する(前日までを表示)
    const todayDate = new Date();
    const todayDateStr = todayDate.toISOString().split('T')[0];

    const dateSet = new Set();
    [...foodLogs, ...exerciseLogs].forEach((l) => {
      if (l.logged_date >= cutoffStr && l.logged_date < todayDateStr) dateSet.add(l.logged_date);
    });
    // 期間内の日付は、食事/運動の記録が無い日も含めて連続で表示する(当日は除く)
    for (let i = 1; i <= days; i++) {
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

  // AIコメント生成用に、期間全体を要約する
  const summaryStats = useMemo(() => {
    if (balanceChartData.length === 0) return null;
    const avgIntake = Math.round(
      balanceChartData.reduce((sum, d) => sum + d.摂取, 0) / balanceChartData.length
    );
    const avgBurn = Math.round(
      balanceChartData.reduce((sum, d) => sum + d.基礎代謝 + d.アクティブ, 0) / balanceChartData.length
    );
    const daysOverIntake = balanceChartData.filter(
      (d) => d.摂取 > d.基礎代謝 + d.アクティブ
    ).length;

    return {
      periodDays: days,
      latestWeight: latestWeight ? Number(latestWeight.weight_kg) : null,
      weightChange: weightChangeInRange != null ? Number(weightChangeInRange.toFixed(1)) : null,
      latestBodyFat: latestFat,
      bodyFatChange: fatChange != null ? Number(fatChange.toFixed(1)) : null,
      avgIntake,
      avgBurn,
      daysOverIntake,
      totalDays: balanceChartData.length,
      goalMetric,
      goalValue: goalValue ? Number(goalValue) : null,
      toneInstruction: toneInstruction || null,
    };
  }, [balanceChartData, days, latestWeight, weightChangeInRange, latestFat, fatChange, goalMetric, goalValue, toneInstruction]);

  async function handleGenerateComment() {
    if (!summaryStats) return;
    setCommentLoading(true);
    setCommentError('');
    try {
      const response = await fetch('/api/generate-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summaryStats),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'コメントの生成に失敗しました');
      }
      const data = await response.json();
      setAiComment(data.comment);
    } catch (err) {
      console.error(err);
      setCommentError('コメントの生成に失敗しました。もう一度お試しください。');
    } finally {
      setCommentLoading(false);
    }
  }

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

      {/* 目標値の設定(現時点では体重のみ。将来的に体脂肪率・除脂肪体重にも切り替えられるようmetricを持たせてある) */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 12, color: MUTED, margin: 0, whiteSpace: 'nowrap' }}>目標体重</p>
        <input
          type="number"
          value={goalValue}
          onChange={(e) => setGoalValue(e.target.value)}
          onBlur={saveGoal}
          placeholder="例: 65"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14 }}
        />
        <span style={{ fontSize: 12, color: MUTED }}>kg</span>
        {goalSaving && <span style={{ fontSize: 11, color: TEAL }}>保存中...</span>}
      </div>

      {/* AIコメントの口調・トーン(自由記述、そのままプロンプトに追加指示として渡す) */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>AIコメントの口調(任意)</p>
          {toneSaving && <span style={{ fontSize: 11, color: TEAL }}>保存中...</span>}
        </div>
        <textarea
          value={toneInstruction}
          onChange={(e) => setToneInstruction(e.target.value)}
          onBlur={saveToneInstruction}
          placeholder="例: 熱血コーチっぽく応援する口調で。絵文字も少し使って。"
          rows={2}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiComment || commentError ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* アイコン(未設定なら丸い枠だけ表示。タップ/クリックでアップロード) */}
            <label style={{ cursor: 'pointer', position: 'relative' }}>
              <input type="file" accept="image/*" onChange={handleIconUpload} style={{ display: 'none' }} />
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt="AIアイコン"
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${ICE}` }}
                />
              ) : (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: '#fff', border: `1px dashed ${MUTED}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {iconUploading
                    ? <Loader2 size={12} color={MUTED} style={{ animation: 'spin 1s linear infinite' }} />
                    : <span style={{ fontSize: 9, color: MUTED }}>設定</span>}
                </div>
              )}
            </label>
            <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: 0 }}>AIコメント</p>
          </div>
          <button
            onClick={handleGenerateComment}
            disabled={commentLoading || !summaryStats}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: NAVY, color: '#fff',
              border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
              cursor: commentLoading ? 'default' : 'pointer', opacity: commentLoading || !summaryStats ? 0.6 : 1,
            }}
          >
            {commentLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
            {commentLoading ? '生成中...' : 'コメントを生成する'}
          </button>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {commentError && <p style={{ fontSize: 12, color: '#B91C1C', margin: 0 }}>{commentError}</p>}

        {aiComment && !commentError && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {iconUrl && (
              <img src={iconUrl} alt="AIアイコン" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            )}
            <p style={{ fontSize: 13, color: NAVY, margin: 0, lineHeight: 1.7 }}>{aiComment}</p>
          </div>
        )}

        {!aiComment && !commentError && !commentLoading && (
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>ボタンを押すと、直近{days}日のデータを踏まえたコメントが表示されます。</p>
        )}
      </div>
    </div>
  );
}
