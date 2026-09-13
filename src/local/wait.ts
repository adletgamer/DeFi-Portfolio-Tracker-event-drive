import net from "node:net";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkPort(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

/** Wait until a TCP endpoint accepts connections, or throw after the deadline. */
export async function waitForPort(
  endpoint: string,
  label: string,
  attempts = 60,
  intervalMs = 1000
): Promise<void> {
  const url = new URL(endpoint);
  const host = url.hostname;
  const port = Number(url.port);
  for (let i = 0; i < attempts; i++) {
    if (await checkPort(host, port)) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label} at ${endpoint}`);
}
