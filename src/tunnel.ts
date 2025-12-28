import { tunnel, Connection } from 'cloudflared';

export interface TunnelInfo {
  url: string;
  stop: () => Promise<void>;
}

export async function createTunnel(port: number): Promise<TunnelInfo> {
  console.log('Creating Cloudflare tunnel...');

  const { url, connections, child, stop } = tunnel({ port });

  // Wait for the tunnel URL to be available
  const tunnelUrl = await url;

  // Wait for at least one connection to be established
  Promise.all(connections).then((conns: Connection[]) => {
    if (conns.length > 0) {
      console.log(`Tunnel connected via ${conns[0].location}`);
    }
  }).catch(() => {
    // Ignore connection errors - tunnel may still work
  });

  // Handle tunnel process errors
  child.on('error', (err: Error) => {
    console.error('Tunnel error:', err.message);
  });

  return {
    url: tunnelUrl,
    stop: async () => {
      await stop();
    },
  };
}
