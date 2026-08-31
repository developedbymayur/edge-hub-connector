# Azure IoT Edge AMQP and MQTT nodes for Node-RED

This package provides Node-RED nodes for communicating with the local Azure IoT Edge Hub using the Azure IoT Node.js SDK over **AMQP or MQTT**.

The MQTT implementation is intended as the replacement path for older Node-RED Azure IoT Edge MQTT integrations that depend on outdated SDKs or fragile MQTT lifecycle handling. It is designed for Azure IoT Edge 1.6.x and Node-RED 5.x.

## Requirements

- Azure IoT Edge 1.6.x
- Node-RED 5.x
- Node.js 18 or newer
- The module must run as an IoT Edge module so the standard `IOTEDGE_*` environment variables are available.
- For AMQP, Edge Hub AMQP must be enabled (standard port 5671).
- For MQTT, Edge Hub MQTT must be enabled (standard port 8883).

No connection string is required. Authentication is obtained through the standard IoT Edge workload identity flow used by `ModuleClient.fromEnvironment()`.

## Transport choices

The package exposes two independent node families:

- **AMQP**: `moduletwin-amqp`, `moduleinput-amqp`, `moduleoutput-amqp`, `modulemethod-amqp`
- **MQTT**: `moduletwin-mqtt`, `moduleinput-mqtt`, `moduleoutput-mqtt`, `modulemethod-mqtt`

The MQTT nodes use Microsoft's `azure-iot-device-mqtt` transport rather than implementing the Edge Hub MQTT protocol directly. This keeps authentication, MQTT topics, twin handling, direct methods, SAS renewal, and transport behavior aligned with the supported Azure IoT Node.js SDK.

## Shared client and startup behavior

All nodes in one transport family within a Node-RED runtime share one `ModuleClient` connection. There is no connection node to place in a flow.

The shared managers are resilient to startup ordering. If Node-RED starts before Edge Hub is ready, they retry the connection with bounded exponential backoff. If an established connection is lost, they create a fresh client, reconnect through the Edge workload identity flow, and restore registered input, method, and twin listeners.

The MQTT manager specifically listens for the SDK transport `disconnect` event and does not rely on Node-RED or Edge Agent startup ordering for recovery.

## MQTT nodes

### Module Input (MQTT)

Receives messages from a named Edge Hub module input.

Configure the input name, for example `OpcPublisher` or `SimulatedTemperatureSensor`.

JSON payloads are parsed into JavaScript objects. Non-JSON payloads remain strings.

### Module Output (MQTT)

Sends `msg.payload` to a named Edge Hub module output using the SDK `sendOutputEvent()` API.

Object payloads are serialized as JSON. Strings and buffers are sent as UTF-8 content.

### Module Twin (MQTT)

Connects to the module twin, emits desired-property updates, and sends `msg.payload` as reported-property updates.

### Module Method (MQTT)

Registers a direct-method handler and exposes the incoming method request as a Node-RED message. A subsequent input message is used as the method response.

## Edge Hub MQTT protocol

The MQTT transport is implemented by Microsoft's Azure IoT Node.js SDK. Relevant Edge Hub protocol endpoints include:

```text
Module output:
devices/<deviceId>/modules/<moduleId>/messages/events/

Module input:
devices/<deviceId>/modules/<moduleId>/inputs/<inputName>

Direct methods:
$iothub/methods/POST/#
$iothub/methods/res/<status>/?$rid=<requestId>

Twin:
$iothub/twin/...
```

Module output names are supplied to the SDK as the output name, which the MQTT transport maps to Edge Hub's MQTT message properties. The package does not hard-code device IDs, module IDs, SAS credentials, or workload API credentials.

## Authentication

When running as an IoT Edge module, `ModuleClient.fromEnvironment(Mqtt)` uses the standard Edge workload environment and `IotEdgeAuthenticationProvider`. The workload API supplies the trust bundle and signs the SAS material through iotedged.

This means the Node-RED flow does not need a connection string or a manually managed MQTT password.

## Azure IoT Edge routing

The Node-RED module communicates with the local Edge Hub. Edge Hub routes messages locally or upstream according to the deployment's `$edgeHub` routes.

For example, a module output can be routed upstream with a deployment route similar to:

```json
{
  "NodeRedDatatoUpstream": "FROM /messages/modules/NodeRedData/outputs/* INTO $upstream"
}
```

Store-and-forward behavior remains an Edge Hub responsibility; the Node-RED connector does not attempt to replace Edge Hub routing.

## Example MQTT flow

A minimal flow can be built as:

```text
Module Input (MQTT: OpcPublisher)
        |
        v
     processing
        |
        v
Module Output (MQTT: output1)
```

See `examples/basic-mqtt-flow.json` for a minimal example.

## Development

Install dependencies and run:

```bash
npm test
npm run pack:check
```

The CI workflow tests Node.js 18, 20, 22, and 24 and checks the npm package contents.

## Package contents

The published package includes the runtime sources, examples, README, and license. Both AMQP and MQTT entry points are registered with Node-RED.

## License

MIT
