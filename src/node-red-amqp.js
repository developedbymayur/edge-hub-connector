'use strict';

const { Message } = require('azure-iot-device');
const manager = require('./client-manager');

module.exports = function registerNodes(RED) {
    const status = {
        connecting: { fill: 'yellow', shape: 'ring', text: 'Connecting' },
        connected: { fill: 'green', shape: 'dot', text: 'Connected' },
        disconnected: { fill: 'red', shape: 'ring', text: 'Disconnected' },
        sent: { fill: 'blue', shape: 'dot', text: 'Sending' },
        received: { fill: 'yellow', shape: 'dot', text: 'Receiving' },
        error: { fill: 'red', shape: 'dot', text: 'Error' }
    };

    function setStatus(node, value, detail) {
        node.status(detail ? { ...status[value], text: detail } : status[value]);
    }

    function bindConnectionStatus(node) {
        const onConnecting = () => setStatus(node, 'connecting');
        const onConnected = () => {
            setStatus(node, 'connected');
            node.log('AMQP ModuleClient connected to Edge Hub.');
        };
        const onDisconnected = () => setStatus(node, 'disconnected');
        const onError = (error) => {
            setStatus(node, 'error', error?.message || 'Connection error');
            node.error(`AMQP connection error: ${error?.message || error}`);
        };

        manager.on('connecting', onConnecting);
        manager.on('connected', onConnected);
        manager.on('disconnected', onDisconnected);
        manager.on('error', onError);

        node.on('close', (done) => {
            manager.off('connecting', onConnecting);
            manager.off('connected', onConnected);
            manager.off('disconnected', onDisconnected);
            manager.off('error', onError);
            manager.release();
            done();
        });
    }

    function acquire(node) {
        manager.acquire();
        bindConnectionStatus(node);
        setStatus(node, manager.isConnected() ? 'connected' : 'connecting');
    }

    function EdgeClientNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        acquire(node);
        node.log('Shared AMQP Edge Hub client enabled.');
    }

    function ModuleInputNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.inputName = config.input || 'input1';
        acquire(node);

        node._listener = (inputName, message) => {
            if (inputName !== node.inputName) return;
            setStatus(node, 'received');
            let payload = message.getBytes().toString('utf8');
            try {
                payload = JSON.parse(payload);
            } catch (_) {
                // Keep non-JSON payload as a string.
            }
            node.send({ payload, topic: 'input', input: inputName });
            const client = manager.getClient();
            if (client) {
                client.complete(message, (error) => {
                    if (error) node.error(`Input completion failed: ${error.message}`);
                });
            }
            setStatus(node, 'connected');
        };

        node._removeListener = manager.addInputListener(node.inputName, node._listener);
        node.log(`Module input listening: ${node.inputName}`);

        node.on('close', (done) => {
            if (node._removeListener) node._removeListener();
            setStatus(node, 'disconnected');
            manager.release();
            done();
        });
    }

    function ModuleOutputNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.outputName = config.output || 'output1';
        acquire(node);
        node.log(`Module output ready: ${node.outputName}`);

        node.on('input', (msg, send, done) => {
            setStatus(node, 'sent');
            let payload = msg.payload;
            if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
            const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const message = new Message(body);
            message.contentType = 'application/json';
            message.contentEncoding = 'utf-8';

            manager.sendOutputEvent(node.outputName, message, (error) => {
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
    }

    function ModuleTwinNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        acquire(node);

        node._desiredListener = (delta) => {
            setStatus(node, 'received');
            node.send({ payload: delta, topic: 'desired' });
            setStatus(node, 'connected');
        };
        node._removeDesired = manager.addTwinDesiredListener(node._desiredListener);

        node.on('input', (msg, send, done) => {
            setStatus(node, 'sent');
            manager.reportTwin(msg.payload, (error) => {
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
    }

    function ModuleMethodNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.methodName = config.method || 'method1';
        node._pendingResponse = null;
        acquire(node);

        node._methodHandler = (request, response) => {
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

            const started = Date.now();
            const wait = () => {
                if (node._pendingResponse || Date.now() - started >= 20000) {
                    finish();
                    return;
                }
                setTimeout(wait, 100);
            };
            wait();
        };
        node._removeMethod = manager.addMethodHandler(node.methodName, node._methodHandler);

        node.on('input', (msg, send, done) => {
            node._pendingResponse = {
                response: msg.payload,
                status: msg.status || 200
            };
            if (send) send(msg);
            if (done) done();
        });
    }

    function closeCleanup(configCleanup) {
        return (done) => {
            if (configCleanup) configCleanup();
            setStatus(this, 'disconnected');
            done();
        };
    }

    // Add per-node cleanup for nodes with extra registrations.
    const originalModuleInputNode = ModuleInputNode;
    const originalModuleOutputNode = ModuleOutputNode;
    const originalModuleTwinNode = ModuleTwinNode;
    const originalModuleMethodNode = ModuleMethodNode;

    function RegisteredModuleInputNode(config) {
        originalModuleInputNode.call(this, config);
    }

    function RegisteredModuleOutputNode(config) {
        originalModuleOutputNode.call(this, config);
        this.on('close', (done) => { done(); });
    }

    function RegisteredModuleTwinNode(config) {
        originalModuleTwinNode.call(this, config);
        const node = this;
        node.on('close', (done) => {
            if (node._removeDesired) node._removeDesired();
            done();
        });
    }

    function RegisteredModuleMethodNode(config) {
        originalModuleMethodNode.call(this, config);
        const node = this;
        node.on('close', (done) => {
            if (node._removeMethod) node._removeMethod();
            done();
        });
    }

    RED.nodes.registerType('edgeclient-amqp', EdgeClientNode);
    RED.nodes.registerType('moduletwin-amqp', RegisteredModuleTwinNode);
    RED.nodes.registerType('moduleinput-amqp', ModuleInputNode);
    RED.nodes.registerType('moduleoutput-amqp', ModuleOutputNode);
    RED.nodes.registerType('modulemethod-amqp', RegisteredModuleMethodNode);
};
