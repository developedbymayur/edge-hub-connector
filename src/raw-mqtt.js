'use strict';

const mqtt = require('mqtt');
const { IotEdgeAuthenticationProvider } = require('azure-iot-device/dist/iotedge_authentication_provider');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const config = {
  workloadUri: required('IOTEDGE_WORKLOADURI'),
  deviceId: required('IOTEDGE_DEVICEID'),
  moduleId: required('IOTEDGE_MODULEID'),
  iothubHostName: required('IOTEDGE_IOTHUBHOSTNAME'),
  authScheme: required('IOTEDGE_AUTHSCHEME'),
  gatewayHostName: required('IOTEDGE_GATEWAYHOSTNAME'),
  generationId: required('IOTEDGE_MODULEGENERATIONID')
};

const clientId = `${config.deviceId}/${config.moduleId}`;
const username = `${config.iothubHostName}/${clientId}/?api-version=2021-04-12&DeviceClientType=edge-hub-connector-raw`;

const auth = new IotEdgeAuthenticationProvider(config);

auth.getTrustBundle((trustErr, ca) => {
  if (trustErr) {
    console.error('raw-mqtt: trust bundle failed:', trustErr);
    process.exitCode = 1;
    return;
  }

  auth.getDeviceCredentials((credentialErr, credentials) => {
    if (credentialErr) {
      console.error('raw-mqtt: device credentials failed:', credentialErr);
      process.exitCode = 1;
      return;
    }

    console.log('raw-mqtt: clientId =', clientId);
    console.log('raw-mqtt: username =', username);
    console.log('raw-mqtt: broker =', `${config.gatewayHostName}:8883`);
    console.log('raw-mqtt: protocolVersion = 4');
    console.log('raw-mqtt: clean =', process.env.MQTT_CLEAN !== 'false');
    console.log('raw-mqtt: keepalive =', Number(process.env.MQTT_KEEPALIVE || 60));

    const client = mqtt.connect(`mqtts://${config.gatewayHostName}:8883`, {
      clientId,
      username,
      password: credentials.sharedAccessSignature,
      ca,
      rejectUnauthorized: true,
      protocolVersion: 4,
      clean: process.env.MQTT_CLEAN !== 'false',
      keepalive: Number(process.env.MQTT_KEEPALIVE || 60),
      connectTimeout: Number(process.env.MQTT_CONNECT_TIMEOUT || 15000),
      reconnectPeriod: 0,
      reschedulePings: true
    });

    client.on('connect', packet => {
      console.log('raw-mqtt: CONNACK received:', packet);
      client.end(true, () => process.exit(0));
    });

    client.on('error', error => {
      console.error('raw-mqtt: error:', error);
    });

    client.on('close', () => {
      console.log('raw-mqtt: CLOSED');
      setTimeout(() => {
        process.exitCode = 2;
      }, 250);
    });
  });
});
