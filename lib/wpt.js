var request = require("request");
var str = require("str.js");
var xml2js = require("xml2js");
var EventEmitter = require('events').EventEmitter;
var util = require("util");
var querystring = require("querystring");
var R = require("resistance").R;

var WPT = function(apikey) {
  this.apikey = apikey;
  EventEmitter.call(this);

  var self = this;

  this.on("finishTest", function(testId, statusData) {
    self.getResults(testId);
  });

  this.on("parseResults", function(resultsJSON) {
    var results = resultsJSON.data;
    self.emit("endTest", results);
    if (typeof callback !== "undefined") callback(results);
  });
};
util.inherits(WPT, EventEmitter);

WPT.prototype._makeJSONRequest = function(url, callback) {
  request({ uri: url }, function(err, res, body) {
    try {
      var json = JSON.parse(body);
      callback(json);
    } catch (e) {
      console.log(e);
    }
  });
};

WPT.prototype._makeXMLRequest = function(url, callback) {
  request({ uri: url }, function(err, res, body) {
    var parser = new xml2js.Parser();
    parser.addListener("end", function(result) {
      callback(result);
    });
    parser.parseString(body);
  });
};

WPT.prototype.runTest = function(testOptions, callback) {
  testOptions.url = encodeURIComponent(testOptions.url);
  var opt = querystring.unescape(querystring.stringify(testOptions));
  var wptUrl = str.format('http://www.webpagetest.org/runtest.php?{opt}&k={api}&f=json', { api: this.apikey, opt: opt });
  var self = this;
  var testDetails = {};

  this._makeJSONRequest(wptUrl, function(data) {
    self.emit("startTest", testOptions, data);
    testDetails = data.data;
    self.testStatus(testDetails.testId);
  });
};

WPT.prototype.testStatus = function(testId) {
  var self = this;
  var url = str.format("http://www.webpagetest.org/testStatus.php?test={testId}&f=json", { testId: testId });
  var checkStatus = function() {
    self._makeJSONRequest(url, function(data) {
      self.emit("status", data);
      if (data.data.statusCode == 200) {
        clearInterval(interval);
        self.emit("finishTest", testId, data);
      }
    });
  };
  var interval = setInterval(checkStatus, 30*1000);
  checkStatus();
};

WPT.prototype.getResults = function(id) {
  var self = this;
  var url = str.format("http://www.webpagetest.org/xmlResult/{0}/", [id]);
  this._makeXMLRequest(url, function(json) {
    self.emit("parseResults", json);
  });
};

WPT.prototype.runBatch = function(tests, locations, callback) {
  var self = this; 
  var results = [];
  self.emit("startBatch", tests);
  var q = [];
  var addToQueue = function(test, location) {
    return function(callback) {
      test.location = location;
      self.runTest(test, function(testResults) {
        results.push(testResults);
        callback();
      });
    };
  };

  for (var i = 0, c = tests.length; i < c; i++) {
    var test = tests[i];
    for (var x = 0, y = locations.length; x < y; x++) {
      var location = locations[x];
      q.push(addToQueue(test, location));
    }
  }
  R.parallel(q, function() {
    self.emit("endBatch", results);
    if (typeof callback !== "undefined") callback(results);
  });
};

WPT.prototype.getHARFile = function(testId, callback) {
  var url = str.format("http://www.webpagetest.org/export.php?test={testId}", { testId: testId });
  var self = this;
  this._makeJSONRequest(url, function(data) {
    callback(data);
  });
};



module.exports = WPT;



