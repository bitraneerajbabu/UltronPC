import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler } from 'chart.js';
import { T, BTN, INP, SEL } from '../theme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, LineController, Filler);

const pad = (n: number) => String(n).padStart(2, '0');

const fmtDt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TABS = [
  { key: 'jobs', label: 'Calibration Jobs' },
  { key: 'start', label: 'Start New Calibration' },
  { key: 'results', label: 'Calibration Results / Approval' },
];

const tabRowStyle: React.CSSProperties = {
  display: 'flex', gap: '8px', borderBottom: '1px solid rgba(15,118,110,0.1)',
  marginBottom: '20px',
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px', border: 'none', background: active ? 'rgba(15,118,110,0.06)' : 'none',
  cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '600',
  color: active ? T.primary : T.textLabel, fontFamily: 'inherit',
  borderBottom: active ? `2px solid ${T.primary}` : '2px solid transparent',
  marginBottom: '-1px', borderRadius: '8px 8px 0 0', transition: 'all 0.2s',
});

const STAT_COLORS: Record<string, string> = {
  pending: '#f59e0b', running: '#3b82f6', completed: '#10b981',
  approved: '#0f766e', rejected: '#ef4444',
};

export const CalibrationScreen = React.memo(() => {
  const { stations, devices, parameters, API_BASE, showToast, authFetch, currentUser } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('jobs');
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [approveComment, setApproveComment] = useState('');
  const [jobsLoading, setJobsLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<number | null>(null);

  // Start form
  const [startStationId, setStartStationId] = useState('');
  const [startParamId, setStartParamId] = useState('');
  const [startJobName, setStartJobName] = useState('');
  const [startType, setStartType] = useState<'zero' | 'span' | 'full'>('full');
  const [startSequence, setStartSequence] = useState<'zero_first' | 'span_first'>('zero_first');
  const [startSchedule, setStartSchedule] = useState<'now' | 'scheduled'>('now');
  const [startDateTime, setStartDateTime] = useState('');

  // Results tab state
  const [viewingJob, setViewingJob] = useState<any>(null);
  const [controlChartData, setControlChartData] = useState<any>(null);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);
  const spanChartRef = useRef<HTMLCanvasElement>(null);
  const spanChartInstanceRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) { chartInstanceRef.current.destroy(); chartInstanceRef.current = null; }
      if (spanChartInstanceRef.current) { spanChartInstanceRef.current.destroy(); spanChartInstanceRef.current = null; }
    };
  }, []);

  const allStations = useMemo(() => {
    return stations.filter(st => {
      return parameters.some(p => {
        const dev = devices.find(d => String(d.id) === String(p.device_id));
        return dev && String(dev.station_id) === String(st.id);
      });
    });
  }, [stations, parameters, devices]);

  useEffect(() => {
    if (allStations.length && !startStationId) setStartStationId(String(allStations[0].id));
  }, [allStations, startStationId]);

  const filteredParams = useMemo(() => {
    if (!startStationId) return [];
    return parameters.filter(p => {
      const dev = devices.find(d => String(d.id) === String(p.device_id));
      return dev && String(dev.station_id) === startStationId;
    });
  }, [parameters, devices, startStationId]);

  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/calibration/jobs?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data || []);
    } catch {
      showToast('Failed to fetch calibration jobs.', 'error');
    }
    setJobsLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'jobs' || activeTab === 'results') fetchJobs();
  }, [activeTab]);

  const handleStartJob = async () => {
    if (!startStationId || !startParamId || !startJobName.trim()) {
      showToast('Fill in all required fields.', 'warn');
      return;
    }
    try {
      const payload: any = {
        station_id: Number(startStationId),
        parameter_id: Number(startParamId),
        job_name: startJobName.trim(),
        calibration_type: startType,
        sequence: startType === 'full' ? startSequence : 'zero_first',
      };
      if (startSchedule === 'scheduled' && startDateTime) {
        payload.scheduled_start = new Date(startDateTime).toISOString();
      }
      const res = await authFetch(`${API_BASE}/calibration/start`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      showToast('Calibration job started successfully.');
      setStartJobName('');
      setActiveTab('jobs');
      fetchJobs();
    } catch (e: any) {
      showToast('Failed: ' + (e.message || 'unknown error'), 'error');
    }
  };

  const jobCacheRef = useRef<Record<number, { job: any; cc: any }>>({});

  const prefetchJob = async (jobId: number) => {
    if (jobCacheRef.current[jobId]) return;
    try {
      const [jRes, ccRes] = await Promise.all([
        authFetch(`${API_BASE}/calibration/jobs/${jobId}`),
        authFetch(`${API_BASE}/calibration/control-chart/${jobId}`),
      ]);
      if (jRes.ok) {
        const job = await jRes.json();
        const cc = ccRes.ok ? await ccRes.json() : null;
        jobCacheRef.current[jobId] = { job, cc };
      }
    } catch {}
  };

  const handleViewResults = async (jobId: number) => {
    if (jobCacheRef.current[jobId]) {
      const { job, cc } = jobCacheRef.current[jobId];
      setViewingJob(job);
      setControlChartData(cc);
      setActiveTab('results');
      return;
    }
    setResultsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/calibration/jobs/${jobId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const job = await res.json();
      setViewingJob(job);
      setActiveTab('results');

      const ccRes = await authFetch(`${API_BASE}/calibration/control-chart/${jobId}`);
      const cc = ccRes.ok ? await ccRes.json() : null;
      setControlChartData(cc);
      jobCacheRef.current[jobId] = { job, cc };
    } catch {
      showToast('Failed to load job results.', 'error');
    }
    setResultsLoading(false);
  };

  const handleApproveReject = async (jobId: number, decision: 'approve' | 'reject') => {
    setProcessingJobId(jobId);
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const previousJobs = [...jobs];
    const previousViewing = viewingJob;

    // Optimistic UI Update
    setJobs(prev => prev.map(j => j.id == jobId ? { ...j, status: newStatus } : j));
    if (viewingJob && viewingJob.id == jobId) {
      setViewingJob((prev: any) => prev ? { ...prev, status: newStatus } : null);
    }
    showToast(`Job ${decision}d. Pressing commit in background...`, 'success');

    try {
      const res = await authFetch(`${API_BASE}/calibration/${jobId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ comments: approveComment || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApproveComment('');
      delete jobCacheRef.current[jobId];
      fetchJobs();
    } catch {
      setJobs(previousJobs);
      setViewingJob(previousViewing);
      showToast(`Failed to ${decision} job. Rollback applied.`, 'error');
    } finally {
      setProcessingJobId(null);
    }
  };

  // Draw trend chart for a phase
  const drawPhaseChart = (ref: React.RefObject<HTMLCanvasElement | null>, instanceRef: React.MutableRefObject<ChartJS | null>, result: any, color: string) => {
    if (!ref.current || !result?.values_json) return;
    if (instanceRef.current) instanceRef.current.destroy();

    const values = result.values_json;
    const labels = values.labels || values.map((_: any, i: number) => `#${i + 1}`);
    const data = values.values || values;

    const ctx = ref.current.getContext('2d');
    if (!ctx) return;
    instanceRef.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `${result.phase.toUpperCase()} Phase Values`,
          data,
          borderColor: color,
          backgroundColor: color + '1A',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: color,
          pointRadius: 3,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: {
          legend: { labels: { color: '#475569', font: { weight: 600, family: 'Inter, sans-serif' as any } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        },
      },
    });
  };

  useEffect(() => {
    if (viewingJob && viewingJob.results?.length) {
      const zeroResult = viewingJob.results.find((r: any) => r.phase === 'zero');
      const spanResult = viewingJob.results.find((r: any) => r.phase === 'span');
      if (zeroResult) drawPhaseChart(chartRef, chartInstanceRef, zeroResult, '#0f766e');
      if (spanResult) drawPhaseChart(spanChartRef, spanChartInstanceRef, spanResult, '#3b82f6');
    }
  }, [viewingJob]);

  // Draw Control Charts
  const ccChartRef = useRef<HTMLCanvasElement>(null);
  const ccChartInstanceRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!controlChartData || !ccChartRef.current) return;
    if (ccChartInstanceRef.current) ccChartInstanceRef.current.destroy();

    const shewhart = controlChartData.shewhart;
    if (!shewhart || !shewhart.labels) return;

    const ctx = ccChartRef.current.getContext('2d');
    if (!ctx) return;
    const datasets: any[] = [
      {
        label: 'Value',
        data: shewhart.values,
        borderColor: '#0f766e',
        backgroundColor: 'rgba(15,118,110,0.07)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#0f766e',
        pointRadius: 3,
      },
    ];
    if (shewhart.ucl) {
      datasets.push({ label: 'UCL', data: shewhart.ucl, borderColor: '#ef4444', borderDash: [6, 3], pointRadius: 0, fill: false, borderWidth: 1.5 });
    }
    if (shewhart.lcl) {
      datasets.push({ label: 'LCL', data: shewhart.lcl, borderColor: '#ef4444', borderDash: [6, 3], pointRadius: 0, fill: false, borderWidth: 1.5 });
    }
    if (shewhart.mean) {
      datasets.push({ label: 'Mean', data: shewhart.mean, borderColor: '#3b82f6', borderDash: [4, 2], pointRadius: 0, fill: false, borderWidth: 1 });
    }

    ccChartInstanceRef.current = new ChartJS(ctx, {
      type: 'line',
      data: { labels: shewhart.labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#475569', font: { weight: 600, family: 'Inter, sans-serif' as any } } },
          title: { display: true, text: 'Shewhart Control Chart', color: '#0f172a', font: { weight: 700, size: 14 } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        },
      },
    });
  }, [controlChartData]);

  const phaseCard = (result: any, color: string) => {
    if (!result) return null;
    return (
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">{result.phase.toUpperCase()} Phase</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          <div><div className="form-label">Start</div><div style={{ fontWeight: 600, color: T.text }}>{fmtDt(result.start_time)}</div></div>
          <div><div className="form-label">End</div><div style={{ fontWeight: 600, color: T.text }}>{fmtDt(result.end_time)}</div></div>
          <div><div className="form-label">Min</div><div style={{ fontWeight: 700, color }}>{result.min_value?.toFixed(3) ?? '—'}</div></div>
          <div><div className="form-label">Max</div><div style={{ fontWeight: 700, color }}>{result.max_value?.toFixed(3) ?? '—'}</div></div>
          <div><div className="form-label">Avg</div><div style={{ fontWeight: 700, color: T.primary }}>{result.avg_value?.toFixed(3) ?? '—'}</div></div>
          <div><div className="form-label">Std Dev</div><div style={{ fontWeight: 700, color: T.text }}>{result.std_dev?.toFixed(4) ?? '—'}</div></div>
        </div>
        <canvas ref={result.phase === 'zero' ? chartRef : spanChartRef} height="80"></canvas>
      </div>
    );
  };

  return (
    <div className="screen active" id="calibrationScreen">
      <div style={tabRowStyle}>
        {TABS.map(t => (
          <button key={t.key} style={tabBtnStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Calibration Jobs */}
      {activeTab === 'jobs' && (
        <div>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => setActiveTab('start')}>+ Start New Calibration</button>
            <button className="btn" onClick={fetchJobs}>Refresh</button>
          </div>
          <div className="card">
            <div className="section-title">Calibration Jobs</div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job Name</th>
                    <th>Station Name</th>
                    <th>Parameter</th>
                    <th>Type</th>
                    <th>Sequence</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Triggered By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsLoading ? (
                    <tr><td colSpan={9} className="table-empty">Loading calibration jobs…</td></tr>
                  ) : jobs.length === 0 ? (
                    <tr><td colSpan={9} className="table-empty">No calibration jobs found. Start a new one.</td></tr>
                  ) : (
                    jobs.map((job: any) => (
                      <tr key={job.id} onMouseEnter={() => prefetchJob(job.id)} onFocus={() => prefetchJob(job.id)}>
                        <td><strong>{job.job_name}</strong></td>
                        <td>{stations.find(s => s.id == job.station_id)?.name || `Station #${job.station_id}`}</td>
                        <td>{parameters.find(p => p.id == job.parameter_id)?.name || `Param #${job.parameter_id}`}</td>
                        <td><span className="badge-info">{job.calibration_type}</span></td>
                        <td>{job.sequence || '—'}</td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: '999px',
                            fontSize: '11px', fontWeight: 700, background: (STAT_COLORS[job.status] || '#94a3b8') + '1A',
                            color: STAT_COLORS[job.status] || '#94a3b8',
                            border: `1px solid ${(STAT_COLORS[job.status] || '#94a3b8') + '33'}`,
                          }}>
                            {job.status.toUpperCase()}
                          </span>
                        </td>
                        <td>{fmtDt(job.scheduled_start)}</td>
                        <td>{job.triggered_by || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="table action-btn" onClick={() => handleViewResults(job.id)}
                              disabled={resultsLoading}>{resultsLoading ? '…' : 'View'}</button>
                            {job.status === 'completed' && (
                              <button className="table action-btn" style={{ color: T.primary, borderColor: T.primaryBorder }}
                                onClick={() => { setSelectedJob(job); setActiveTab('results'); handleViewResults(job.id); }}
                                disabled={resultsLoading}>{resultsLoading ? '…' : 'Approve'}</button>
                            )}
                            <button className="table action-btn" style={{ color: '#d32f2f', borderColor: '#d32f2f' }}
                              onClick={async () => {
                                if (!window.confirm(`Delete job "${job.job_name}"?`)) return;
                                const r = await authFetch(`${API_BASE}/calibration/${job.id}`, { method: 'DELETE' });
                                if (!r.ok) { const b = await r.json().catch(() => ({})); showToast(b.detail || 'Delete failed', 'error'); return; }
                                showToast('Job deleted.');
                                fetchJobs();
                              }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Start New Calibration */}
      {activeTab === 'start' && (
        <div className="card">
          <div className="section-title">Start New Calibration</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '18px', maxWidth: '640px' }}>
            <div className="form-group">
              <label className="form-label">Station Name</label>
              <select className="form-select" value={startStationId} onChange={e => setStartStationId(e.target.value)}>
                {allStations.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Parameter</label>
              <select className="form-select" value={startParamId} onChange={e => setStartParamId(e.target.value)}>
                <option value="">-- Select --</option>
                {filteredParams.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tag_name})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Job Name</label>
              <input className="form-input" value={startJobName} onChange={e => setStartJobName(e.target.value)}
                placeholder="e.g. Monthly Zero-Span Check" />
            </div>
            <div className="form-group">
              <label className="form-label">Calibration Type</label>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                {(['zero', 'span', 'full'] as const).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: T.text }}>
                    <input type="radio" name="calType" checked={startType === t} onChange={() => setStartType(t)}
                      style={{ accentColor: T.primary }} />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            {startType === 'full' && (
              <div className="form-group">
                <label className="form-label">Sequence</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                  {(['zero_first', 'span_first'] as const).map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: T.text }}>
                      <input type="radio" name="sequence" checked={startSequence === s} onChange={() => setStartSequence(s)}
                        style={{ accentColor: T.primary }} />
                      {s === 'zero_first' ? 'Zero First' : 'Span First'}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {startType !== 'full' && (
              <div className="form-group">
                <label className="form-label">Sequence</label>
                <div style={{ fontSize: '13px', color: T.textLabel, marginTop: '8px' }}>N/A for single-phase</div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Schedule</label>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: T.text }}>
                  <input type="radio" name="schedule" checked={startSchedule === 'now'} onChange={() => setStartSchedule('now')}
                    style={{ accentColor: T.primary }} /> Now
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: T.text }}>
                  <input type="radio" name="schedule" checked={startSchedule === 'scheduled'} onChange={() => setStartSchedule('scheduled')}
                    style={{ accentColor: T.primary }} /> Scheduled
                </label>
              </div>
              {startSchedule === 'scheduled' && (
                <input type="datetime-local" className="form-input" style={{ marginTop: '8px' }}
                  value={startDateTime} onChange={e => setStartDateTime(e.target.value)} />
              )}
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: '20px' }}>
            <button className="btn btn-primary" onClick={handleStartJob}>Submit Calibration Job</button>
            <button className="btn" onClick={() => setActiveTab('jobs')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tab 3: Results / Approval */}
      {activeTab === 'results' && (
        <div>
          {!viewingJob ? (
            <div className="card">
              <div className="section-title">Select a Job</div>
              <p style={{ color: T.textLabel, fontSize: '13px' }}>Go to the "Calibration Jobs" tab and click "View" on a job to see its results here.</p>
            </div>
          ) : (
            <div>
              <div className="card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>{viewingJob.job_name}</div>
                  <span style={{
                    display: 'inline-block', padding: '4px 14px', borderRadius: '999px',
                    fontSize: '12px', fontWeight: 700, background: (STAT_COLORS[viewingJob.status] || '#94a3b8') + '1A',
                    color: STAT_COLORS[viewingJob.status] || '#94a3b8',
                    border: `1px solid ${(STAT_COLORS[viewingJob.status] || '#94a3b8') + '33'}`,
                  }}>
                    {viewingJob.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '13px', color: T.textMuted }}>
                  <span>Station: <strong>{stations.find(s => s.id == viewingJob.station_id)?.name || `#${viewingJob.station_id}`}</strong></span>
                  <span>Parameter: <strong>{parameters.find(p => p.id == viewingJob.parameter_id)?.name || `#${viewingJob.parameter_id}`}</strong></span>
                  <span>Type: <strong>{viewingJob.calibration_type}</strong></span>
                  <span>Created: <strong>{fmtDt(viewingJob.created_at)}</strong></span>
                </div>
              </div>

              {viewingJob.results?.length === 0 && (
                <div className="card">
                  <p style={{ color: T.textLabel, fontSize: '13px' }}>No results recorded yet for this job.</p>
                </div>
              )}

              {phaseCard(viewingJob.results?.find((r: any) => r.phase === 'zero'), '#0f766e')}
              {phaseCard(viewingJob.results?.find((r: any) => r.phase === 'span'), '#3b82f6')}

              {/* Control Chart */}
              {controlChartData && controlChartData.shewhart && controlChartData.shewhart.labels && (
                <div className="card">
                  <div className="section-title">Control Charts (Shewhart)</div>
                  <canvas ref={ccChartRef} height="100"></canvas>
                </div>
              )}

              {/* CUSUM / EWMA */}
              {controlChartData && controlChartData.cusum && controlChartData.cusum.labels && (
                <div className="card">
                  <div className="section-title">CUSUM Control Chart</div>
                  <canvas ref={el => { if (el) drawExtraChart(el, controlChartData.cusum, '#8b5cf6', 'CUSUM'); }} height="80"></canvas>
                </div>
              )}
              {controlChartData && controlChartData.ewma && controlChartData.ewma.labels && (
                <div className="card">
                  <div className="section-title">EWMA Control Chart</div>
                  <canvas ref={el => { if (el) drawExtraChart(el, controlChartData.ewma, '#f59e0b', 'EWMA'); }} height="80"></canvas>
                </div>
              )}

              {/* Approve / Reject section */}
              {(viewingJob.status === 'completed' || viewingJob.status === 'pending' || viewingJob.status === 'running') && (
                <div className="card">
                  <div className="section-title">Approval Decision</div>
                  <div className="form-group" style={{ maxWidth: '480px' }}>
                    <label className="form-label">Comments (optional)</label>
                    <textarea className="form-input" style={{ height: '80px', resize: 'vertical', fontFamily: 'inherit' }}
                      value={approveComment} onChange={e => setApproveComment(e.target.value)}
                      placeholder="Enter approval or rejection comments..." />
                  </div>
                  <div className="toolbar">
                    <button className="btn btn-primary" onClick={() => handleApproveReject(viewingJob.id, 'approve')}
                      disabled={processingJobId === viewingJob.id}>{processingJobId === viewingJob.id ? 'Processing…' : 'Approve'}</button>
                    <button className="btn btn-danger" onClick={() => handleApproveReject(viewingJob.id, 'reject')}
                      disabled={processingJobId === viewingJob.id}>{processingJobId === viewingJob.id ? 'Processing…' : 'Reject'}</button>
                  </div>
                </div>
              )}

              {/* Previous Approvals */}
              {viewingJob.approvals?.length > 0 && (
                <div className="card">
                  <div className="section-title">Approval History</div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Decision</th>
                          <th>By</th>
                          <th>Date</th>
                          <th>Comments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingJob.approvals.map((a: any) => (
                          <tr key={a.id}>
                            <td><span className={a.status === 'approved' ? 'badge-success' : 'badge-error'}>{a.status}</span></td>
                            <td>{a.approved_by}</td>
                            <td>{fmtDt(a.approved_at)}</td>
                            <td>{a.comments || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function drawExtraChart(canvas: HTMLCanvasElement, data: any, color: string, label: string) {
  if (!data || !data.labels) return;
  const existing = (canvas as any).__chart;
  if (existing) existing.destroy();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const chart = new ChartJS(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label,
        data: data.values,
        borderColor: color,
        backgroundColor: color + '1A',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: color,
        pointRadius: 2,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#475569', font: { weight: 600, family: 'Inter, sans-serif' as any } } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
      },
    },
  });
  (canvas as any).__chart = chart;
}
