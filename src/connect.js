'use strict';

const Protocol = require('azure-iot-device-amqp').Amqp;
const ModuleClient = require('azure-iot-device').ModuleClient;

console.log('edge-hub-connector: starting ModuleClient AMQP test');
console.log('edge-hub-connector: IOTEDGE_MODULEID =', process.env.IOTEDGE_MODULEID || '<not set>');
console.log('edge-hub-connector: IOTEDGE_DEVICEID =', process.env.IOTEDGE_DEVICEID || '<not set>');
console.log('edge-hub-connector: IOTEDGE_APIVERSION =', process.env.IOTEDGE_APIVERSION || '<not set>');
console.log('edge-hub-connector: IOTEDGE_WORKLOADURI =', process.env.IOTEDGE_WORKLOADURI || '<not set>');

ModuleClient.fromEnvironment(Protocol, (err, client) => {
  if (err) {
    console.error('edge-hub-connector: ModuleClient creation failed:', err);
    process.exitCode = 1;
    return;
  }

  console.log('edge-hub-connector: ModuleClient created (AMQP)');

  client.on('error', (error) => {
    console.error('edge-hub-connector: client error:', error);
  });

  client.open((openError) => {
    if (openError) {
      console.error('edge-hub-connector: AMQP/EdgeHub connection failed:', openError);
      process.exitCode = 2;
      return;
    }

    console.log('edge-hub-connector: CONNECTED to Edge Hub over AMQP');

    client.getTwin((twinError, twin) => {
      if (twinError) {
        console.error('edge-hub-connector: GET TWIN failed:', twinError);
        client.close(() => {
          process.exitCode = 3;
        });
        return;
      }

      console.log('edge-hub-connector: GET TWIN succeeded');
      twin.removeAllListeners();

      client.close((closeError) => {
        if (closeError) {
          console.error('edge-hub-connector: close failed:', closeError);
          process.exitCode = 4;
          return;
        }

        console.log('edge-hub-connector: connection closed');
      });
    });
  });
});
