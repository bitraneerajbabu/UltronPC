import React, { useState, useEffect, useRef } from 'react';
import { IconCalendar } from '@tabler/icons-react';

interface DateTimeRangePickerProps {
  fromDate: string; // YYYY-MM-DD
  setFromDate: (v: string) => void;
  fromTime: string; // HH:MM (24h)
  setFromTime: (v: string) => void;
  toDate: string; // YYYY-MM-DD
  setToDate: (v: string) => void;
  toTime: string; // HH:MM (24h)
  setToTime: (v: string) => void;
  onSave?: () => void;
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function to12Hr(time24: string): { hh: string; mm: string; ampm: 'AM' | 'PM' } {
  if (!time24) return { hh: '12', mm: '00', ampm: 'AM' };
  const parts = time24.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const mm = (parseInt(parts[1], 10) || 0).toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hh = h.toString().padStart(2, '0');
  return { hh, mm, ampm };
}

function to24Hr(hh: string, mm: string, ampm: 'AM' | 'PM'): string {
  let h = parseInt(hh, 10) || 12;
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${mm.padStart(2, '0')}`;
}

function formatDisplayDate(dateStr: string, time24Str: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return '';
  const d = parts[2];
  const m = parts[1];
  const { hh, mm, ampm } = to12Hr(time24Str);
  const mName = MONTH_NAMES_SHORT[m - 1] || '';
  return `${d} ${mName}, ${hh}:${mm} ${ampm}`;
}

export const DateTimeRangePicker: React.FC<DateTimeRangePickerProps> = ({
  fromDate,
  setFromDate,
  fromTime,
  setFromTime,
  toDate,
  setToDate,
  toTime,
  setToTime,
  onSave,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Temporary selection state during modal edits
  const [tempFromDate, setTempFromDate] = useState(fromDate);
  const [tempFromTime, setTempFromTime] = useState(fromTime);
  const [tempToDate, setTempToDate] = useState(toDate);
  const [tempToTime, setTempToTime] = useState(toTime);

  // Range selection mode: 'start' (next click sets fromDate) or 'end' (next click sets toDate)
  const [selectionStep, setSelectionStep] = useState<'start' | 'end'>('start');

  // Left month calendar view state
  const initialDate = fromDate ? new Date(fromDate) : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Right month calendar view state
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear;
  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1;

  // Sync temp state when props or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setTempFromDate(fromDate);
      setTempFromTime(fromTime);
      setTempToDate(toDate);
      setTempToTime(toTime);
      if (fromDate) {
        const d = new Date(fromDate);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [isOpen, fromDate, fromTime, toDate, toTime]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleDayClick = (dateStr: string) => {
    if (selectionStep === 'start' || (tempFromDate && tempToDate)) {
      setTempFromDate(dateStr);
      setTempToDate('');
      setSelectionStep('end');
    } else {
      if (dateStr < tempFromDate) {
        setTempToDate(tempFromDate);
        setTempFromDate(dateStr);
      } else {
        setTempToDate(dateStr);
      }
      setSelectionStep('start');
    }
  };

  const handleSaveClick = () => {
    setFromDate(tempFromDate);
    setFromTime(tempFromTime);
    setToDate(tempToDate || tempFromDate);
    setToTime(tempToTime);
    setIsOpen(false);
    if (onSave) onSave();
  };

  const renderMonthGrid = (year: number, month: number) => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }

    return (
      <div style={{ flex: 1, padding: '0 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
            <div key={idx} style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>
              {day}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
          {days.map((d, idx) => {
            if (d === null) return <div key={idx} style={{ height: '32px' }} />;
            const monthStr = (month + 1).toString().padStart(2, '0');
            const dayStr = d.toString().padStart(2, '0');
            const fullDateStr = `${year}-${monthStr}-${dayStr}`;

            const isStart = tempFromDate === fullDateStr;
            const isEnd = tempToDate === fullDateStr;
            const isInRange = tempFromDate && tempToDate && fullDateStr > tempFromDate && fullDateStr < tempToDate;

            let bgColor = 'transparent';
            let textColor = 'var(--text-primary)';
            let borderRadius = '50%';
            let fontWeight = '500';

            if (isStart || isEnd) {
              bgColor = 'var(--primary-600)';
              textColor = '#ffffff';
              fontWeight = '700';
            } else if (isInRange) {
              bgColor = 'var(--primary-50)';
              textColor = 'var(--primary-600)';
              borderRadius = '4px';
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleDayClick(fullDateStr)}
                style={{
                  height: '32px',
                  width: '32px',
                  margin: '0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight,
                  color: textColor,
                  backgroundColor: bgColor,
                  borderRadius,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const from12 = to12Hr(tempFromTime);
  const to12 = to12Hr(tempToTime);

  return (
    <div ref={pickerRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      {/* Trigger Bar Input Box */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '4px 6px 4px 14px',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>
          {formatDisplayDate(fromDate, fromTime)} <span style={{ color: 'var(--text-secondary)', margin: '0 4px' }}>to</span> {formatDisplayDate(toDate, toTime)}
        </span>
        <div
          style={{
            background: 'var(--primary-50)',
            borderRadius: '6px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary-600)',
          }}
        >
          <IconCalendar size={18} stroke={2} />
        </div>
      </div>

      {/* Modal Popup Date-Time Picker */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 9999,
            width: '640px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
            padding: '20px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {/* Calendar Header with Nav Arrows */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-600)', fontSize: '18px', fontWeight: 'bold' }}
              >
                â€¹
              </button>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {MONTH_NAMES[rightMonth]} {rightYear}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-600)', fontSize: '18px', fontWeight: 'bold' }}
              >
                â€º
              </button>
            </div>
          </div>

          {/* Dual Month Calendars Side-by-Side */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--surface-muted)', paddingBottom: '16px' }}>
            {renderMonthGrid(viewYear, viewMonth)}
            <div style={{ width: '1px', background: 'var(--surface-muted)', margin: '0 8px' }} />
            {renderMonthGrid(rightYear, rightMonth)}
          </div>

          {/* Time Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '16px 0', borderBottom: '1px solid var(--surface-muted)' }}>
            {/* From Time Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                value={from12.hh}
                onChange={e => setTempFromTime(to24Hr(e.target.value, from12.mm, from12.ampm))}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
              >
                {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>:</span>
              <select
                value={from12.mm}
                onChange={e => setTempFromTime(to24Hr(from12.hh, e.target.value, from12.ampm))}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
              >
                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden', marginLeft: '4px' }}>
                <button
                  type="button"
                  onClick={() => setTempFromTime(to24Hr(from12.hh, from12.mm, 'AM'))}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    border: 'none',
                    background: from12.ampm === 'AM' ? 'var(--primary-600)' : '#ffffff',
                    color: from12.ampm === 'AM' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setTempFromTime(to24Hr(from12.hh, from12.mm, 'PM'))}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    border: 'none',
                    background: from12.ampm === 'PM' ? 'var(--primary-600)' : '#ffffff',
                    color: from12.ampm === 'PM' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  PM
                </button>
              </div>
            </div>

            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>to</span>

            {/* To Time Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                value={to12.hh}
                onChange={e => setTempToTime(to24Hr(e.target.value, to12.mm, to12.ampm))}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
              >
                {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>:</span>
              <select
                value={to12.mm}
                onChange={e => setTempToTime(to24Hr(to12.hh, e.target.value, to12.ampm))}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
              >
                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden', marginLeft: '4px' }}>
                <button
                  type="button"
                  onClick={() => setTempToTime(to24Hr(to12.hh, to12.mm, 'AM'))}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    border: 'none',
                    background: to12.ampm === 'AM' ? 'var(--primary-600)' : '#ffffff',
                    color: to12.ampm === 'AM' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setTempToTime(to24Hr(to12.hh, to12.mm, 'PM'))}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    border: 'none',
                    background: to12.ampm === 'PM' ? 'var(--primary-600)' : '#ffffff',
                    color: to12.ampm === 'PM' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Footer Bar: Selected Text & Save Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: '700', color: 'var(--primary-600)' }}>SELECTED: </span>
              {formatDisplayDate(tempFromDate, tempFromTime)} <span style={{ color: 'var(--text-secondary)' }}>to</span> {formatDisplayDate(tempToDate || tempFromDate, tempToTime)}
            </div>
            <button
              type="button"
              onClick={handleSaveClick}
              style={{
                background: 'var(--primary-600)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 24px',
                fontSize: '13px',
                fontWeight: '700',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(15,118,110,0.3)',
              }}
            >
              SAVE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
