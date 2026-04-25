import { useState, useEffect, useRef } from 'react';

const getIconForMerchant = (merchant) => {
  if (merchant.includes('Starbucks')) return { icon: '☕', bg: 'bg-green-900', text: 'text-green-400' };
  if (merchant.includes('Albert Heijn')) return { icon: '🛒', bg: 'bg-blue-900', text: 'text-blue-400' };
  if (merchant.includes('Netflix')) return { icon: '🍿', bg: 'bg-red-900', text: 'text-red-400' };
  if (merchant.includes('bunq')) return { icon: '🌈', bg: 'bg-purple-900', text: 'text-purple-400' };
  if (merchant.includes('Zara')) return { icon: '👕', bg: 'bg-gray-800', text: 'text-gray-300' };
  return { icon: '💳', bg: 'bg-gray-800', text: 'text-gray-300' };
};

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [transactions, setTransactions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/transactions')
      .then(res => res.json())
      .then(data => setTransactions(data))
      .catch(err => console.error('Failed to fetch transactions:', err));
  }, []);

  useEffect(() => {
    if (currentTab === 'ai' && chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory, isWaiting, currentTab]);

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
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      const data = await response.json();
      setChatHistory([...newHistory, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error(error);
      setChatHistory([...newHistory, { role: 'assistant', content: 'Oops, there was a communication error! 😢 Please check if the backend server is running.' }]);
    } finally {
      setIsWaiting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
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
  );

  const renderChat = () => (
    <div className="flex-1 flex flex-col h-full w-full bg-black">
      {/* Top Header */}
      <div className="flex items-center justify-center p-4 border-b border-[#1C1C1E] bg-black z-20 shrink-0 relative pt-12">
        <h1 className="text-lg font-bold text-white">Finn AI</h1>
      </div>

      <div ref={chatBoxRef} className="chat-area">
        <div className="flex items-start gap-2 max-w-[90%]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm border border-[#2C2C2E]">
            F
          </div>
          <div className="chat-bubble-ai p-3.5 text-[15px] shadow-sm leading-relaxed">
            Hi! 👋 I'm your financial assistant, <b>Finn</b>. I'll help you manage your money smartly by analyzing your spending. Feel free to ask me anything!
          </div>
        </div>
        
        {chatHistory.map((msg, idx) => (
          msg.role === 'user' ? (
            <div key={idx} className="flex justify-end mb-1 mt-2">
              <div className="chat-bubble-user p-3 text-[15px] max-w-[85%] break-words">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={idx} className="flex items-start gap-2 max-w-[90%] mb-1 mt-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm mt-1 border border-[#2C2C2E]">
                F
              </div>
              <div className="chat-bubble-ai p-3 text-[15px] shadow-sm break-words leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br>') }} />
            </div>
          )
        ))}

        {isWaiting && (
          <div className="flex items-start gap-2 max-w-[85%] mb-1 mt-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm mt-1 border border-[#2C2C2E]">
              F
            </div>
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
            💸 Where did I spend the most this month?
          </button>
          <button className="quick-btn shrink-0" onClick={() => sendMessage('Give me a plan to save on coffee')}>
            ☕ Give me a plan to save on coffee
          </button>
        </div>
        
        <div className="flex items-center gap-2 bg-[#1C1C1E] rounded-full p-1.5 shadow-inner mt-1 border border-[#2C2C2E]">
          <input 
            type="text" 
            className="flex-grow bg-transparent border-none outline-none px-4 py-2 text-[15px] text-white placeholder-gray-500" 
            placeholder="Ask Finn..." 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isWaiting}
          />
          <button 
            onClick={() => sendMessage()} 
            disabled={isWaiting}
            className={`w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition shadow-md shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400 ${isWaiting ? 'opacity-50' : 'opacity-100'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="app-container">
        {currentTab === 'home' ? renderHome() : renderChat()}

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          <div className={`nav-item ${currentTab === 'home' ? 'active' : ''}`} onClick={() => setCurrentTab('home')}>
            <svg fill={currentTab === 'home' ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
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
          <div className={`nav-item ${currentTab === 'ai' ? 'active' : ''}`} onClick={() => setCurrentTab('ai')}>
            <svg fill={currentTab === 'ai' ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <span>AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
