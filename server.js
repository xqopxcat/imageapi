var port = process.env.port || 3000;
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var multer = require('multer');
var path = require('path');
var fs = require('fs');
var sharp = require('sharp');
var request = require('request');
var cv = require('opencv');
var cors = require('cors');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname + '/uploads'));
app.use(express.static(__dirname + '/resize'));
app.use(express.static(__dirname + '/img'));

var HEX_NUMBERS = {
	jpg: 'ffd8ffe0',
	jpg1: 'ffd8ffe1',
	jpeg: 'ffd8ffe2',
	png: '89504e47',
	gif: '47494638'
}

function checkHexNumbers(hex) {
	if (hex == HEX_NUMBERS.jpg || hex == HEX_NUMBERS.jpg1 || hex == HEX_NUMBERS.jpeg || hex == HEX_NUMBERS.png || hex == HEX_NUMBERS.gif) 
		return true
}


var storage = multer.diskStorage({
	destination: function(req, file, callback) {
		callback(null, './uploads')
	},
	filename: function(req, file, callback) {
		callback(null, Date.now() + '_' + file.originalname)
	}
})

var upload = multer({
	storage: storage
}).any()

app.post('/api/uploadfile', function(req, res) {
	upload(req, res, function(err) {
		var bitmap = fs.readFileSync('./uploads/' + req.files[0].filename).toString('hex', 0, 4)
		if (!checkHexNumbers(bitmap)) {
			fs.unlinkSync('./uploads/' + req.files[0].filename)
			return res.json({
		        message: 'invalid',
		        filename: req.files[0].filename
		    });
		}
		return res.json({
		    message: 'OK',
		    filename: req.files[0].filename
	    });
	})
})

app.post("/api/uploadurl", function(req, res){
	var nowTime = Date.now();
	if(Object.getOwnPropertyNames(req.body).length == 0 || typeof(req.body.imageUrl) == "undefined")
		return res.json({
		    message: 'invalid',
		    filename: ''
	});
	var imageName = req.body.imageUrl.substr(req.body.imageUrl.lastIndexOf('/')+1);
	var imageExtName = imageName.substr(imageName.lastIndexOf('.')).toLowerCase(); 

	if(imageExtName == '.png' || imageExtName == '.jpg' || imageExtName == '.jpeg' || imageExtName == '.gif'){
		download(req.body.imageUrl, nowTime + '_' + imageName, function(){
			return res.json({
		        message: 'OK',
		        filename: nowTime + '_' + imageName
		    });
		});
	}
	else{
		return res.json({
		    message: 'failed',
		    filename: ''
		}); 
	}
})

var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    request(uri).pipe(fs.createWriteStream('./uploads/' + filename)).on('close', callback);
  });
};

app.get("/api/getlist", function(req, res){
	fs.readdir('./uploads', function(err, files){
		var jsonArray = [];
		for(var i=0; i<files.length; i++){
			var jsonObj = {};
		    jsonObj['name'] = path.basename(files[i], path.extname(files[i]));
		    jsonObj['extension'] = path.extname(files[i]);
		    jsonArray.push(jsonObj);
		}
		return res.end(JSON.stringify(jsonArray));
	})
})


app.get("/api/getimage/:name", function(req, res){
	if(!req.query.format){
		return res.json({
		    message: 'Error: lose querystring: ?format=',
		    filename: ''
		});
	}
	else if(!req.query.width && !req.query.height){
		return res.json({
		    message: 'OK',
		    filename: req.params.name + req.query.format
		});
	}
	else{
		var width = req.query.width && !isNaN(req.query.width) ? parseInt(req.query.width) : null;
		var height = req.query.height && !isNaN(req.query.height) ? parseInt(req.query.height) : null;
		sharp('./uploads/' + req.params.name + req.query.format)
		.resize(width, height)	
  		.ignoreAspectRatio()
		.toFile('./resize/' + req.params.name + '-' + width + 'x' + height + req.query.format, function(err) {
			if(err) throw err;
				return res.json({
				    message: 'OK',
				    filename: req.params.name + '-' + width + 'x' + height + req.query.format
			});
		})
	}
})

app.post("/api/getdetection/:name", function(req, res){
	cv.readImage('./uploads/' + req.params.name, function (err, img) {  
	  if (err) {
	    throw err;
	  }
	  const width = img.width();
	  const height = img.height();

	  if (width < 1 || height < 1) {
	    throw new Error('Image has no size');
	  }
	  let diagonal = Math.round(Math.sqrt(Math.pow(img.size()[1], 2) + Math.pow(img.size()[0], 2)));
	  const lowThresh = req.body.low;
	  const highThresh = req.body.high;
	  const iterations = 2;
	  const thickness = 1;
	  const lineType = 8;

	  const GREEN = [0, 255, 0];
	  if(req.body.grascale){
		img.convertGrayscale();
	  }
	  img.gaussianBlur([9,9]);

	  img.canny(lowThresh, highThresh);
	  img.dilate(iterations);

	  let largestContourImg = new cv.Matrix(height, width);
	  let largestArea = 500;
	  let largestAreaIndex;
	  let contours = img.findContours();
	  for (let i = 0; i < contours.size(); i++) {
	    if (contours.area(i) > largestArea) {
	      largestContourImg.drawContour(contours, i, GREEN, thickness, lineType);
	    }
	  }

	  largestContourImg.save('./img/' + req.body.low + '-' + req.body.high + '-' + req.params.name);
	  return res.json({
			    message: 'OK',
			    filename:  + req.body.low + '-' + req.body.high + '-' + req.params.name
		});
	});
})


var server = app.listen(port, function(){
	console.log('Listeing on port ' + port);
});