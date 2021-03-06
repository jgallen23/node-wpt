var request = require("request");
var str = require("str.js");
var xml2js = require("xml2js");
var EventEmitter = require('events').EventEmitter;
var util = require("util");
var querystring = require("querystring");
var R = require("resistance").R;

var Test = function(url, options, meta) {
  this.url = url;
  this.options = options || {};
  this.meta = meta;
  this.id = null;
  this.results = null;
};

var WPT = function(apikey) {
  this.apikey = apikey;
  EventEmitter.call(this);

  var self = this;

  this.on("finishTest", function(test, statusData) {
    self.getResults(test);
  });

  this.on("parseResults", function(test, resultsJSON) {
    var results = resultsJSON.data;
    test.results = results;
    self.emit("endTest", test);
    if (typeof test.callback !== "undefined") test.callback();
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

WPT.prototype.runTest = function(test, callback) {
  var opts = test.options;
  test.callback = callback;
  opts.url = encodeURIComponent(test.url);
  var opt = querystring.unescape(querystring.stringify(opts));
  var wptUrl = str.format('http://www.webpagetest.org/runtest.php?{opt}&k={api}&f=json', { api: this.apikey, opt: opt });
  var self = this;

  this._makeJSONRequest(wptUrl, function(data) {
    if (data.statusCode == 400) {
      self.emit("error", data);
    } else {
      test.id = data.data.testId;
      test.details = data.data;
      self.emit("startTest", test, data);
      self.testStatus(test);
    }
  });
};

WPT.prototype.testStatus = function(test) {
  var self = this;
  var url = str.format("http://www.webpagetest.org/testStatus.php?test={testId}&f=json", { testId: test.id });
  var checkStatus = function() {
    self._makeJSONRequest(url, function(data) {
      self.emit("status", test, data);
      if (data.data.statusCode == 200) {
        clearInterval(interval);
        self.emit("finishTest", test, data);
      }
    });
  };
  var interval = setInterval(checkStatus, 30*1000);
  checkStatus();
};

WPT.prototype.getResults = function(test) {
  var self = this;
  var url = str.format("http://www.webpagetest.org/xmlResult/{0}/", [test.id]);
  this._makeXMLRequest(url, function(json) {
    self.emit("parseResults", test, json);
  });
};

WPT.prototype._cloneObj = function(obj) {
  if(obj == null || typeof(obj) != 'object')
    return obj;

  var temp = new obj.constructor();
  for(var key in obj)
    temp[key] = this._cloneObj(obj[key]);

  return temp;
};

WPT.prototype.runBatch = function(tests, locations, callback) {
  var self = this; 
  var results = [];
  self.emit("startBatch", tests);
  var q = [];
  var addToQueue = function(test) {
    return function(callback) {
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
      var opt = self._cloneObj(test.options || {});
      opt.location = location;
      var t = new Test(test.url, opt, test.meta);
      q.push(addToQueue(t));
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



module.exports = { WPT: WPT, Test: Test };

