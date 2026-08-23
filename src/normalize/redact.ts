const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi, "[REDACTED:possible-secret]"],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED:possible-secret]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED:possible-secret]"],
  [/\b(?:sk|rk|pk)_[A-Za-z0-9]{20,}\b/g, "[REDACTED:possible-secret]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED:possible-secret]"],
  [/\b(?:api[_-]?key|password|passwd|client[_-]?secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED:possible-secret]"],
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}
