var request = require("request");
var str = require("str.js");
var xml2js = require("xml2js");
var EventEmitter = require('events').EventEmitter;
var util = require("util");
var async = require("async");
var querystring = require("querystring");

var WPT = function(apikey) {
  this.apikey = apikey;
  EventEmitter.call(this);
};
util.inherits(WPT, EventEmitter);

WPT.prototype._makeJSONRequest = function(url, callback) {
  request({ uri: url }, function(err, res, body) {
    var json = eval('(' + body + ')');
    callback(json);
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
  var opt = querystring.stringify(testOptions);
  var wptUrl = str.format('http://webpagetest.org/runtest.php?f=json&k={api}&{opt}', { api: this.apikey, opt: opt });
  var self = this;
  var testDetails = {};

  this.on("finishTest", function(statusData) {
    self.getResults(testDetails.testId);
  });

  this.on("parseResults", function(resultsJSON) {
    var results = resultsJSON.data;
    self.emit("endTest", results);
    if (callback) callback(results);
  });

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
        self.emit("finishTest", data);
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

WPT.prototype.runBatch = function(tests, callback) {
  var self = this; 
  var results = [];
  self.emit("startBatch", tests);
  var q = async.queue(function(test, callback) {
    self.runTest(test, function(testResults) {
      results.push(testResults);
      callback();
    });
  }, 2);

  for (var i = 0, c = tests.length; i < c; i++) {
    var test = tests[i];
    q.push(test);
  }
  q.drain = function() {
    self.emit("endBatch", results);
    if (callback) callback(results);
  };
};



module.exports = WPT;


