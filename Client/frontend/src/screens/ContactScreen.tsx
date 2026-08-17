import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { IconPhone, IconMail, IconGlobe, IconMapPin } from '@tabler/icons-react';

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
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  heading: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--primary-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '1px',
  },
  value: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
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
  <IconPhone size={15} stroke={2.2} color="var(--primary-600)" />
);

const MailIcon = () => (
  <IconMail size={15} stroke={2.2} color="var(--primary-600)" />
);

const GlobeIcon = () => (
  <IconGlobe size={15} stroke={2.2} color="var(--primary-600)" />
);

const MapPinIcon = () => (
  <IconMapPin size={15} stroke={2.2} color="var(--primary-600)" />
);

export const ContactScreen = React.memo(() => {
  const { currentUser } = useContext(AppContext);
  const [localVersion, setLocalVersion] = useState('');
  useEffect(() => { fetch('/api/v1/version').then(r => r.ok ? r.json() : {version:''}).then(d => setLocalVersion(d.version || '')).catch(() => {}); }, []);

  return (
    <div className="screen active" id="contactScreen">
      <div className="card">
        <div className="section-title">Contact Us</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.6 }}>
          Welcome, <strong style={{ color: 'var(--text-primary)' }}>{currentUser}</strong>. For any assistance, please reach out to our support team.
        </p>

        <div style={s.grid}>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><PhoneIcon /></IconWrapper> Support Helpline</div>
            <div style={s.value}>7659091468, 9133377852, 853</div>
          </div>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><PhoneIcon /></IconWrapper> Sales Enquiries</div>
            <div style={s.value}>8801231166, 9133377854</div>
          </div>
          <div style={s.card}>
            <div style={s.heading}><IconWrapper><MailIcon /></IconWrapper> Email</div>
            <div style={s.value}>tst@sunshinetechno.com, support@sunshinetechno.com, service@sunshinetechno.com</div>
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
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary-600)', textAlign: 'center', marginBottom: '4px' }}>
            UltrON Industrial Monitoring Platform
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            Real-time telemetry, CPCB compliance, and alarm management system.
            <br />Developed by{' '}
            <a href="https://sunshinetechno.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-600)', fontWeight: '600', textDecoration: 'none' }}>
              Neeraj
            </a>
            {localVersion && <> &mdash; v{localVersion}</>}
          </div>
        </div>
      </div>
    </div>
  );
});
