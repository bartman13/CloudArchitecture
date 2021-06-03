const VERIFY_TOKEN = 'my_awesome_token';
const PAGE_ACCESS_TOKEN = 'EAArmPtkydZAIBAIk2y3kYBONA2DRcjT8CE0e4aFN2duVQV8t6XOgZBUgWXBP8bflG350vxON7XlTTjXFc158QwdcWXITVHbzNJos2DDYnBlQwwCV1lAX1ssTZA4zqDZBOpyB1prCpbsFCPARI2OqpbzrgUkNtSPxDYcQh353DDYOK5z0ZCBF6';

const https = require('https');
const httpsFR = require('follow-redirects').https;

const baseNasaUrl = 'https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos';
const AWS = require('aws-sdk');

function receivedMessage(event) {
  console.log('Message data: ', event.message);
  const senderID = event.sender.id;
  const recipientID = event.recipient.id;
  const timeOfMessage = event.timestamp;
  const { message } = event;
  console.log('Received message for user %d and page %d at %d with message:', senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));
  // Write in S3 Photos
  getImages('2015-6-3', extractImageUrls, 'negate');

  const messageText = message.text;
  const messageAttachments = message.attachments;
  if (messageText) { // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'generic':
        // sendGenericMessage(senderID);
        break; default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, 'Message with attachment received');
  }
}

exports.handler = (event, context, callback) => {
  // process GET request
  if (event.queryStringParameters) {
    const queryParams = event.queryStringParameters;

    const rVerifyToken = queryParams['hub.verify_token'];
    if (rVerifyToken === VERIFY_TOKEN) {
      const challenge = queryParams['hub.challenge'];
      console.log(challenge);
    }

  // process POST request
  } else {
    const data = JSON.parse(event.body);

    // Make sure this is a page subscription
    if (data.object === 'page') { // Iterate over each entry - there may be multiple if batched
      data.entry.forEach((entry) => {
        console.log('data entry');
        entry.messaging.forEach((msg) => {
          console.log('entry messaging');
          if (msg.message) {
            receivedMessage(msg);
          } else {
            console.log('Webhook received unknown event: ', event);
          }
        });
      });
    } // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    const response = {
      body: 'ok',
      statusCode: 200,
    };

    callback(null, response);
  }
};

function sendTextMessage(recipientId, messageText) {
  const messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      text: messageText,
    },
  }; callSendAPI(messageData);
}

function callSendAPI(messageData) {
  const body = JSON.stringify(messageData);
  const path = `/v10.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const options = {
    host: 'graph.facebook.com',
    path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  // eslint-disable-next-line func-names
  const callback = function (response) {
    // eslint-disable-next-line no-unused-vars
    let str = '';
    response.on('data', (chunk) => {
      str += chunk;
    });
    response.on('end', () => {

    });
  };
  const req = https.request(options, callback);
  req.on('error', (e) => {
    console.log(`problem with request: ${e}`);
  });

  req.write(body);
  req.end();
}

function prepareRequestUrl(day) {
  const url = new URL(baseNasaUrl);
  url.searchParams.append('api_key', getNasaApiKey());
  url.searchParams.append('earth_date', day);
  return url;
}

function getImages(day, callback, filterName) {
  // eslint-disable-next-line prefer-rest-params
  const filterArgs = Array.prototype.slice.call(arguments, 3);
  const requestUrl = prepareRequestUrl(day);
  httpsFR.get(requestUrl, (res) => {
    let body = '';
    // eslint-disable-next-line no-return-assign
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => callback(null, JSON.parse(body), filterName, filterArgs));
  }).on('error', (e) => {
    callback(Error(e));
  });
}

// TODO: read this from env
function getNasaApiKey() {
  return 'DEMO_KEY';
}

async function putObjectToS3(bucket, key, data) {
  const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    params: { Bucket: bucket },
  });
  console.log('DATA: ', data);
  const resp = await s3.upload({ Bucket: bucket, Key: key, Body: data }).promise();
  console.log('RESP: ', resp);
  return {
    statusCode: 200,
    body: JSON.stringify(resp),
  };
}

function downloadAndFilterImages(urls, filterName, filterArgs) {
  const filterArgsObj = Object.fromEntries(filterArgs);
  console.log(filterArgsObj);
  urls.forEach((url) => {
    console.log(url);

    httpsFR.get(url, (res) => {
      const data = [];
      res.on('data', (chunk) => {
        data.push(chunk);
      }).on('end', () => {
        const buffer = Buffer.concat(data);
        // Do something with the buffer
        const r = Math.random().toString(36).substring(7);
        putObjectToS3('cloud-project-mars-photos', `file${filterName}${r}.jpg`, buffer);
      });
    }).on('error', (err) => {
      console.log('download error:', err);
    });
    // let r = Math.random().toString(36).substring(7);
    // putObjectToS3('cloud-project-mars-photos','file' + filterName + r + '.jpg', response2)
    // upload(response2)
  });
}

function extractImageUrls(_, body, filterName, filterArgs) {
  const urls = [];
  body.photos.forEach((photo) => {
    urls.push(photo.img_src.replace('http', 'https'));
  });
  console.log(urls);
  downloadAndFilterImages(urls, filterName, filterArgs);
}

// async function upload(file) {

// // Create S3 service object
// var s3 = new AWS.S3({apiVersion: '2006-03-01'});

// // call S3 to retrieve upload file to specified bucket
// var uploadParams = {Bucket: 'cloud-project-mars-photos', Key: '', Body: ''};

// // Configure the file stream and obtain the upload parameters
// var fs = require('fs');
// var fileStream = fs.createReadStream(file);
// fileStream.on('error', function(err) {
//   console.log('File Error', err);
// });
// uploadParams.Body = fileStream;
// var path = require('path');
// uploadParams.Key = path.basename('a.jpg');

// // call S3 to retrieve upload file to specified bucket
// s3.upload (uploadParams, function (err, data) {
//   if (err) {
//     console.log("Error", err);
//   } if (data) {
//     console.log("Upload Success", data.Location);
//   }
// });

// }

// function executeFunctionByName(functionName, context) {
//   const args = Array.prototype.slice.call(arguments, 2);
//   const namespaces = functionName.split('.');
//   const func = namespaces.pop();
//   for (let i = 0; i < namespaces.length; i++) {
//     context = context[namespaces[i]];
//   }
//   return context[func].apply(context, args);
// }

// getImages("2015-6-3", extractImageUrls, "negate")
