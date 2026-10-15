import { logger } from '../core/logger';
import { j1ProvisionTimeout } from './j1_provisionTimeout';
import { j2ReconcileInstances } from './j2_reconcileInstances';
import { j3AgentSilence } from './j3_agentSilence';
import { j4StaleSessions } from './j4_staleSessions';
import { j5ExpireIntents } from './j5_expireIntents';
import { j6PruneRewards } from './j6_pruneRewards';
import { j7PruneAdminSessions } from './j7_pruneAdminSessions';
import { j8MonthRollover } from './j8_monthRollover';

// A job returns the counts it logs after each run (spec 14.1).
export type Job = { id: string; everyMs: number; run: () => Promise<Record<string, number>> };

// Spec 14.2.
const jobs: Job[] = [
  j1ProvisionTimeout,
  j2ReconcileInstances,
  j3AgentSilence,
  j4StaleSessions,
  j5ExpireIntents,
  j6PruneRewards,
  j7PruneAdminSessions,
  j8MonthRollover,
];

const FIRST_RUN_DELAY_MS = 30 * 1000;
const timers: NodeJS.Timeout[] = [];

function schedule(job: Job) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const counts = await job.run();
      logger.info(counts, `job ${job.id} done`);
    } catch (e) {
      logger.error({ message: e instanceof Error ? e.message : String(e) }, `job ${job.id} failed`);
    } finally {
      running = false;
    }
  };
  timers.push(
    setTimeout(() => {
      void tick();
      timers.push(setInterval(() => void tick(), job.everyMs));
    }, FIRST_RUN_DELAY_MS),
  );
}

export function startScheduler(): void {
  for (const job of jobs) schedule(job);
}

export function stopScheduler(): void {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
}
