import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../core/http';
import { getSettings, saveSettings, settingsView } from '../settings/settings.service';
import { writeAudit } from './audit';

const putBody = z.object({
  minutesPerAd: z.number().int().min(1).max(240),
  starterMinutes: z.number().int().min(0).max(1440),
  dailyFreeMinutes: z.number().int().min(0).max(1440),
  maxAdsPerDay: z.number().int().min(1).max(100),
  lowMinutesWarning: z.number().int().min(1).max(120),
  defaultProtocol: z.enum(['auto', 'udp', 'tcp']),
  supportEmail: z.string().trim().email().max(254).nullable(),
});

export const settingsAdminRouter = Router();

settingsAdminRouter.get(
  '/settings',
  ah(async (_req, res) => {
    res.json(settingsView(await getSettings()));
  }),
);

settingsAdminRouter.put(
  '/settings',
  ah(async (req, res) => {
    const body = parse(putBody, req.body);
    const out = await saveSettings(body);
    await writeAudit(req.admin!.id, 'settings.update', 'settings', '1', body);
    res.json(out);
  }),
);
