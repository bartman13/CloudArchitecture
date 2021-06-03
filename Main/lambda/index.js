'use strict';
const VERIFY_TOKEN = 'my_awesome_token';
const PAGE_ACCESS_TOKEN = 'EAArmPtkydZAIBAIk2y3kYBONA2DRcjT8CE0e4aFN2duVQV8t6XOgZBUgWXBP8bflG350vxON7XlTTjXFc158QwdcWXITVHbzNJos2DDYnBlQwwCV1lAX1ssTZA4zqDZBOpyB1prCpbsFCPARI2OqpbzrgUkNtSPxDYcQh353DDYOK5z0ZCBF6';

const https = require('https');
const sharp = require('sharp');
const httpsFR = require('follow-redirects').https,
      fs = require('fs')
let baseNasaUrl = "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos";
var AWS = require('aws-sdk');


exports.handler = (event, context, callback) => {

  // process GET request
  if(event.queryStringParameters){
    var queryParams = event.queryStringParameters;

    var rVerifyToken = queryParams['hub.verify_token']
    if (rVerifyToken === VERIFY_TOKEN) {
      var challenge = queryParams['hub.challenge'];
    }

  // process POST request
  }else{
    var data = JSON.parse(event.body);

    // Make sure this is a page subscription
    if (data.object === 'page') {    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
        console.log("data entry")
        var pageID = entry.id;
        var timeOfEvent = entry.time;        // Iterate over each messaging event
        entry.messaging.forEach(function(msg) {
          console.log("entry messaging")
          if (msg.message) {
            receivedMessage(msg);
          } else {
            console.log("Webhook received unknown event: ", event);
          }
        });
    });

    }    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    var response = {
      'body': "ok",
      'statusCode': 200
    };

    callback(null, response);
  }
}

function receivedMessage(event) {
  console.log("Message data: ", event.message);
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;  console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));  var messageId = message.mid;  var messageText = message.text;
// Write in S3 Photos
  getImages("2015-6-3", extractImageUrls, "negate")
//
  var messageAttachments = message.attachments;  if (messageText) {    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'generic':
        //sendGenericMessage(senderID);
        break;      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  var body = JSON.stringify(messageData);
  var path = '/v10.0/me/messages?access_token=' + PAGE_ACCESS_TOKEN;
  var options = {
    host: "graph.facebook.com",
    path: path,
    method: 'POST',
    headers: {'Content-Type': 'application/json'}
  };
  var callback = function(response) {
    var str = ''
    response.on('data', function (chunk) {
      str += chunk;
    });
    response.on('end', function () {

    });
  }
  var req = https.request(options, callback);
  req.on('error', function(e) {
    console.log('problem with request: '+ e);
  });

  req.write(body);
  req.end();
}


const prepareRequestUrl = function(day) {
  let url = new URL(baseNasaUrl)
  url.searchParams.append("api_key", getNasaApiKey())
  url.searchParams.append("earth_date", day)
  return url
}

const getImages = function(day, callback, filterName) {
    var filterArgs = Array.prototype.slice.call(arguments, 3);
    let requestUrl = prepareRequestUrl(day)
    httpsFR.get(requestUrl, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => callback(null, JSON.parse(body), filterName, filterArgs));
    }).on('error', (e) => {
        callback(Error(e))
    })
}

// TODO: read this from parameter store
const getNasaApiKey = function() {
    return "DEMO_KEY"
}

const extractImageUrls = function(_, body, filterName, filterArgs) {
    let urls = []
    body.photos.forEach(function(photo) {
        urls.push(photo.img_src.replace("http", "https"))
    })
    console.log(urls)
    downloadAndFilterImages(urls, filterName, filterArgs)
}

const putObjectToS3 = async function(bucket, key, data) {
  var s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    params: {Bucket: bucket}
  });
  var params = {
      Bucket : bucket,
      Key : key,
      Body : data
  }
  console.log("DATA: ", data)
  const resp = await s3.upload({Bucket: bucket, Key: key, Body: data}).promise();
  console.log("RESP: ", resp)
  return {
    statusCode: 200,
    body: JSON.stringify(resp)
  }
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

const downloadAndFilterImages = function(urls, filterName, filterArgs) {
    const filterArgsObj = Object.fromEntries(filterArgs);
    urls.forEach(function(url) {
        const dest = url.split("/").pop()
        console.log(url)

        httpsFR.get(url, (res) => {
          const data = [];
          res.on('data', (chunk) => {
            data.push(chunk);
          }).on('end', () => {
            let buffer = Buffer.concat(data);
            // Do something with the buffer
            let r = Math.random().toString(36).substring(7);
            putObjectToS3('cloud-project-mars-photos','file' + filterName + r + '.jpg', buffer)
          });
        }).on('error', (err) => {
          console.log('download error:', err);
        });
      	//let r = Math.random().toString(36).substring(7);
        //putObjectToS3('cloud-project-mars-photos','file' + filterName + r + '.jpg', response2)
        //upload(response2)
    })
}



function executeFunctionByName(functionName, context ) {
    var args = Array.prototype.slice.call(arguments, 2);
    var namespaces = functionName.split(".");
    var func = namespaces.pop();
    for(var i = 0; i < namespaces.length; i++) {
        context = context[namespaces[i]];
    }
    return context[func].apply(context, args);
}

//getImages("2015-6-3", extractImageUrls, "negate")
//getImages("2015-6-3", extractImageUrls, "modulate", ["brightness", 0.5], ["saturation", 0.5], ["hue", 90])

 function stream2buffer( stream ) {

        return new Promise( (resolve, reject) => {
            let _buf = []

            stream.on( 'data', chunk => _buf.push(chunk) )
            stream.on( 'end', () => resolve(Buffer.concat(_buf)) )
            stream.on( 'error', err => reject( err ))

        })
 }
