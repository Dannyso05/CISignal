export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  publicUrl: string;
  blobToken?: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function githubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig {
  return {
    appId: required(env, "GITHUB_APP_ID"),
    privateKey: required(env, "GITHUB_APP_PRIVATE_KEY").replaceAll("\\n", "\n"),
    webhookSecret: required(env, "GITHUB_WEBHOOK_SECRET"),
    publicUrl: (env.CISIGNAL_PUBLIC_URL?.trim() || "https://ci-signal.vercel.app").replace(/\/$/, ""),
    blobToken: env.BLOB_READ_WRITE_TOKEN?.trim() || undefined,
  };
}

export function githubAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_WEBHOOK_SECRET);
}
