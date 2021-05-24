const https = require('follow-redirects').https,
      fs = require('fs')

let baseNasaUrl = "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos"

const getImages = function(day, callback) {
    let requestUrl = prepareRequestUrl(day)
    https.get(requestUrl, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => callback(null, JSON.parse(body)));
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

const extractImageUrls = function(_, body) {
    let urls = []
    body.photos.forEach(function(photo) {
        urls.push(photo.img_src.replace("http", "https"))
    })
    console.log(urls)
    downloadImages(urls)
}

const downloadImages = function(urls) {
    urls.forEach(function(url) {
        const dest = url.split("/").pop()
        console.log(url)
        let file = fs.createWriteStream(dest);
        https.get(url, function(response) {
            response.pipe(file);
            file.on('finish', function() {
                file.close();
            });
        });
    })
}

getImages("2015-6-3", extractImageUrls)