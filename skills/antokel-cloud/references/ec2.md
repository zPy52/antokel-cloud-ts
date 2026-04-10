# EC2

## Overview

Use `aws.EC2()` for EC2 instance lookup, lifecycle actions, and Linux-only SSH command execution backed by detached `screen` sessions.

## Setup Pattern

```ts
const ec2 = aws.EC2();
```

## Common Tasks

### Find Instances by Name Regex

```ts
const instances = await ec2.findByNameRegex("worker-.+");
```

Use this when the user wants to discover instances by a naming pattern.

### Manage an Existing Instance

```ts
const instance = ec2.Instance({
  id: "i-0abc123",
  ssh: {
    user: "ubuntu",
    privateKeyPath: "/Users/me/.ssh/my-worker.pem",
  },
});
```

Use `id` when the instance already exists. `ssh` is required only for remote command execution.

### Configure a New Instance

```ts
const instance = ec2.Instance({
  name: "my-worker",
  machine: "t4g.micro",
  mode: "spot",
  keyPair: "my-keypair",
  securityGroups: ["sg-01234"],
  ami: "ami-0c55b159cbfafe1f0",
  userData: "#!/bin/bash\necho hello",
  ssh: {
    user: "ubuntu",
    privateKeyPem: process.env.MY_WORKER_PRIVATE_KEY_PEM,
  },
});
```

The README documents `mode` as `"spot" | "on-demand"`.

### Create and Read the Instance ID

```ts
const instanceId = await instance.create();

console.log(instanceId);
console.log(instance.id); // same value after create()
```

`create()` returns the instance ID. If the instance already had an `id`, `create()` returns it without launching anything new.

### Lifecycle Actions

```ts
await instance.start();
await instance.stop();
await instance.terminate();
```

Use these exact method names in generated code and explanations.

### Run a Remote Command

```ts
const remote = await instance.run("npm run worker", {
  sessionName: "my-screen",
  workingDirectory: "/srv/app",
  env: {
    NODE_ENV: "production",
  },
});

console.log(await remote.status());
console.log(await remote.readOutput());

const finished = await remote.wait({ timeoutMs: 60_000 });
console.log(finished.exitCode, finished.output);
```

The returned `SubmoduleEc2RemoteCommand` is a tracked command handle, not a live interactive terminal.

### Stop or Reattach a Session

```ts
await remote.stop();
// manual reattach on the instance:
// screen -r my-screen
```

`stop()` sends `screen -S <sessionName> -X quit`.

## Important Caveats

- Remote command execution is Linux-only in v1.
- The EC2 instance must already be in the `running` state before `run(...)`.
- The remote instance must already have `bash` and `screen` installed.
- SSH requires `ssh.user` plus either `ssh.privateKeyPath` or `ssh.privateKeyPem`.
- `.ppk` keys are not supported in v1; use PEM/OpenSSH keys.
- `keyPair` is used for instance creation only. It is not used as SSH authentication.
- If `ssh.host` is omitted, host resolution uses public DNS/IP first, then private IP. Set `preferPrivateIp: true` to flip that order.

## Request Mapping

- “Find workers by name” -> `ec2.findByNameRegex("worker-.+")`
- “Operate on an existing instance” -> `ec2.Instance({ id }).start()/stop()/terminate()`
- “Create an instance and read its ID” -> `const id = await ec2.Instance(config).create()`
- “Run a command on a running EC2 instance” -> `ec2.Instance({ id, ssh }).run("...", options)`
- “Check remote command output” -> `remote.status()/readOutput()/wait()/stop()`
