import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  _InstanceType as Ec2InstanceType,
  type Instance as AwsEc2Instance,
} from '@aws-sdk/client-ec2';

export interface Ec2InstanceSshConfig {
  user: string;
  privateKeyPem?: string;
  privateKeyPath?: string;
  host?: string;
  port?: number;
  preferPrivateIp?: boolean;
}

export interface Ec2InstanceConfig {
  id?: string;
  name?: string;
  machine?: string;
  mode?: 'spot' | 'on-demand';
  keyPair?: string;
  securityGroups?: string[];
  ami?: string;
  userData?: string;
  ssh?: Ec2InstanceSshConfig;
}

export interface Ec2RunCommandOptions {
  sessionName?: string;
  workingDirectory?: string;
  shell?: string;
  env?: Record<string, string>;
}

export interface Ec2RemoteCommandStatus {
  state: 'running' | 'finished' | 'missing';
  exitCode?: number;
}

export interface Ec2RemoteCommandResult {
  exitCode: number;
  output: string;
}

interface ProcessExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface TemporaryKeyFile {
  path: string;
  cleanup: () => Promise<void>;
}

interface Ec2RuntimeDependencies {
  createTemporaryKeyFile: (pem: string) => Promise<TemporaryKeyFile>;
  now: () => number;
  randomSuffix: () => string;
  runProcess: (command: string, args: string[]) => Promise<ProcessExecutionResult>;
  sleep: (ms: number) => Promise<void>;
}

interface Ec2DescribeInstanceDetails {
  instance: AwsEc2Instance;
  host: string | undefined;
  privateHost: string | undefined;
  publicHost: string | undefined;
  state: string | undefined;
}

interface Ec2ResolvedSshConfig {
  host: string;
  instanceId: string;
  port?: number;
  privateKeyPath?: string;
  privateKeyPem?: string;
  user: string;
}

const DEFAULT_REMOTE_ROOT = '$HOME/.antokel-cloud/ec2';

const DEFAULT_RUNTIME_DEPENDENCIES: Ec2RuntimeDependencies = {
  async createTemporaryKeyFile(pem: string) {
    const dir = await mkdtemp(join(tmpdir(), 'antokel-cloud-ec2-'));
    const path = join(dir, 'id.pem');
    await writeFile(path, pem, 'utf8');
    await chmod(path, 0o600);

    return {
      path,
      cleanup: async () => {
        await rm(dir, { force: true, recursive: true });
      },
    };
  },
  now: () => Date.now(),
  randomSuffix: () => randomBytes(4).toString('hex'),
  async runProcess(command: string, args: string[]) {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    return await new Promise<ProcessExecutionResult>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  },
  sleep: (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

function assertSupportedPrivateKey(privateKeyPath?: string, privateKeyPem?: string): void {
  if (privateKeyPath?.toLowerCase().endsWith('.ppk')) {
    throw new Error('PuTTY .ppk keys are not supported. Provide a PEM/OpenSSH private key.');
  }
  if (privateKeyPem?.includes('PuTTY-User-Key-File-')) {
    throw new Error('PuTTY .ppk keys are not supported. Provide PEM/OpenSSH private key content.');
  }
}

function assertValidEnv(env?: Record<string, string>): void {
  if (!env) return;

  for (const key of Object.keys(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment variable name: ${key}`);
    }
  }
}

function escapeForDoubleQuotes(value: string): string {
  return value.replace(/["\\$`]/g, '\\$&');
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildSessionName(now: number, randomSuffix: string): string {
  return `antokel-${now}-${randomSuffix}`;
}

function getRemoteSessionDirectory(sessionName: string): string {
  return `${DEFAULT_REMOTE_ROOT}/${escapeForDoubleQuotes(sessionName)}`;
}

function getPreferredHost(instance: AwsEc2Instance, preferPrivateIp: boolean): string | undefined {
  const publicHost = instance.PublicDnsName || instance.PublicIpAddress;
  const privateHost = instance.PrivateIpAddress;
  return preferPrivateIp ? privateHost || publicHost : publicHost || privateHost;
}

function buildEnvExports(env?: Record<string, string>): string[] {
  if (!env) return [];
  return Object.entries(env).map(([key, value]) => `export ${key}=${shellEscape(value)}`);
}

function buildRemoteCommandScript(
  command: string,
  sessionName: string,
  options?: Ec2RunCommandOptions,
): string {
  assertValidEnv(options?.env);

  const sessionDir = getRemoteSessionDirectory(sessionName);
  const logFile = `${sessionDir}/output.log`;
  const exitFile = `${sessionDir}/exit.code`;
  const shell = options?.shell || '/bin/bash';
  const commandSteps: string[] = [];

  if (options?.workingDirectory) {
    commandSteps.push(`cd ${shellEscape(options.workingDirectory)}`);
  }
  commandSteps.push(...buildEnvExports(options?.env));
  commandSteps.push(command);

  const detachedCommand = [
    '{',
    ...commandSteps,
    `} > ${shellEscape(logFile)} 2>&1`,
    'EXIT_CODE=$?',
    `printf '%s' "$EXIT_CODE" > ${shellEscape(exitFile)}`,
    'exit "$EXIT_CODE"',
  ].join('; ');

  const outerScript = [
    'command -v screen >/dev/null 2>&1 || { echo "screen is required on the remote instance." >&2; exit 1; }',
    `SESSION_DIR="${sessionDir}"`,
    'mkdir -p "$SESSION_DIR"',
    `screen -dmS ${shellEscape(sessionName)} ${shellEscape(shell)} -lc ${shellEscape(detachedCommand)}`,
  ].join('; ');

  return `bash -lc ${shellEscape(outerScript)}`;
}

function buildStatusScript(sessionName: string): string {
  const sessionDir = getRemoteSessionDirectory(sessionName);
  const exitFile = `${sessionDir}/exit.code`;

  const script = [
    `SESSION_DIR="${sessionDir}"`,
    `EXIT_FILE=${shellEscape(exitFile)}`,
    'if [ -f "$EXIT_FILE" ]; then',
    `  printf 'finished:%s' "$(cat "$EXIT_FILE")"`,
    'elif command -v screen >/dev/null 2>&1 && screen -ls | grep -F -- ' +
      `${shellEscape(`.${sessionName}`)} >/dev/null 2>&1; then`,
    "  printf 'running'",
    'else',
    "  printf 'missing'",
    'fi',
  ].join('; ');

  return `bash -lc ${shellEscape(script)}`;
}

function buildReadOutputScript(sessionName: string, tailLines?: number): string {
  const sessionDir = getRemoteSessionDirectory(sessionName);
  const outputFile = `${sessionDir}/output.log`;
  const readCommand = tailLines ? `tail -n ${tailLines}` : 'cat';
  const script = [
    `OUTPUT_FILE=${shellEscape(outputFile)}`,
    'if [ -f "$OUTPUT_FILE" ]; then',
    `  ${readCommand} "$OUTPUT_FILE"`,
    'fi',
  ].join('; ');

  return `bash -lc ${shellEscape(script)}`;
}

function buildStopScript(sessionName: string): string {
  const script = [
    'if command -v screen >/dev/null 2>&1; then',
    `  screen -S ${shellEscape(sessionName)} -X quit || true`,
    'fi',
  ].join('; ');

  return `bash -lc ${shellEscape(script)}`;
}

async function runSshCommand(
  sshConfig: Ec2ResolvedSshConfig,
  remoteCommand: string,
  runtimeDependencies: Ec2RuntimeDependencies,
): Promise<string> {
  assertSupportedPrivateKey(sshConfig.privateKeyPath, sshConfig.privateKeyPem);

  let temporaryKeyFile: TemporaryKeyFile | undefined;
  const args = ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];

  try {
    if (sshConfig.privateKeyPath) {
      args.push('-i', sshConfig.privateKeyPath);
    } else if (sshConfig.privateKeyPem) {
      temporaryKeyFile = await runtimeDependencies.createTemporaryKeyFile(sshConfig.privateKeyPem);
      args.push('-i', temporaryKeyFile.path);
    } else {
      throw new Error('SSH requires either `privateKeyPem` or `privateKeyPath`.');
    }

    if (sshConfig.port) {
      args.push('-p', String(sshConfig.port));
    }

    args.push(`${sshConfig.user}@${sshConfig.host}`, remoteCommand);

    const result = await runtimeDependencies.runProcess('ssh', args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `ssh exited with code ${result.exitCode}`);
    }

    return result.stdout;
  } finally {
    await temporaryKeyFile?.cleanup();
  }
}

export class SubmoduleEc2RemoteCommand {
  public readonly host: string;
  public readonly instanceId: string;
  public readonly sessionName: string;

  constructor(
    sshConfig: Ec2ResolvedSshConfig,
    sessionName: string,
    private runtimeDependencies: Ec2RuntimeDependencies = DEFAULT_RUNTIME_DEPENDENCIES,
  ) {
    this.host = sshConfig.host;
    this.instanceId = sshConfig.instanceId;
    this.sessionName = sessionName;
    this.sshConfig = sshConfig;
  }

  private sshConfig: Ec2ResolvedSshConfig;

  public async readOutput(options?: { tailLines?: number }): Promise<string> {
    const tailLines = options?.tailLines;
    if (tailLines !== undefined && (!Number.isInteger(tailLines) || tailLines <= 0)) {
      throw new Error('`tailLines` must be a positive integer.');
    }

    return runSshCommand(
      this.sshConfig,
      buildReadOutputScript(this.sessionName, tailLines),
      this.runtimeDependencies,
    );
  }

  public async status(): Promise<Ec2RemoteCommandStatus> {
    const raw = (
      await runSshCommand(this.sshConfig, buildStatusScript(this.sessionName), this.runtimeDependencies)
    ).trim();

    if (raw.startsWith('finished:')) {
      const exitCode = Number(raw.slice('finished:'.length));
      return {
        state: 'finished',
        exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
      };
    }

    if (raw === 'running') {
      return { state: 'running' };
    }

    return { state: 'missing' };
  }

  public async stop(): Promise<void> {
    await runSshCommand(this.sshConfig, buildStopScript(this.sessionName), this.runtimeDependencies);
  }

  public async wait(options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  }): Promise<Ec2RemoteCommandResult> {
    const pollIntervalMs = options?.pollIntervalMs ?? 1000;
    const timeoutMs = options?.timeoutMs;
    const startedAt = this.runtimeDependencies.now();

    while (true) {
      const currentStatus = await this.status();
      if (currentStatus.state === 'finished') {
        return {
          exitCode: currentStatus.exitCode ?? 0,
          output: await this.readOutput(),
        };
      }

      if (currentStatus.state === 'missing') {
        throw new Error(`Remote session "${this.sessionName}" is missing.`);
      }

      if (timeoutMs !== undefined && this.runtimeDependencies.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for remote session "${this.sessionName}".`);
      }

      await this.runtimeDependencies.sleep(pollIntervalMs);
    }
  }
}

export class SubmoduleEc2Instance {
  private _id: string | undefined;

  constructor(
    private ec2Client: EC2Client,
    private config: Ec2InstanceConfig,
    private runtimeDependencies: Ec2RuntimeDependencies = DEFAULT_RUNTIME_DEPENDENCIES,
  ) {
    this._id = config.id;
  }

  public get id(): string | undefined {
    return this._id;
  }

  public async create(): Promise<string> {
    if (this.id) return this.id;
    if (!this.config.machine || !this.config.keyPair) {
      throw new Error('Machine type and keyPair are required to create a new instance.');
    }

    const runCmd = new RunInstancesCommand({
      ImageId: this.config.ami || 'ami-0c55b159cbfafe1f0',
      InstanceType: this.config.machine as Ec2InstanceType,
      KeyName: this.config.keyPair,
      MinCount: 1,
      MaxCount: 1,
      SecurityGroupIds: this.config.securityGroups,
      UserData: this.config.userData
        ? Buffer.from(this.config.userData).toString('base64')
        : undefined,
      InstanceMarketOptions: this.config.mode === 'spot' ? { MarketType: 'spot' } : undefined,
    });

    const resp = await this.ec2Client.send(runCmd);
    const instanceId = resp.Instances?.[0]?.InstanceId;
    if (!instanceId) {
      throw new Error('AWS did not return an instance ID for the created EC2 instance.');
    }

    this.setId(instanceId);
    return instanceId;
  }

  public async run(
    command: string,
    options?: Ec2RunCommandOptions,
  ): Promise<SubmoduleEc2RemoteCommand> {
    if (!this.id) {
      throw new Error('No instance ID.');
    }

    const ssh = this.config.ssh;
    if (!ssh) {
      throw new Error('SSH configuration is required to run remote commands.');
    }
    if (!ssh.user) {
      throw new Error('`ssh.user` is required to run remote commands.');
    }
    if (!ssh.privateKeyPath && !ssh.privateKeyPem) {
      throw new Error('SSH requires either `ssh.privateKeyPem` or `ssh.privateKeyPath`.');
    }

    assertSupportedPrivateKey(ssh.privateKeyPath, ssh.privateKeyPem);

    const instanceDetails = await this.describeCurrentInstance();
    if (instanceDetails.state !== 'running') {
      throw new Error('Remote commands can only run while the EC2 instance is in the `running` state.');
    }

    const host =
      ssh.host ||
      getPreferredHost(instanceDetails.instance, ssh.preferPrivateIp === true);
    if (!host) {
      throw new Error('Could not resolve an SSH host for this EC2 instance.');
    }

    const sessionName =
      options?.sessionName ||
      buildSessionName(this.runtimeDependencies.now(), this.runtimeDependencies.randomSuffix());

    const resolvedSshConfig: Ec2ResolvedSshConfig = {
      host,
      instanceId: this.id,
      port: ssh.port,
      privateKeyPath: ssh.privateKeyPath,
      privateKeyPem: ssh.privateKeyPem,
      user: ssh.user,
    };

    await runSshCommand(
      resolvedSshConfig,
      buildRemoteCommandScript(command, sessionName, options),
      this.runtimeDependencies,
    );

    return new SubmoduleEc2RemoteCommand(
      resolvedSshConfig,
      sessionName,
      this.runtimeDependencies,
    );
  }

  public async start(): Promise<void> {
    if (!this.id) throw new Error('No instance ID.');
    await this.ec2Client.send(new StartInstancesCommand({ InstanceIds: [this.id] }));
  }

  public async stop(): Promise<void> {
    if (!this.id) throw new Error('No instance ID.');
    await this.ec2Client.send(new StopInstancesCommand({ InstanceIds: [this.id] }));
  }

  public async terminate(): Promise<void> {
    if (!this.id) throw new Error('No instance ID.');
    await this.ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [this.id] }));
  }

  private async describeCurrentInstance(): Promise<Ec2DescribeInstanceDetails> {
    if (!this.id) {
      throw new Error('No instance ID.');
    }

    const resp = await this.ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [this.id],
      }),
    );

    const instance = resp.Reservations?.flatMap((reservation) => reservation.Instances || []).find(
      (candidate) => candidate.InstanceId === this.id,
    );

    if (!instance) {
      throw new Error(`Could not find EC2 instance "${this.id}".`);
    }

    const publicHost = instance.PublicDnsName || instance.PublicIpAddress;
    const privateHost = instance.PrivateIpAddress;

    return {
      instance,
      host: getPreferredHost(instance, this.config.ssh?.preferPrivateIp === true),
      privateHost,
      publicHost,
      state: instance.State?.Name,
    };
  }

  private setId(instanceId: string): void {
    this._id = instanceId;
    this.config.id = instanceId;
  }
}

export class Ec2Wrapper {
  constructor(
    private ec2Client: EC2Client,
    private runtimeDependencies: Ec2RuntimeDependencies = DEFAULT_RUNTIME_DEPENDENCIES,
  ) {}

  public Instance(config: Ec2InstanceConfig): SubmoduleEc2Instance {
    return new SubmoduleEc2Instance(this.ec2Client, config, this.runtimeDependencies);
  }

  public async findByNameRegex(regexPattern: string): Promise<SubmoduleEc2Instance[]> {
    const resp = await this.ec2Client.send(new DescribeInstancesCommand({}));
    const instances: SubmoduleEc2Instance[] = [];
    const regex = new RegExp(regexPattern);

    resp.Reservations?.forEach((reservation) => {
      reservation.Instances?.forEach((instance) => {
        const nameTag = instance.Tags?.find((tag) => tag.Key === 'Name')?.Value;
        if (nameTag && regex.test(nameTag) && instance.InstanceId) {
          instances.push(
            this.Instance({
              id: instance.InstanceId,
              machine: instance.InstanceType,
              name: nameTag,
            }),
          );
        }
      });
    });

    return instances;
  }
}
