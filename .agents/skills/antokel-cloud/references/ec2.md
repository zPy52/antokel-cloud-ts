# EC2

## Overview

Use `aws.EC2()` for EC2 instance lookup and instance lifecycle actions. The README documents regex-based lookup plus an `Instance(...)` configuration flow for existing or new instances.

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
});
```

This pattern targets an existing instance by ID.

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
});
```

The README documents `mode` as `"spot" | "on-demand"`.

### Lifecycle Actions

```ts
await instance.create();
await instance.start();
await instance.stop();
await instance.terminate();
```

Use these exact method names in generated code and explanations.

## Important Caveats

- Keep configuration examples within the fields explicitly shown in the README.
- Do not add undocumented lifecycle helpers or provisioning fields.
- If the user only needs lookup, use `findByNameRegex(...)` instead of creating an instance wrapper.

## Request Mapping

- “Find workers by name” -> `ec2.findByNameRegex("worker-.+")`
- “Operate on an existing instance” -> `ec2.Instance({ id }).start()/stop()/terminate()`
- “Define and create a new instance” -> `ec2.Instance({ name, machine, mode, keyPair, securityGroups, ami, userData }).create()`
