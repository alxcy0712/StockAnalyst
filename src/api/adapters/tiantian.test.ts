import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFundQuote } from './tiantian';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('getFundQuote', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).jsonpgz;
  });

  it('serializes JSONP requests so concurrent fund refreshes do not overwrite each other', async () => {
    const appendChildSpy = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node) => node);

    const firstRequest = getFundQuote('000001');
    const secondRequest = getFundQuote('000002');
    await flushMicrotasks();

    expect(appendChildSpy).toHaveBeenCalledTimes(1);

    (window as any).jsonpgz({
      fundcode: '000001',
      name: '基金一号',
      dwjz: '1.0000',
      jzrq: '2024-01-01',
    });

    await expect(firstRequest).resolves.toMatchObject({ fundcode: '000001' });
    await flushMicrotasks();

    expect(appendChildSpy).toHaveBeenCalledTimes(2);

    (window as any).jsonpgz({
      fundcode: '000002',
      name: '基金二号',
      dwjz: '1.2000',
      jzrq: '2024-01-01',
    });

    await expect(secondRequest).resolves.toMatchObject({ fundcode: '000002' });
  });
});
