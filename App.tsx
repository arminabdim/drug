
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Medicine, ViewType, ShortageInsight } from './types';
import { getLocalDB, saveToLocalDB, exportDB, importDB, getAppSettings, saveAppSettings, exportToCSV } from './db';
import { syncMedicinesWithAI, fetchShortageInsights, getAIResponse, getDeepAnalysis, generateSpeech } from './geminiService';

// --- Utils ---
async function playBase64Audio(base64: string) {
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

const Sidebar: React.FC<{ currentView: ViewType | 'COMPARISON', setView: (v: ViewType | 'COMPARISON') => void, isOpen: boolean, toggle: () => void }> = ({ currentView, setView, isOpen, toggle }) => {
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
          <div className="flex items-center gap-3"><div className="bg-blue-600 p-2 rounded-xl">💉</div><span>PharmaBase</span></div>
          <button onClick={toggle} className="lg:hidden text-slate-400">✕</button>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
          {items.map(item => (
            <button key={item.id} onClick={() => { setView(item.id as any); if (window.innerWidth < 1024) toggle(); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${currentView === item.id ? 'bg-blue-600 shadow-xl' : 'hover:bg-slate-800'}`}>
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

  useEffect(() => { 
    setMedicines(getLocalDB());
    const settings = getAppSettings();
    setBatchSize(settings.batchSize);
  }, []);

  useEffect(() => { 
    if (view === ViewType.SHORTAGES && !shortageInsight) fetchShortageInsights().then(setShortageInsight); 
  }, [view]);

  const categories = useMemo(() => Array.from(new Set(medicines.map(m => m.category || "سایر"))).sort(), [medicines]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true); setSyncProgress(10);
    try {
      const interval = setInterval(() => setSyncProgress(p => p < 92 ? p + Math.random() * 3 : p), 600);
      const newMeds = await syncMedicinesWithAI(batchSize);
      clearInterval(interval);
      setSyncProgress(100);

      const merged = [...medicines];
      newMeds.forEach(nm => {
        const idx = merged.findIndex(m => m.genericName.trim() === nm.genericName.trim());
        if (idx > -1) merged[idx] = nm; else merged.push(nm);
      });

      setMedicines(merged);
      saveToLocalDB(merged);
      setTimeout(() => { setIsSyncing(false); setSyncProgress(0); }, 500);
    } catch (e) { 
      alert("خطا در بروزرسانی. لطفاً اتصال اینترنت خود را چک کنید.");
      setIsSyncing(false); 
    }
  }, [medicines, batchSize]);

  const handleDeepAnalysis = async (name: string) => {
    setIsAnalyzing(true); setAnalysisResult(null);
    try {
      const res = await getDeepAnalysis(name);
      setAnalysisResult(res);
    } catch (e) { setAnalysisResult("خطا در تحلیل عمیق."); }
    finally { setIsAnalyzing(false); }
  };

  const handleTTS = async (text: string) => {
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
    if (searchTerm) res = res.filter(m => m.genericName.toLowerCase().includes(searchTerm.toLowerCase()));
    return res;
  }, [medicines, searchTerm, selectedCategory, view]);

  return (
    <div className="min-h-screen bg-[#FDFDFE] font-vazir lg:pr-72 transition-all">
      <Sidebar currentView={view} setView={setView} isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <header className="h-20 lg:h-24 bg-white/80 backdrop-blur-lg border-b sticky top-0 z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 bg-slate-100 rounded-xl">☰</button>
          <h1 className="text-xl font-black text-slate-800">PharmaBase Pro</h1>
        </div>
        <button onClick={handleSync} disabled={isSyncing} className="bg-blue-600 text-white px-5 py-2 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all hover:scale-105 disabled:opacity-50 text-xs lg:text-sm">
          {isSyncing ? `در حال دریافت ${batchSize} مورد...` : 'بروزرسانی هوشمند'}
        </button>
        {isSyncing && <div className="absolute bottom-0 left-0 h-1 bg-blue-600 transition-all duration-300" style={{ width: `${syncProgress}%` }} />}
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-10 pb-24">
        {view === ViewType.DASHBOARD && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2rem] border shadow-sm group hover:border-blue-200 transition-all">
              <div className="text-4xl mb-4">📦</div>
              <div className="text-4xl font-black">{medicines.length}</div>
              <div className="text-xs text-slate-400 font-bold uppercase mt-2">تعداد داروهای دیتابیس لوکال</div>
            </div>
            <div className="bg-red-600 p-8 rounded-[2rem] text-white shadow-xl group hover:scale-[1.02] transition-all">
              <div className="text-4xl mb-4">⚠️</div>
              <div className="text-4xl font-black">{medicines.filter(m => m.variants.some(v => v.isShortage)).length}</div>
              <div className="text-xs opacity-70 font-bold uppercase mt-2">اقلام دارای کمبود فعال</div>
            </div>
            <div className="bg-slate-900 p-8 rounded-[2rem] text-white flex flex-col justify-center">
              <div className="text-lg font-black mb-1">تنظیمات بروزرسانی</div>
              <div className="text-[10px] text-slate-400 mb-4 uppercase">Current Sync Batch: {batchSize} items</div>
              <button onClick={() => setView(ViewType.SETTINGS)} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all">تغییر تنظیمات</button>
            </div>
          </div>
        )}

        {view === ViewType.INVENTORY && (
          <div className="space-y-6">
            <div className="relative group">
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="نام دارو را جستجو کنید..." className="w-full h-16 px-6 pr-14 rounded-3xl border-2 border-slate-100 focus:border-blue-500 bg-white font-bold transition-all" />
              <span className="absolute right-6 top-5 text-xl opacity-40">🔍</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredMeds.map(med => (
                <div key={med.id} className="bg-white border rounded-[2rem] p-6 hover:shadow-xl transition-all border-slate-100 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-black text-slate-800">{med.genericName}</h3>
                    {med.variants.some(v => v.isShortage) && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black">SHORTAGE</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mb-6">{med.category}</p>
                  <div className="mt-auto flex justify-between items-center pt-4 border-t border-slate-50">
                    <button onClick={() => setPreviewMed(med)} className="text-blue-600 font-black text-xs hover:underline">مشاهده جزئیات</button>
                    <button 
                      onClick={() => setComparisonList(prev => prev.includes(med.id) ? prev.filter(id => id !== med.id) : [...prev, med.id])} 
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${comparisonList.includes(med.id) ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400 hover:text-blue-600'}`}
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
            <h2 className="text-2xl font-black px-4">مقایسه تخصصی اقلام انتخاب شده ({comparisonList.length})</h2>
            <div className="overflow-x-auto bg-white rounded-[2rem] border shadow-sm">
              <table className="w-full text-right">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-6 font-black text-slate-500">ویژگی</th>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => (
                      <th key={m.id} className="p-6 font-black text-blue-600 border-r">{m.genericName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-6 font-bold text-slate-500">دسته درمانی</td>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => <td key={m.id} className="p-6 border-r text-sm">{m.category}</td>)}
                  </tr>
                  <tr className="border-b">
                    <td className="p-6 font-bold text-slate-500">حداقل قیمت</td>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => <td key={m.id} className="p-6 border-r font-mono text-sm">{Math.min(...m.variants.map(v => v.price)).toLocaleString()} ر</td>)}
                  </tr>
                  <tr>
                    <td className="p-6 font-bold text-slate-500">تعداد واریانت</td>
                    {medicines.filter(m => comparisonList.includes(m.id)).map(m => <td key={m.id} className="p-6 border-r text-sm">{m.variants.length} مورد</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === ViewType.SETTINGS && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="bg-white p-8 lg:p-12 rounded-[2.5rem] border shadow-sm space-y-10">
              <div>
                <h3 className="text-xl font-black mb-6">تنظیمات بروزرسانی (Advanced Sync)</h3>
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">تعداد دارو در هر نوبت اپدیت</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[50, 100, 200, 500].map(size => (
                      <button 
                        key={size}
                        onClick={() => { setBatchSize(size); saveAppSettings({ batchSize: size }); }}
                        className={`py-3 rounded-2xl font-black transition-all border-2 ${batchSize === size ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-blue-200'}`}
                      >
                        {size} مورد
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">انتخاب تعداد بالاتر ممکن است زمان بروزرسانی را افزایش دهد اما دیتابیس جامع‌تری به شما ارائه می‌دهد.</p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-black mb-6">خروجی و پشتیبان‌گیری (Export Tools)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={exportDB} className="p-6 bg-slate-900 text-white rounded-[1.5rem] font-bold flex flex-col items-center gap-2 hover:bg-black transition-all">
                    <span className="text-2xl">📥</span>
                    <span className="text-xs">پشتیبان‌گیری کامل (JSON)</span>
                  </button>
                  <button onClick={() => exportToCSV(medicines)} className="p-6 bg-emerald-600 text-white rounded-[1.5rem] font-bold flex flex-col items-center gap-2 hover:bg-emerald-700 transition-all">
                    <span className="text-2xl">📊</span>
                    <span className="text-xs">خروجی اکسل (CSV)</span>
                  </button>
                </div>
                <button onClick={() => window.print()} className="w-full mt-4 p-4 border-2 border-slate-100 rounded-[1.5rem] font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2">
                  <span>🖨️</span> چاپ گزارش (PDF)
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Chatbot />

      <Modal isOpen={!!previewMed} onClose={() => { setPreviewMed(null); setAnalysisResult(null); }} title={`نمای تخصصی: ${previewMed?.genericName}`}>
        {previewMed && (
          <div className="space-y-8">
            <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-blue-400 uppercase">Category</div>
                <div className="text-lg font-black text-slate-800">{previewMed.category}</div>
              </div>
              <button onClick={() => handleTTS(`اطلاعات جامع داروی ${previewMed.genericName} در گروه ${previewMed.category}.`)} className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-xl">🔊</button>
            </div>

            <div className="space-y-3">
              <button onClick={() => handleDeepAnalysis(previewMed.genericName)} disabled={isAnalyzing} className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-3">
                {isAnalyzing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🧠'} تحلیل عمیق (AI Thinking Mode)
              </button>
              {analysisResult && (
                <div className="p-6 bg-slate-50 border rounded-[2rem] text-xs leading-loose text-slate-700 whitespace-pre-wrap animate-in">
                  {analysisResult}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="font-black text-slate-800 px-2">لیست تامین‌کنندگان و قیمت‌های جاری</h4>
              <div className="space-y-3">
                {previewMed.variants.map((v, i) => (
                  <div key={i} className="bg-white border p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="font-black text-slate-800">{v.manufacturer}</div>
                      <div className="text-[10px] text-slate-400 font-bold">{v.form} | {v.dosage}</div>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between">
                      <div className="text-lg font-black text-blue-600 font-mono">{v.price.toLocaleString()} ر</div>
                      {v.isShortage && <span className="text-[9px] bg-red-100 text-red-600 px-2 py-1 rounded-lg font-black">کمیاب</span>}
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
          header, sidebar, nav, .fixed, button { display: none !important; }
          main { width: 100% !important; max-width: none !important; padding: 0 !important; }
          .bg-white { border: none !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
