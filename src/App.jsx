import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Check, X, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#121D33';
const TEAL = '#00B8A9';
const ICE = '#E8EDF5';
const MUTED = '#6B7280';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function App() {
  const [stage, setStage] = useState('idle'); // idle, analyzing, confirm, error
  const [imagePreview, setImagePreview] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [entries, setEntries] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const totalToday = entries
    .filter((e) => e.logged_date === todayStr())
    .reduce((sum, e) => sum + e.kcal, 0);

  // 起動時に直近の記録をSupabaseから読み込む
  useEffect(() => {
    loadRecentEntries();
  }, []);

  async function loadRecentEntries() {
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .order('logged_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) setEntries(data);
  }

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setImagePreview(dataUrl);
      setStage('analyzing');
      setErrorMsg('');

      try {
        const base64Data = dataUrl.split(',')[1];
        const mediaType = file.type || 'image/jpeg';

        // Vercelのサーバーレス関数経由で解析(APIキーはブラウザに渡らない)
        const response = await fetch('/api/analyze-food', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data, mediaType }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || '解析に失敗しました');
        }

        const result = await response.json();
        setAnalysis(result);
        setStage('confirm');
      } catch (err) {
        console.error(err);
        setErrorMsg('解析に失敗しました。もう一度お試しください。');
        setStage('error');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleConfirm = async () => {
    const newEntry = {
      logged_date: todayStr(),
      food_name: analysis.foodName,
      kcal: analysis.kcal,
      protein_g: analysis.protein,
      fat_g: analysis.fat,
      carbs_g: analysis.carbs,
      provider: analysis.provider,
    };

    const { data, error } = await supabase.from('food_logs').insert(newEntry).select();

    if (error) {
      console.error(error);
      setErrorMsg('データベースへの保存に失敗しました。');
      setStage('error');
      return;
    }

    setEntries((prev) => [data[0], ...prev]);
    resetFlow();
  };

  const resetFlow = () => {
    setStage('idle');
    setImagePreview(null);
    setAnalysis(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCamera = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FA', fontFamily: 'Calibri, sans-serif' }}>
      <div style={{ background: NAVY_DARK, padding: '24px 20px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: TEAL, opacity: 0.15 }} />
        <div style={{ position: 'absolute', bottom: -50, right: 30, width: 90, height: 90, borderRadius: '50%', background: TEAL, opacity: 0.1 }} />
        <p style={{ color: '#B8C2D9', fontSize: 13, margin: 0, letterSpacing: 0.5 }}>今日の摂取カロリー</p>
        <p style={{ color: '#fff', fontSize: 40, fontWeight: 700, margin: '4px 0 0', fontFamily: 'Cambria, serif' }}>
          {totalToday.toLocaleString()} <span style={{ fontSize: 18, fontWeight: 400, color: '#B8C2D9' }}>kcal</span>
        </p>
      </div>

      <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
        {stage === 'idle' && (
          <button
            onClick={openCamera}
            style={{
              width: '100%',
              background: TEAL,
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '18px',
              fontSize: 16,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,184,169,0.35)',
            }}
          >
            <Camera size={22} />
            カロリーを登録する
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {stage === 'analyzing' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center' }}>
            {imagePreview && (
              <img src={imagePreview} alt="撮影した食事" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 16 }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: NAVY }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>カロリーを解析中...</span>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {stage === 'confirm' && analysis && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
            {imagePreview && (
              <img src={imagePreview} alt="撮影した食事" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 16 }} />
            )}
            <p style={{ color: MUTED, fontSize: 13, margin: '0 0 4px' }}>推定メニュー</p>
            <p style={{ color: NAVY, fontSize: 18, fontWeight: 700, margin: '0 0 16px', fontFamily: 'Cambria, serif' }}>{analysis.foodName}</p>

            <div style={{ background: ICE, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: NAVY }}>{analysis.kcal}</span>
                <span style={{ fontSize: 14, color: MUTED }}>kcal</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['たんぱく質', analysis.protein],
                  ['脂質', analysis.fat],
                  ['炭水化物', analysis.carbs],
                ].map(([label, val]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: MUTED, margin: '0 0 2px' }}>{label}</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: 0 }}>{val}g</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={resetFlow}
                style={{ flex: 1, background: '#fff', color: MUTED, border: `1px solid #D1D5DB`, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
              >
                <X size={16} />
                取り消す
              </button>
              <button
                onClick={handleConfirm}
                style={{ flex: 2, background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
              >
                <Check size={16} />
                この内容で登録する
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center' }}>
            <p style={{ color: '#B91C1C', fontSize: 14, margin: '0 0 16px' }}>{errorMsg}</p>
            <button
              onClick={resetFlow}
              style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              やり直す
            </button>
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <TrendingUp size={16} color={NAVY} />
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>記録一覧</p>
            </div>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: NAVY, margin: '0 0 2px' }}>{entry.food_name}</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} />
                    {entry.logged_date}
                  </p>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: TEAL, margin: 0 }}>{entry.kcal} kcal</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
