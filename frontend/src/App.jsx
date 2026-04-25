import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [addMoneyAmount, setAddMoneyAmount] = useState('');
  const [addMoneyDesc, setAddMoneyDesc] = useState('');
  const [addMoneyLoading, setAddMoneyLoading] = useState(false);
  const [addMoneyResult, setAddMoneyResult] = useState(null);
  const [txLimit, setTxLimit] = useState(5);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/transactions')
      .then(res => res.json())
      .then(data => setTransactions(data))
      .catch(err => console.error('Failed to fetch transactions:', err));

    fetch('http://127.0.0.1:8000/api/balance')
      .then(res => res.json())
      .then(data => { if (data.balance !== null) setAccountBalance(data.balance); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentTab === 'subs' && subscriptions.length === 0) {
      setSubsLoading(true);
      fetch('http://127.0.0.1:8000/api/subscriptions')
        .then(res => res.json())
        .then(data => { setSubscriptions(data); setSubsLoading(false); })
        .catch(() => setSubsLoading(false));
    }
    if (currentTab === 'forecast' && !forecast) {
      loadForecast();
    }
  }, [currentTab]);

  useEffect(() => {
    if (currentTab === 'ai' && chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory, isWaiting, currentTab]);

  const loadForecast = () => {
    setForecastLoading(true);
    fetch('http://127.0.0.1:8000/api/predict')
      .then(res => res.json())
      .then(data => { setForecast(data); setForecastLoading(false); })
      .catch(() => setForecastLoading(false));
  };

  const handleAddMoney = async () => {
    const amount = parseFloat(addMoneyAmount);
    if (!addMoneyAmount || isNaN(amount) || amount <= 0) return;
    setAddMoneyLoading(true);
    setAddMoneyResult(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/request-money', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount.toFixed(2), description: addMoneyDesc || 'Request money' })
      });
      const data = await res.json();
      if (res.ok) {
        setAddMoneyResult({ ok: true, msg: data.detail });
        setTimeout(() => { setShowAddMoney(false); setAddMoneyResult(null); setAddMoneyAmount(''); setAddMoneyDesc(''); }, 2000);
      } else {
        setAddMoneyResult({ ok: false, msg: data.detail || 'Request failed' });
      }
    } catch {
      setAddMoneyResult({ ok: false, msg: 'Could not reach backend' });
    } finally {
      setAddMoneyLoading(false);
    }
  };

  const sendMessage = async (textToUse) => {
    const text = textToUse || inputValue.trim();
    if (!text || isWaiting) return;
    setInputValue('');
    const newHistory = [...chatHistory, { role: 'user', content: text }];
    setChatHistory(newHistory);
    setIsWaiting(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
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

  // ── Tabs ──────────────────────────────────────────────

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
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
        <button className="flex-1 btn-add-money rounded-xl py-3 flex flex-col items-center gap-1 bg-[#2D0A4E]" onClick={() => { setShowAddMoney(true); setAddMoneyResult(null); }}>
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
          {transactions.slice(0, txLimit).map((t, i) => {
            const isExpense = t.amount.startsWith('-');
            const { icon, bg, text } = getIconForMerchant(t.merchant);
            return (
              <div key={i} className="flex items-center justify-between p-3 hover:bg-[#2C2C2E] rounded-lg transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full ${bg} ${text} flex items-center justify-center text-lg shrink-0`}>{icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{t.merchant}</p>
                    <p className="text-xs text-gray-400 truncate">{t.desc || t.date}</p>
                  </div>
                </div>
                <p className={`text-[15px] font-bold shrink-0 ml-2 ${isExpense ? 'text-white' : 'text-blue-500'}`}>
                  {isExpense ? '-' : '+'}€{Math.abs(parseFloat(t.amount)).toFixed(2)}
                </p>
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

            {subscriptions.map((sub, i) => (
              <div key={i} className="bunq-card p-4 mb-3">
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
              <div className="chat-bubble-ai p-3 text-[15px] shadow-sm break-words leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br>') }} />
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

  const renderAddMoneyModal = () => (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={() => setShowAddMoney(false)}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-[430px] bg-[#1C1C1E] rounded-t-2xl p-6 pb-10" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-5" />
        <h2 className="text-lg font-bold text-white mb-1">Add Money</h2>
        <p className="text-xs text-gray-400 mb-5">Sends a payment request to sugardaddy@bunq.com</p>

        <label className="text-xs text-gray-400 mb-1 block">Amount (EUR)</label>
        <div className="flex items-center bg-[#2C2C2E] rounded-xl px-4 py-3 mb-4">
          <span className="text-gray-400 mr-2 text-lg">€</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={addMoneyAmount}
            onChange={e => setAddMoneyAmount(e.target.value)}
            className="flex-1 bg-transparent outline-none text-white text-lg placeholder-gray-600"
            autoFocus
          />
        </div>

        <label className="text-xs text-gray-400 mb-1 block">Description</label>
        <div className="flex items-center bg-[#2C2C2E] rounded-xl px-4 py-3 mb-6">
          <input
            type="text"
            placeholder="Request money"
            value={addMoneyDesc}
            onChange={e => setAddMoneyDesc(e.target.value)}
            className="flex-1 bg-transparent outline-none text-white text-sm placeholder-gray-600"
          />
        </div>

        {addMoneyResult && (
          <p className={`text-sm text-center mb-4 ${addMoneyResult.ok ? 'text-green-400' : 'text-red-400'}`}>
            {addMoneyResult.ok ? '✓ ' : '✗ '}{addMoneyResult.msg}
          </p>
        )}

        <button
          onClick={handleAddMoney}
          disabled={addMoneyLoading || !addMoneyAmount}
          className="w-full py-3.5 rounded-xl bg-purple-600 text-white font-bold text-sm disabled:opacity-50 transition"
        >
          {addMoneyLoading ? 'Sending...' : 'Send Request'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="app-container">
        {(tabs[currentTab] || renderHome)()}

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

      {showAddMoney && createPortal(renderAddMoneyModal(), document.body)}
    </div>
  );
}
