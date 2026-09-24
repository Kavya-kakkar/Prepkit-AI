import { describe, it, expect } from 'vitest';
import { isPrivateOrBlockedIp, validateSafeUrl, extractCleanText } from '../src/retrieval/safeFetch.js';

describe('SSRF Safety & URL Validation', () => {
  it('blocks private IPv4 addresses in strict mode', () => {
    expect(isPrivateOrBlockedIp('127.0.0.1', 'strict')).toBe(true);
    expect(isPrivateOrBlockedIp('10.0.0.1', 'strict')).toBe(true);
    expect(isPrivateOrBlockedIp('172.16.0.1', 'strict')).toBe(true);
    expect(isPrivateOrBlockedIp('172.31.255.255', 'strict')).toBe(true);
    expect(isPrivateOrBlockedIp('192.168.1.100', 'strict')).toBe(true);
  });

  it('ALWAYS blocks AWS/GCP cloud metadata IP (169.254.169.254) regardless of policy', () => {
    expect(isPrivateOrBlockedIp('169.254.169.254', 'strict')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.169.254', 'allow-local')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.1.1', 'allow-local')).toBe(true);
  });

  it('allows public IP addresses', () => {
    expect(isPrivateOrBlockedIp('8.8.8.8', 'strict')).toBe(false);
    expect(isPrivateOrBlockedIp('93.184.216.34', 'strict')).toBe(false);
  });

  it('allows localhost only under allow-local policy for testing', () => {
    expect(isPrivateOrBlockedIp('127.0.0.1', 'allow-local')).toBe(false);
  });

  it('rejects disallowed protocols like file://, ftp://, gopher://', async () => {
    const resFile = await validateSafeUrl('file:///etc/passwd');
    expect(resFile.valid).toBe(false);
    expect(resFile.reason).toContain('Disallowed protocol');

    const resFtp = await validateSafeUrl('ftp://example.com/file');
    expect(resFtp.valid).toBe(false);
  });

  it('rejects cloud metadata hostname aliases', async () => {
    const res = await validateSafeUrl('http://169.254.169.254/latest/meta-data/');
    expect(res.valid).toBe(false);

    const resGcp = await validateSafeUrl('http://metadata.google.internal/computeMetadata/v1/');
    expect(resGcp.valid).toBe(false);
  });

  it('extractCleanText strips script, style tags and decodes entities', () => {
    const html = `
      <html>
        <head><style>body { color: red; }</style></head>
        <body>
          <script>alert("attack");</script>
          <h1>Senior &amp; Lead Engineer</h1>
          <p>We are hiring at Acme &lt;Corp&gt;.</p>
        </body>
      </html>
    `;
    const cleaned = extractCleanText(html);
    expect(cleaned).not.toContain('alert');
    expect(cleaned).not.toContain('color: red');
    expect(cleaned).toContain('Senior & Lead Engineer');
    expect(cleaned).toContain('We are hiring at Acme <Corp>.');
  });
});
