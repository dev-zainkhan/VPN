import pino from 'pino';
import { config } from './config';

// NEVER log a client IP, device ID, WireGuard public key, tunnel IP, query
// string, request body or token. These rules keep the no-logs promise true.
export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['authorization', 'cookie', 'token', 'password', 'secretAccessKey', 'accessKeyId', '*.token', '*.password'],
    remove: true,
  },
});
