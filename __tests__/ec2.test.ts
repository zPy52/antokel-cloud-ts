import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DescribeInstancesCommand,
  RunInstancesCommand,
} from '@aws-sdk/client-ec2';

import {
  SubmoduleEc2Instance,
  SubmoduleEc2RemoteCommand,
  SubmoduleEc2SshTerminal,
} from '../src/aws/ec2';

function createClient(sendImpl?: (command: unknown) => Promise<unknown>) {
  return {
    send: sendImpl ?? (async () => ({})),
    config: {},
  } as any;
}

function createRuntimeDependencies(overrides?: Partial<Record<string, unknown>>) {
  return {
    createTemporaryKeyFile: async () => ({
      path: '/tmp/test-key.pem',
      cleanup: async () => {},
    }),
    now: () => 1712345678901,
    randomSuffix: () => 'abc123',
    runProcess: async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
    }),
    sleep: async () => {},
    ...overrides,
  } as any;
}

function createDescribeResponse(
  overrides?: Partial<{
    state: string;
    publicDnsName: string;
    publicIpAddress: string;
    privateIpAddress: string;
  }>,
) {
  return {
    Reservations: [
      {
        Instances: [
          {
            InstanceId: 'i-123',
            State: { Name: overrides?.state ?? 'running' },
            PublicDnsName: overrides?.publicDnsName,
            PublicIpAddress: overrides?.publicIpAddress ?? '1.2.3.4',
            PrivateIpAddress: overrides?.privateIpAddress ?? '10.0.0.10',
          },
        ],
      },
    ],
  };
}

test('SubmoduleEc2Instance.create returns an existing id without calling AWS', async () => {
  let sendCount = 0;
  const instance = new SubmoduleEc2Instance(
    createClient(async () => {
      sendCount += 1;
      return {};
    }),
    { id: 'i-existing' },
  );

  const instanceId = await instance.create();

  assert.equal(instanceId, 'i-existing');
  assert.equal(instance.id, 'i-existing');
  assert.equal(sendCount, 0);
});

test('SubmoduleEc2Instance.create returns a new id and updates instance.id', async () => {
  const sent: unknown[] = [];
  const instance = new SubmoduleEc2Instance(
    createClient(async (command) => {
      sent.push(command);
      return {
        Instances: [{ InstanceId: 'i-created' }],
      };
    }),
    {
      machine: 't4g.micro',
      keyPair: 'my-key',
      securityGroups: ['sg-1'],
      mode: 'spot',
      userData: '#!/bin/bash\necho hi',
    },
  );

  const instanceId = await instance.create();

  assert.equal(instanceId, 'i-created');
  assert.equal(instance.id, 'i-created');
  assert.equal(sent.length, 1);
  assert.ok(sent[0] instanceof RunInstancesCommand);
});

test('SubmoduleEc2Instance.create throws when AWS does not return an instance id', async () => {
  const instance = new SubmoduleEc2Instance(
    createClient(async () => ({
      Instances: [{}],
    })),
    {
      machine: 't4g.micro',
      keyPair: 'my-key',
    },
  );

  await assert.rejects(instance.create(), /did not return an instance ID/);
  assert.equal(instance.id, undefined);
});

test('SubmoduleEc2SshTerminal.run validates instance id, user, and private key input', async () => {
  const runtimeDependencies = createRuntimeDependencies();

  const missingId = new SubmoduleEc2SshTerminal(
    createClient(),
    {
      instanceId: '',
      user: 'ubuntu',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );
  await assert.rejects(missingId.run('echo hi'), /instanceId/);

  const missingUser = new SubmoduleEc2SshTerminal(
    createClient(async () => createDescribeResponse()),
    {
      instanceId: 'i-123',
      user: '',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );
  await assert.rejects(missingUser.run('echo hi'), /`user`/);

  const missingKey = new SubmoduleEc2SshTerminal(
    createClient(async () => createDescribeResponse()),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKey: '',
    },
    runtimeDependencies,
  );
  await assert.rejects(missingKey.run('echo hi'), /`privateKey`/);
});

test('SubmoduleEc2SshTerminal.run rejects instances that are not running or have no host', async () => {
  const runtimeDependencies = createRuntimeDependencies();

  const stopped = new SubmoduleEc2SshTerminal(
    createClient(async () => createDescribeResponse({ state: 'stopped' })),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );
  await assert.rejects(stopped.run('echo hi'), /running/);

  const missingHost = new SubmoduleEc2SshTerminal(
    createClient(async () =>
      createDescribeResponse({
        publicIpAddress: '',
        privateIpAddress: '',
        publicDnsName: '',
      }),
    ),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );
  await assert.rejects(missingHost.run('echo hi'), /Could not resolve an SSH host/);
});

test('SubmoduleEc2SshTerminal.run resolves public host by default and private host when requested', async () => {
  const sshCalls: Array<{ command: string; args: string[] }> = [];
  const runtimeDependencies = createRuntimeDependencies({
    runProcess: async (command: string, args: string[]) => {
      sshCalls.push({ command, args });
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    },
  });

  const publicFirst = new SubmoduleEc2SshTerminal(
    createClient(async () => createDescribeResponse({ publicDnsName: 'ec2.example.com' })),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );

  await publicFirst.run('echo hi', { sessionName: 'public-session' });

  const privateFirst = new SubmoduleEc2SshTerminal(
    createClient(async () => createDescribeResponse({ publicDnsName: 'ec2.example.com' })),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      preferPrivateIp: true,
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );

  await privateFirst.run('echo hi', { sessionName: 'private-session' });

  assert.equal(sshCalls[0]?.command, 'ssh');
  assert.equal(sshCalls[0]?.args[sshCalls[0].args.length - 2], 'ubuntu@ec2.example.com');
  assert.equal(sshCalls[1]?.args[sshCalls[1].args.length - 2], 'ubuntu@10.0.0.10');
});

test('SubmoduleEc2SshTerminal.run honors explicit host and builds the detached screen command', async () => {
  const sshCalls: Array<{ command: string; args: string[] }> = [];
  const tempPemInputs: string[] = [];
  let cleanupCount = 0;

  const runtimeDependencies = createRuntimeDependencies({
    createTemporaryKeyFile: async (pem: string) => {
      tempPemInputs.push(pem);
      return {
        path: '/tmp/generated-key.pem',
        cleanup: async () => {
          cleanupCount += 1;
        },
      };
    },
    runProcess: async (command: string, args: string[]) => {
      sshCalls.push({ command, args });
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    },
  });

  const terminal = new SubmoduleEc2SshTerminal(
    createClient(async (command) => {
      if (command instanceof DescribeInstancesCommand) {
        return createDescribeResponse({
          publicDnsName: 'ignored.example.com',
        });
      }

      return {};
    }),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      host: 'manual-host.example.com',
      port: 2222,
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    },
    runtimeDependencies,
  );

  const remote = await terminal.run('npm run worker', {
    sessionName: 'my-screen',
    workingDirectory: '/srv/app',
    env: {
      NODE_ENV: 'production',
    },
  });

  const call = sshCalls[0];
  const remoteCommand = call.args[call.args.length - 1];

  assert.equal(remote.sessionName, 'my-screen');
  assert.equal(remote.host, 'manual-host.example.com');
  assert.equal(remote.instanceId, 'i-123');
  assert.equal(call.command, 'ssh');
  assert.deepEqual(call.args.slice(0, 8), [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-i',
    '/tmp/generated-key.pem',
    '-p',
  ]);
  assert.equal(call.args[8], '2222');
  assert.equal(call.args[9], 'ubuntu@manual-host.example.com');
  assert.match(remoteCommand, /screen -dmS/);
  assert.match(remoteCommand, /my-screen/);
  assert.match(remoteCommand, /screen is required on the remote instance/);
  assert.match(remoteCommand, /\$HOME\/\.antokel-cloud\/ec2\/my-screen/);
  assert.match(remoteCommand, /output\.log/);
  assert.match(remoteCommand, /exit\.code/);
  assert.match(remoteCommand, /\/srv\/app/);
  assert.match(remoteCommand, /export NODE_ENV/);
  assert.match(remoteCommand, /production/);
  assert.match(remoteCommand, /npm run worker/);
  assert.deepEqual(tempPemInputs, [
    '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
  ]);
  assert.equal(cleanupCount, 1);
});

test('SubmoduleEc2SshTerminal.run accepts privateKey file paths without creating a temporary key', async () => {
  const sshCalls: Array<{ command: string; args: string[] }> = [];
  let createTemporaryKeyFileCount = 0;

  const terminal = new SubmoduleEc2SshTerminal(
    createClient(async () => createDescribeResponse({ publicDnsName: 'ec2.example.com' })),
    {
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKey: '/Users/me/.ssh/my-worker.pem',
    },
    createRuntimeDependencies({
      createTemporaryKeyFile: async () => {
        createTemporaryKeyFileCount += 1;
        return {
          path: '/tmp/generated-key.pem',
          cleanup: async () => {},
        };
      },
      runProcess: async (command: string, args: string[]) => {
        sshCalls.push({ command, args });
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
    }),
  );

  await terminal.run('echo hi', { sessionName: 'path-key-session' });

  assert.equal(createTemporaryKeyFileCount, 0);
  assert.equal(sshCalls[0]?.args[6], '/Users/me/.ssh/my-worker.pem');
});

test('SubmoduleEc2RemoteCommand status, output, stop, and wait use ssh-backed polling', async () => {
  const sshCommands: string[] = [];
  let statusCount = 0;
  let sleepCount = 0;
  let nowValue = 1000;

  const remote = new SubmoduleEc2RemoteCommand(
    {
      host: 'ec2.example.com',
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKeyPath: '/tmp/key.pem',
    } as any,
    'my-screen',
    createRuntimeDependencies({
      now: () => {
        nowValue += 50;
        return nowValue;
      },
      runProcess: async (_command: string, args: string[]) => {
        const remoteCommand = args[args.length - 1];
        sshCommands.push(remoteCommand);

        if (remoteCommand.includes('finished:%s')) {
          statusCount += 1;
          return {
            exitCode: 0,
            stdout: statusCount === 1 ? 'running' : 'finished:7',
            stderr: '',
          };
        }

        if (remoteCommand.includes('tail -n 5')) {
          return {
            exitCode: 0,
            stdout: 'line 1\nline 2\n',
            stderr: '',
          };
        }

        if (remoteCommand.includes('cat "$OUTPUT_FILE"')) {
          return {
            exitCode: 0,
            stdout: 'full output',
            stderr: '',
          };
        }

        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
      sleep: async () => {
        sleepCount += 1;
      },
    }),
  );

  const firstStatus = await remote.status();
  const tailedOutput = await remote.readOutput({ tailLines: 5 });
  const waited = await remote.wait({ pollIntervalMs: 10, timeoutMs: 500 });
  await remote.stop();

  assert.deepEqual(firstStatus, { state: 'running' });
  assert.equal(tailedOutput, 'line 1\nline 2\n');
  assert.deepEqual(waited, {
    exitCode: 7,
    output: 'full output',
  });
  assert.equal(sleepCount, 0);
  assert.ok(sshCommands.some((command) => command.includes('finished:%s')));
  assert.ok(sshCommands.some((command) => command.includes('tail -n 5')));
  assert.ok(sshCommands.some((command) => command.includes('cat "$OUTPUT_FILE"')));
  assert.ok(
    sshCommands.some(
      (command) =>
        command.includes('screen -S') &&
        command.includes('my-screen') &&
        command.includes('-X quit'),
    ),
  );
});

test('SubmoduleEc2RemoteCommand.wait rejects when the remote session disappears', async () => {
  const remote = new SubmoduleEc2RemoteCommand(
    {
      host: 'ec2.example.com',
      instanceId: 'i-123',
      user: 'ubuntu',
      privateKeyPath: '/tmp/key.pem',
    } as any,
    'gone-session',
    createRuntimeDependencies({
      runProcess: async () => ({
        exitCode: 0,
        stdout: 'missing',
        stderr: '',
      }),
    }),
  );

  await assert.rejects(remote.wait({ pollIntervalMs: 1, timeoutMs: 5 }), /missing/);
});
