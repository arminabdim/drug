
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Medicine, ViewType, ShortageInsight } from './types';
import { getLocalDB, saveToLocalDB, exportDB, importDB, getAppSettings, saveAppSettings, exportToCSV } from './db';
import { syncMedicinesWithAI, fetchShortageInsights, getAIResponse, getDeepAnalysis, generateSpeech, getPharmacyStrategy } from './geminiService';

// --- Utils ---
async function playBase64Audio(base64: string) {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  } catch (e) { console.error(e); }
}

// --- Modal Component ---
// Added missing Modal component to fix "Cannot find name 'Modal'" errors.
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b flex justify-between items-center text-right" dir="rtl">
          <h2 className="text-2xl font-black text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 text-xl transition-colors">✕</button>
        </div>
        <div className="p-8 overflow-y-auto text-right" dir="rtl">
          {children}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewType>(ViewType.DASHBOARD);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batchSize, setBatchSize] = useState(200);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Smart Filters
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterPriceRange, setFilterPriceRange] = useState<[number, number]>([0, 10000000]);
  const [showFilters, setShowFilters] = useState(false);

  // Strategy Section
  const [specialists, setSpecialists] = useState('');
  const [strategyResult, setStrategyResult] = useState<string | null>(null);
  const [isAnalyzingStrategy, setIsAnalyzingStrategy] = useState(false);

  const [shortageInsight, setShortageInsight] = useState<ShortageInsight | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewMed, setPreviewMed] = useState<Medicine | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    const loadedDB = getLocalDB();
    setMedicines(loadedDB);
    const settings = getAppSettings();
    setBatchSize(settings.batchSize);
    if (loadedDB.length > 0) setLastSyncTime(new Date(loadedDB[0].lastUpdated));
  }, []);

  // Auto Sync every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSyncing && !isBackgroundSyncing) handleBackgroundSync();
    }, 15000);
    return () => clearInterval(interval);
  }, [isSyncing, isBackgroundSyncing, medicines, batchSize]);

  // Load Shortage Insights
  useEffect(() => {
    if (view === ViewType.SHORTAGES && !shortageInsight) fetchShortageInsights().then(setShortageInsight);
  }, [view]);

  const categories = useMemo(() => Array.from(new Set(medicines.map(m => m.category))).sort(), [medicines]);

  const mergeAndSave = useCallback((newMeds: Medicine[]) => {
    setMedicines(prev => {
      const map = new Map<string, Medicine>();
      prev.forEach(m => map.set(m.genericName.toLowerCase().trim(), m));
      newMeds.forEach(m => map.set(m.genericName.toLowerCase().trim(), m));
      const final = Array.from(map.values());
      saveToLocalDB(final);
      return final;
    });
    setLastSyncTime(new Date());
  }, []);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true); setSyncProgress(5);
    try {
      const newMeds = await syncMedicinesWithAI(batchSize);
      mergeAndSave(newMeds);
      setSyncProgress(100);
      setTimeout(() => { setIsSyncing(false); setSyncProgress(0); }, 500);
    } catch (e) { setIsSyncing(false); }
  };

  const handleBackgroundSync = async () => {
    setIsBackgroundSyncing(true);
    try {
      const newMeds = await syncMedicinesWithAI(50);
      mergeAndSave(newMeds);
    } finally { setIsBackgroundSyncing(false); }
  };

  const handleStrategyAnalysis = async () => {
    if (!specialists.trim()) return;
    setIsAnalyzingStrategy(true);
    try {
      const medSummary = medicines.slice(0, 20).map(m => m.genericName).join(', ');
      const res = await getPharmacyStrategy(specialists, medSummary);
      setStrategyResult(res);
    } catch (e) { setStrategyResult("خطا در تحلیل استراتژی."); }
    finally { setIsAnalyzingStrategy(false); }
  };

  // TTS Handler
  // Added missing handleTTS function to resolve "Cannot find name 'handleTTS'" error.
  const handleTTS = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audioBase64 = await generateSpeech(text);
      if (audioBase64) {
        await playBase64Audio(audioBase64);
      }
    } catch (e) {
      console.error("TTS Error:", e);
    } finally {
      setIsSpeaking(false);
    }
  };

  const filteredMeds = useMemo(() => {
    return medicines.filter(m => {
      const matchesSearch = m.genericName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            m.indications?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            m.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !filterCategory || m.category === filterCategory;
      const minPrice = Math.min(...m.variants.map(v => v.price));
      const matchesPrice = minPrice >= filterPriceRange[0] && minPrice <= filterPriceRange[1];
      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [medicines, searchTerm, filterCategory, filterPriceRange]);

  const shortageMeds = useMemo(() => medicines.filter(m => m.variants.some(v => v.isShortage)), [medicines]);

  return (
    <div className="min-h-screen bg-[#FDFDFE] font-vazir lg:pr-72 transition-all">
      {/* Sidebar */}
      <div className={`fixed right-0 top-0 bottom-0 z-[50] w-72 bg-slate-900 text-white flex flex-col p-6 shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="text-2xl font-bold mb-10 border-b border-slate-700 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-blue-600 p-2 rounded-xl shadow-lg">💉</div><span>PharmaBase</span></div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400">✕</button>
        </div>
        <nav className="flex-1 space-y-2">
          {[
            { id: ViewType.DASHBOARD, label: 'داشبورد', icon: '📊' },
            { id: ViewType.INVENTORY, label: 'بانک دارویی', icon: '💊' },
            { id: ViewType.SHORTAGES, label: 'کمبودهای بازار', icon: '⚠️' },
            { id: ViewType.STRATEGY, label: 'استراتژی فروش', icon: '📈' },
            { id: ViewType.SETTINGS, label: 'تنظیمات', icon: '⚙️' },
          ].map(item => (
            <button key={item.id} onClick={() => { setView(item.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${view === item.id ? 'bg-blue-600 shadow-xl' : 'hover:bg-slate-800'}`}>
              <span className="text-xl">{item.icon}</span><span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <header className="h-20 lg:h-24 bg-white/90 backdrop-blur-lg border-b sticky top-0 z-30 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2.5 bg-slate-100 rounded-xl">☰</button>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-slate-800">مدیریت هوشمند داروخانه</h1>
            <div className="flex items-center gap-1.5">
               <div className={`w-2 h-2 rounded-full ${isBackgroundSyncing ? 'bg-blue-500 animate-ping' : 'bg-emerald-500'}`} />
               <span className="text-[10px] text-slate-500 font-bold">
                 {isBackgroundSyncing ? 'در حال پایش زنده...' : lastSyncTime ? `آخرین بروزرسانی: ${lastSyncTime.toLocaleTimeString('fa-IR')}` : 'اتصال فعال'}
               </span>
            </div>
          </div>
        </div>
        <button onClick={handleSync} disabled={isSyncing} className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-bold shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-50 text-xs flex items-center gap-2">
          {isSyncing ? 'بروزرسانی دستی...' : '🔄 آپدیت فوری'}
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-10 pb-32">
        {view === ViewType.DASHBOARD && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm group hover:border-blue-200 transition-all">
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📦</div>
              <div className="text-4xl font-black text-slate-800">{medicines.length}</div>
              <div className="text-xs text-slate-400 font-bold uppercase mt-2">تعداد کل اقلام دیتابیس</div>
            </div>
            <div className="bg-red-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-red-200">
              <div className="text-5xl mb-4">🚨</div>
              <div className="text-4xl font-black">{shortageMeds.length}</div>
              <div className="text-xs opacity-70 font-bold uppercase mt-2">کمبودهای فعال در دیتابیس شما</div>
            </div>
            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-center">
              <div className="text-lg font-black mb-1">پایش زنده</div>
              <div className="text-[10px] text-blue-400 mb-4 font-bold animate-pulse">Auto-Scan Active: 15s</div>
              <button onClick={() => setView(ViewType.STRATEGY)} className="bg-blue-600 px-6 py-2 rounded-xl text-xs font-bold shadow-lg">تحلیل تخصص‌های اطراف</button>
            </div>
          </div>
        )}

        {view === ViewType.INVENTORY && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="جستجوی نام، دسته یا مورد مصرف..." className="w-full h-16 px-6 pr-14 rounded-3xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold shadow-sm" />
                <span className="absolute right-6 top-5 text-2xl opacity-40">🔍</span>
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`px-6 rounded-3xl font-black transition-all ${showFilters ? 'bg-blue-600 text-white' : 'bg-white border-2 border-slate-100 text-slate-500'}`}>
                {showFilters ? 'بستن فیلترها' : 'فیلتر هوشمند'}
              </button>
            </div>

            {showFilters && (
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-lg space-y-6 animate-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2">دسته بندی درمانی</label>
                    <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm">
                      <option value="">همه دسته‌ها</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 mb-2">فیلتر قیمت (ریال)</label>
                    <div className="flex gap-2">
                      <input type="number" placeholder="از" onChange={e => setFilterPriceRange([Number(e.target.value), filterPriceRange[1]])} className="w-1/2 p-4 bg-slate-50 rounded-2xl text-sm font-bold" />
                      <input type="number" placeholder="تا" onChange={e => setFilterPriceRange([filterPriceRange[0], Number(e.target.value) || 10000000])} className="w-1/2 p-4 bg-slate-50 rounded-2xl text-sm font-bold" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredMeds.map(med => (
                <div key={med.id} className="bg-white border rounded-[2rem] p-6 hover:shadow-2xl transition-all border-slate-100 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-black text-slate-800">{med.genericName}</h3>
                    {med.variants.some(v => v.isShortage) && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-1 rounded-lg font-black">کمیاب</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mb-2 bg-slate-50 px-2 py-1 rounded-md self-start">{med.category}</p>
                  <p className="text-[11px] text-slate-600 mb-6 line-clamp-2">{med.indications || "اطلاعات مصرف ثبت نشده است."}</p>
                  <button onClick={() => setPreviewMed(med)} className="mt-auto w-full py-3 bg-slate-50 text-blue-600 font-black text-xs rounded-xl hover:bg-blue-50 transition-colors">مشاهده و تحلیل فنی</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === ViewType.SHORTAGES && (
          <div className="space-y-8">
            <h2 className="text-2xl font-black text-slate-800">لیست زنده کمبودهای دیتابیس شما</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {shortageMeds.map(med => (
                <div key={med.id} className="bg-white border-r-8 border-r-red-500 p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 mb-1">{med.genericName}</h3>
                    <p className="text-xs text-slate-400 font-bold mb-4">{med.category}</p>
                    <div className="space-y-2">
                      {med.variants.filter(v => v.isShortage).map((v, i) => (
                        <div key={i} className="text-[10px] bg-red-50 text-red-700 p-2 rounded-lg flex justify-between">
                          <span>{v.manufacturer} ({v.form})</span>
                          <span className="font-bold">کمیاب</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setPreviewMed(med)} className="mt-6 text-blue-600 font-black text-xs">تحلیل جایگزین هوشمند</button>
                </div>
              ))}
              {shortageMeds.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 font-bold">در حال حاضر هیچ دارویی در دیتابیس به عنوان "کمیاب" علامت نخورده است.</div>}
            </div>

            {shortageInsight && (
              <div className="bg-slate-900 p-10 rounded-[3rem] text-white space-y-6">
                <h3 className="text-xl font-black flex items-center gap-3">
                  <span className="text-3xl">🌐</span> تحلیل آنلاین بازار دارو
                </h3>
                <p className="text-sm leading-loose opacity-80 whitespace-pre-wrap">{shortageInsight.text}</p>
                <div className="flex flex-wrap gap-2 pt-4">
                  {shortageInsight.sources.map((s, i) => (
                    <a key={i} href={s.uri} target="_blank" className="text-[10px] bg-white/10 px-3 py-1 rounded-full hover:bg-white/20">🔗 {s.title}</a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === ViewType.STRATEGY && (
          <div className="max-w-4xl mx-auto space-y-10">
            <div className="bg-white p-10 lg:p-14 rounded-[3.5rem] border shadow-2xl space-y-10">
              <div className="text-center space-y-4">
                <div className="text-6xl">🏢</div>
                <h2 className="text-3xl font-black text-slate-800">تحلیل پزشکان اطراف داروخانه</h2>
                <p className="text-slate-400 font-bold">لیست تخصص‌های اطراف داروخانه را وارد کنید تا بهترین سبد دارویی سودآور را به شما پیشنهاد دهیم.</p>
              </div>

              <div className="space-y-6">
                <textarea 
                  value={specialists} 
                  onChange={e => setSpecialists(e.target.value)} 
                  placeholder="مثلاً: متخصص اطفال، فوق تخصص قلب، دندانپزشک، کلینیک شبانه‌روزی..." 
                  className="w-full h-40 p-8 rounded-[2rem] bg-slate-50 border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-800 resize-none"
                />
                <button 
                  onClick={handleStrategyAnalysis} 
                  disabled={isAnalyzingStrategy || !specialists.trim()} 
                  className="w-full h-16 bg-blue-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isAnalyzingStrategy ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : "تحلیل استراتژیک چیدمان و خرید"}
                </button>
              </div>

              {strategyResult && (
                <div className="p-10 bg-indigo-50 border border-indigo-100 rounded-[3rem] space-y-6 animate-in">
                  <div className="flex items-center gap-3 font-black text-indigo-900 border-b border-indigo-200 pb-4 text-xl">
                    <span>💡</span> پیشنهاد استراتژیک هوش مصنوعی:
                  </div>
                  <div className="text-sm leading-[2.4] text-slate-700 whitespace-pre-wrap font-medium">
                    {strategyResult}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === ViewType.SETTINGS && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-10">
              <h3 className="text-2xl font-black text-slate-800">تنظیمات پایگاه داده</h3>
              <div className="space-y-6">
                 <div>
                    <label className="block text-xs font-black text-slate-400 mb-3 uppercase tracking-widest">تعداد استخراج در هر نوبت دستی</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[50, 100, 200, 500].map(s => (
                        <button key={s} onClick={() => { setBatchSize(s); saveAppSettings({ batchSize: s }); }} className={`py-3 rounded-xl font-black border-2 transition-all ${batchSize === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>{s}</button>
                      ))}
                    </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t">
                    <button onClick={exportDB} className="p-6 bg-slate-900 text-white rounded-2xl font-bold flex flex-col items-center gap-2">💾 پشتیبان‌گیری</button>
                    <button onClick={() => exportToCSV(medicines)} className="p-6 bg-emerald-600 text-white rounded-2xl font-bold flex flex-col items-center gap-2">📊 خروجی اکسل</button>
                 </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Modal isOpen={!!previewMed} onClose={() => { setPreviewMed(null); setAnalysisResult(null); }} title={previewMed?.genericName || ""}>
        {previewMed && (
          <div className="space-y-8">
            <div className="bg-blue-50 p-6 rounded-[2rem] flex justify-between items-center">
              <div>
                <div className="text-[10px] font-black text-blue-400">CATEGORY</div>
                <div className="text-lg font-black text-slate-800">{previewMed.category}</div>
              </div>
              <button onClick={() => handleTTS(`اطلاعات داروی ${previewMed.genericName} در گروه ${previewMed.category}. مورد مصرف: ${previewMed.indications}`)} className="w-12 h-12 bg-white rounded-2xl shadow flex items-center justify-center text-xl">🔊</button>
            </div>
            
            <div className="space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase">موارد مصرف اصلی</div>
              <p className="text-sm font-bold text-slate-700 leading-loose">{previewMed.indications || "ثبت نشده."}</p>
            </div>

            <button onClick={() => { setIsAnalyzing(true); getDeepAnalysis(previewMed.genericName).then(setAnalysisResult).finally(() => setIsAnalyzing(false)); }} className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-3">
              {isAnalyzing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "تحلیل تخصصی (Thinking AI)"}
            </button>
            
            {analysisResult && <div className="p-6 bg-slate-50 border rounded-2xl text-xs leading-loose text-slate-600 whitespace-pre-wrap">{analysisResult}</div>}

            <div className="space-y-4">
              <h4 className="font-black text-slate-800">لیست تولیدکنندگان و قیمت</h4>
              {previewMed.variants.map((v, i) => (
                <div key={i} className="bg-white border p-5 rounded-2xl flex justify-between items-center shadow-sm">
                  <div>
                    <div className="font-black text-slate-800">{v.manufacturer}</div>
                    <div className="text-[10px] text-slate-400">{v.form} | {v.dosage}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-black text-blue-600">{v.price.toLocaleString()} ر</div>
                    {v.isShortage && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black">کمیاب</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default App;
