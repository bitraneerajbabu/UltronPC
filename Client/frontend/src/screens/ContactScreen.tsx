import React, { useContext } from 'react';
import { AppContext } from '../context/AppContext';

const s: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '14px',
    marginBottom: '16px',
  },
  card: {
    background: '#fff',
    borderRadius: '10px',
    padding: '18px 20px',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  heading: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#0f766e',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '1px',
  },
  value: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 1.5,
  },
  offices: {
    padding: '12px 0 0 18px',
    borderLeft: '2px solid rgba(15,118,110,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
};

const IconWrapper = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: '30px', height: '30px', background: 'rgba(15,118,110,0.08)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {children}
  </div>
);

const PhoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const ContactScreen = () => {
  const { currentUser, localVersion } = useContext(AppContext);

  return (
    <div className="screen active" id="contactScreen">
      <div className="card">
        <div className="section-title">Contact Us</div>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px', lineHeight: 1.6 }}>
          Welcome, <strong style={{ color: '#0f172a' }}>{currentUser}</strong>. For any assistance, please reach out to our support team.
        </p>

        <div style={s.grid}>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><PhoneIcon /></IconWrapper> Support Helpline</div>
            <div style={s.value}>7659091468, 9133377852, 853</div>
          </div>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><PhoneIcon /></IconWrapper> Sales Enquiries</div>
            <div style={s.value}>8801231166, 9133377852</div>
          </div>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><MailIcon /></IconWrapper> Email</div>
            <div style={s.value}>tst@sunshinetechno.com</div>
          </div>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><GlobeIcon /></IconWrapper> Website</div>
            <div style={s.value}>sunshinetechno.com</div>
          </div>
        </div>

        <div style={{ ...s.card, flexDirection: 'row', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '180px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <IconWrapper><MapPinIcon /></IconWrapper>
              <div style={s.heading}>Our Offices</div>
            </div>
            <div style={s.offices}>
              <div>
                <div style={s.label}>Registered</div>
                <div style={s.value}>#4-7-83, Flat No. 403-404, Kalanjali Classic, Scientist Colony, Habsiguda, Hyderabad &ndash; 500007</div>
              </div>
              <div>
                <div style={s.label}>Corporate</div>
                <div style={s.value}>#213, Fairmount Fortune One, 7-2-1813/5/A/1, Czech Colony, Sanath Nagar, Hyderabad &ndash; 500018</div>
              </div>
              <div>
                <div style={s.label}>Branch &mdash; Visakhapatnam</div>
                <div style={s.value}>#413, Dattathreya Enclave, Siddhartha Nagar, Kurmannapalem, Andhra Pradesh &ndash; 530046</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '14px', padding: '16px 20px', background: 'linear-gradient(135deg, rgba(15,118,110,0.05) 0%, rgba(13,148,136,0.08) 100%)', borderRadius: '10px', border: '1px solid rgba(15,118,110,0.12)' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f766e', textAlign: 'center', marginBottom: '4px' }}>
            UltrON Industrial Monitoring Platform
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
            Real-time telemetry, CPCB compliance, and alarm management system.
            <br />Developed by{' '}
            <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#0f766e', fontWeight: '600', textDecoration: 'none' }}>
              Sunshine Technologies
            </a>
            {localVersion && <> &mdash; v{localVersion}</>}
          </div>
        </div>
      </div>
    </div>
  );
};
