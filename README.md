# Azure IoT Edge AMQP nodes for Node-RED

This package provides Node-RED nodes for communicating with the local Azure IoT Edge Hub using the Azure IoT Node.js SDK over AMQP.

It is an AMQP-based replacement for the older MQTT-based Azure IoT Edge Node-RED integration and has been validated against Azure IoT Edge 1.6.0 and Node-RED 5.0.4.

## Requirements

- Azure IoT Edge 1.6.x
- Node-RED 5.x
- Node.js 18 or newer
- The module must run as an IoT Edge module so the standard `IOTEDGE_*` environment variables are available.
- Edge Hub AMQP endpoint must be enabled (the standard EdgeHub deployment exposes port 5671).

No connection string is required. Authentication is obtained through the standard IoT Edge workload identity flow used by `ModuleClient.fromEnvironment()`.

## Shared client and startup behavior

All AMQP nodes in one Node-RED runtime share a single `ModuleClient` connection. Input/output/twin/method nodes only differ by the route, input, output, or method name configured on the node.

The shared client is resilient to startup ordering: if Node-RED starts before EdgeHub is ready, the package keeps retrying the AMQP connection with backoff. If an established connection is lost, the package reconnects and restores registered input, method, and twin listeners without requiring a Node-RED restart.

## Nodes

### Edge Client (AMQP)

Enables the shared Azure IoT Edge AMQP client and exposes connection status in the flow.

### Module Input (AMQP)

Receives messages from a named EdgeHub input endpoint and emits them into the Node-RED flow.

Configure the input name, for example `OpcPublisher` or `SimulatedTemperatureSensor`.

JSON payloads are parsed into JavaScript objects. Non-JSON payloads remain strings.

### Module Output (AMQP)

Sends a Node-RED message to a named EdgeHub module output using `sendOutputEvent()`.

For object payloads the message is encoded as JSON. Buffer payloads are sent as UTF-8 text.

### Module Twin (AMQP)

Connects to the module twin, emits desired-property updates, and sends `msg.payload` as reported-property updates.

### Module Method (AMQP)

Registers a direct-method handler and exposes the incoming method request as a Node-RED message. A subsequent input message is used as the method response.

## Installing from the Node-RED Palette Manager

The package must be published to the public npm registry and submitted to the Node-RED Flow Library before it can be discovered by the Palette Manager.

For local testing before publication:

```bash
npm install /path/to/developedbymayur-node-red-contrib-azure-iot-edge-amqp-0.5.0.tgz
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

## Development

Run the local package checks with:

```bash
npm test
npm run pack:check
```

The package only publishes runtime sources, examples, README, and license files.

## License

MIT
