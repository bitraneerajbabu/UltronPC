import { describe, it, expect } from 'vitest';
import { T, PARAM_STATE, getParamState, PROTO, BTN } from '../theme';

describe('theme', () => {
  it('exports core design tokens', () => {
    expect(T.primary).toBe('#0F6E56');
    expect(T.error).toBe('#E24B4A');
    expect(T.success).toBe('#1D9E75');
    expect(T.fontBase).toContain('Inter');
  });

  it('PARAM_STATE has expected shapes', () => {
    expect(PARAM_STATE.good.cls).toBe('sensor-card-good');
    expect(PARAM_STATE.offline.badge).toBe('OFFLINE');
    expect(PARAM_STATE.critical.dot).toBe('#E24B4A');
  });

  it('getParamState returns good for null livePoint', () => {
    const param = { alarm_enabled: true, alarm_high: 100 };
    expect(getParamState(param, null)).toBe(PARAM_STATE.offline);
  });

  it('PROTO includes expected protocols', () => {
    expect(PROTO.modbus_tcp.label).toBe('Modbus TCP');
    expect(PROTO.csv.label).toBe('CSV Watch');
  });

  it('BTN.primary has gradient background', () => {
    expect(BTN.primary.background).toContain('linear-gradient');
    expect(BTN.primary.color).toBe('#fff');
  });
});
