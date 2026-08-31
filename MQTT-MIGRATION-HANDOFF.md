# MQTT Migration Handoff

## Purpose

Use this document as the starting point for the **separate MQTT project/chat**. Do not continue the MQTT implementation in the AMQP discussion thread.

The objective is to build and test a Node-RED Azure IoT Edge MQTT connector that provides the same practical flow functionality as the AMQP connector, while using the correct Azure IoT Edge 1.6-era MQTT client/transport model.

## Current AMQP project context

Repository:
- `https://github.com/developedbymayur/edge-hub-connector`

Current AMQP package:
- `@developedbymayur/node-red-contrib-azure-iot-edge-amqp`
- Current version: `0.5.1`

Current AMQP design:
- Node-RED 5.0.4
- Node.js 24.x in the current test container
- Azure IoT Edge 1.6.x
- Four public Node-RED nodes:
  1. Module Input (AMQP)
  2. Module Output (AMQP)
  3. Module Twin (AMQP)
  4. Module Method (AMQP)
- The connection client is internal and shared; users do not place a separate client node in the flow.

## Important architecture requirement for MQTT

The old MQTT implementation had the desired user model:

```text
One Node-RED runtime
        |
        +-- Module Input
        +-- Module Output
        +-- Module Twin / other route-based nodes
        |
        +----> ONE shared MQTT client/connection
```

Multiple nodes should reuse the same underlying connection. Node names/configuration should identify the relevant EdgeHub route/input/output rather than creating a separate transport connection for every node.

The MQTT implementation should preserve existing functional behavior as far as the Azure IoT Edge 1.6 platform and MQTT transport allow.

## What the new MQTT chat must do first

Before writing MQTT code:

1. Retrieve and inspect the relevant Azure IoT Edge 1.6 source repository/modules.
2. Read the **actual Edge Hub and Edge Agent 1.6 code/configuration paths** relevant to MQTT protocol heads, authentication, local module communication, routing, and cloud forwarding.
3. Identify which Node.js/Azure IoT SDK and MQTT transport APIs are actually supported for IoT Edge modules in the target environment.
4. Do not assume the old MQTT SDK behavior is still valid just because it worked with an older IoT Edge release.
5. Compare the current AMQP implementation only for user-facing functionality and Node-RED behavior; do not blindly copy its transport internals.

## Repository strategy

Use the current repository only as a reference/starting point. For the MQTT work:

- Inspect the current AMQP repository and preserve useful Node-RED UX patterns.
- Create a **separate MQTT repository/fork/project** rather than mixing MQTT and AMQP production code in the same package.
- Keep the AMQP repository focused on the working AMQP connector.
- The MQTT repository should have its own package name, tests, README, CI, examples, and release/versioning strategy.

Suggested direction for the separate repository name:
- `node-red-contrib-azure-iot-edge-mqtt`

Do not create the new repository merely by renaming files. Re-evaluate the architecture against Azure IoT Edge 1.6 first.

## Target functionality

The MQTT project should aim to support the functionality that is appropriate and currently required:

### Module Input

Receive messages from a named EdgeHub module input/route and emit them into Node-RED.

### Module Output

Send `msg.payload` to a named EdgeHub module output so that EdgeHub can route it locally or upstream to IoT Hub.

### Module Twin

Support module twin desired-property reception and reported-property updates if the chosen MQTT/API path supports them correctly.

### Module Method

Determine from Azure IoT Edge 1.6 and the supported MQTT/API path whether direct methods are supported through the same MQTT mechanism. If not, document the platform/API limitation rather than emulating unsupported behavior.

## Key test requirements

The MQTT project must not be considered production-ready until the following are tested:

1. Basic local EdgeHub MQTT connection.
2. Module Input message reception.
3. Module Output to EdgeHub.
4. EdgeHub route to Azure IoT Hub cloud.
5. Multiple Node-RED nodes using one shared MQTT client.
6. Node-RED restart without requiring a source-module restart.
7. EdgeHub startup after Node-RED.
8. Node-RED startup after EdgeHub.
9. MQTT disconnect/reconnect without restarting Node-RED.
10. Listener/subscription restoration after reconnect.
11. Cloud outage/store-and-forward behavior where applicable.
12. Twin behavior if supported by the final MQTT architecture.
13. Direct method behavior if supported by the final MQTT architecture.
14. Long-running stability.

## Test record format

Maintain a running table throughout the MQTT project:

| TC | Test Case | Status | Remarks |
|---|---|---|---|
| TC-01 | Basic MQTT connection | | |
| TC-02 | Module input | | |
| TC-03 | Module output | | |
| TC-04 | Cloud telemetry | | |
| TC-05 | Shared client with multiple nodes | | |
| TC-06 | Node-RED restart | | |
| TC-07 | Startup ordering | | |
| TC-08 | MQTT disconnect/reconnect | | |
| TC-09 | Listener restoration | | |
| TC-10 | Cloud outage/store-and-forward | | |
| TC-11 | Twin | | |
| TC-12 | Direct method | | |
| TC-13 | Payload compatibility | | |
| TC-14 | Long-running stability | | |

Record the exact commands/logs/evidence for each test rather than relying only on visual confirmation.

## Important lessons from AMQP testing

The clean AMQP test exposed that a working SDK-level connection is not enough. The Node-RED lifecycle must also be tested.

The MQTT project should therefore explicitly test:

```text
Node-RED process
    |
    +--> shared client lifecycle
    |
    +--> subscriptions/listeners
    |
    +--> send path
    |
    +--> reconnect
    |
    +--> restoration after reconnect
```

Do not treat a successful `connect()` call as proof that the Node-RED integration is production-ready.

## Production-readiness expectations

Before publishing the MQTT package:

- Clean package contents through `npm pack --dry-run`.
- Automated unit/smoke tests.
- Behavioral tests for shared-client lifecycle.
- CI across supported Node.js versions.
- Clear README with Edge 1.6 requirements and limitations.
- Example Node-RED flow.
- No secrets or connection strings committed.
- Explicit documentation of which operations use MQTT and which require another mechanism.
- Palette Manager readiness only after local testing passes.

## Relationship to the AMQP project

The AMQP connector is currently working end-to-end for telemetry in the user's Azure IoT Edge 1.6 test environment. Do not destabilize that repository while building MQTT.

The AMQP flow currently demonstrated:

```text
SimulatedTemperatureSensor
        -> EdgeHub
        -> NodeRedData Module Input
        -> NodeRedData Module Output
        -> EdgeHub
        -> IoT Hub
```

The MQTT project should reproduce the necessary user-facing flow behavior where the platform supports it, while using the correct MQTT transport/API architecture for Azure IoT Edge 1.6.

## Starting command sequence for the new MQTT chat

The next chat should proceed one command/step at a time:

1. Retrieve this handoff file.
2. Retrieve the current AMQP repository metadata/files for reference.
3. Retrieve the Azure IoT Edge 1.6 source and relevant SDK documentation.
4. Summarize the supported MQTT architecture and constraints.
5. Decide the new repository/fork structure.
6. Only then begin implementation.

Do not start coding MQTT before steps 1-4 are complete.
