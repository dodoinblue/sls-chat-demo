'use strict';

const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();

// the following section injects the new ApiGatewayManagementApi service
// into the Lambda AWS SDK, otherwise you'll have to deploy the entire new version of the SDK

/* START ApiGatewayManagementApi injection */
const { Service, apiLoader } = AWS;

apiLoader.services['apigatewaymanagementapi'] = {};

const model = {
  metadata: {
    apiVersion: '2018-11-29',
    endpointPrefix: 'execute-api',
    signingName: 'execute-api',
    serviceFullName: 'AmazonApiGatewayManagementApi',
    serviceId: 'ApiGatewayManagementApi',
    protocol: 'rest-json',
    jsonVersion: '1.1',
    uid: 'apigatewaymanagementapi-2018-11-29',
    signatureVersion: 'v4',
  },
  operations: {
    PostToConnection: {
      http: {
        requestUri: '/@connections/{connectionId}',
        responseCode: 200,
      },
      input: {
        type: 'structure',
        members: {
          Data: {
            type: 'blob',
          },
          ConnectionId: {
            location: 'uri',
            locationName: 'connectionId',
          },
        },
        required: ['ConnectionId', 'Data'],
        payload: 'Data',
      },
    },
  },
  paginators: {},
  shapes: {},
};

AWS.ApiGatewayManagementApi = Service.defineService('apigatewaymanagementapi', ['2018-11-29']);
Object.defineProperty(apiLoader.services['apigatewaymanagementapi'], '2018-11-29', {
  // eslint-disable-next-line
  get: function get() {
    return model;
  },
  enumerable: true,
  configurable: true,
});
/* END ApiGatewayManagementApi injection */

module.exports.connect = async (event, context, cb) => {
  console.log('event.requestContext.connectionId', event.requestContext.connectionId);

  await docClient
    .put({
      TableName: 'ws-demo-chat',
      Item: {
        type: 'Connection',
        connectionId: event.requestContext.connectionId,
        userId: event.headers.Auth,
      },
    })
    .promise();

  cb(null, {
    statusCode: 200,
    body: 'Connected.',
  });
};

module.exports.disconnect = async (event, context, cb) => {
  console.log('disconnect');
  const item = await docClient
    .delete({
      TableName: 'ws-demo-chat',
      Key: {
        type: 'Connection',
        connectionId: event.requestContext.connectionId,
      },
    })
    .promise();
  console.log('item', item);
  cb(null, {
    statusCode: 200,
    body: 'Disconnected.',
  });
};

// module.exports.connection = (event, context, cb) => {
//   if (event.requestContext.eventType === 'CONNECT') {
//   } else if (event.requestContext.eventType === 'DISCONNECT') {
//   }
// };

module.exports.sendMessage = async (event, context, cb) => {
  // console.log(event);
  console.log(typeof event.body);
  const payload = JSON.parse(event.body);
  const toUserId = payload.to;

  const client = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  if (toUserId) {
    const ddbResponse = await docClient
      .query({
        TableName: 'ws-demo-chat',
        IndexName: 'type-userId-index',
        KeyConditionExpression: 'userId = :uid and #type = :type',
        ExpressionAttributeNames: {
          '#type': 'type',
        },
        ExpressionAttributeValues: {
          ':uid': toUserId,
          ':type': 'Connection',
        },
      })
      .promise();

    console.log('toUserConnectionIds', ddbResponse);

    if (ddbResponse.Count > 0) {
      for (const item of ddbResponse.Items) {
        console.log(`sending ${item.message} to ${item.to}`);
        await client
          .postToConnection({
            ConnectionId: item.connectionId,
            Data: payload.message,
          })
          .promise();
      }
    } else {
      await client
        .postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: `No connection found for user ${toUserId}`,
        })
        .promise();
    }
  } else {
    await client
      .postToConnection({
        ConnectionId: event.requestContext.connectionId,
        Data: `Cannot find toUserId`,
      })
      .promise();
  }

  // const item = await docClient.query({
  //   TableName: 'ws-demo-chat',
  //   IndexName: 'type-userId-index',
  //   Key: {
  //     type: 'Connection',
  //     userId: event.body.toUser,
  //   },
  // });

  // console.log('sendTo: ', item);

  cb(null, {
    statusCode: 200,
    body: 'Sent.',
  });
};

module.exports.default = async (event, context, cb) => {
  console.log(event);
  // default function that just echos back the data to the client
  const client = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  await client
    .postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: `default route received: ${event.body}`,
    })
    .promise();

  cb(null, {
    statusCode: 200,
    body: 'Sent.',
  });
};

module.exports.auth = async (event, context) => {
  // return policy statement that allows to invoke the connect function.
  // in a real world application, you'd verify that the header in the event
  // object actually corresponds to a user, and return an appropriate statement accordingly
  return {
    principalId: 'user',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn,
        },
      ],
    },
  };
};
