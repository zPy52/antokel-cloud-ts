import {
  EC2Client,
  DescribeInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  _InstanceType as Ec2InstanceType,
} from '@aws-sdk/client-ec2';

export interface Ec2InstanceConfig {
  id?: string;
  name?: string;
  machine?: string;
  mode?: 'spot' | 'on-demand';
  keyPair?: string;
  securityGroups?: string[];
  ami?: string;
  userData?: string;
}

export class SubmoduleEc2Instance {
  constructor(
    private ec2Client: EC2Client,
    private config: Ec2InstanceConfig,
  ) {}

  public async create(): Promise<void> {
    if (this.config.id) return; // already exists
    if (!this.config.machine || !this.config.keyPair) {
      throw new Error('Machine type and keyPair are required to create a new instance.');
    }

    const runCmd = new RunInstancesCommand({
      ImageId: this.config.ami || 'ami-0c55b159cbfafe1f0', // Default example Amazon Linux
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
    if (instanceId) {
      this.config.id = instanceId;
    }
  }

  public async start(): Promise<void> {
    if (!this.config.id) throw new Error('No instance ID.');
    await this.ec2Client.send(new StartInstancesCommand({ InstanceIds: [this.config.id] }));
  }

  public async stop(): Promise<void> {
    if (!this.config.id) throw new Error('No instance ID.');
    await this.ec2Client.send(new StopInstancesCommand({ InstanceIds: [this.config.id] }));
  }

  public async terminate(): Promise<void> {
    if (!this.config.id) throw new Error('No instance ID.');
    await this.ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [this.config.id] }));
  }
}

export class Ec2Wrapper {
  constructor(private ec2Client: EC2Client) {}

  public Instance(config: Ec2InstanceConfig): SubmoduleEc2Instance {
    return new SubmoduleEc2Instance(this.ec2Client, config);
  }

  public async findByNameRegex(regexPattern: string): Promise<SubmoduleEc2Instance[]> {
    const resp = await this.ec2Client.send(new DescribeInstancesCommand({}));
    const instances: SubmoduleEc2Instance[] = [];
    const regex = new RegExp(regexPattern);

    resp.Reservations?.forEach((res: any) => {
      res.Instances?.forEach((inst: any) => {
        const nameTag = inst.Tags?.find((t: any) => t.Key === 'Name')?.Value;
        if (nameTag && regex.test(nameTag) && inst.InstanceId) {
          instances.push(
            this.Instance({
              id: inst.InstanceId,
              name: nameTag,
              machine: inst.InstanceType,
            }),
          );
        }
      });
    });

    return instances;
  }
}
