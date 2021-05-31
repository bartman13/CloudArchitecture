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
      const fetch = require("node-fetch");
      fetch('https://salesystemapi.azurewebsites.net/categories').then((response) => callback(null, response));
    }
  
  // process POST request
  }else{
    var data = JSON.parse(event.body);
     
    // Make sure this is a page subscription
    if (data.object === 'page') {    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
        var pageID = entry.id;
        var timeOfEvent = entry.time;        // Iterate over each messaging event
        entry.messaging.forEach(function(msg) {
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

const putObjectToS3 = function(bucket, key, data) {
  var s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    params: {Bucket: bucket}
  });
  var params = {
	  Bucket: bucket,
      Key : key,
      Body : data
  }
  console.log(s3)
  console.log("DATA: ", data)
  s3.upload(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log('SUCCESS:' + data);           // successful response
  });
}

const downloadAndFilterImages = function(urls, filterName, filterArgs) {
    const filterArgsObj = Object.fromEntries(filterArgs);
    urls.forEach(function(url) {
        console.log(url)
        let response2 = httpsFR.get(url, function(response) {
            response.pipe(executeFunctionByName(filterName, sharp(), filterArgsObj));
        })
        putObjectToS3('cloud-project-mars-photos','file1.jpg', response2)
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
