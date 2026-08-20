'use strict';

const assert = require('node:assert/strict');
const registerNodes = require('../src/node-red-amqp');
const manager = require('../src/client-manager');

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
  'edgeclient-amqp',
  'moduletwin-amqp',
  'moduleinput-amqp',
  'moduleoutput-amqp',
  'modulemethod-amqp'
];

assert.deepEqual(registered.sort(), expected.sort());
assert.equal(typeof manager.acquire, 'function');
assert.equal(typeof manager.release, 'function');
assert.equal(typeof manager.addInputListener, 'function');
assert.equal(typeof manager.addMethodHandler, 'function');
assert.equal(typeof manager.addTwinDesiredListener, 'function');
assert.equal(typeof manager.sendOutputEvent, 'function');
assert.equal(typeof manager.reportTwin, 'function');
assert.equal(typeof manager.EdgeHubClientManager, 'function');

console.log(`Registered ${registered.length} AMQP Node-RED node types.`);
console.log('Shared resilient AMQP client manager is available.');
