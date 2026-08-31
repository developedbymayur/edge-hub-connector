'use strict';

const assert = require('node:assert/strict');
const registerNodes = require('../src/node-red-mqtt');
const manager = require('../src/client-manager-mqtt');

const registered = [];
const RED = {
    nodes: {
        registerType(name) {
            registered.push(name);
        }
    }
};

registerNodes(RED);

const expected = [
    'moduletwin-mqtt',
    'moduleinput-mqtt',
    'moduleoutput-mqtt',
    'modulemethod-mqtt'
];

assert.deepEqual(registered.sort(), expected.sort());
assert.equal(registered.length, 4);
assert.equal(typeof manager.acquire, 'function');
assert.equal(typeof manager.release, 'function');
assert.equal(typeof manager.addInputListener, 'function');
assert.equal(typeof manager.addMethodHandler, 'function');
assert.equal(typeof manager.addTwinDesiredListener, 'function');
assert.equal(typeof manager.sendOutputEvent, 'function');
assert.equal(typeof manager.reportTwin, 'function');
assert.equal(typeof manager.EdgeHubMqttClientManager, 'function');

console.log(`Registered ${registered.length} MQTT Node-RED node types.`);
console.log('Shared resilient MQTT EdgeHub client manager is available.');
