import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../../core/config';
import { sha256Hex } from '../../core/crypto';
import { logger } from '../../core/logger';

export const EDGE_FILE_NAMES = ['veil_agent.py', 'veil_tcpgw.py', 'fw.sh'] as const;
export type EdgeFileName = (typeof EDGE_FILE_NAMES)[number];

const files = new Map<string, { body: string; sha: string }>();

// Edge servers run Linux: a Windows checkout's CRLF would break fw.sh, so lines are normalized.
export function readEdgeText(name: string): string {
  return readFileSync(path.resolve(config.EDGE_FILES_DIR, name), 'utf8').replace(/\r\n/g, '\n');
}

// 11.6: called once at startup; a missing file stops the API.
export function loadEdgeFiles(): void {
  for (const name of EDGE_FILE_NAMES) {
    try {
      const body = readEdgeText(name);
      files.set(name, { body, sha: sha256Hex(body) });
    } catch {
      logger.fatal({ file: name, dir: config.EDGE_FILES_DIR }, 'edge file missing');
      process.exit(1);
    }
  }
}

function entry(name: EdgeFileName) {
  if (!files.has(name)) loadEdgeFiles();
  return files.get(name)!;
}

export function isEdgeFileName(name: string): name is EdgeFileName {
  return (EDGE_FILE_NAMES as readonly string[]).includes(name);
}

export const getEdgeFile = (name: EdgeFileName) => entry(name).body;
export const edgeSha = (name: EdgeFileName) => entry(name).sha;
