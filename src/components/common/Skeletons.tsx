import React from 'react';

// Base pulse animation class matching design system
const pulseClass = "animate-pulse bg-slate-200/60 rounded";

export const TableSkeleton = ({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className={`h-3 ${pulseClass}`} style={{ width: `${100 / columns}%` }}></div>
        ))}
      </div>
      {/* Body */}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex items-center justify-between space-x-4">
            {Array.from({ length: columns }).map((_, j) => (
              <div 
                key={j} 
                className={`h-4 ${pulseClass}`} 
                style={{ width: `${Math.random() * 40 + 40}%` }}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton = () => {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${pulseClass}`}></div>
        <div className={`w-16 h-5 rounded-full ${pulseClass}`}></div>
      </div>
      <div className="space-y-2">
        <div className={`h-4 w-1/3 ${pulseClass}`}></div>
        <div className={`h-6 w-1/2 ${pulseClass}`}></div>
      </div>
      <div className={`h-2 w-full mt-4 ${pulseClass}`}></div>
    </div>
  );
};

export const DashboardGridSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
};

export const PageHeaderSkeleton = () => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div className="space-y-2">
        <div className={`h-6 w-48 ${pulseClass}`}></div>
        <div className={`h-3 w-72 ${pulseClass}`}></div>
      </div>
      <div className="flex space-x-2">
        <div className={`h-8 w-24 ${pulseClass}`}></div>
        <div className={`h-8 w-24 ${pulseClass}`}></div>
      </div>
    </div>
  );
};
