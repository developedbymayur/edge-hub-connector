'use strict';

const { Message } = require('azure-iot-device');
const manager = require('./client-manager');

module.exports = function registerNodes(RED) {
    const status = {
        connecting: { fill: 'yellow', shape: 'ring', text: 'Connecting' },
        connected: { fill: 'green', shape: 'dot', text: 'Connected' },
        disconnected: { fill: 'red', shape: 'ring', text: 'Disconnected' },
        sending: { fill: 'blue', shape: 'dot', text: 'Sending' },
        receiving: { fill: 'yellow', shape: 'dot', text: 'Receiving' },
        error: { fill: 'red', shape: 'dot', text: 'Error' }
    };

    function setStatus(node, key, detail) {
        node.status(detail ? { ...status[key], text: detail } : status[key]);
    }

    function acquire(node) {
        manager.acquire();
        const onConnecting = () => setStatus(node, 'connecting');
        const onConnected = () => {
            setStatus(node, 'connected');
            node.log('AMQP ModuleClient connected to Edge Hub.');
        };
        const onDisconnected = () => setStatus(node, 'disconnected');
        const onError = (error) => {
            setStatus(node, 'error', error?.message || 'AMQP error');
            node.error(`AMQP connection error: ${error?.message || error}`);
        };

        manager.on('connecting', onConnecting);
        manager.on('connected', onConnected);
        manager.on('disconnected', onDisconnected);
        manager.on('error', onError);
        setStatus(node, manager.isConnected() ? 'connected' : 'connecting');

        return () => {
            manager.off('connecting', onConnecting);
            manager.off('connected', onConnected);
            manager.off('disconnected', onDisconnected);
            manager.off('error', onError);
            manager.release();
        };
    }

    function ModuleInputNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.inputName = config.input || 'input1';
        node._release = acquire(node);
        node._listener = (inputName, message) => {
            if (inputName !== node.inputName) return;
            setStatus(node, 'receiving');
            let payload = message.getBytes().toString('utf8');
            try { payload = JSON.parse(payload); } catch (_) {}
            node.log(`Module input message received: ${inputName}`);
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
            node._removeListener();
            node._release();
            done();
        });
    }

    function ModuleOutputNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.outputName = config.output || 'output1';
        node._release = acquire(node);
        node.log(`Module output ready: ${node.outputName}`);

        node.on('input', (msg, send, done) => {
            setStatus(node, 'sending');
            node.log(`Module output message received: ${node.outputName}`);
            let payload = msg.payload;
            if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
            const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const message = new Message(body);
            message.contentType = 'application/json';
            message.contentEncoding = 'utf-8';
            node.log(`Module output sending via AMQP: ${node.outputName}`);
            manager.sendOutputEvent(node.outputName, message, (error) => {
                if (error) {
                    setStatus(node, 'error');
                    node.error(`Output send failed: ${error.message}`, msg);
                    node.log(`Module output send failed: ${node.outputName}`);
                    if (done) done(error);
                    return;
                }
                node.log(`Module output sent successfully: ${node.outputName}`);
                setStatus(node, 'connected');
                if (send) send(msg);
                if (done) done();
            });
        });

        node.on('close', (done) => {
            node._release();
            done();
        });
    }

    function ModuleTwinNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node._release = acquire(node);
        node._desiredListener = (delta) => {
            setStatus(node, 'receiving');
            node.send({ payload: delta, topic: 'desired' });
            setStatus(node, 'connected');
        };
        node._removeDesired = manager.addTwinDesiredListener(node._desiredListener);

        node.on('input', (msg, send, done) => {
            setStatus(node, 'sending');
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

        node.on('close', (done) => {
            node._removeDesired();
            node._release();
            done();
        });
    }

    function ModuleMethodNode(config) {
        const node = this;
        RED.nodes.createNode(node, config);
        node.methodName = config.method || 'method1';
        node._pendingResponse = null;
        node._release = acquire(node);

        node._methodHandler = (request, response) => {
            setStatus(node, 'receiving');
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

        node.on('close', (done) => {
            node._removeMethod();
            node._release();
            done();
        });
    }

    RED.nodes.registerType('moduletwin-amqp', ModuleTwinNode);
    RED.nodes.registerType('moduleinput-amqp', ModuleInputNode);
    RED.nodes.registerType('moduleoutput-amqp', ModuleOutputNode);
    RED.nodes.registerType('modulemethod-amqp', ModuleMethodNode);
};
