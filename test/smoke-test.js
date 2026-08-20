'use strict';

const assert = require('node:assert/strict');
const registerNodes = require('../src/node-red-amqp');

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
console.log(`Registered ${registered.length} AMQP Node-RED node types.`);
