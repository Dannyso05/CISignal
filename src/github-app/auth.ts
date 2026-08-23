import { createSign } from "node:crypto";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createGitHubAppJwt(appId: string, privateKey: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000) - 60;
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: issuedAt, exp: issuedAt + 600, iss: appId })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

export async function createInstallationToken(input: {
  appId: string;
  privateKey: string;
  installationId: number;
  fetcher?: typeof fetch;
}): Promise<string> {
  const response = await (input.fetcher ?? fetch)(`https://api.github.com/app/installations/${input.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${createGitHubAppJwt(input.appId, input.privateKey)}`,
      "User-Agent": "CISignal-GitHub-App/0.1",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const value = await response.json() as { token?: string };
  if (!value.token) throw new Error("GitHub installation token response did not include a token");
  return value.token;
}
