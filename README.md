# Azure IoT Edge AMQP nodes for Node-RED

This package provides Node-RED nodes for communicating with the local Azure IoT Edge Hub using the Azure IoT Node.js SDK over AMQP.

It was developed as an AMQP-based replacement for the older MQTT-based Azure IoT Edge Node-RED integration and has been validated against Azure IoT Edge 1.6.0 and Node-RED 5.0.4.

## Requirements

- Azure IoT Edge 1.6.x
- Node-RED 5.x
- Node.js 18 or newer
- The module must run as an IoT Edge module so the standard `IOTEDGE_*` environment variables are available.
- Edge Hub AMQP endpoint must be enabled (the standard EdgeHub deployment exposes port 5671).

No special connection string is required. Authentication is obtained through the standard IoT Edge environment/workload identity flow used by `ModuleClient.fromEnvironment()`.

## Nodes

### Edge Client (AMQP)

Creates and keeps the shared Azure IoT Edge `ModuleClient` connected over AMQP. This node is useful when you want an explicit connection/status node in a flow.

### Module Input (AMQP)

Receives messages from an EdgeHub input endpoint and emits them into the Node-RED flow.

Configure the input name, for example `OpcPublisher` or `SimulatedTemperatureSensor`.

JSON payloads are parsed into JavaScript objects. Non-JSON payloads remain strings.

### Module Output (AMQP)

Sends a Node-RED message to an EdgeHub module output using `sendOutputEvent()`.

For object payloads the message is encoded as JSON. Buffer payloads are sent as UTF-8 text.

### Module Twin (AMQP)

Connects to the module twin, emits desired-property updates, and sends `msg.payload` as reported-property updates.

### Module Method (AMQP)

Registers a direct-method handler and exposes the incoming method request as a Node-RED message. A subsequent input message is used as the method response.

## Installing from the Node-RED Palette Manager

The package must be published to the public npm registry and submitted to the Node-RED Flow Library before it can be discovered by the Palette Manager.

Once it is listed, open **Manage palette → Install** in Node-RED and search for this package.

For local testing before publication:

```bash
npm install /path/to/node-red-contrib-azure-iot-edge-amqp
```

Then restart Node-RED.

## Azure IoT Edge routing

A typical deployment routes module output to the cloud with an EdgeHub route such as:

```json
{
  "NodeRedDatatoUpstream": "FROM /messages/modules/NodeRedData/outputs/* INTO $upstream"
}
```

The module talks only to the local EdgeHub. EdgeHub is responsible for forwarding the message upstream to Azure IoT Hub.

## Example flow

See `examples/basic-amqp-flow.json` for a minimal input/output flow.

## Compatibility note

The original MQTT-based Azure IoT Edge Node-RED module path does not work in the tested EdgeHub 1.6 environment used during development. The AMQP path is the validated transport for this package.

## Development

Run the local package checks with:

```bash
npm test
npm run pack:check
```

The package only publishes runtime sources, examples, README, and license files.

## License

MIT
