import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Check, X, Calendar, TrendingUp, Loader2, PenLine, Repeat, Trash2, Scale, Utensils, Pencil } from 'lucide-react';
import { supabase } from './supabaseClient';
import WeightDashboard from './WeightDashboard';
import CalorieDashboard from './CalorieDashboard';

const NAVY = '#1B2A4A';
const NAVY_DARK = '#121D33';
const TEAL = '#00B8A9';
const ICE = '#E8EDF5';
const MUTED = '#6B7280';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function compressImage(file, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const emptyManualEntry = { foodName: '', kcal: '', protein: '', fat: '', carbs: '' };

export default function App() {
  const [activeTab, setActiveTab] = useState('food'); // 'food' | 'weight'
  const [stage, setStage] = useState('idle');
  const [pendingFile, setPendingFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [comment, setComment] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [entries, setEntries] = useState([]);
  const [frequentFoods, setFrequentFoods] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const totalToday = entries
    .filter((e) => e.logged_date === todayStr())
    .reduce((sum, e) => sum + e.kcal, 0);

  const todayEntries = entries.filter((e) => e.logged_date === todayStr());
  const totalProteinToday = todayEntries.reduce((sum, e) => sum + (e.protein_g || 0), 0);
  const totalFatToday = todayEntries.reduce((sum, e) => sum + (e.fat_g || 0), 0);
  const totalCarbsToday = todayEntries.reduce((sum, e) => sum + (e.carbs_g || 0), 0);

  useEffect(() => {
    loadRecentEntries();
    loadFrequentFoods();
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

  // 過去の記録から「よく食べるもの」を集計する。
  // 同じ料理名が何度も出てくるものを頻度順に並べ、直近の栄養値をそのまま使い回せるようにする。
  async function loadFrequentFoods() {
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error || !data) return;

    const map = new Map();
    for (const row of data) {
      if (!map.has(row.food_name)) {
        map.set(row.food_name, { ...row, count: 1 });
      } else {
        map.get(row.food_name).count += 1;
      }
    }

    const sorted = Array.from(map.values())
      .filter((item) => item.count >= 2) // 1回しか食べてないものは「よく食べる」に含めない
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    setFrequentFoods(sorted);
  }

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setComment('');
    setErrorMsg('');
    setStage('comment');
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!pendingFile) return;
    setStage('analyzing');
    try {
      const compressedDataUrl = await compressImage(pendingFile, 1024, 0.7);
      setImagePreview(compressedDataUrl);
      const base64Data = compressedDataUrl.split(',')[1];
      const mediaType = 'image/jpeg';

      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, mediaType, userComment: comment }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || '解析に失敗しました');
      }

      const result = await response.json();
      setAnalysis({
        foodName: result.foodName,
        kcal: String(result.kcal),
        protein: String(result.protein),
        fat: String(result.fat),
        carbs: String(result.carbs),
        provider: result.provider,
      });
      setStage('confirm');
    } catch (err) {
      console.error(err);
      setErrorMsg('解析に失敗しました。もう一度お試しください。');
      setStage('error');
    }
  }, [pendingFile, comment]);

  const startManualEntry = () => {
    setAnalysis({ ...emptyManualEntry, provider: 'manual' });
    setImagePreview(null);
    setStage('confirm');
  };

  // 「よく食べるもの」をタップした時、写真撮影・AI解析をスキップして
  // 過去の栄養値をそのまま確認画面に流し込む(その場で微調整も可能)
  const selectFrequentFood = (item) => {
    setAnalysis({
      foodName: item.food_name,
      kcal: String(item.kcal),
      protein: item.protein_g != null ? String(item.protein_g) : '',
      fat: item.fat_g != null ? String(item.fat_g) : '',
      carbs: item.carbs_g != null ? String(item.carbs_g) : '',
      provider: 'repeat',
    });
    setImagePreview(null);
    setStage('confirm');
  };

  const updateAnalysisField = (field, value) => {
    setAnalysis((prev) => ({ ...prev, [field]: value }));
  };

  const handleConfirm = async () => {
    const kcalNum = parseInt(analysis.kcal, 10);
    if (!analysis.foodName?.trim() || Number.isNaN(kcalNum)) {
      setErrorMsg('料理名とカロリーは必須です。');
      return;
    }

    const entryFields = {
      food_name: analysis.foodName.trim(),
      kcal: kcalNum,
      protein_g: analysis.protein ? parseInt(analysis.protein, 10) : null,
      fat_g: analysis.fat ? parseInt(analysis.fat, 10) : null,
      carbs_g: analysis.carbs ? parseInt(analysis.carbs, 10) : null,
      provider: analysis.provider,
    };

    if (analysis.id) {
      // 編集モード: 既存レコードを更新(日付・登録日時は変更しない)
      const { data, error } = await supabase
        .from('food_logs')
        .update(entryFields)
        .eq('id', analysis.id)
        .select();

      if (error) {
        console.error(error);
        setErrorMsg('更新に失敗しました。');
        setStage('error');
        return;
      }

      setEntries((prev) => prev.map((e) => (e.id === analysis.id ? data[0] : e)));
    } else {
      // 新規登録モード
      const newEntry = { logged_date: todayStr(), ...entryFields };
      const { data, error } = await supabase.from('food_logs').insert(newEntry).select();

      if (error) {
        console.error(error);
        setErrorMsg('データベースへの保存に失敗しました。');
        setStage('error');
        return;
      }

      setEntries((prev) => [data[0], ...prev]);
    }

    resetFlow();
  };

  // 記録一覧から1件削除する。確認ダイアログを挟んで誤操作を防ぐ。
  const handleDelete = async (id) => {
    const ok = window.confirm('この記録を削除しますか?');
    if (!ok) return;

    const { error } = await supabase.from('food_logs').delete().eq('id', id);
    if (error) {
      console.error(error);
      alert('削除に失敗しました。');
      return;
    }

    setEntries((prev) => prev.filter((e) => e.id !== id));
    loadFrequentFoods(); // 「よく食べるもの」の集計も更新
  };

  // 保存済みの記録を編集する(一部だけ入力していたものを後から直す用途)
  const startEditEntry = (entry) => {
    setAnalysis({
      id: entry.id, // 更新対象を区別するために保持(新規登録時はundefined)
      foodName: entry.food_name,
      kcal: String(entry.kcal),
      protein: entry.protein_g != null ? String(entry.protein_g) : '',
      fat: entry.fat_g != null ? String(entry.fat_g) : '',
      carbs: entry.carbs_g != null ? String(entry.carbs_g) : '',
      provider: entry.provider,
    });
    setImagePreview(null);
    setStage('confirm');
  };

  const resetFlow = () => {
    setStage('idle');
    setPendingFile(null);
    setImagePreview(null);
    setComment('');
    setAnalysis(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCamera = () => { fileInputRef.current?.click(); };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
    fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FA', fontFamily: 'Calibri, sans-serif' }}>
      {/* タブ切り替え */}
      <div style={{ display: 'flex', background: NAVY_DARK, padding: '12px 20px 0' }}>
        <button
          onClick={() => setActiveTab('food')}
          style={{
            flex: 1, background: 'none', border: 'none', paddingBottom: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            color: activeTab === 'food' ? '#fff' : '#8492AD',
            fontSize: 14, fontWeight: 600,
            borderBottom: activeTab === 'food' ? `2px solid ${TEAL}` : '2px solid transparent',
          }}
        >
          <Utensils size={16} />
          食事
        </button>
        <button
          onClick={() => setActiveTab('weight')}
          style={{
            flex: 1, background: 'none', border: 'none', paddingBottom: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            color: activeTab === 'weight' ? '#fff' : '#8492AD',
            fontSize: 14, fontWeight: 600,
            borderBottom: activeTab === 'weight' ? `2px solid ${TEAL}` : '2px solid transparent',
          }}
        >
          <Scale size={16} />
          体重
        </button>
        <button
          onClick={() => setActiveTab('calorie_trend')}
          style={{
            flex: 1, background: 'none', border: 'none', paddingBottom: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            color: activeTab === 'calorie_trend' ? '#fff' : '#8492AD',
            fontSize: 14, fontWeight: 600,
            borderBottom: activeTab === 'calorie_trend' ? `2px solid ${TEAL}` : '2px solid transparent',
          }}
        >
          <TrendingUp size={16} />
          推移
        </button>
      </div>

      {activeTab === 'weight' ? (
        <WeightDashboard />
      ) : activeTab === 'calorie_trend' ? (
        <CalorieDashboard />
      ) : (
        <>
          <div style={{ background: NAVY_DARK, padding: '20px 20px 32px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: TEAL, opacity: 0.15 }} />
            <div style={{ position: 'absolute', bottom: -50, right: 30, width: 90, height: 90, borderRadius: '50%', background: TEAL, opacity: 0.1 }} />
            <p style={{ color: '#B8C2D9', fontSize: 13, margin: 0, letterSpacing: 0.5 }}>今日の摂取カロリー</p>
            <p style={{ color: '#fff', fontSize: 40, fontWeight: 700, margin: '4px 0 0', fontFamily: 'Cambria, serif' }}>
              {totalToday.toLocaleString()} <span style={{ fontSize: 18, fontWeight: 400, color: '#B8C2D9' }}>kcal</span>
            </p>

            {todayEntries.length > 0 && (
              <div style={{ display: 'flex', gap: 16, marginTop: 12, position: 'relative', zIndex: 1 }}>
                {[
                  ['P', totalProteinToday, '#7FE3D6'],
                  ['F', totalFatToday, '#FFC97F'],
                  ['C', totalCarbsToday, '#9FB4E0'],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ color, fontSize: 11, fontWeight: 700 }}>{label}</span>
                    <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'Cambria, serif' }}>
                      {value}
                    </span>
                    <span style={{ color: '#B8C2D9', fontSize: 10 }}>g</span>
                  </div>
                ))}
              </div>
            )}
          </div>

      <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
        {stage === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={openCamera} style={{
              width: '100%', background: TEAL, color: '#fff', border: 'none', borderRadius: 14,
              padding: '18px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,184,169,0.35)',
            }}>
              <Camera size={22} />
              カロリーを登録する
            </button>
            <button onClick={startManualEntry} style={{
              width: '100%', background: '#fff', color: NAVY, border: '1px solid #D1D5DB', borderRadius: 14,
              padding: '14px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, cursor: 'pointer',
            }}>
              <PenLine size={18} />
              手入力で登録する(AI解析なし)
            </button>

            {frequentFoods.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Repeat size={14} color={NAVY} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>よく食べるもの</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {frequentFoods.map((item) => (
                    <button
                      key={item.food_name}
                      onClick={() => selectFrequentFood(item)}
                      style={{
                        background: '#fff', border: `1px solid ${ICE}`, borderRadius: 20,
                        padding: '8px 14px', fontSize: 13, color: NAVY, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.food_name}</span>
                      <span style={{ color: MUTED, fontSize: 11 }}>{item.kcal}kcal</span>
                      <span style={{
                        background: ICE, color: NAVY, borderRadius: 10, padding: '1px 6px',
                        fontSize: 10, fontWeight: 700,
                      }}>
                        ×{item.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />

        {stage === 'comment' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
            <p style={{ color: NAVY, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>補足コメント(任意)</p>
            <p style={{ color: MUTED, fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>
              量や残した分など、写真だけでは伝わらない情報があれば入力してください。<br />
              例:「並盛でした」「スープは半分残した」
            </p>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="例: 富士そばの大盛と表示されていましたが並盛でした" rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={resetFlow} style={{ flex: 1, background: '#fff', color: MUTED, border: '1px solid #D1D5DB', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={runAnalysis} style={{ flex: 2, background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                この内容で解析する
              </button>
            </div>
          </div>
        )}

        {stage === 'analyzing' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center' }}>
            {imagePreview && <img src={imagePreview} alt="撮影した食事" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 16 }} />}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: NAVY }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>カロリーを解析中...</span>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {stage === 'confirm' && analysis && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
            {imagePreview && <img src={imagePreview} alt="撮影した食事" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 16 }} />}
            {analysis.provider === 'manual' && <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, margin: '0 0 12px' }}>手入力モード(AI解析なし)</p>}
            {analysis.provider === 'repeat' && <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, margin: '0 0 12px' }}>よく食べるものから選択(過去の記録を再利用・必要に応じて数値を調整してください)</p>}

            <p style={{ color: MUTED, fontSize: 13, margin: '0 0 4px' }}>料理名</p>
            <input type="text" value={analysis.foodName} onChange={(e) => updateAnalysisField('foodName', e.target.value)}
              placeholder="例: 鴨南蛮そば" style={{ ...inputStyle, marginBottom: 16, fontSize: 16, fontWeight: 700, color: NAVY }} />

            <div style={{ background: ICE, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: MUTED, margin: '0 0 6px' }}>カロリー(kcal) — 数値を編集できます</p>
              <input type="number" value={analysis.kcal} onChange={(e) => updateAnalysisField('kcal', e.target.value)}
                style={{ ...inputStyle, fontSize: 24, fontWeight: 700, color: NAVY, marginBottom: 14 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[['たんぱく質', 'protein'], ['脂質', 'fat'], ['炭水化物', 'carbs']].map(([label, field]) => (
                  <div key={field}>
                    <p style={{ fontSize: 11, color: MUTED, margin: '0 0 4px', textAlign: 'center' }}>{label}(g)</p>
                    <input type="number" value={analysis[field]} onChange={(e) => updateAnalysisField(field, e.target.value)}
                      style={{ ...inputStyle, textAlign: 'center', fontSize: 14, fontWeight: 600, padding: '8px' }} />
                  </div>
                ))}
              </div>
            </div>

            {errorMsg && <p style={{ color: '#B91C1C', fontSize: 13, margin: '0 0 12px' }}>{errorMsg}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={resetFlow} style={{ flex: 1, background: '#fff', color: MUTED, border: '1px solid #D1D5DB', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                <X size={16} />
                取り消す
              </button>
              <button onClick={handleConfirm} style={{ flex: 2, background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                <Check size={16} />
                {analysis.id ? 'この内容に更新する' : 'この内容で登録する'}
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center' }}>
            <p style={{ color: '#B91C1C', fontSize: 14, margin: '0 0 16px' }}>{errorMsg}</p>
            <button onClick={resetFlow} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              やり直す
            </button>
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <TrendingUp size={16} color={NAVY} />
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>直近の記録(最新20件)</p>
            </div>
            {entries.map((entry) => (
              <div key={entry.id} style={{
                background: '#fff', borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: NAVY, margin: '0 0 2px' }}>{entry.food_name}</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} />
                    {entry.logged_date}
                    {entry.provider === 'manual' && <span style={{ color: TEAL, fontWeight: 600 }}>・手入力</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: TEAL, margin: 0 }}>{entry.kcal} kcal</p>
                  <button
                    onClick={() => startEditEntry(entry)}
                    aria-label="編集"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: MUTED, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    aria-label="削除"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: MUTED, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
