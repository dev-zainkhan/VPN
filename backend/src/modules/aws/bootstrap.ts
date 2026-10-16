import { config } from '../../core/config';
import { edgeSha, readEdgeText } from '../agent/edgeFiles';

let template: string | null = null;

// 12.6 step 6: the setup script for one server (EC2 user data, or the install command's script).
export function renderBootstrap(serverId: string, bootstrapToken: string): string {
  template ??= readEdgeText('bootstrap.sh.tpl');
  const values: Record<string, string> = {
    API_BASE: config.PUBLIC_BASE_URL,
    SERVER_ID: serverId,
    BOOTSTRAP_TOKEN: bootstrapToken,
    AGENT_SHA256: edgeSha('veil_agent.py'),
    TCPGW_SHA256: edgeSha('veil_tcpgw.py'),
    FW_SHA256: edgeSha('fw.sh'),
  };
  let script = template;
  for (const [key, value] of Object.entries(values)) script = script.replaceAll(`{{${key}}}`, value);
  return script;
}

export function renderUserData(serverId: string, bootstrapToken: string): string {
  return Buffer.from(renderBootstrap(serverId, bootstrapToken), 'utf8').toString('base64');
}
