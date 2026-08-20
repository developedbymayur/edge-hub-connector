'use strict';

const { ModuleClient, Message } = require('azure-iot-device');
const { Amqp } = require('azure-iot-device-amqp');

let clientPromise = null;
let edgeClient = null;
let moduleTwin = null;
let closeRequested = false;

function getClient() {
    if (edgeClient) {
        return Promise.resolve(edgeClient);
    }

    if (!clientPromise) {
        clientPromise = new Promise((resolve, reject) => {
            ModuleClient.fromEnvironment(Amqp, (createError, client) => {
                if (createError) {
                    clientPromise = null;
                    reject(createError);
                    return;
                }

                edgeClient = client;
                client.on('error', (error) => {
                    // Keep the shared client alive; individual Node-RED nodes report errors.
                    if (!closeRequested) {
                        console.error('edge-hub-connector: AMQP client error:', error);
                    }
                });

                client.open((openError) => {
                    if (openError) {
                        edgeClient = null;
                        clientPromise = null;
                        reject(openError);
                        return;
                    }

                    resolve(client);
                });
            });
        });
    }

    return clientPromise;
}

function getTwin() {
    if (moduleTwin) {
        return Promise.resolve(moduleTwin);
    }

    return getClient().then((client) => new Promise((resolve, reject) => {
        client.getTwin((error, twin) => {
            if (error) {
                reject(error);
                return;
            }
            moduleTwin = twin;
            resolve(twin);
        });
    }));
}

function closeClient(done) {
    if (!edgeClient) {
        done();
        return;
    }

    closeRequested = true;
    const client = edgeClient;
    edgeClient = null;
    clientPromise = null;
    moduleTwin = null;

    client.close(() => {
        closeRequested = false;
        done();
    });
}

module.exports = function registerNodes(RED) {
    const status = {
        disconnected: { fill: 'red', shape: 'dot', text: 'Disconnected' },
        connected: { fill: 'green', shape: 'dot', text: 'Connected' },
        sent: { fill: 'blue', shape: 'dot', text: 'Sending' },
        received: { fill: 'yellow', shape: 'dot', text: 'Receiving' },
        error: { fill: 'grey', shape: 'dot', text: 'Error' }
    };

    function setStatus(node, value) {
        node.status(status[value]);
    }

    function EdgeClientNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node._users = (node._users || 0) + 1;

        getClient()
            .then(() => node.log('AMQP ModuleClient connected to Edge Hub.'))
            .catch((error) => node.error(`AMQP ModuleClient connection failed: ${error.message}`));

        node.on('close', (done) => {
            node._users = 0;
            closeClient(done);
        });
    }

    function ModuleTwinNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        setStatus(node, 'disconnected');

        getTwin()
            .then((twin) => {
                setStatus(node, 'connected');
                node.log('Module twin connected.');

                twin.on('properties.desired', (delta) => {
                    node.send({ payload: delta, topic: 'desired' });
                });

                node.on('input', (msg, send, done) => {
                    setStatus(node, 'sent');
                    const reported = msg.payload;
                    twin.properties.reported.update(reported, (error) => {
                        if (error) {
                            setStatus(node, 'error');
                            node.error(`Twin reported update failed: ${error.message}`, msg);
                            if (done) done(error);
                            return;
                        }
                        setStatus(node, 'connected');
                        if (send) send(msg);
                        if (done) done();
                    });
                });
            })
            .catch((error) => {
                setStatus(node, 'error');
                node.error(`Module twin failed: ${error.message}`);
            });

        node.on('close', (done) => {
            if (moduleTwin) {
                moduleTwin.removeAllListeners();
            }
            setStatus(node, 'disconnected');
            done();
        });
    }

    function ModuleInputNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.inputName = config.input || 'input1';
        setStatus(node, 'disconnected');

        getClient()
            .then((client) => {
                setStatus(node, 'connected');
                node.log(`Module input listening: ${node.inputName}`);
                node._listener = (inputName, message) => {
                    if (inputName !== node.inputName) return;
                    setStatus(node, 'received');
                    client.complete(message, (error) => {
                        if (error) node.error(`Input completion failed: ${error.message}`);
                    });
                    let payload = message.getBytes().toString('utf8');
                    try {
                        payload = JSON.parse(payload);
                    } catch (_) {
                        // Keep non-JSON payload as a string.
                    }
                    node.send({ payload, topic: 'input', input: inputName });
                    setStatus(node, 'connected');
                };
                client.on('inputMessage', node._listener);
            })
            .catch((error) => {
                setStatus(node, 'error');
                node.error(`Module input failed: ${error.message}`);
            });

        node.on('close', (done) => {
            if (edgeClient && node._listener) {
                edgeClient.removeListener('inputMessage', node._listener);
            }
            setStatus(node, 'disconnected');
            done();
        });
    }

    function ModuleOutputNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.outputName = config.output || 'output1';
        setStatus(node, 'disconnected');

        getClient()
            .then(() => {
                setStatus(node, 'connected');
                node.log(`Module output ready: ${node.outputName}`);

                node.on('input', (msg, send, done) => {
                    setStatus(node, 'sent');
                    let payload = msg.payload;
                    if (Buffer.isBuffer(payload)) {
                        payload = payload.toString('utf8');
                    }
                    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
                    const message = new Message(body);
                    message.contentType = 'application/json';
                    message.contentEncoding = 'utf-8';

                    edgeClient.sendOutputEvent(node.outputName, message, (error) => {
                        if (error) {
                            setStatus(node, 'error');
                            node.error(`Output send failed: ${error.message}`, msg);
                            if (done) done(error);
                            return;
                        }
                        setStatus(node, 'connected');
                        if (send) send(msg);
                        if (done) done();
                    });
                });
            })
            .catch((error) => {
                setStatus(node, 'error');
                node.error(`Module output failed: ${error.message}`);
            });

        node.on('close', (done) => {
            setStatus(node, 'disconnected');
            done();
        });
    }

    function ModuleMethodNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.methodName = config.method || 'method1';
        node._pendingResponse = null;
        setStatus(node, 'disconnected');

        getClient()
            .then((client) => {
                setStatus(node, 'connected');
                client.onMethod(node.methodName, (request, response) => {
                    setStatus(node, 'received');
                    node.log(`Direct method received: ${request.methodName}`);
                    node.send({
                        payload: request.payload ?? null,
                        topic: 'method',
                        method: request.methodName
                    });

                    const finish = () => {
                        const result = node._pendingResponse || { status: 200, response: {} };
                        node._pendingResponse = null;
                        const body = typeof result.response === 'string'
                            ? result.response
                            : JSON.stringify(result.response ?? {});
                        response.send(result.status ?? 200, body, (error) => {
                            if (error) node.error(`Method response failed: ${error.message}`);
                            setStatus(node, 'connected');
                        });
                    };

                    // Wait for a Node-RED input response, matching the Black Belt behavior.
                    const started = Date.now();
                    const wait = () => {
                        if (node._pendingResponse || Date.now() - started >= 20000) {
                            finish();
                            return;
                        }
                        setTimeout(wait, 100);
                    };
                    wait();
                });

                node.on('input', (msg, send, done) => {
                    node._pendingResponse = {
                        response: msg.payload,
                        status: msg.status || 200
                    };
                    if (send) send(msg);
                    if (done) done();
                });
            })
            .catch((error) => {
                setStatus(node, 'error');
                node.error(`Module method failed: ${error.message}`);
            });

        node.on('close', (done) => {
            setStatus(node, 'disconnected');
            done();
        });
    }

    RED.nodes.registerType('edgeclient-amqp', EdgeClientNode);
    RED.nodes.registerType('moduletwin-amqp', ModuleTwinNode);
    RED.nodes.registerType('moduleinput-amqp', ModuleInputNode);
    RED.nodes.registerType('moduleoutput-amqp', ModuleOutputNode);
    RED.nodes.registerType('modulemethod-amqp', ModuleMethodNode);
};
