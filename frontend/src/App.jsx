import { useState, useEffect } from 'react';

const getIconForMerchant = (merchant) => {
  if (merchant.includes('Starbucks')) return { icon: '☕', bg: 'bg-green-900', text: 'text-green-400' };
  if (merchant.includes('Albert Heijn')) return { icon: '🛒', bg: 'bg-blue-900', text: 'text-blue-400' };
  if (merchant.includes('Netflix')) return { icon: '🍿', bg: 'bg-red-900', text: 'text-red-400' };
  if (merchant.includes('bunq')) return { icon: '🌈', bg: 'bg-purple-900', text: 'text-purple-400' };
  if (merchant.includes('Zara')) return { icon: '👕', bg: 'bg-gray-800', text: 'text-gray-300' };
  return { icon: '💳', bg: 'bg-gray-800', text: 'text-gray-300' };
};

export default function App() {
  const [transactions, setTransactions] = useState([]);
  
  // F.R Modal States
  const [showReportModal, setShowReportModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [userPreference, setUserPreference] = useState({});
  const [selectedTransactionIndex, setSelectedTransactionIndex] = useState(null);

  const loadTransactions = async () => {
    try {
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

    if (reportReady && reportData?.categorized_items) {
      reportData.categorized_items.forEach(item => {
        const amt = Math.abs(parseFloat(item.amount) || 0);
        if (item.category === 'Essential') essentialSum += amt;
        else if (item.category === 'Standard') standardSum += amt;
        else if (item.category === 'Luxury') luxurySum += amt;
      });
    }

    const total = essentialSum + standardSum + luxurySum || 1;
    const essentialPct = essentialSum / total;
    const standardPct = standardSum / total;
    const luxuryPct = luxurySum / total;

    const essentialDash = essentialPct * 100;
    const standardDash = standardPct * 100;
    const luxuryDash = luxuryPct * 100;

    return (
      <div className="absolute inset-0 z-50 bg-[#0D0D1A] flex flex-col pt-12 overflow-y-auto no-scrollbar pb-24 text-center">
        {/* Close Button */}
        <button 
          className="fixed top-6 right-6 text-gray-400 hover:text-white transition-colors z-50 bg-black/50 rounded-full p-2 backdrop-blur-sm"
          onClick={() => {
            setShowReportModal(false);
            setIsAnalyzing(false);
            setReportReady(false);
          }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {!reportReady && isAnalyzing ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
            {/* Scanner Animation */}
            <div className="relative w-32 h-32 flex items-center justify-center bg-[#1C1C1E] rounded-3xl shadow-inner border border-gray-800">
              <svg className="w-16 h-16 text-blue-500 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="absolute inset-0 overflow-hidden rounded-3xl">
                <div className="w-full h-1 bg-cyan-400 shadow-[0_0_15px_3px_rgba(34,211,238,0.8)] animate-scan absolute top-1/2"></div>
              </div>
            </div>
            <div className="text-cyan-400 font-semibold animate-pulse tracking-wide text-sm">
              Categorizing your receipts in detail...
            </div>
          </div>
        ) : !reportReady ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <button 
              onClick={handleAnalyze}
              className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-cyan-500/30 transition-all transform hover:scale-105 active:scale-95"
            >
              [Analyze Recent Spending]
            </button>
          </div>
        ) : (
          <div className="w-full px-4 text-left pb-10 mt-6">
            {/* Top Section: Chart & Headline */}
            <h1 className="text-2xl font-bold text-white mb-8 text-center tracking-tight px-2 leading-tight">
              "{reportData?.summary_headline}"
            </h1>

            <div className="flex flex-col items-center mb-8">
              <div className="relative w-48 h-48 mb-6">
                <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90">
                  {/* Essential Segment */}
                  <circle r="15.915" cx="16" cy="16" fill="transparent" stroke="#06b6d4" strokeWidth="4" 
                    strokeDasharray={`${essentialDash} ${100 - essentialDash}`} strokeDashoffset="0" className="transition-all duration-700 ease-out" />
                  {/* Standard Segment */}
                  <circle r="15.915" cx="16" cy="16" fill="transparent" stroke="#3b82f6" strokeWidth="4" 
                    strokeDasharray={`${standardDash} ${100 - standardDash}`} strokeDashoffset={-essentialDash} className="transition-all duration-700 ease-out" />
                  {/* Luxury Segment */}
                  <circle r="15.915" cx="16" cy="16" fill="transparent" stroke="#a855f7" strokeWidth="4" 
                    strokeDasharray={`${luxuryDash} ${100 - luxuryDash}`} strokeDashoffset={-(essentialDash + standardDash)} className="transition-all duration-700 ease-out" />
                </svg>
                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <span className="text-3xl font-bold">€{(essentialSum+standardSum+luxurySum).toFixed(0)}</span>
                  <span className="text-xs text-gray-400">Total Spent</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-4 text-sm w-full px-2">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-cyan-500"></div><span className="text-white text-xs">Essential {Math.round(essentialPct*100)}%</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span className="text-white text-xs">Standard {Math.round(standardPct*100)}%</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-purple-500"></div><span className="text-white text-xs">Luxury {Math.round(luxuryPct*100)}%</span></div>
              </div>
            </div>

            {/* Middle Section: AI Insights */}
            <div className="mb-10 space-y-4">
              <h2 className="text-lg font-bold text-white mb-4">AI Insights</h2>
              <div className="bg-[#1C1C1E] border border-gray-800 rounded-2xl p-4 flex gap-4 shadow-sm shadow-black/50">
                <div className="text-2xl mt-1">🔍</div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-1">Past Insight</h3>
                  <p className="text-white text-sm leading-relaxed">{reportData?.advice?.past_insight}</p>
                </div>
              </div>
              <div className="bg-[#1C1C1E] border border-gray-800 rounded-2xl p-4 flex gap-4 shadow-sm shadow-black/50">
                <div className="text-2xl mt-1">👏</div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-1">Present Pacing</h3>
                  <p className="text-white text-sm leading-relaxed">{reportData?.advice?.present_pacing}</p>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 border border-purple-500/30 rounded-2xl p-4 flex gap-4 shadow-lg shadow-purple-500/10">
                <div className="text-2xl mt-1">🎯</div>
                <div>
                  <h3 className="text-sm font-semibold text-purple-300 mb-1">Future Action</h3>
                  <p className="text-white text-sm leading-relaxed font-medium">{reportData?.advice?.future_action}</p>
                </div>
              </div>
            </div>

            {/* Bottom Section: Transaction List */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Categorized Transactions</h2>
              <div className="bunq-card flex flex-col gap-2 p-2 bg-[#1C1C1E] border border-gray-800">
                {reportData?.categorized_items?.map((t, i) => {
                  let badgeColor = "bg-gray-500 text-gray-200";
                  if (t.category === "Essential") badgeColor = "bg-cyan-500/20 text-cyan-400";
                  if (t.category === "Standard") badgeColor = "bg-blue-500/20 text-blue-400";
                  if (t.category === "Luxury") badgeColor = "bg-purple-500/20 text-purple-400";

                  return (
                    <div 
                      key={i} 
                      onClick={() => setSelectedTransactionIndex(i)}
                      className="flex items-center justify-between p-3 hover:bg-[#2C2C2E] rounded-xl transition cursor-pointer active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-800 text-gray-300 flex items-center justify-center text-lg shrink-0 border border-gray-700">
                          {getIconForMerchant(t.merchant).icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white truncate max-w-[120px]">{t.merchant}</p>
                          <p className="text-xs text-gray-400">{t.date}</p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1 shrink-0">
                        <p className="text-[16px] font-bold text-white">€ {Math.abs(parseFloat(t.amount)).toFixed(2)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                          {t.category}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sheet Overlay */}
        {selectedTransactionIndex !== null && (
          <>
            <div 
              className="fixed inset-0 bg-black/60 z-[55] backdrop-blur-sm" 
              onClick={() => setSelectedTransactionIndex(null)}
            ></div>
            <div className="fixed inset-x-0 bottom-0 bg-[#1C1C1E] border-t border-gray-800 rounded-t-3xl p-6 z-[60] transform transition-transform duration-300 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <h3 className="text-white text-lg font-bold mb-1">
                {reportData.categorized_items[selectedTransactionIndex]?.merchant}
              </h3>
              <p className="text-gray-400 text-sm mb-6">Select a new category for this transaction</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleCategoryChange('Essential')}
                  className="w-full bg-[#0D0D1A] border border-cyan-500/30 text-cyan-400 font-bold py-4 rounded-2xl hover:bg-cyan-500/10 transition-colors"
                >
                  Essential
                </button>
                <button 
                  onClick={() => handleCategoryChange('Standard')}
                  className="w-full bg-[#0D0D1A] border border-blue-500/30 text-blue-400 font-bold py-4 rounded-2xl hover:bg-blue-500/10 transition-colors"
                >
                  Standard
                </button>
                <button 
                  onClick={() => handleCategoryChange('Luxury')}
                  className="w-full bg-[#0D0D1A] border border-purple-500/30 text-purple-400 font-bold py-4 rounded-2xl hover:bg-purple-500/10 transition-colors"
                >
                  Luxury
                </button>
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
        
        {/* Main Home Content */}
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

          {/* Bank Accounts */}
          <div className="mb-8">
            <div className="flex justify-between items-end mb-3">
              <h2 className="text-lg font-bold">Bank Accounts</h2>
              <span className="text-sm font-semibold text-gray-300">€ 2,450.00</span>
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
                <p className="text-lg font-bold text-white">€ 2,450.00</p>
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
                const isExpense = t.amount.startsWith('-');
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
                    <div className="text-right">
                      <p className={`text-[16px] font-bold ${colorClass}`}>{isExpense ? '' : '+'}€ {t.amount.replace('-', '')}</p>
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

        {/* F.R Floating Button */}
        <button 
          onClick={() => setShowReportModal(true)}
          className="absolute bottom-28 right-6 w-14 h-14 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full shadow-[0_4px_14px_0_rgba(6,182,212,0.39)] flex items-center justify-center text-white font-bold border border-white/20 transition-transform transform hover:scale-105 active:scale-95 z-40"
        >
          F.R
        </button>

        {/* Report Modal Layer */}
        {showReportModal && renderReportModal()}

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          <div className="nav-item active">
            <svg fill="currentColor" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span>Home</span>
          </div>
          <div className="nav-item">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            <span>Cards</span>
          </div>
          <div className="nav-item">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>Savings</span>
          </div>
          <div className="nav-item">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            <span>Stocks</span>
          </div>
        </div>
      </div>
    </div>
  );
}
