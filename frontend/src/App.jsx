import { useState, useEffect } from 'react';
import ReceiptUpload from './components/ReceiptUpload';
import FinancialReport from './components/FinancialReport';
import PayFlow from './components/PayFlow';

const getIconForMerchant = (merchant) => {
  if (!merchant) return { icon: '💳', bg: 'bg-gray-800', text: 'text-gray-300' };
  if (merchant.includes('Starbucks')) return { icon: '☕', bg: 'bg-green-900', text: 'text-green-400' };
  if (merchant.includes('Albert Heijn')) return { icon: '🛒', bg: 'bg-blue-900', text: 'text-blue-400' };
  if (merchant.includes('Netflix')) return { icon: '🍿', bg: 'bg-red-900', text: 'text-red-400' };
  if (merchant.includes('bunq')) return { icon: '🌈', bg: 'bg-purple-900', text: 'text-purple-400' };
  if (merchant.includes('Zara')) return { icon: '👕', bg: 'bg-gray-800', text: 'text-gray-300' };
  return { icon: '💳', bg: 'bg-gray-800', text: 'text-gray-300' };
};

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [accountInfo, setAccountInfo] = useState({ balance: "0.00", currency: "EUR", iban: "", description: "Bank Account" });
  
  // F.R Modal States
  const [showReportModal, setShowReportModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [userPreference, setUserPreference] = useState({});
  const [selectedTransactionIndex, setSelectedTransactionIndex] = useState(null);
  const [receiptTxId, setReceiptTxId] = useState(null);
  const [activePage, setActivePage] = useState('home');
  const [showPayFlow, setShowPayFlow] = useState(false);

  const loadTransactions = async () => {
    try {
      // Fetch Account Info
      try {
        const accRes = await fetch('http://127.0.0.1:8000/api/account');
        if (accRes.ok) {
          const accData = await accRes.json();
          setAccountInfo(accData);
        }
      } catch (e) {
        console.error('Failed to fetch account info:', e);
      }

      const res = await fetch('http://127.0.0.1:8000/api/transactions');
      const data = await res.json();
      
      if (data.length === 0) {
        // DB is empty, trigger sync
        console.log("DB is empty, syncing with Bunq...");
        await fetch('http://127.0.0.1:8000/api/transactions/sync', { method: 'POST' });
        // Fetch again
        const newRes = await fetch('http://127.0.0.1:8000/api/transactions');
        const newData = await newRes.json();
        setTransactions(newData);
      } else {
        setTransactions(data);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const fetchBunqData = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/transactions?limit=15');
      const data = await res.json();
      return data.map(t => ({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount
      }));
    } catch (err) {
      console.error('Failed to fetch Bunq data:', err);
      return [];
    }
  };

  const analyzeWithClaude = async (mappedTransactions) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: mappedTransactions,
          user_preference: userPreference
        })
      });
      if (!res.ok) throw new Error('Analyze API failed');
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('Failed to analyze with Claude:', err);
      return null;
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setReportReady(false);
    
    // 1. Fetch & Map Data
    const mappedTransactions = await fetchBunqData();
    
    // 2. Send to Claude API
    const reportJson = await analyzeWithClaude(mappedTransactions);
    
    // 3. Update States
    setReportData(reportJson);
    setIsAnalyzing(false);
    setReportReady(true);
  };

  const handleCategoryChange = (newCategory) => {
    if (selectedTransactionIndex === null) return;
    const target = reportData.categorized_items[selectedTransactionIndex];
    const newItems = [...reportData.categorized_items];
    newItems[selectedTransactionIndex] = { ...target, category: newCategory };
    
    setReportData({ ...reportData, categorized_items: newItems });
    setUserPreference(prev => ({ ...prev, [target.merchant]: newCategory }));
    setSelectedTransactionIndex(null);
  };

  const renderReportModal = () => {
    let essentialSum = 0;
    let standardSum = 0;
    let luxurySum = 0;
    let incomeSum = 0;

    if (reportReady && reportData?.categorized_items) {
      reportData.categorized_items.forEach(item => {
        const amt = parseFloat(item.amount) || 0;
        if (item.category === 'Income' || amt > 0) incomeSum += Math.abs(amt);
        else if (item.category === 'Essential') essentialSum += Math.abs(amt);
        else if (item.category === 'Standard') standardSum += Math.abs(amt);
        else if (item.category === 'Luxury') luxurySum += Math.abs(amt);
      });
    }

    const totalExpense = essentialSum + standardSum + luxurySum || 1;
    const essentialPct = essentialSum / totalExpense;
    const standardPct = standardSum / totalExpense;
    const luxuryPct = luxurySum / totalExpense;
    const essentialDash = essentialPct * 100;
    const standardDash = standardPct * 100;
    const luxuryDash = luxuryPct * 100;

    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });

    const closeBtn = (
      <button
        className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-50 bg-[#1C1C1E] border border-[#2C2C2E] rounded-full p-1.5"
        onClick={() => { setShowReportModal(false); setIsAnalyzing(false); setReportReady(false); }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    );

    /* ── ANALYZING ── */
    if (!reportReady && isAnalyzing) return (
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

    /* ── INITIAL ── */
    if (!reportReady) return (
      <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-y-auto no-scrollbar">
        {closeBtn}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 pt-10 pb-10">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-3xl font-bold shadow-[0_0_50px_rgba(175,82,222,0.4)]">F</div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Financial Report</h2>
            <p className="text-gray-500 text-sm leading-relaxed max-w-[220px] mx-auto">Finn analyzes your spending and delivers personalized insights</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {['Spending Breakdown', 'AI Insights', 'Category Analysis'].map(f => (
              <span key={f} className="px-3 py-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-full text-xs text-gray-400">{f}</span>
            ))}
          </div>
          <button
            onClick={handleAnalyze}
            className="w-full bg-gradient-to-r from-[#FF8C00] to-[#AF52DE] text-white font-bold py-4 rounded-2xl shadow-[0_8px_30px_rgba(175,82,222,0.35)] transition-all transform hover:scale-[1.02] active:scale-[0.98] mt-2"
          >
            Analyze My Spending →
          </button>
          <p className="text-gray-600 text-xs">Based on your last 15 transactions</p>
        </div>
      </div>
    );

    /* ── REPORT READY ── */
    return (
      <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-y-auto no-scrollbar pb-10">
        {closeBtn}

        {/* Header */}
        <div className="px-4 pt-12 pb-5 border-b border-[#1C1C1E]">
          <p className="text-[10px] font-semibold text-gray-600 tracking-widest uppercase mb-0.5">{monthName} {now.getFullYear()}</p>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-[10px] font-bold shrink-0">F</div>
            <h1 className="text-xl font-bold text-white">Spending Report</h1>
          </div>
        </div>

        <div className="px-4 pt-5 flex flex-col gap-4">

          {/* Finn's Summary */}
          <div className="relative bg-[#111] border border-[#2C2C2E] rounded-2xl p-4 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#FF8C00] to-[#AF52DE]"></div>
            <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-2">FINN'S SUMMARY</p>
            <p className="text-gray-200 text-sm leading-relaxed italic">"{reportData?.summary_headline}"</p>
          </div>

          {/* Spending Overview */}
          <div className="bg-[#111] border border-[#2C2C2E] rounded-2xl p-4">
            <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-4">SPENDING OVERVIEW</p>
            <div className="flex items-center gap-4 mb-4">
              {/* Donut */}
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90">
                  <circle r="12" cx="16" cy="16" fill="transparent" stroke="#1C1C1E" strokeWidth="5" />
                  <circle r="12" cx="16" cy="16" fill="transparent" stroke="#06b6d4" strokeWidth="5"
                    strokeDasharray={`${essentialDash * 0.754} 100`} strokeDashoffset="0" className="transition-all duration-700" />
                  <circle r="12" cx="16" cy="16" fill="transparent" stroke="#3b82f6" strokeWidth="5"
                    strokeDasharray={`${standardDash * 0.754} 100`} strokeDashoffset={`${-essentialDash * 0.754}`} className="transition-all duration-700" />
                  <circle r="12" cx="16" cy="16" fill="transparent" stroke="#a855f7" strokeWidth="5"
                    strokeDasharray={`${luxuryDash * 0.754} 100`} strokeDashoffset={`${-(essentialDash + standardDash) * 0.754}`} className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-bold text-white">€{(essentialSum+standardSum+luxurySum).toFixed(0)}</span>
                  <span className="text-[9px] text-gray-500">total spent</span>
                </div>
              </div>
              {/* Progress bars */}
              <div className="flex-1 flex flex-col gap-3">
                {[
                  { label: 'Essential', pct: essentialPct, color: 'bg-cyan-500', amt: essentialSum },
                  { label: 'Standard',  pct: standardPct,  color: 'bg-blue-500',  amt: standardSum },
                  { label: 'Luxury',    pct: luxuryPct,    color: 'bg-purple-500', amt: luxurySum },
                ].map(({ label, pct, color, amt }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] text-gray-400">{label}</span>
                      <span className="text-[11px] font-semibold text-white">€{amt.toFixed(0)}</span>
                    </div>
                    <div className="h-1 bg-[#2C2C2E] rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Income / Spent row */}
            <div className="flex gap-3 pt-4 border-t border-[#2C2C2E]">
              <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <p className="text-[9px] font-bold text-green-500 tracking-widest uppercase mb-0.5">Income</p>
                <p className="text-sm font-bold text-green-400">+€{incomeSum.toFixed(2)}</p>
              </div>
              <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-[9px] font-bold text-red-500 tracking-widest uppercase mb-0.5">Spent</p>
                <p className="text-sm font-bold text-red-400">-€{(essentialSum+standardSum+luxurySum).toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* AI Insights */}
          <div>
            <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-3">AI INSIGHTS</p>
            <div className="flex flex-col gap-2.5">
              {[
                { icon: '🔍', label: 'Past Insight',     key: 'past_insight',     cls: 'border-[#2C2C2E]' },
                { icon: '📊', label: 'Present Pacing',   key: 'present_pacing',   cls: 'border-blue-500/20' },
                { icon: '🎯', label: 'Future Action',    key: 'future_action',    cls: 'border-purple-500/25 bg-gradient-to-br from-[#111] to-purple-950/30' },
              ].map(({ icon, label, key, cls }) => (
                <div key={key} className={`bg-[#111] border ${cls} rounded-2xl p-4 flex gap-3`}>
                  <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                  <div>
                    <p className="text-[9px] font-bold text-gray-600 tracking-widest uppercase mb-1">{label}</p>
                    <p className="text-gray-200 text-sm leading-relaxed">{reportData?.advice?.[key]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction List */}
          <div>
            <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-3">TRANSACTIONS</p>
            <div className="bg-[#111] border border-[#2C2C2E] rounded-2xl overflow-hidden">
              {reportData?.categorized_items?.map((t, i) => {
                const badges = {
                  Essential: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                  Standard:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
                  Luxury:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
                  Income:    'bg-green-500/15 text-green-400 border-green-500/30',
                };
                const badgeCls = badges[t.category] || 'bg-gray-700/50 text-gray-400 border-gray-600';
                const isLast = i === reportData.categorized_items.length - 1;
                return (
                  <div key={i} onClick={() => setSelectedTransactionIndex(i)}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-[#1C1C1E] transition cursor-pointer active:opacity-70 ${!isLast ? 'border-b border-[#1C1C1E]' : ''}`}
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

        {/* Bottom Sheet */}
        {selectedTransactionIndex !== null && (
          <>
            <div className="absolute inset-0 bg-black/70 z-[55]" onClick={() => setSelectedTransactionIndex(null)}></div>
            <div className="absolute inset-x-0 bottom-0 bg-[#1C1C1E] border-t border-[#2C2C2E] rounded-t-3xl p-5 z-[60]">
              <div className="w-8 h-1 bg-[#3C3C3E] rounded-full mx-auto mb-4"></div>
              <p className="text-[10px] font-bold text-gray-600 tracking-widest uppercase mb-1">Change Category</p>
              <h3 className="text-white text-base font-bold mb-4">
                {reportData.categorized_items[selectedTransactionIndex]?.merchant}
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Income',    cls: 'border-green-500/40 text-green-400 hover:bg-green-500/10' },
                  { label: 'Essential', cls: 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10' },
                  { label: 'Standard',  cls: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                  { label: 'Luxury',    cls: 'border-purple-500/40 text-purple-400 hover:bg-purple-500/10' },
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
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="app-container">
        
        {/* Main Content */}
        {activePage === 'report' ? <FinancialReport onBack={() => setActivePage('home')} /> :
         activePage === 'cards' ? (
          <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-5">
              <h1 className="text-3xl font-bold">Cards</h1>
              <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-[#FF8C00] via-[#FF2D9B] to-[#5856D6]">
                <div className="w-full h-full rounded-full bg-[#1C1C1E] flex items-center justify-center text-sm">😊</div>
              </div>
            </div>
            {/* Promo Card */}
            <div className="bg-gradient-to-b from-[#0F5C3A] to-[#0A3D28] rounded-2xl p-5 mb-4">
              <h2 className="text-lg font-bold text-[#7DE8B4] text-center mb-2">Get your card instantly</h2>
              <p className="text-green-100/60 text-sm text-center leading-relaxed mb-5">
                For online shopping, car rentals or paying for groceries—we got you covered with the right card. You can also personalize it to make it uniquely yours.
              </p>
              <button className="w-full bg-[#2EBD7A] hover:bg-[#35D68A] text-white font-bold py-3.5 rounded-xl text-sm transition-colors">Get My Card</button>
            </div>
            {/* Points & ZeroFX */}
            <div className="flex gap-3 mb-5">
              {[
                { icon: '◆', iconBg: 'bg-yellow-500', label: 'Points', value: '0' },
                { icon: '🌐', iconBg: 'bg-blue-500', label: 'ZeroFX', value: '€ 0.00' },
              ].map(({ icon, iconBg, label, value }) => (
                <div key={label} className="flex-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{icon}</div>
                    <div>
                      <p className="text-[10px] text-gray-500">{label}</p>
                      <p className="text-sm font-bold text-white">{value}</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              ))}
            </div>
            {/* Card Placeholder */}
            <div className="border border-[#2C2C2E] rounded-2xl flex flex-col items-center justify-center py-14 mb-5">
              <span className="text-3xl font-light text-gray-600 mb-2">+</span>
              <p className="text-gray-400 font-medium text-sm">Add Card</p>
            </div>
            {/* Features */}
            <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl overflow-hidden">
              {[
                { iconBg: 'bg-blue-500', icon: '🔒', title: 'Choose your own PIN', desc: "Your card, your PIN code–so you'll always remember it" },
                { iconBg: 'bg-yellow-500', icon: '📱', title: 'Google Pay, right away', desc: 'Add your card to Google Pay right after activation' },
              ].map(({ iconBg, icon, title, desc }, i, arr) => (
                <div key={title} className={`flex items-center gap-4 p-4 ${i < arr.length - 1 ? 'border-b border-[#2C2C2E]' : ''}`}>
                  <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center text-lg shrink-0`}>{icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
         ) :
         activePage === 'savings' ? (
          <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-5">
              <h1 className="text-3xl font-bold">Savings</h1>
              <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-[#FF8C00] via-[#FF2D9B] to-[#5856D6]">
                <div className="w-full h-full rounded-full bg-[#1C1C1E] flex items-center justify-center text-sm">😊</div>
              </div>
            </div>
            {/* Promo Card */}
            <div className="bg-gradient-to-b from-[#0F5C3A] to-[#0A3D28] rounded-2xl p-5 mb-4">
              <h2 className="text-lg font-bold text-[#7DE8B4] text-center mb-2">Start earning 2.01% interest</h2>
              <p className="text-green-100/60 text-sm text-center leading-relaxed mb-5">
                Deposit savings in your account to start earning interest. Your money is insured up to €100,000 by the Dutch Deposit Guarantee Scheme (DGS)
              </p>
              <button className="w-full bg-[#2EBD7A] hover:bg-[#35D68A] text-white font-bold py-3.5 rounded-xl text-sm transition-colors">Deposit Savings</button>
            </div>
            {/* Deposit / Withdraw */}
            <div className="flex gap-3 mb-6">
              {[
                { icon: '⊕', label: 'Deposit' },
                { icon: '↓', label: 'Withdraw' },
              ].map(({ icon, label }) => (
                <button key={label} className="flex-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl py-3.5 flex items-center justify-center gap-2 text-white font-medium text-sm hover:bg-[#2C2C2E] transition-colors">
                  <span className="text-gray-400 text-base">{icon}</span>{label}
                </button>
              ))}
            </div>
            {/* Savings Accounts */}
            <h2 className="text-lg font-bold mb-3">Savings Accounts</h2>
            <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl overflow-hidden">
              <div className="flex items-center gap-4 p-4 border-b border-[#2C2C2E]">
                <div className="w-12 h-12 flex items-center justify-center text-3xl shrink-0">🐷</div>
                <div>
                  <p className="text-sm font-semibold text-white">Add your first Savings Account</p>
                  <p className="text-xs text-gray-500 mt-0.5">Add your first Savings Account in just a tap!</p>
                </div>
              </div>
              <div className="p-4">
                <p className="text-blue-400 font-medium text-sm">Add a Savings Account</p>
              </div>
            </div>
          </div>
         ) : (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12 relative">
          {/* Top Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-gray-700">
              <span className="text-xl">🐜</span>
            </div>
            <div className="flex gap-4 text-gray-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM14 16h6v6h-6zM10 4v4M14 4v4M10 20v-4M10 10h4v4h-4z" /></svg>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold mb-6">Home</h1>

          {/* Insights Card */}
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

          {/* Action Buttons */}
          <div className="flex gap-3 mb-8">
            <button onClick={() => setShowPayFlow(true)} className="flex-1 btn-pay rounded-xl py-3 flex flex-col items-center gap-1 bg-black">
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

          {/* Bank Accounts */}
          <div className="mb-8">
            <div className="flex justify-between items-end mb-3">
              <h2 className="text-lg font-bold">Bank Accounts</h2>
              <span className="text-sm font-semibold text-gray-300">€ {accountInfo.balance}</span>
            </div>
            <div className="bunq-card p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-500 border-4 border-gray-600 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full border-2 border-white"></div>
                  </div>
                  <div>
                    <p className="font-bold text-white">{accountInfo.description || 'Bank Account'}</p>
                    <p className="text-xs text-gray-400">{accountInfo.iban}</p>
                  </div>
                </div>
                <p className="text-lg font-bold text-white">€ {accountInfo.balance}</p>
              </div>
              <p className="text-sm text-blue-500 font-medium">Add an Extra Bank Account</p>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold">Recent Transactions</h2>
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div className="bunq-card flex flex-col gap-1 p-2">
              {transactions.slice(0, 5).map((t, i) => {
                const isExpense = t.amount ? t.amount.startsWith('-') : false;
                const colorClass = isExpense ? 'text-white' : 'text-blue-500';
                const { icon, bg, text } = getIconForMerchant(t.merchant);
                return (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-[#2C2C2E] rounded-lg transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${bg} ${text} flex items-center justify-center text-lg shrink-0`}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{t.merchant}</p>
                        <p className="text-xs text-gray-400">{t.desc || t.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`text-[16px] font-bold ${colorClass}`}>{isExpense ? '' : '+'}€ {(t.amount || '0.00').replace('-', '')}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReceiptTxId(t.id); }}
                        className="p-1.5 text-gray-600 hover:text-blue-400 transition-colors"
                        title="Scan receipt"
                      >
                        📷
                      </button>
                    </div>
                  </div>
                );
              })}
              {transactions.length === 0 && (
                 <div className="p-4 text-center text-gray-500 text-sm">No recent transactions</div>
              )}
            </div>
          </div>
          
          {/* Extras */}
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Extras</h2>
            <div className="bunq-card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-2xl shrink-0">🎁</div>
              <div className="flex-1">
                <p className="font-bold text-white">Win your groceries back!</p>
                <p className="text-xs text-gray-400 leading-tight mt-1">Get a chance to win every time you pay for groceries with your bunq card for the next 12 months</p>
              </div>
              <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </div>
        )}

        {/* F.R Floating Button - home only */}
        {activePage === 'home' && (
          <button
            onClick={() => setShowReportModal(true)}
            className="absolute bottom-28 right-4 flex items-center gap-2 pl-1.5 pr-4 py-1.5 bg-gradient-to-r from-[#FF8C00] to-[#AF52DE] rounded-full shadow-[0_6px_24px_rgba(175,82,222,0.45)] transition-all transform hover:scale-105 active:scale-95 z-40 border border-white/10"
          >
            <div className="w-9 h-9 rounded-full bg-black/25 flex items-center justify-center text-white text-sm font-bold shrink-0">
              F
            </div>
            <span className="text-white font-semibold text-sm tracking-wide">Report</span>
          </button>
        )}

        {/* Report Modal Layer */}
        {showReportModal && renderReportModal()}

        {/* Pay Flow Modal */}
        {showPayFlow && (
          <PayFlow
            accountInfo={accountInfo}
            transactions={transactions}
            onClose={() => setShowPayFlow(false)}
            onPaymentSent={() => { setShowPayFlow(false); loadTransactions(); }}
          />
        )}

        {/* Receipt Upload Modal */}
        {receiptTxId && (
          <ReceiptUpload
            txId={receiptTxId}
            onClose={() => setReceiptTxId(null)}
            onUploadSuccess={() => setReceiptTxId(null)}
          />
        )}

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          <div className={`nav-item ${activePage === 'home' ? 'active' : ''}`} onClick={() => setActivePage('home')}>
            <svg fill="currentColor" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span>Home</span>
          </div>
          <div className={`nav-item ${activePage === 'cards' ? 'active' : ''}`} onClick={() => setActivePage('cards')}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            <span>Cards</span>
          </div>
          <div className={`nav-item ${activePage === 'savings' ? 'active' : ''}`} onClick={() => setActivePage('savings')}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>Savings</span>
          </div>
          <div className={`nav-item ${activePage === 'report' ? 'active' : ''}`} onClick={() => setActivePage('report')}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
            <span>Receipt</span>
          </div>
        </div>
      </div>
    </div>
  );
}
