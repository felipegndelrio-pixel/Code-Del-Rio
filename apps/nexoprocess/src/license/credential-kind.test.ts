import { describe, expect, it } from 'vitest';
import { looksLikeGumroadLicenseKey, looksLikePaddleTransactionId } from './credential-kind';

describe('credential-kind', () => {
  it('id de transação da Paddle: txn_ + 26 a-z0-9, com espaços e maiúsculas tolerados', () => {
    expect(looksLikePaddleTransactionId('txn_01hv8wptq8987qeep44cyrewp9')).toBe(true);
    expect(looksLikePaddleTransactionId('  TXN_01HV8WPTQ8987QEEP44CYREWP9 ')).toBe(true);
    for (const v of ['', 'txn_', 'txn_01hv8wptq8987qeep44cyrewp', 'txn_01hv8wptq8987qeep44cyrewp99', 'txn_01hv8wptq8987qeep44cyrewp-', 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4', 'RGRGrgrgRGRGrgrg-_91Qw']) {
      expect(looksLikePaddleTransactionId(v), v).toBe(false);
    }
  });
  it('license key da Gumroad: 4 grupos de 8 hexadecimais (8-8-8-8)', () => {
    expect(looksLikeGumroadLicenseKey('8DEEBF5A-EA2B4829-91D1C0D8-DFE2B03A')).toBe(true);
    expect(looksLikeGumroadLicenseKey(' 8deebf5a-ea2b4829-91d1c0d8-dfe2b03a ')).toBe(true);
    for (const v of ['', '8DEEBF5A-EA2B4829-91D1C0D8', '8DEEBF5A-EA2B4829-91D1C0D8-DFE2B03A-1', '8DEEBF5A-EA2B4829-91D1C0D8-DFE2B03G', '8DEEBF5AEA2B482991D1C0D8DFE2B03A', 'txn_01hv8wptq8987qeep44cyrewp9']) {
      expect(looksLikeGumroadLicenseKey(v), v).toBe(false);
    }
  });
});
