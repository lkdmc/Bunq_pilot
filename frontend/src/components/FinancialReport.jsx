import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import { Loader2, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function FinancialReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/receipts/report')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12 flex flex-col items-center justify-center">
        <Loader2 size={32} className="text-blue-500 animate-spin mb-4" />
        <p className="text-gray-400">Generating your financial report...</p>
      </div>
    );
  }

  if (!data || !data.breakdown || data.breakdown.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
        <h1 className="text-3xl font-bold mb-6">Financial Report</h1>
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-6 text-center">
          <AlertCircle size={48} className="text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">No receipts scanned yet.</p>
          <p className="text-sm text-gray-500 mt-2">Scan receipts from your transactions to see your spending breakdown!</p>
        </div>
      </div>
    );
  }

  // Process data for charts
  const subcatTotals = { Essential: 0, Standard: 0, Luxury: 0 };
  const catTotals = {};

  data.breakdown.forEach(item => {
    const sub = item.subcategory || 'Standard';
    const cat = item.category || 'Other';
    
    if (subcatTotals[sub] !== undefined) {
      subcatTotals[sub] += item.total;
    } else {
      subcatTotals[sub] = item.total;
    }

    if (!catTotals[cat]) catTotals[cat] = { name: cat, Essential: 0, Standard: 0, Luxury: 0, total: 0 };
    if (catTotals[cat][sub] !== undefined) {
      catTotals[cat][sub] += item.total;
    }
    catTotals[cat].total += item.total;
  });

  const pieData = [
    { name: 'Essential', value: subcatTotals.Essential, color: '#22c55e' },
    { name: 'Standard', value: subcatTotals.Standard, color: '#3b82f6' },
    { name: 'Luxury', value: subcatTotals.Luxury, color: '#a855f7' },
  ].filter(d => d.value > 0);

  const barData = Object.values(catTotals).sort((a, b) => b.total - a.total).slice(0, 5); // top 5 categories

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-3 rounded-lg shadow-xl">
          <p className="text-white font-medium mb-1">{payload[0].name}</p>
          <p className="text-white font-bold">€{payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] bg-black text-white px-4 pt-12">
      <h1 className="text-3xl font-bold mb-1">Financial Report</h1>
      <p className="text-gray-400 text-sm mb-6">AI analysis of your receipts</p>

      {/* AI Advice Card */}
      <div className="bg-gradient-to-br from-[#1C1C1E] to-black border border-[#2C2C2E] rounded-2xl p-5 mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-blue-500 to-purple-500"></div>
        <div className="flex gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF8C00] to-[#AF52DE] flex items-center justify-center text-white text-sm font-bold shrink-0">F</div>
          <h2 className="text-lg font-bold text-white flex-1">Finn's Analysis</h2>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: data.advice.replace(/\n/g, '<br>') }}></p>
      </div>

      {/* Need vs Want Pie Chart */}
      <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4 mb-6">
        <h3 className="text-sm font-bold text-gray-400 mb-4 tracking-wide">SPENDING BEHAVIOR</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 mt-2">
          {pieData.map(d => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
              <span className="text-xs text-gray-300">{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown Bar Chart */}
      <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4 mb-6">
        <h3 className="text-sm font-bold text-gray-400 mb-4 tracking-wide">TOP CATEGORIES</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `€${v}`} />
              <Tooltip cursor={{ fill: '#2C2C2E' }} contentStyle={{ backgroundColor: '#1C1C1E', borderColor: '#2C2C2E', borderRadius: '8px', color: 'white' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#888' }} />
              <Bar dataKey="Essential" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
              <Bar dataKey="Standard" stackId="a" fill="#3b82f6" />
              <Bar dataKey="Luxury" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
