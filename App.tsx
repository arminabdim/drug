
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Medicine, ViewType, ShortageInsight } from './types';
import { getLocalDB, saveToLocalDB, exportDB, importDB, getAppSettings, saveAppSettings, exportToCSV } from './db';
import { syncMedicinesWithAI, fetchShortageInsights, getAIResponse, getDeepAnalysis, generateSpeech } from './geminiService';

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
  } catch (e) {
    console.error("Audio Playback Error:", e);
  }
}

// --- Components ---

const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string, isUser: boolean }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { text: userMsg, isUser: true }]);
    setIsTyping(true);
    try {
      const reply = await getAIResponse(userMsg);
      setMessages(prev => [...prev, { text: reply || "متوجه نشدم.", isUser: false }]);
    } catch (e) {
      setMessages(prev => [...prev, { text: "خطا در ارتباط با هوش مصنوعی.", isUser: false }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-[100] flex flex-col items-end gap-4">
      {isOpen && (
        <div className="w-80 h-[450px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in">
          <div className="p-4 bg-blue-600 text-white flex justify-between items-center font-bold">
            <span>دستیار هوشمند PharmaBase</span>
            <button onClick={() => setIsOpen(false)}>✕</button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
            {messages.length === 0 && <div className="text-center text-slate-400 text-sm mt-10">سوالات دارویی خود را بپرسید...</div>}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed ${m.isUser ? 'bg-blue-600 text-white mr-auto rounded-bl-none' : 'bg-white text-slate-700 ml-auto border border-slate-200 rounded-br-none'}`}>
                {m.text}
              </div>
            ))}
            {isTyping && <div className="text-[10px] text-slate-400 animate-pulse">در حال پاسخ‌گویی...</div>}
          </div>
          <div className="p-3 border-t bg-white flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="بپرسید..." className="flex-1 bg-slate-100 px-3 py-2 rounded-xl text-xs outline-none" />
            <button onClick={handleSend} className="bg-blue-600 text-white w-8 h-8 rounded-xl flex items-center justify-center">▲</button>
          </div>
        </div>
      )}
      <button onClick={() => setIsOpen(!isOpen)} className="w-14 h-14 bg-blue-600 rounded-full shadow-xl flex items-center justify-center text-white text-2xl hover:scale-110 transition-transform">
        {isOpen ? '✕' : '💬'}
      </button>
    </div>
  );
};

const Modal: React.FC<{ isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col relative shadow-2xl animate-in">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="text-xl font-black text-slate-800">{title}</h3>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const Sidebar: React.FC<{ currentView: string, setView: (v: any) => void, isOpen: boolean, toggle: () => void }> = ({ currentView, setView, isOpen, toggle }) => {
  const items = [
    { id: ViewType.DASHBOARD, label: 'داشبورد', icon: '📊' },
    { id: ViewType.INVENTORY, label: 'بانک دارویی', icon: '💊' },
    { id: ViewType.CATEGORIES, label: 'دسته‌بندی‌ها', icon: '📂' },
    { id: ViewType.SHORTAGES, label: 'کمبودهای بازار', icon: '⚠️' },
    { id: 'COMPARISON', label: 'مقایسه داروها', icon: '⚖️' },
    { id: ViewType.SETTINGS, label: 'تنظیمات پیشرفته', icon: '⚙️' },
  ];
  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-slate-900/40 z-[40] lg:hidden backdrop-blur-sm" onClick={toggle} />}
      <div className={`fixed right-0 top-0 bottom-0 z-[50] w-72 bg-slate-900 text-white flex flex-col p-6 shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="text-2xl font-bold mb-10 flex items-center justify-between border-b border-slate-700 pb-6">
          <div className="flex items-center gap-3"><div className="bg-blue-600 p-2 rounded-xl shadow-lg">💉</div><span>PharmaBase</span></div>
          <button onClick={toggle} className="lg:hidden text-slate-400">✕</button>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
          {items.map(item => (
            <button key={item.id} onClick={() => { setView(item.id); if (window.innerWidth < 1024) toggle(); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${currentView === item.id ? 'bg-blue-600 shadow-xl' : 'hover:bg-slate-800'}`}>
              <span className="text-xl">{item.icon}</span><span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewType | 'COMPARISON'>(ViewType.DASHBOARD);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batchSize, setBatchSize] = useState(200);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [shortageInsight, setShortageInsight] = useState<ShortageInsight | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [comparisonList, setComparisonList] = useState<string[]>([]);
  const [previewMed, setPreviewMed] = useState<Medicine | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // چرخه خودکار بروزرسانی ۱۵ ثانیه‌ای
  useEffect(() => {
    const autoSyncInterval = setInterval(() => {
      // فقط اگر در حال آپدیت دستی نیست، آپدیت پس‌زمینه شروع شود
      if (!isSyncing && !isBackgroundSyncing) {
        handleBackgroundSync();
      }
    }, 15000);

    return () => clearInterval(autoSyncInterval);
  }, [isSyncing, isBackgroundSyncing, medicines, batchSize]);

  useEffect(() => { 
    const loadedDB = getLocalDB();
    setMedicines(loadedDB);
    const settings = getAppSettings();
    setBatchSize(settings.batchSize);
    if (loadedDB.length > 0) setLastSyncTime(new Date(loadedDB[0].lastUpdated));
  }, []);

  useEffect(() => { 
    if (view === ViewType.SHORTAGES && !shortageInsight) fetchShortageInsights().then(setShortageInsight); 
  }, [view]);

  const categories = useMemo(() => Array.from(new Set(medicines.map(m => m.category || "سایر"))).sort(), [medicines]);

  // منطق مشترک برای ادغام داده‌ها
  const mergeAndSave = useCallback((newMeds: Medicine[]) => {
    setMedicines(prevMeds => {
      const mergedMap = new Map<string, Medicine>();
      prevMeds.forEach(m => mergedMap.set(m.genericName.toLowerCase().trim(), m));
      newMeds.forEach(m => mergedMap.set(m.genericName.toLowerCase().trim(), m));
      const finalMeds = Array.from(mergedMap.values());
      saveToLocalDB(finalMeds);
      return finalMeds;
    });
    setLastSyncTime(new Date());
  }, []);

  // آپدیت دستی (با نمایش کامل وضعیت)
  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true); 
    setSyncProgress(5);
    try {
      const interval = setInterval(() => setSyncProgress(p => p < 90 ? p + Math.random() * 5 : p), 800);
      const newMeds = await syncMedicinesWithAI(batchSize);
      clearInterval(interval);
      mergeAndSave(newMeds);
      setSyncProgress(100); 
      setTimeout(() => { setIsSyncing(false); setSyncProgress(0); }, 500);
    } catch (e) { 
      setIsSyncing(false); 
      setSyncProgress(0);
    }
  }, [batchSize, mergeAndSave]);

  // آپدیت پس‌زمینه (بی‌صدا)
  const handleBackgroundSync = useCallback(async () => {
    setIsBackgroundSyncing(true);
    try {
      // در پس‌زمینه تعداد کمتری (مثلاً ۵۰ مورد جدید) دریافت می‌کنیم تا سرعت بالا بماند
      const newMeds = await syncMedicinesWithAI(50);
      mergeAndSave(newMeds);
    } catch (e) {
      console.warn("Background Sync Failed - Retrying in 15s");
    } finally {
      setIsBackgroundSyncing(false);
    }
  }, [mergeAndSave]);

  const handleDeepAnalysis = async (name: string) => {
    setIsAnalyzing(true); setAnalysisResult(null);
    try {
      const res = await getDeepAnalysis(name);
      setAnalysisResult(res);
    } catch (e) { setAnalysisResult("خطا در تحلیل عمیق."); }
    finally { setIsAnalyzing(false); }
  };

  const handleTTS = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audio = await generateSpeech(text);
      if (audio) await playBase64Audio(audio);
    } catch (e) {}
    finally { setIsSpeaking(false); }
  };

  const filteredMeds = useMemo(() => {
    let res = medicines;
    if (view === ViewType.CATEGORIES && selectedCategory) res = res.filter(m => m.category === selectedCategory);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      res = res.filter(m => m.genericName.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    }
    return res;
  }, [medicines, searchTerm, selectedCategory, view]);

  return (
    <div className="min-h-screen bg-[#FDFDFE] font-vazir lg:pr-72 transition-all">
      <Sidebar currentView={view} setView={setView} isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <header className="h-20 lg:h-24 bg-white/90 backdrop-blur-lg border-b sticky top-0 z-30 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2.5 bg-slate-100 rounded-xl">☰</button>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">PharmaBase Pro</h1>
            <div className="flex items-center gap-1.5">
               <div className={`w-2 h-2 rounded-full ${isBackgroundSyncing || isSyncing ? 'bg-blue-500 animate-ping' : 'bg-emerald-500'}`} />
               <span className="text-[10px] text-slate-500 font-bold">
                 {isBackgroundSyncing ? 'در حال همگام‌سازی پس‌زمینه...' : lastSyncTime ? `بروزرسانی شده: ${lastSyncTime.toLocaleTimeString('fa-IR')}` : 'آماده بکار'}
               </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={handleSync} 
            disabled={isSyncing} 
            className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-bold shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-xs lg:text-sm flex items-center gap-2"
          >
            {isSyncing ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                در حال دریافت...
              </>
            ) : (
              <>
                <span>🔄</span>
                بروزرسانی دستی
              </>
            )}
          </button>
        </div>
        {isSyncing && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100">
            <div className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_#2563eb]" style={{ width: `${syncProgress}%` }} />
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-10 pb-32">
        {view === ViewType.DASHBOARD && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm group hover:border-blue-200 transition-all">
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📦</div>
              <div className="text-4xl font-black text-slate-800">{medicines.length}</div>
              <div className="text-xs text-slate-400 font-bold uppercase mt-2 tracking-widest">اقلام ژنریک ثبت شده</div>
            </div>
            <div className="bg-red-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-red-200 group hover:scale-[1.02] transition-all">
              <div className="text-5xl mb-4">🚨</div>
              <div className="text-4xl font-black">{medicines.filter(m => m.variants.some(v => v.isShortage)).length}</div>
              <div className="text-xs opacity-70 font-bold uppercase mt-2 tracking-widest">کمبودهای گزارش شده</div>
            </div>
            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-center relative overflow-hidden group">
              <div className="relative z-10">
                <div className="text-lg font-black mb-1">چرخه بروزرسانی زنده</div>
                <div className="text-[10px] text-blue-400 mb-4 font-bold animate-pulse">Auto-Sync: Every 15 Seconds</div>
                <button onClick={() => setView(ViewType.SETTINGS)} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-xs font-bold transition-all border border-white/10">تنظیمات پیشرفته</button>
              </div>
              <div className="absolute -right-6 -bottom-6 text-9xl opacity-5 rotate-12 group-hover:rotate-0 transition-transform">⚡</div>
            </div>
          </div>
        )}

        {view === ViewType.INVENTORY && (
          <div className="space-y-6">
            <div className="relative group">
              <input 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder="نام دارو یا دسته درمانی را جستجو کنید..." 
                className="w-full h-16 px-6 pr-14 rounded-3xl border-2 border-slate-100 focus:border-blue-500 bg-white font-bold transition-all shadow-sm focus:shadow-xl focus:shadow-blue-500/5 outline-none" 
              />
              <span className="absolute right-6 top-5 text-2xl opacity-40 group-focus-within:opacity-100 group-focus-within:text-blue-500 transition-all">🔍</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredMeds.map(med => (
                <div key={med.id} className="bg-white border rounded-[2rem] p-6 hover:shadow-2xl transition-all border-slate-100 flex flex-col group relative">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-black text-slate-800 truncate pr-2" title={med.genericName}>{med.genericName}</h3>
                    {med.variants.some(v => v.isShortage) && (
                      <span className="shrink-0 text-[8px] bg-red-100 text-red-600 px-2 py-1 rounded-lg font-black shadow-sm">NAYAB</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mb-6 bg-slate-50 px-2 py-1 rounded-md inline-block self-start">{med.category}</p>
                  <div className="mt-auto flex justify-between items-center pt-5 border-t border-slate-50">
                    <button onClick={() => setPreviewMed(med)} className="text-blue-600 font-black text-xs hover:text-blue-800 transition-colors flex items-center gap-1">
                      جزئیات فنی <span>←</span>
                    </button>
                    <button 
                      onClick={() => setComparisonList(prev => prev.includes(med.id) ? prev.filter(id => id !== med.id) : [...prev, med.id])} 
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${comparisonList.includes(med.id) ? 'bg-red-50 text-red-600 shadow-inner' : 'bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600'}`}
                    >
                      {comparisonList.includes(med.id) ? '➖' : '⚖️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'COMPARISON' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-4">
               <h2 className="text-2xl font-black text-slate-800">مقایسه تخصصی اقلام ({comparisonList.length})</h2>
               {comparisonList.length > 0 && <button onClick={() => setComparisonList([])} className="text-xs font-bold text-red-500 hover:underline">پاک کردن لیست</button>}
            </div>
            <div className="overflow-x-auto bg-white rounded-[2.5rem] border shadow-xl">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-6 font-black text-slate-500 text-sm">ویژگی تخصصی</th>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => (
                      <th key={m.id} className="p-6 font-black text-blue-600 border-r min-w-[200px]">
                        <div className="flex flex-col gap-1">
                          <span>{m.genericName}</span>
                          <span className="text-[10px] text-slate-400 font-normal">{m.category}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-500 text-sm">دسته درمانی</td>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => <td key={m.id} className="p-6 border-r text-sm font-medium">{m.category}</td>)}
                  </tr>
                  <tr className="border-b hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-500 text-sm">حداقل قیمت</td>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => <td key={m.id} className="p-6 border-r font-mono text-sm text-blue-600 font-bold">{Math.min(...m.variants.map(v => v.price)).toLocaleString()} ر</td>)}
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-500 text-sm">تعداد تامین‌کننده</td>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => <td key={m.id} className="p-6 border-r text-sm font-bold">{m.variants.length} شرکت</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === ViewType.SETTINGS && (
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="bg-white p-10 lg:p-14 rounded-[3rem] border shadow-2xl space-y-12">
              <div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">استراتژی بروزرسانی مستمر</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Continuous Sync & Database Integrity</p>
                <div className="space-y-6">
                  <div className="p-6 bg-blue-50 border border-blue-100 rounded-[2rem] flex items-center justify-between">
                     <div>
                        <h4 className="font-black text-slate-800 text-sm">بروزرسانی خودکار ۱۵ ثانیه‌ای</h4>
                        <p className="text-[10px] text-blue-600 font-bold mt-1">وضعیت فعلی: فعال و در حال پایش منابع</p>
                     </div>
                     <div className="w-12 h-6 bg-blue-600 rounded-full relative shadow-inner"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" /></div>
                  </div>
                  <label className="block text-sm font-black text-slate-700 mb-3">حجم استخراج داده در هر نوبت دستی:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[50, 100, 200, 500].map(size => (
                      <button 
                        key={size}
                        onClick={() => { setBatchSize(size); saveAppSettings({ batchSize: size }); }}
                        className={`py-4 rounded-2xl font-black transition-all border-2 flex flex-col items-center gap-1 ${batchSize === size ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-blue-200'}`}
                      >
                        <span className="text-lg">{size}</span>
                        <span className="text-[10px] opacity-70">قلم دارو</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-10 border-t">
                <h3 className="text-2xl font-black text-slate-800 mb-6">ابزارهای پشتیبان‌گیری و گزارش</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={exportDB} className="p-8 bg-slate-900 text-white rounded-[2rem] font-bold flex flex-col items-center gap-3 hover:bg-black transition-all group">
                    <span className="text-3xl group-hover:scale-110 transition-transform">💾</span>
                    <span className="text-xs">پشتیبان‌گیری رمزنگاری شده (.pharma)</span>
                  </button>
                  <button onClick={() => exportToCSV(medicines)} className="p-8 bg-emerald-600 text-white rounded-[2rem] font-bold flex flex-col items-center gap-3 hover:bg-emerald-700 transition-all group">
                    <span className="text-3xl group-hover:scale-110 transition-transform">📊</span>
                    <span className="text-xs">خروجی اکسل (CSV)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Chatbot />

      <Modal isOpen={!!previewMed} onClose={() => { setPreviewMed(null); setAnalysisResult(null); }} title={`نمای فنی: ${previewMed?.genericName}`}>
        {previewMed && (
          <div className="space-y-8">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-7 rounded-[2.5rem] border border-blue-100 flex items-center justify-between shadow-inner">
              <div className="space-y-1">
                <div className="text-[10px] font-black text-blue-500 uppercase tracking-tighter">Therapeutic Category</div>
                <div className="text-xl font-black text-slate-800">{previewMed.category}</div>
              </div>
              <button 
                onClick={() => handleTTS(`اطلاعات جامع داروی ${previewMed.genericName} در گروه ${previewMed.category}. این دارو دارای ${previewMed.variants.length} نوع تولید شده در ایران است.`)} 
                className={`w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center text-2xl transition-all ${isSpeaking ? 'animate-pulse text-blue-500 scale-90' : 'hover:scale-110 text-slate-600'}`}
              >
                {isSpeaking ? '💬' : '🔊'}
              </button>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => handleDeepAnalysis(previewMed.genericName)} 
                disabled={isAnalyzing} 
                className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    در حال تحلیل عمیق...
                  </div>
                ) : (
                  <>
                    <span className="text-xl">🧠</span>
                    دریافت تحلیل فارماکولوژیک (AI Thinking)
                  </>
                )}
              </button>
              {analysisResult && (
                <div className="p-7 bg-slate-50 border rounded-[2rem] text-xs leading-[2.2] text-slate-700 whitespace-pre-wrap animate-in shadow-inner border-slate-200">
                  <div className="font-black text-slate-900 mb-4 border-b pb-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full" /> تحلیل هوش مصنوعی:
                  </div>
                  {analysisResult}
                </div>
              )}
            </div>

            <div className="space-y-5">
              <h4 className="font-black text-slate-800 px-2 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                تامین‌کنندگان و قیمت‌گذاری
              </h4>
              <div className="space-y-3">
                {previewMed.variants.map((v, i) => (
                  <div key={i} className="bg-white border p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-blue-100 transition-colors shadow-sm">
                    <div>
                      <div className="font-black text-slate-800 text-base">{v.manufacturer}</div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">{v.form} | {v.dosage}</div>
                    </div>
                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between border-t sm:border-t-0 pt-3 sm:pt-0">
                      <div className="text-left">
                        <div className="text-[9px] text-slate-400 font-black uppercase">Last Official Price</div>
                        <div className="text-xl font-black text-blue-600 font-mono tracking-tighter">{v.price.toLocaleString()} ر</div>
                      </div>
                      <div className="w-20 text-center">
                        {v.isShortage ? 
                          <span className="text-[10px] bg-red-50 text-red-600 px-3 py-1.5 rounded-xl font-black border border-red-100 animate-pulse">NAYAB</span> : 
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl font-black border border-emerald-100">MOJUD</span>
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <style>{`
        @media print {
          .lg\\:pr-72 { padding-right: 0 !important; }
          header, sidebar, .fixed, button, input { display: none !important; }
          main { width: 100% !important; max-width: none !important; padding: 0 !important; }
          .bg-white { border: none !important; box-shadow: none !important; }
          table { width: 100% !important; border: 1px solid #eee !important; }
        }
        .animate-in { animation: animate-in 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes animate-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default App;
