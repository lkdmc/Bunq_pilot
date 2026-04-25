import { useState, useEffect, useRef } from 'react';

const NUMPAD = ['1','2','3','4','5','6','7','8','9','00','0','⌫'];

export default function PayFlow({ accountInfo, transactions, onClose, onPaymentSent }) {
  const [step, setStep] = useState(1);
  const [amountCents, setAmountCents] = useState(0);
  const [recipient, setRecipient] = useState(null);
  const [showIbanForm, setShowIbanForm] = useState(false);
  const [ibanInput, setIbanInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [attachmentB64, setAttachmentB64] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  // Amount display: amountCents = 33400 → "334.00"
  const intPart = String(Math.floor(amountCents / 100)) || '0';
  const decPart = String(amountCents % 100).padStart(2, '0');
  const amountForApi = `${intPart}.${decPart}`;

  const handleDigit = (d) => {
    setAmountCents(v => {
      if (d === '⌫') return Math.floor(v / 10);
      if (d === '00') {
        const val = v * 100;
        return val <= 9999999 ? val : v;
      }
      if (d === '.') return v;
      const val = v * 10 + parseInt(d);
      return val <= 9999999 ? val : v;
    });
  };

  useEffect(() => {
    if (step !== 1) return;
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDigit('⌫');
      } else if (e.key === 'Enter') {
        setAmountCents(v => {
          if (v > 0) setStep(2);
          return v;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentB64(reader.result.split(',')[1]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectRecipient = () => {
    if (!ibanInput.trim() || !nameInput.trim()) return;
    setRecipient({ iban: ibanInput.trim().toUpperCase(), name: nameInput.trim() });
    setStep(3);
  };

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountForApi,
          currency: 'EUR',
          recipient_iban: recipient.iban,
          recipient_name: recipient.name,
          description: description || 'Payment',
          attachment_b64: attachmentB64,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Payment failed');
      setSent(true);
      setTimeout(() => { onPaymentSent?.(); onClose(); }, 2200);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const Header = ({ title, onBack }) => (
    <div className="flex items-center justify-between px-4 pt-10 pb-4">
      <button onClick={onBack} className="w-9 h-9 flex items-center justify-center text-white">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="text-base font-bold text-white">{title}</h1>
      <button className="w-9 h-9 flex items-center justify-center text-white opacity-50">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      </button>
    </div>
  );

  /* ── SUCCESS ── */
  if (sent) return (
    <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-5">
      <div className="w-20 h-20 rounded-full bg-orange-500 flex items-center justify-center animate-bounce">
        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-white text-xl font-bold">Payment Sent!</p>
      <p className="text-gray-500 text-sm">€{amountForApi} → {recipient?.name}</p>
    </div>
  );

  /* ── STEP 1: AMOUNT ── */
  if (step === 1) return (
    <div className="absolute inset-0 z-[100] bg-black flex flex-col">
      <Header title="New Payment" onBack={onClose} />

      {/* Amount display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-light text-gray-500">€</span>
          <span className="text-6xl font-semibold text-white">{intPart}</span>
          <span className="w-0.5 h-14 bg-orange-500 animate-pulse mx-0.5 rounded-full"></span>
          <span className="text-4xl font-light text-gray-400">.{decPart}</span>
        </div>
        <button className="text-orange-500 font-bold text-xs tracking-widest mt-2">CHOOSE CURRENCY</button>
      </div>

      {/* From card */}
      <div className="px-4 mb-4">
        <div className="bg-[#1C1C1E] rounded-2xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">From</p>
            <p className="text-sm font-semibold text-white">{accountInfo?.description || 'Bank Account'}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-300">€ {accountInfo?.balance || '0.00'}</span>
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Choose Recipient */}
      <button
        disabled={amountCents === 0}
        onClick={() => setStep(2)}
        className="mx-4 mb-4 py-4 text-center text-white font-bold text-sm tracking-widest disabled:text-gray-600 transition-colors"
      >
        CHOOSE RECIPIENT
      </button>

      {/* Numpad */}
      <div className="grid grid-cols-5 border-t border-[#1C1C1E]">
        {['+', '-', '×', '÷', '='].map(op => (
          <button key={op} className="py-4 text-gray-500 text-xl font-light">{op}</button>
        ))}
      </div>
      <div className="grid grid-cols-3">
        {NUMPAD.map(k => (
          <button
            key={k}
            onClick={() => handleDigit(k)}
            className="py-5 text-center text-white text-2xl font-light active:bg-[#1C1C1E] transition-colors"
          >
            {k === '⌫' ? (
              <svg className="w-6 h-6 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
              </svg>
            ) : k}
          </button>
        ))}
      </div>
    </div>
  );

  /* ── STEP 2: RECIPIENT ── */
  if (step === 2) return (
    <div className="absolute inset-0 z-[100] bg-black flex flex-col">
      <Header title="Choose Recipient" onBack={() => setStep(1)} />

      <div className="px-4 flex flex-col gap-4 overflow-y-auto no-scrollbar flex-1">
        {/* Search */}
        <div className="bg-[#1C1C1E] rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <input
            className="flex-1 bg-transparent text-gray-300 text-sm placeholder-gray-600 outline-none"
            placeholder="Phone number, Email"
            value={ibanInput}
            onChange={e => setIbanInput(e.target.value)}
          />
          <svg className="w-5 h-5 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>

        {/* Options */}
        <div className="flex flex-col">
          {[
            { icon: '👥', label: 'Multiple people' },
            { icon: '🏦', label: 'My accounts' },
          ].map(({ icon, label }, i, arr) => (
            <button key={label} className={`flex items-center gap-4 py-4 ${i < arr.length - 1 ? 'border-b border-[#1C1C1E]' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-orange-900/60 flex items-center justify-center text-lg shrink-0">{icon}</div>
              <span className="text-sm font-medium text-white flex-1 text-left">{label}</span>
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}
          <button
            onClick={() => setShowIbanForm(v => !v)}
            className="flex items-center gap-4 py-4"
          >
            <div className="w-10 h-10 rounded-full bg-orange-900/60 flex items-center justify-center text-lg shrink-0">🔢</div>
            <span className="text-sm font-medium text-white flex-1 text-left">Enter IBAN</span>
            <svg className={`w-4 h-4 text-gray-600 transition-transform ${showIbanForm ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>

          {showIbanForm && (
            <div className="flex flex-col gap-3 py-3 px-1">
              <input
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-orange-500 transition-colors font-mono"
                placeholder="NL49BUNQ..."
                value={ibanInput}
                onChange={e => setIbanInput(e.target.value.toUpperCase())}
              />
              <input
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-orange-500 transition-colors"
                placeholder="Recipient name"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
              />
              <button
                onClick={handleSelectRecipient}
                disabled={!ibanInput.trim() || !nameInput.trim()}
                className="w-full bg-orange-500 disabled:bg-[#2C2C2E] disabled:text-gray-600 text-white font-bold py-3.5 rounded-xl text-sm transition-colors"
              >
                Confirm Recipient →
              </button>
            </div>
          )}
        </div>

        {/* Recents */}
        {transactions.length > 0 && (
          <div>
            <p className="text-sm font-bold text-white mb-3">Recents</p>
            {transactions.slice(0, 4).map((t, i) => (
              <button
                key={i}
                onClick={() => {
                  setNameInput(t.merchant || '');
                  setShowIbanForm(true);
                }}
                className="flex items-center gap-3 w-full py-3 border-b border-[#1C1C1E] last:border-0"
              >
                <div className="w-10 h-10 rounded-full bg-[#1C1C1E] border border-[#2C2C2E] flex items-center justify-center text-lg shrink-0">
                  {t.merchant?.[0] || '?'}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">{t.merchant}</p>
                  <p className="text-xs text-gray-600">{t.date?.slice(0, 10)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ── STEP 3: CONFIRM ── */
  return (
    <div className="absolute inset-0 z-[100] bg-black flex flex-col">
      <Header title="New Payment" onBack={() => setStep(2)} />

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 flex flex-col gap-4 pt-2">
        {/* Sender → Recipient */}
        <div className="flex items-center justify-center gap-4 py-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-[#2C2C2E] flex items-center justify-center text-3xl">🐜</div>
            <p className="text-xs font-semibold text-white">{accountInfo?.description || 'Bank Account'}</p>
            <p className="text-[10px] text-gray-500">€ {accountInfo?.balance}</p>
          </div>
          <svg className="w-6 h-6 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-[#2C2C2E] border border-[#3C3C3E] flex items-center justify-center text-2xl font-bold text-white">
              {recipient?.name?.[0]?.toUpperCase()}
            </div>
            <p className="text-xs font-semibold text-white">{recipient?.name}</p>
            <p className="text-[10px] text-gray-500 font-mono max-w-[110px] truncate">{recipient?.iban}</p>
          </div>
        </div>

        {/* Amount */}
        <div className="text-center">
          <span className="text-5xl font-bold text-orange-500">€ {intPart}</span>
          <span className="text-3xl font-bold text-orange-400">.{decPart}</span>
        </div>

        {/* Security warning */}
        <div className="bg-[#0A2A5E] border border-blue-500/30 rounded-2xl p-4 relative">
          <button className="absolute top-3 right-3 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <p className="text-blue-300 font-bold text-sm mb-1">bunq employees will never call you</p>
          <p className="text-blue-400/70 text-xs leading-relaxed">Stay safe: bunq employees will never call you, not even in an emergency. bunq employees will only contact you through secure in-app support messages.</p>
        </div>

        {/* Description */}
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5 flex items-center gap-3">
          {previewUrl && (
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-[#3C3C3E]">
              <img src={previewUrl} alt="Attachment preview" className="w-full h-full object-cover" />
            </div>
          )}
          <input
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
            placeholder="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <input 
            type="file" 
            ref={fileRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
          <button onClick={() => fileRef.current?.click()} className="shrink-0 p-1">
            <svg className={`w-5 h-5 ${previewUrl ? 'text-blue-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
          </button>
        </div>

        {/* Pay timing */}
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Pay</p>
            <p className="text-xs text-gray-500">Immediately</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}
      </div>

      {/* Send button */}
      <div className="px-4 py-4 pb-8">
        <button
          onClick={handleSend}
          disabled={sending || amountCents === 0}
          className="w-full bg-orange-500 disabled:bg-[#2C2C2E] disabled:text-gray-600 text-white font-bold py-4 rounded-2xl text-sm tracking-widest transition-all active:scale-[0.98]"
        >
          {sending ? 'SENDING...' : 'SEND PAYMENT'}
        </button>
      </div>
    </div>
  );
}
