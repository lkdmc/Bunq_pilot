import { useState, useEffect, useRef } from 'react';
import ReceiptUpload from './components/ReceiptUpload';
import { API_BASE } from './config';

const getIconForMerchant = (merchant) => {
  if (merchant.includes('Starbucks')) return { icon: '☕', bg: 'bg-green-900', text: 'text-green-400' };
  if (merchant.includes('Albert Heijn')) return { icon: '🛒', bg: 'bg-blue-900', text: 'text-blue-400' };
  if (merchant.includes('Netflix')) return { icon: '🍿', bg: 'bg-red-900', text: 'text-red-400' };
  if (merchant.includes('bunq')) return { icon: '🌈', bg: 'bg-purple-900', text: 'text-purple-400' };
  if (merchant.includes('Zara')) return { icon: '👕', bg: 'bg-gray-800', text: 'text-gray-300' };
  return { icon: '💳', bg: 'bg-gray-800', text: 'text-gray-300' };
};

const FinnAvatar = () => (
  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm border border-[#2C2C2E]">F</div>
);

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [transactions, setTransactions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [accountBalance, setAccountBalance] = useState(null);
  const [txLimit, setTxLimit] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [trend, setTrend] = useState([]);
  const [budget, setBudget] = useState(() => { const s = localStorage.getItem('monthly_budget'); return s ? parseFloat(s) : null; });
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [receiptTxId, setReceiptTxId] = useState(null);
  const [frMode, setFrMode] = useState(null);
  const [receiptReportData, setReceiptReportData] = useState(null);
  const [receiptReportLoading, setReceiptReportLoading] = useState(false);
  const chatBoxRef = useRef(null);

  // F.R. (Financial Report) modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [userPreference, setUserPreference] = useState({});
  const [selectedTxIndex, setSelectedTxIndex] = useState(null);

  const fetchHomeData = () => {
    setRefreshing(true);
    Promise.all([
      fetch(`${API_BASE}/api/transactions/sync`, { method: 'POST' })
        .then(r => r.json())
        .then(d => d.transactions || [])
        .catch(() => fetch(`${API_BASE}/api/transactions`).then(r => r.json())),
      fetch(`${API_BASE}/api/balance`).then(r => r.json()),
    ]).then(([txData, balData]) => {
      setTransactions(Array.isArray(txData) ? txData : []);
      if (balData.balance !== null) setAccountBalance(balData.balance);
    }).catch(() => {}).finally(() => setRefreshing(false));
  };

  useEffect(() => {
    fetchHomeData();
    // Load budget from backend on mount
    const now = new Date();
    fetch(`${API_BASE}/api/budget/${now.getFullYear()}/${now.getMonth() + 1}`)
      .then(r => r.json())
      .then(d => { if (d.amount != null) { setBudget(d.amount); localStorage.setItem('monthly_budget', d.amount); } })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const subsLoadedRef = useRef(false);
  const forecastLoadedRef = useRef(false);
  const trendLoadedRef = useRef(false);

  useEffect(() => {
    if (currentTab === 'subs' && !subsLoadedRef.current) {
      subsLoadedRef.current = true;
      setSubsLoading(true);
      fetch(`${API_BASE}/api/subscriptions`)
        .then(res => res.json())
        .then(data => { setSubscriptions(data); setSubsLoading(false); })
        .catch(() => setSubsLoading(false));
    }
    if (currentTab === 'forecast') {
      if (!forecastLoadedRef.current) { forecastLoadedRef.current = true; loadForecast(); }
      if (!trendLoadedRef.current) {
        trendLoadedRef.current = true;
        fetch(`${API_BASE}/api/monthly-trend`)
          .then(r => r.json()).then(data => setTrend(data)).catch(() => {});
      }
    }
  }, [currentTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentTab === 'ai' && chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory, isWaiting, currentTab]);

  const loadForecast = () => {
    setForecastLoading(true);
    fetch(`${API_BASE}/api/predict`)
      .then(res => res.json())
      .then(data => { setForecast(data); setForecastLoading(false); })
      .catch(() => setForecastLoading(false));
  };

  const sendMessage = async (textToUse) => {
    const text = textToUse || inputValue.trim();
    if (!text || isWaiting) return;
    setInputValue('');
    const newHistory = [...chatHistory, { role: 'user', content: text }];
    setChatHistory(newHistory);
    setIsWaiting(true);
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory })
      });
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data = await response.json();
      setChatHistory([...newHistory, { role: 'assistant', content: data.response }]);
    } catch (error) {
      setChatHistory([...newHistory, { role: 'assistant', content: 'Oops, there was a communication error! 😢 Please check if the backend server is running.' }]);
    } finally {
      setIsWaiting(false);
    }
  };

  // ── F.R. Financial Report ─────────────────────────────

  const handleAnalyze = async () => {
    setFrMode('transactions');
    setIsAnalyzing(true);
    setReportReady(false);
    try {
      const txData = transactions.slice(0, 15).map(t => ({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
      }));
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: txData, user_preference: userPreference }),
      });
      if (!res.ok) throw new Error('Analyze API failed');
      const data = await res.json();
      setReportData(data);
      setReportReady(true);
    } catch (err) {
      console.error(err);
      alert('Failed to analyze. Please check if the backend is running and API key is set.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReceiptAnalysis = async () => {
    setFrMode('receipts');
    setReceiptReportLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/receipts/report`);
      const data = await res.json();
      setReceiptReportData(data);
    } catch {
      setReceiptReportData({ breakdown: [], advice: 'Failed to load receipt data.' });
    } finally {
      setReceiptReportLoading(false);
    }
  };

  const handleCategoryChange = (newCategory) => {
    if (selectedTxIndex === null) return;
    const target = reportData.categorized_items[selectedTxIndex];
    const newItems = [...reportData.categorized_items];
    newItems[selectedTxIndex] = { ...target, category: newCategory };
    setReportData({ ...reportData, categorized_items: newItems });
    setUserPreference(prev => ({ ...prev, [target.merchant]: newCategory }));
    setSelectedTxIndex(null);
  };

  const renderReportModal = () => {
    const closeModal = () => {
      setShowReportModal(false);
      setIsAnalyzing(false);
      setReportReady(false);
      setFrMode(null);
      setReceiptReportData(null);
      setReceiptReportLoading(false);
    };
    const goBack = () => {
      setFrMode(null);
      setReportReady(false);
      setIsAnalyzing(false);
      setReceiptReportData(null);
      setReceiptReportLoading(false);
    };

    const closeBtn = (
      <button
        className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-50 bg-[#1C1C1E] border border-[#2C2C2E] rounded-full p-1.5"
        onClick={closeModal}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    );

    const backBtn = (
      <button
        className="absolute top-4 left-4 text-gray-500 hover:text-white transition-colors z-50 bg-[#1C1C1E] border border-[#2C2C2E] rounded-full p-1.5"
        onClick={goBack}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
      </button>
    );

    // ── Intro: choose analysis type ───────────────────
    if (frMode === null) return (
      <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-y-auto no-scrollbar">
        {closeBtn}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 pt-10 pb-10">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-3xl font-bold shadow-[0_0_50px_rgba(175,82,222,0.4)]">F</div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Financial Report</h2>
            <p className="text-gray-500 text-sm leading-relaxed max-w-[240px] mx-auto">Choose the type of analysis you want</p>
          </div>
          <div className="w-full flex flex-col gap-3 mt-2">
            <button
              onClick={handleAnalyze}
              className="w-full bg-gradient-to-r from-[#FF8C00] to-[#AF52DE] text-white font-bold py-5 rounded-2xl shadow-[0_8px_30px_rgba(175,82,222,0.35)] transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <p className="text-base mb-0.5">💳 Transaction Analysis</p>
              <p className="text-xs font-normal opacity-75">Income & expenses breakdown</p>
            </button>
            <button
              onClick={handleReceiptAnalysis}
              className="w-full bg-[#1C1C1E] border border-[#3C3C3E] text-white font-bold py-5 rounded-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <p className="text-base mb-0.5">🧾 Receipt Deep-Dive</p>
              <p className="text-xs font-normal text-gray-400">Detailed item-level analysis</p>
            </button>
          </div>
          <p className="text-gray-600 text-xs text-center">Use 📷 on any transaction to add receipt data</p>
        </div>
      </div>
    );

    // ── Transaction: loading ──────────────────────────
    if (frMode === 'transactions' && isAnalyzing) return (
      <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6">
        {closeBtn}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] opacity-25 animate-ping scale-110"></div>
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-3xl font-bold relative shadow-[0_0_40px_rgba(175,82,222,0.5)]">F</div>
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-base mb-1">Finn is analyzing…</p>
          <p className="text-gray-500 text-sm">Categorizing your transactions</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0, 150, 300].map(d => (
            <div key={d} className="w-2 h-2 rounded-full bg-gradient-to-r from-[#FF8C00] to-[#AF52DE] animate-bounce" style={{ animationDelay: `${d}ms` }}></div>
          ))}
        </div>
      </div>
    );

    // ── Transaction: results ──────────────────────────
    if (frMode === 'transactions' && reportReady) {
      let essentialSum = 0, standardSum = 0, luxurySum = 0, incomeSum = 0;
      reportData?.categorized_items?.forEach(item => {
        const amt = parseFloat(item.amount) || 0;
        if (item.category === 'Income' || amt > 0) incomeSum += Math.abs(amt);
        else if (item.category === 'Essential') essentialSum += Math.abs(amt);
        else if (item.category === 'Standard') standardSum += Math.abs(amt);
        else if (item.category === 'Luxury') luxurySum += Math.abs(amt);
      });
      const totalExpense = essentialSum + standardSum + luxurySum || 1;
      const essentialPct = essentialSum / totalExpense;
      const standardPct = standardSum / totalExpense;
      const luxuryPct = luxurySum / totalExpense;
      const now = new Date();
      const monthName = now.toLocaleString('default', { month: 'long' });

      return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-y-auto no-scrollbar pb-24">
          {closeBtn}
          {backBtn}
          <div className="px-4 pt-12 pb-5 border-b border-[#1C1C1E]">
            <p className="text-[10px] font-semibold text-gray-600 tracking-widest uppercase mb-0.5">{monthName} {now.getFullYear()}</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-[10px] font-bold shrink-0">F</div>
              <h1 className="text-xl font-bold text-white">Transaction Analysis</h1>
            </div>
          </div>

          <div className="px-4 pt-5 flex flex-col gap-4">
            <div className="relative bg-[#111] border border-[#2C2C2E] rounded-2xl p-4 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#FF8C00] to-[#AF52DE]"></div>
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-2">FINN'S SUMMARY</p>
              <p className="text-gray-200 text-sm leading-relaxed italic">"{reportData?.summary_headline}"</p>
            </div>

            <div className="bg-[#111] border border-[#2C2C2E] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-4">SPENDING OVERVIEW</p>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-28 h-28 shrink-0">
                  <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#1C1C1E" strokeWidth="5" />
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#06b6d4" strokeWidth="5"
                      strokeDasharray={`${essentialPct * 75.4} 100`} strokeDashoffset="0" />
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#3b82f6" strokeWidth="5"
                      strokeDasharray={`${standardPct * 75.4} 100`} strokeDashoffset={`${-essentialPct * 75.4}`} />
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#a855f7" strokeWidth="5"
                      strokeDasharray={`${luxuryPct * 75.4} 100`} strokeDashoffset={`${-(essentialPct + standardPct) * 75.4}`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-base font-bold text-white">€{(essentialSum + standardSum + luxurySum).toFixed(0)}</span>
                    <span className="text-[9px] text-gray-500">total spent</span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  {[
                    { label: 'Essential', pct: essentialPct, color: 'bg-cyan-500', amt: essentialSum },
                    { label: 'Standard', pct: standardPct, color: 'bg-blue-500', amt: standardSum },
                    { label: 'Luxury', pct: luxuryPct, color: 'bg-purple-500', amt: luxurySum },
                  ].map(({ label, pct, color, amt }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-gray-400">{label}</span>
                        <span className="text-[11px] font-semibold text-white">€{amt.toFixed(0)}</span>
                      </div>
                      <div className="h-1 bg-[#2C2C2E] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-[#2C2C2E]">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-green-500 tracking-widest uppercase mb-0.5">Income</p>
                  <p className="text-sm font-bold text-green-400">+€{incomeSum.toFixed(2)}</p>
                </div>
                <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-red-500 tracking-widest uppercase mb-0.5">Spent</p>
                  <p className="text-sm font-bold text-red-400">-€{(essentialSum + standardSum + luxurySum).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-3">AI INSIGHTS</p>
              <div className="flex flex-col gap-2.5">
                {[
                  { icon: '🔍', label: 'Past Insight', key: 'past_insight' },
                  { icon: '📊', label: 'Present Pacing', key: 'present_pacing' },
                  { icon: '🎯', label: 'Future Action', key: 'future_action' },
                ].map(({ icon, label, key }) => (
                  <div key={key} className="bg-[#111] border border-[#2C2C2E] rounded-2xl p-4 flex gap-3">
                    <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-[9px] font-bold text-gray-600 tracking-widest uppercase mb-1">{label}</p>
                      <p className="text-gray-200 text-sm leading-relaxed">{reportData?.advice?.[key]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-3">TRANSACTIONS</p>
              <div className="bg-[#111] border border-[#2C2C2E] rounded-2xl overflow-hidden">
                {reportData?.categorized_items?.map((t, i) => {
                  const badges = {
                    Essential: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                    Standard: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                    Luxury: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                    Income: 'bg-green-500/15 text-green-400 border-green-500/30',
                  };
                  const badgeCls = badges[t.category] || 'bg-gray-700/50 text-gray-400 border-gray-600';
                  const isLast = i === reportData.categorized_items.length - 1;
                  return (
                    <div key={i} onClick={() => setSelectedTxIndex(i)}
                      className={`flex items-center justify-between px-4 py-3 hover:bg-[#1C1C1E] transition cursor-pointer ${!isLast ? 'border-b border-[#1C1C1E]' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center text-base shrink-0 border border-[#2C2C2E]">
                          {getIconForMerchant(t.merchant).icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white truncate max-w-[110px]">{t.merchant}</p>
                          <p className="text-[11px] text-gray-600">{t.date}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className={`text-sm font-bold ${parseFloat(t.amount) > 0 ? 'text-green-400' : 'text-white'}`}>
                          {parseFloat(t.amount) > 0 ? '+' : ''}€{Math.abs(parseFloat(t.amount)).toFixed(2)}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badgeCls}`}>{t.category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedTxIndex !== null && (
            <>
              <div className="absolute inset-0 bg-black/70 z-[55]" onClick={() => setSelectedTxIndex(null)}></div>
              <div className="absolute inset-x-0 bottom-0 bg-[#1C1C1E] border-t border-[#2C2C2E] rounded-t-3xl p-5 z-[60]">
                <div className="w-8 h-1 bg-[#3C3C3E] rounded-full mx-auto mb-4"></div>
                <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-1">Change Category</p>
                <h3 className="text-white text-base font-bold mb-4">{reportData.categorized_items[selectedTxIndex]?.merchant}</h3>
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Income', cls: 'border-green-500/40 text-green-400 hover:bg-green-500/10' },
                    { label: 'Essential', cls: 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10' },
                    { label: 'Standard', cls: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                    { label: 'Luxury', cls: 'border-purple-500/40 text-purple-400 hover:bg-purple-500/10' },
                  ].map(({ label, cls }) => (
                    <button key={label} onClick={() => handleCategoryChange(label)}
                      className={`w-full bg-black border ${cls} font-semibold py-3 rounded-xl transition-colors text-sm`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    // ── Receipt: loading ──────────────────────────────
    if (frMode === 'receipts' && receiptReportLoading) return (
      <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6">
        {closeBtn}
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-green-500 to-blue-500 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(59,130,246,0.4)]">🧾</div>
        <div className="text-center">
          <p className="text-white font-semibold text-base mb-1">Analyzing receipts…</p>
          <p className="text-gray-500 text-sm">Loading your item-level data</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0, 150, 300].map(d => (
            <div key={d} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${d}ms` }}></div>
          ))}
        </div>
      </div>
    );

    // ── Receipt: results ──────────────────────────────
    if (frMode === 'receipts' && receiptReportData) {
      const hasData = receiptReportData.breakdown && receiptReportData.breakdown.length > 0;

      if (!hasData) return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-y-auto no-scrollbar">
          {closeBtn}
          {backBtn}
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 pt-16">
            <span className="text-5xl">🧾</span>
            <h2 className="text-xl font-bold text-white">No Receipts Yet</h2>
            <p className="text-gray-500 text-sm text-center leading-relaxed max-w-[220px]">
              Tap the 📷 button on any transaction to scan a receipt and get detailed item-level insights.
            </p>
          </div>
        </div>
      );

      const subTotals = { Essential: 0, Standard: 0, Luxury: 0 };
      const catMap = {};
      receiptReportData.breakdown.forEach(item => {
        const sub = item.subcategory || 'Standard';
        const cat = item.category || 'Other';
        if (subTotals[sub] !== undefined) subTotals[sub] += item.total;
        if (!catMap[cat]) catMap[cat] = 0;
        catMap[cat] += item.total;
      });
      const totalReceipt = subTotals.Essential + subTotals.Standard + subTotals.Luxury;
      const totalOrOne = totalReceipt || 1;
      const rEssentialPct = subTotals.Essential / totalOrOne;
      const rStandardPct = subTotals.Standard / totalOrOne;
      const rLuxuryPct = subTotals.Luxury / totalOrOne;
      const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const maxCat = topCats[0]?.[1] || 1;

      return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-y-auto no-scrollbar pb-24">
          {closeBtn}
          {backBtn}
          <div className="px-4 pt-12 pb-5 border-b border-[#1C1C1E]">
            <p className="text-[10px] font-semibold text-gray-600 tracking-widest uppercase mb-0.5">ITEM-LEVEL ANALYSIS</p>
            <div className="flex items-center gap-2">
              <span className="text-xl">🧾</span>
              <h1 className="text-xl font-bold text-white">Receipt Deep-Dive</h1>
            </div>
          </div>

          <div className="px-4 pt-5 flex flex-col gap-4">
            <div className="relative bg-[#111] border border-[#2C2C2E] rounded-2xl p-4 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-green-500 to-blue-500"></div>
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-2">FINN'S ADVICE</p>
              <p className="text-gray-200 text-sm leading-relaxed">{receiptReportData.advice}</p>
            </div>

            <div className="bg-[#111] border border-[#2C2C2E] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-4">SPENDING BEHAVIOR</p>
              <div className="flex items-center gap-4">
                <div className="relative w-28 h-28 shrink-0">
                  <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#1C1C1E" strokeWidth="5" />
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#22c55e" strokeWidth="5"
                      strokeDasharray={`${rEssentialPct * 75.4} 100`} strokeDashoffset="0" />
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#3b82f6" strokeWidth="5"
                      strokeDasharray={`${rStandardPct * 75.4} 100`} strokeDashoffset={`${-rEssentialPct * 75.4}`} />
                    <circle r="12" cx="16" cy="16" fill="transparent" stroke="#a855f7" strokeWidth="5"
                      strokeDasharray={`${rLuxuryPct * 75.4} 100`} strokeDashoffset={`${-(rEssentialPct + rStandardPct) * 75.4}`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-base font-bold text-white">€{totalReceipt.toFixed(0)}</span>
                    <span className="text-[9px] text-gray-500">total items</span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  {[
                    { label: 'Essential', pct: rEssentialPct, color: 'bg-green-500', amt: subTotals.Essential },
                    { label: 'Standard', pct: rStandardPct, color: 'bg-blue-500', amt: subTotals.Standard },
                    { label: 'Luxury', pct: rLuxuryPct, color: 'bg-purple-500', amt: subTotals.Luxury },
                  ].map(({ label, pct, color, amt }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-gray-400">{label}</span>
                        <span className="text-[11px] font-semibold text-white">€{amt.toFixed(2)}</span>
                      </div>
                      <div className="h-1 bg-[#2C2C2E] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-3">TOP CATEGORIES</p>
              <div className="bg-[#111] border border-[#2C2C2E] rounded-2xl overflow-hidden">
                {topCats.map(([cat, total], i) => {
                  const pct = total / maxCat;
                  const isLast = i === topCats.length - 1;
                  return (
                    <div key={cat} className={`px-4 py-3 ${!isLast ? 'border-b border-[#1C1C1E]' : ''}`}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm text-white font-medium">{cat}</span>
                        <span className="text-sm font-bold text-white">€{total.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full" style={{ width: `${pct * 100}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // ── Tabs ──────────────────────────────────────────────

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
      <div className="flex justify-between items-center mb-6">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-gray-700">
          <span className="text-xl">🐜</span>
        </div>
        <div className="flex gap-4 text-gray-300 items-center">
          <button onClick={fetchHomeData} disabled={refreshing} className="text-gray-300 disabled:opacity-40 transition">
            <svg className={`w-6 h-6 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-6">Home</h1>

      <div className="bunq-card p-4 flex items-center gap-4 mb-6">
        <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white">You haven't spent yet this month</p>
          <p className="text-sm text-gray-400">About the same as this time last month</p>
        </div>
        <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </div>

      <div className="flex gap-3 mb-8">
        <button className="flex-1 btn-pay rounded-xl py-3 flex flex-col items-center gap-1 bg-black">
          <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg></div>
          <span className="text-xs font-semibold text-orange-500">Pay</span>
        </button>
        <button className="flex-1 btn-request rounded-xl py-3 flex flex-col items-center gap-1 bg-[#002D6B]">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg></div>
          <span className="text-xs font-semibold text-blue-400">Request</span>
        </button>
        <button className="flex-1 btn-add-money rounded-xl py-3 flex flex-col items-center gap-1 bg-[#2D0A4E]">
          <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>
          <span className="text-xs font-semibold text-purple-400">Add Money</span>
        </button>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-end mb-3">
          <h2 className="text-lg font-bold">Bank Accounts</h2>
          <span className="text-sm font-semibold text-gray-300">
            {accountBalance !== null ? `€ ${accountBalance.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </span>
        </div>
        <div className="bunq-card p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-500 border-4 border-gray-600 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border-2 border-white"></div>
              </div>
              <div>
                <p className="font-bold text-white">Bank Account</p>
                <p className="text-xs text-gray-400">NL19 BUNQ 2106 2462 77</p>
              </div>
            </div>
            <p className="text-lg font-bold text-white">
              {accountBalance !== null ? `€ ${accountBalance.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </p>
          </div>
          <p className="text-sm text-blue-500 font-medium">Add an Extra Bank Account</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold">Recent Transactions</h2>
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <div className="bunq-card flex flex-col gap-1 p-2">
          {transactions.slice(0, txLimit).map((t) => {
            const isExpense = t.amount.startsWith('-');
            const { icon, bg, text } = getIconForMerchant(t.merchant);
            return (
              <div key={t.id} className="flex items-center justify-between p-3 hover:bg-[#2C2C2E] rounded-lg transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full ${bg} ${text} flex items-center justify-center text-lg shrink-0`}>{icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{t.merchant}</p>
                    <p className="text-xs text-gray-400 truncate">{t.desc || t.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <p className={`text-[15px] font-bold ${isExpense ? 'text-white' : 'text-blue-500'}`}>
                    {isExpense ? '-' : '+'}€{Math.abs(parseFloat(t.amount)).toFixed(2)}
                  </p>
                  {isExpense && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setReceiptTxId(t.id); }}
                      className="text-gray-600 hover:text-blue-400 transition-colors p-1"
                      title="Scan receipt"
                    >
                      📷
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {transactions.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">No recent transactions</div>}
          {transactions.length > 5 && (
            <button
              onClick={() => setTxLimit(txLimit === 5 ? transactions.length : 5)}
              className="w-full py-2.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition border-t border-gray-800 mt-1"
            >
              {txLimit === 5 ? `View all ${transactions.length} transactions` : 'Show less'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderSubs = () => {
    const totalAnnual = subscriptions.reduce((s, x) => s + x.annual_cost, 0);
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
        <h1 className="text-3xl font-bold mb-1">Subscriptions</h1>
        <p className="text-gray-400 text-sm mb-6">Recurring payments detected by AI</p>

        {subsLoading ? (
          <div className="flex flex-col items-center justify-center mt-24 gap-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
            </div>
            <p className="text-gray-500 text-sm">Analyzing your payments...</p>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center text-gray-500 mt-24">No recurring payments found yet</div>
        ) : (
          <>
            <div className="bunq-card p-4 mb-5 flex justify-between items-center">
              <div>
                <p className="text-gray-400 text-xs mb-1">TOTAL ANNUAL COST</p>
                <p className="text-2xl font-bold">€ {totalAnnual.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-xs mb-1">SUBSCRIPTIONS</p>
                <p className="text-2xl font-bold">{subscriptions.length}</p>
              </div>
            </div>

            {subscriptions.map((sub) => (
              <div key={sub.counterparty} className="bunq-card p-4 mb-3">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-bold text-white text-[15px] flex-1 pr-2">{sub.counterparty}</p>
                  <p className="text-white font-bold shrink-0">€ {sub.avg_amount.toFixed(2)}</p>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 bg-[#1C1C1E] px-2 py-1 rounded-full capitalize">{sub.frequency} · {sub.count}x detected</span>
                  <span className="text-xs text-gray-400">€ {sub.annual_cost.toFixed(0)}/yr</span>
                </div>
                {sub.advice && (
                  <p className="text-sm text-gray-300 mt-3 border-t border-gray-800 pt-3 leading-relaxed">{sub.advice}</p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const renderForecast = () => {
  
    const pct = forecast ? Math.round((forecast.days_elapsed / (forecast.days_elapsed + forecast.days_remaining)) * 100) : 0;

    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
        <h1 className="text-3xl font-bold mb-1">Forecast</h1>
        <p className="text-gray-400 text-sm mb-6">End-of-month prediction</p>

        {/* Current balance */}
        <div className="bunq-card p-4 mb-4 flex items-center justify-between">
          <p className="text-gray-400 text-sm">Current balance</p>
          {forecast ? (
            forecast.balance_available
              ? <p className="text-white font-bold text-lg">€ {forecast.current_balance.toFixed(2)}</p>
              : <p className="text-gray-500 text-sm">Not available yet</p>
          ) : null}
        </div>

        {forecastLoading ? (
          <div className="flex flex-col items-center justify-center mt-24 gap-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
            </div>
            <p className="text-gray-500 text-sm">Calculating forecast...</p>
          </div>
        ) : forecast ? (
          <>
            {/* Finn summary */}
            {forecast.finn_summary && (
              <div className="bunq-card p-4 mb-4 flex gap-3 items-start">
                <FinnAvatar />
                <p className="text-gray-300 text-sm leading-relaxed">{forecast.finn_summary}</p>
              </div>
            )}

            {/* Month progress bar */}
            <div className="bunq-card p-4 mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Day {forecast.days_elapsed}</span>
                <span>{forecast.days_remaining} days left</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bunq-card p-4">
                <p className="text-gray-400 text-xs mb-1">SPENT SO FAR</p>
                <p className="text-xl font-bold text-red-400">-€ {forecast.current_spend.toFixed(2)}</p>
              </div>
              <div className="bunq-card p-4">
                <p className="text-gray-400 text-xs mb-1">DAILY RATE</p>
                <p className="text-xl font-bold text-orange-400">€ {forecast.daily_rate.toFixed(2)}</p>
              </div>
              <div className="bunq-card p-4">
                <p className="text-gray-400 text-xs mb-1">PREDICTED TOTAL</p>
                <p className="text-xl font-bold text-yellow-400">€ {forecast.predicted_total.toFixed(2)}</p>
              </div>
              <div className="bunq-card p-4">
                <p className="text-gray-400 text-xs mb-1">END BALANCE</p>
                <p className={`text-xl font-bold ${forecast.predicted_end_balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  € {forecast.predicted_end_balance.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Budget */}
            {(() => {
              const now = new Date();
              const budgetPct = budget && forecast ? Math.min((forecast.current_spend / budget) * 100, 100) : 0;
              const overBudget = budget && forecast && forecast.predicted_total > budget;
              return (
                <div className="bunq-card p-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-gray-400 text-xs">MONTHLY BUDGET</p>
                    <button onClick={() => { setBudgetEditing(true); setBudgetInput(budget || ''); }} className="text-xs text-blue-400">
                      {budget ? 'Edit' : 'Set budget'}
                    </button>
                  </div>
                  {budgetEditing ? (
                    <div className="flex gap-2 items-center">
                      <span className="text-gray-400">€</span>
                      <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                        className="flex-1 bg-[#2C2C2E] rounded-lg px-3 py-2 text-white text-sm outline-none"
                        placeholder="e.g. 2000" autoFocus />
                      <button onClick={() => {
                        const val = parseFloat(budgetInput);
                        if (!isNaN(val) && val > 0) {
                          setBudget(val);
                          localStorage.setItem('monthly_budget', val);
                          fetch(`${API_BASE}/api/budget`, { method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ amount: val, year: now.getFullYear(), month: now.getMonth() + 1 }) }).catch(() => {});
                        }
                        setBudgetEditing(false);
                      }} className="bg-blue-600 text-white text-xs px-3 py-2 rounded-lg">Save</button>
                    </div>
                  ) : budget && forecast ? (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className={overBudget ? 'text-red-400 font-bold' : 'text-white'}>
                          €{forecast.current_spend.toFixed(0)} / €{budget.toFixed(0)}
                        </span>
                        <span className={overBudget ? 'text-red-400' : 'text-gray-400'}>
                          {overBudget ? `⚠ €${(forecast.predicted_total - budget).toFixed(0)} over` : `€${(budget - forecast.predicted_total).toFixed(0)} remaining`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${overBudget ? 'bg-red-500' : budgetPct > 80 ? 'bg-orange-400' : 'bg-green-500'}`}
                          style={{ width: `${budgetPct}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-600 text-sm">No budget set</p>
                  )}
                </div>
              );
            })()}

            {/* Monthly trend chart */}
            {trend.length > 0 && (() => {
              const recent = trend.slice(-12);
              const max = Math.max(...recent.map(m => m.total));
              return (
                <div className="bunq-card p-4 mb-4">
                  <p className="text-gray-400 text-xs mb-4">MONTHLY SPENDING</p>
                  <div className="flex items-end gap-1 h-28">
                    {recent.map((m, i) => {
                      const h = Math.round((m.total / max) * 100);
                      const isCurrentMonth = m.year === new Date().getFullYear() && m.month === new Date().getMonth() + 1;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex items-end justify-center" style={{ height: '96px' }}>
                            <div
                              className={`w-full rounded-t-sm transition-all ${isCurrentMonth ? 'bg-blue-500' : budget && m.total > budget ? 'bg-red-500/70' : 'bg-gray-600'}`}
                              style={{ height: `${h}%` }}
                            />
                          </div>
                          <p className="text-[9px] text-gray-500 truncate w-full text-center">{m.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                    <span>€0</span><span>€{max.toFixed(0)}</span>
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="text-center text-gray-500 mt-24">No transaction data yet</div>
        )}
      </div>
    );
  };

  const renderChat = () => (
    <div className="flex-1 flex flex-col h-full w-full bg-black">
      <div className="flex items-center justify-center p-4 border-b border-[#1C1C1E] bg-black z-20 shrink-0 relative pt-12">
        <h1 className="text-lg font-bold text-white">Finn AI</h1>
      </div>

      <div ref={chatBoxRef} className="chat-area">
        <div className="flex items-start gap-2 max-w-[90%]">
          <FinnAvatar />
          <div className="chat-bubble-ai p-3.5 text-[15px] shadow-sm leading-relaxed">
            Hi! 👋 I'm your financial assistant, <b>Finn</b>. I'll help you manage your money smartly by analyzing your spending. Feel free to ask me anything!
          </div>
        </div>

        {chatHistory.map((msg, idx) => (
          msg.role === 'user' ? (
            <div key={idx} className="flex justify-end mb-1 mt-2">
              <div className="chat-bubble-user p-3 text-[15px] max-w-[85%] break-words">{msg.content}</div>
            </div>
          ) : (
            <div key={idx} className="flex items-start gap-2 max-w-[90%] mb-1 mt-2">
              <FinnAvatar />
              <div className="chat-bubble-ai p-3 text-[15px] shadow-sm break-words" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          )
        ))}

        {isWaiting && (
          <div className="flex items-start gap-2 max-w-[85%] mb-1 mt-2">
            <FinnAvatar />
            <div className="chat-bubble-ai p-3 px-4 text-sm shadow-sm flex items-center gap-1.5 min-h-[44px]">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot"></span>
              </div>
              <span className="ml-2 text-gray-400 text-xs font-medium">Finn is typing...</span>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 bg-black border-t border-[#1C1C1E] p-3 flex flex-col gap-2 z-10 pb-[90px]">
        <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar items-center px-1">
          <button className="quick-btn shrink-0" onClick={() => sendMessage('Where did I spend the most this month?')}>
            💸 Where did I spend the most?
          </button>
          <button className="quick-btn shrink-0" onClick={() => sendMessage('Which subscriptions should I cancel?')}>
            🔁 Which subs should I cancel?
          </button>
          <button className="quick-btn shrink-0" onClick={() => sendMessage('Give me 3 tips to save money this month')}>
            💡 Tips to save money
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[#1C1C1E] rounded-full p-1.5 shadow-inner mt-1 border border-[#2C2C2E]">
          <input
            type="text"
            className="flex-grow bg-transparent border-none outline-none px-4 py-2 text-[15px] text-white placeholder-gray-500"
            placeholder="Ask Finn..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={isWaiting}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isWaiting}
            className={`w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition shadow-md shrink-0 ${isWaiting ? 'opacity-50' : 'opacity-100'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  const tabs = {
    home: renderHome,
    subs: renderSubs,
    forecast: renderForecast,
    ai: renderChat,
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="app-container">
        {(tabs[currentTab] || renderHome)()}

        {/* F.R. floating button — visible on home tab only */}
        {currentTab === 'home' && !showReportModal && (
          <button
            onClick={() => { setReportReady(false); setShowReportModal(true); setFrMode(null); setReceiptReportData(null); setIsAnalyzing(false); }}
            className="absolute bottom-28 right-4 flex items-center gap-2 pl-1.5 pr-4 py-1.5 bg-gradient-to-r from-[#FF8C00] to-[#AF52DE] rounded-full shadow-[0_6px_24px_rgba(175,82,222,0.45)] transition-all transform hover:scale-105 active:scale-95 z-40 border border-white/10"
          >
            <div className="w-9 h-9 rounded-full bg-black/25 flex items-center justify-center text-white text-sm font-bold shrink-0">F</div>
            <span className="text-white font-semibold text-sm tracking-wide">Report</span>
          </button>
        )}

        {/* F.R. modal layer */}
        {showReportModal && renderReportModal()}

        {receiptTxId && (
          <ReceiptUpload
            txId={receiptTxId}
            onClose={() => setReceiptTxId(null)}
            onUploadSuccess={() => setReceiptTxId(null)}
          />
        )}

        <div className="bottom-nav">
          <div className={`nav-item ${currentTab === 'home' ? 'active' : ''}`} onClick={() => setCurrentTab('home')}>
            <svg fill={currentTab === 'home' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span>Home</span>
          </div>
          <div className={`nav-item ${currentTab === 'subs' ? 'active' : ''}`} onClick={() => setCurrentTab('subs')}>
            <svg fill={currentTab === 'subs' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            <span>Subs</span>
          </div>
          <div className={`nav-item ${currentTab === 'forecast' ? 'active' : ''}`} onClick={() => setCurrentTab('forecast')}>
            <svg fill={currentTab === 'forecast' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            <span>Forecast</span>
          </div>
          <div className={`nav-item ${currentTab === 'ai' ? 'active' : ''}`} onClick={() => setCurrentTab('ai')}>
            <svg fill={currentTab === 'ai' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <span>Finn</span>
          </div>
        </div>
      </div>

    </div>
  );
}
