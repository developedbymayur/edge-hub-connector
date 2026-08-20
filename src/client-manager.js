'use strict';

const { EventEmitter } = require('node:events');
const { ModuleClient } = require('azure-iot-device');
const { Amqp } = require('azure-iot-device-amqp');

class EdgeHubClientManager extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.users = 0;
        this.retryTimer = null;
        this.retryDelayMs = 2000;
        this.maxRetryDelayMs = 30000;
        this.connecting = false;
        this.closing = false;
        this.inputListeners = new Set();
        this.methodHandlers = new Map();
        this.twinDesiredListeners = new Set();
        this.twin = null;
    }

    acquire() {
        this.users += 1;
        this.closing = false;
        this.ensureConnected();
    }

    release() {
        this.users = Math.max(0, this.users - 1);
        if (this.users === 0) {
            this.closing = true;
            this.clearRetry();
            this.closeCurrentClient();
        }
    }

    isConnected() {
        return !!this.client;
    }

    getClient() {
        return this.client;
    }

    ensureConnected() {
        if (this.closing || this.users === 0 || this.client || this.connecting) {
            return;
        }

        this.connecting = true;
        this.emit('connecting');

        ModuleClient.fromEnvironment(Amqp, (createError, client) => {
            if (createError) {
                this.handleConnectFailure(createError);
                return;
            }

            client.on('error', (error) => {
                if (this.client === client && !this.closing) {
                    this.emit('error', error);
                    this.handleDisconnect(client, error);
                }
            });

            client.open((openError) => {
                if (openError) {
                    this.handleConnectFailure(openError, client);
                    return;
                }

                if (this.closing || this.users === 0) {
                    this.safeClose(client);
                    this.connecting = false;
                    return;
                }

                this.client = client;
                this.connecting = false;
                this.retryDelayMs = 2000;
                this.emit('connected', client);
                this.attachAllListeners(client);
                this.refreshTwin(client);
            });
        });
    }

    handleConnectFailure(error, client) {
        if (client) this.safeClose(client);
        this.connecting = false;
        this.emit('error', error);
        this.scheduleRetry();
    }

    handleDisconnect(client, error) {
        if (this.client !== client) return;
        this.client = null;
        this.twin = null;
        this.detachAllListeners(client);
        this.safeClose(client);
        this.emit('disconnected', error);
        this.scheduleRetry();
    }

    scheduleRetry() {
        if (this.closing || this.users === 0 || this.retryTimer) return;
        const delay = this.retryDelayMs;
        this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.ensureConnected();
        }, delay);
    }

    clearRetry() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    safeClose(client) {
        try {
            client.close(() => {});
        } catch (_) {
            // The SDK may already be closed.
        }
    }

    closeCurrentClient() {
        if (!this.client) return;
        const client = this.client;
        this.client = null;
        this.twin = null;
        this.detachAllListeners(client);
        this.safeClose(client);
        this.emit('disconnected');
    }

    addInputListener(inputName, handler) {
        const entry = { inputName, handler, client: null };
        this.inputListeners.add(entry);
        this.attachInputListener(entry, this.client);
        return () => {
            this.detachInputListener(entry);
            this.inputListeners.delete(entry);
        };
    }

    attachInputListener(entry, client) {
        if (!client || entry.client === client) return;
        client.on('inputMessage', entry.handler);
        entry.client = client;
    }

    detachInputListener(entry) {
        if (entry.client) {
            entry.client.removeListener('inputMessage', entry.handler);
            entry.client = null;
        }
    }

    addMethodHandler(methodName, handler) {
        this.methodHandlers.set(methodName, handler);
        this.attachMethodHandler(methodName, handler, this.client);
        return () => {
            const current = this.methodHandlers.get(methodName);
            if (current === handler) this.methodHandlers.delete(methodName);
        };
    }

    attachMethodHandler(methodName, handler, client) {
        if (!client) return;
        client.onMethod(methodName, handler);
    }

    addTwinDesiredListener(handler) {
        this.twinDesiredListeners.add(handler);
        if (this.twin) this.twin.on('properties.desired', handler);
        return () => {
            if (this.twin) this.twin.removeListener('properties.desired', handler);
            this.twinDesiredListeners.delete(handler);
        };
    }

    async refreshTwin(client) {
        if (!client || this.client !== client) return;
        client.getTwin((error, twin) => {
            if (error || this.client !== client) {
                if (error) this.emit('error', error);
                return;
            }
            this.twin = twin;
            for (const handler of this.twinDesiredListeners) {
                twin.on('properties.desired', handler);
            }
            this.emit('twinReady', twin);
        });
    }

    attachAllListeners(client) {
        for (const entry of this.inputListeners) {
            this.attachInputListener(entry, client);
        }
        for (const [methodName, handler] of this.methodHandlers.entries()) {
            this.attachMethodHandler(methodName, handler, client);
        }
    }

    detachAllListeners(client) {
        for (const entry of this.inputListeners) {
            if (entry.client === client) entry.client = null;
        }
        if (this.twin && this.twin.removeAllListeners) {
            for (const handler of this.twinDesiredListeners) {
                this.twin.removeListener('properties.desired', handler);
            }
        }
    }

    sendOutputEvent(outputName, message, callback) {
        if (!this.client) {
            return callback(new Error('AMQP client is not connected to Edge Hub'));
        }
        this.client.sendOutputEvent(outputName, message, callback);
    }

    reportTwin(properties, callback) {
        const done = typeof callback === 'function' ? callback : () => {};
        if (!this.twin) {
            done(new Error('Module twin is not connected'));
            return;
        }
        this.twin.properties.reported.update(properties, done);
    }
}

module.exports = new EdgeHubClientManager();
module.exports.EdgeHubClientManager = EdgeHubClientManager;
