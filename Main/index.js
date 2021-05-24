const https = require('follow-redirects').https,
      fs = require('fs')

let baseNasaUrl = "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos"

const getImages = function(day, callback, filterName) {
    var filterArgs = Array.prototype.slice.call(arguments, 3);
    let requestUrl = prepareRequestUrl(day)
    https.get(requestUrl, (res) => {
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
const prepareRequestUrl = function(day) {
    let url = new URL(baseNasaUrl)
    url.searchParams.append("api_key", getNasaApiKey())
    url.searchParams.append("earth_date", day)
    return url
}

const extractImageUrls = function(_, body, filterName, filterArgs) {
    let urls = []
    body.photos.forEach(function(photo) {
        urls.push(photo.img_src.replace("http", "https"))
    })
    console.log(urls)
    downloadAndFilterImages(urls, filterName, filterArgs)
}

const downloadAndFilterImages = function(urls, filterName, filterArgs) {
    console.log(filterArgs)
    const filterArgsObj = Object.fromEntries(filterArgs);
    console.log(filterArgsObj)
    urls.forEach(function(url) {
        const dest = url.split("/").pop()
        console.log(url)
        let file = fs.createWriteStream(dest);
        https.get(url, function(response) {
            response.pipe(executeFunctionByName(filterName, sharp(), filterArgsObj)).pipe(file);
            file.on('finish', function() {
                file.close();
            });
        });
    })
}

const sharp = require('sharp');

function executeFunctionByName(functionName, context /*, args */) {
    var args = Array.prototype.slice.call(arguments, 2);
    var namespaces = functionName.split(".");
    var func = namespaces.pop();
    for(var i = 0; i < namespaces.length; i++) {
        context = context[namespaces[i]];
    }
    return context[func].apply(context, args);
}

//getImages("2015-6-3", extractImageUrls, "negate")
getImages("2015-6-3", extractImageUrls, "modulate", ["brightness", 0.5], ["saturation", 0.5], ["hue", 90])