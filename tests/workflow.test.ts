import { describe, expect, it, vi } from 'vitest';
import type { ConnectedAppleClient } from '../src/appleClient';
import type { ConnectionState } from '../src/domain';
import { HideMyEmailWorkflow, type WorkflowPort } from '../src/workflow';

function setup() {
  let state: ConnectionState = {
    status: 'ready',
    setupUrl: 'https://setup.icloud.com/setup/ws/1',
    serviceUrl: 'https://p123-maildomainws.icloud.com',
  };
  const port: WorkflowPort = {
    getConnection: vi.fn(async () => state),
    saveConnection: vi.fn(async (next) => {
      state = next;
    }),
    deliver: vi.fn(async () => 'clipboard' as const),
    notify: vi.fn(async () => undefined),
  };
  const connected: ConnectedAppleClient = {
    setupUrl: 'https://setup.icloud.com/setup/ws/1',
    serviceUrl: 'https://p123-maildomainws.icloud.com',
  };
  const client = {
    connect: vi.fn(async () => connected),
    generate: vi.fn(async () => 'candidate@icloud.com'),
    reserve: vi.fn(async () => 'candidate@icloud.com'),
  };
  return { port, client };
}

describe('HideMyEmailWorkflow', () => {
  it('reserves once with a normalized label, then delivers and notifies', async () => {
    const { port, client } = setup();
    const workflow = new HideMyEmailWorkflow(port, () => client);
    await workflow.generateForTab(7, 'https://www.Example.com:8443/path?q=1');
    expect(client.reserve).toHaveBeenCalledOnce();
    expect(client.reserve).toHaveBeenCalledWith('candidate@icloud.com', 'example.com');
    expect(port.deliver).toHaveBeenCalledWith('candidate@icloud.com', 7, false);
    expect(port.notify).toHaveBeenLastCalledWith(
      'Hide My Email created',
      expect.stringContaining('candidate@icloud.com')
    );
  });

  it('delivers to a focused input when requested', async () => {
    const { port, client } = setup();
    vi.mocked(port.deliver).mockResolvedValueOnce('input');
    const workflow = new HideMyEmailWorkflow(port, () => client);
    await workflow.generateForTab(7, 'https://example.com', { preferInput: true });
    expect(port.deliver).toHaveBeenCalledWith('candidate@icloud.com', 7, true);
    expect(port.notify).toHaveBeenLastCalledWith(
      'Hide My Email created',
      'candidate@icloud.com was inserted into the focused field and copied to your clipboard.'
    );
  });

  it('never delivers an unconfirmed candidate', async () => {
    const { port, client } = setup();
    client.reserve.mockRejectedValueOnce(new Error('not reserved'));
    const workflow = new HideMyEmailWorkflow(port, () => client);
    await expect(workflow.generateForTab(7, 'https://example.com')).rejects.toThrow();
    expect(port.deliver).not.toHaveBeenCalled();
  });

  it('suppresses simultaneous commands in the same tab', async () => {
    const { port, client } = setup();
    let release: (() => void) | undefined;
    client.generate.mockImplementationOnce(
      () => new Promise<string>((resolve) => (release = () => resolve('candidate@icloud.com')))
    );
    const workflow = new HideMyEmailWorkflow(port, () => client);
    const first = workflow.generateForTab(7, 'https://example.com');
    await expect(workflow.generateForTab(7, 'https://example.com')).rejects.toMatchObject({
      code: 'already_in_progress',
    });
    release?.();
    await first;
    expect(client.reserve).toHaveBeenCalledOnce();
  });
});
