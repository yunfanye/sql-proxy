import { tunnel, bin, install, type Connection } from 'cloudflared';
import * as fs from 'fs';

export interface TunnelInfo {
  url: string;
  stop: () => Promise<void>;
}

async function ensureCloudflaredInstalled(): Promise<void> {
  const binPath = bin;

  if (fs.existsSync(binPath)) {
    console.log('Cloudflared binary found.');
    return;
  }

  console.log('Downloading cloudflared binary (this only happens once)...');
  try {
    await install(binPath);
    console.log('Cloudflared binary installed successfully.');
  } catch (err: any) {
    throw new Error(`Failed to install cloudflared: ${err.message}`);
  }
}

export async function createTunnel(port: number): Promise<TunnelInfo> {
  console.log('Setting up Cloudflare tunnel...');

  // Ensure cloudflared is installed first
  await ensureCloudflaredInstalled();

  console.log('Starting tunnel...');
  const { url, connections, child, stop } = tunnel({ '--url': `localhost:${port}` });

  // Capture stderr for debugging
  let stderrOutput = '';
  child.stderr?.on('data', (data: Buffer) => {
    stderrOutput += data.toString();
  });

  // Handle tunnel process errors
  child.on('error', (err: Error) => {
    console.error('Tunnel process error:', err.message);
  });

  // Wait for the tunnel URL to be available with timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (stderrOutput) {
        console.error('Cloudflared output:', stderrOutput);
      }
      reject(new Error('Tunnel creation timed out after 90 seconds. Check your network connection.'));
    }, 90000);
  });

  try {
    const tunnelUrl = await Promise.race([url, timeoutPromise]);

    // Wait for at least one connection to be established
    Promise.all(connections).then((conns: Connection[]) => {
      if (conns.length > 0) {
        console.log(`Tunnel connected via ${conns[0].location}`);
      }
    }).catch(() => {
      // Ignore connection errors - tunnel may still work
    });

    return {
      url: tunnelUrl,
      stop: async () => {
        stop();
      },
    };
  } catch (err: any) {
    // Clean up on failure
    try {
      stop();
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}
