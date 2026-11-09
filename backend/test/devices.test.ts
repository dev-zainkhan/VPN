import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('../src/core/db', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../src/modules/settings/settings.service', () => ({
  getSettings: mocks.getSettings,
}));

import { registerDevice } from '../src/modules/devices/devices.service';

const tx = {
  abuseKey: { upsert: vi.fn(), update: vi.fn() },
  device: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  walletEntry: { create: vi.fn() },
};

const registration = {
  abuseKey: 'a'.repeat(64),
  platform: 'android' as const,
  appVersion: '1.0.2',
};

describe('device registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((run) => run(tx));
    tx.abuseKey.upsert.mockResolvedValue({ blocked: false, starterGranted: true });
    tx.device.findFirst.mockResolvedValue(null);
    mocks.getSettings.mockResolvedValue({ starterMinutes: 60 });
  });

  it('reuses the phone device and retains its adjusted balance after reinstall', async () => {
    const existing = { id: 'existing-device', balanceSeconds: 1275 };
    tx.device.findFirst.mockResolvedValue(existing);
    tx.device.update.mockResolvedValue({ ...existing, appVersion: registration.appVersion });

    const result = await registerDevice(registration);

    expect(result.deviceId).toBe(existing.id);
    expect(result.balanceSeconds).toBe(existing.balanceSeconds);
    expect(tx.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({ appVersion: registration.appVersion }),
      }),
    );
    expect(tx.device.create).not.toHaveBeenCalled();
    expect(tx.walletEntry.create).not.toHaveBeenCalled();
  });

  it('grants starter minutes to a newly registered phone', async () => {
    tx.abuseKey.upsert.mockResolvedValue({ blocked: false, starterGranted: false });
    tx.device.create.mockResolvedValue({ id: 'new-device', balanceSeconds: 3600 });

    const result = await registerDevice(registration);

    expect(result).toMatchObject({ deviceId: 'new-device', balanceSeconds: 3600, blocked: false });
    expect(tx.abuseKey.update).toHaveBeenCalledWith({
      where: { keyHash: expect.any(String) },
      data: { starterGranted: true },
    });
    expect(tx.walletEntry.create).toHaveBeenCalledWith({
      data: { deviceId: 'new-device', seconds: 3600, reason: 'starter' },
    });
  });
});
