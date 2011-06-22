/*
 * splunk.js: Transport for logging to splunk 
 *
 * (C) 2011 JGA 
 * MIT LICENCE
 *
 */

//var utils = require('./../utils'); 
var dgram = require('dgram');
var strftime = require("./dateformat").strftime;

//
// function Splunk (options)
//   Constructor for the Splunk transport object.
//
var Splunk = exports.Splunk = function (options) {
  this.options = options || {};
  if (!this.options.host)  throw new Error('Splunk host is required');
  if (!this.options.port)  throw new Error('Splunk port is required');
  
  this.name = 'splunk'; 
  this.level = options.level || 'info';
  this.logBuffer = [];
  
  
};

Splunk.prototype.objectToString = function(obj, prefix) {
  var msg = [];
  for (var key in obj) {
    if (typeof obj[key] === 'object') {
      msg.push(this.objectToString(obj[key], ((prefix)?prefix+'.':'')+key));
    } else {
      msg.push(((prefix)?prefix+'.':'')+key+'="'+obj[key]+'"');
    }
  }
  return msg.join(' ');
};

//
// function log (level, msg, [meta], callback)
//   Core logging method exposed to Winston. Metadata is optional.
//
Splunk.prototype.log = function (level, msg, meta, callback) {

  var msgArr = [];
  //2011-06-15T16:10:17-07:00
  var date = strftime(new Date(), "%Y-%m-%dT%T");
  msgArr.push(date);
  msgArr.push('NAME='+msg);
  msgArr.push('PID=0');
  msgArr.push('LV='+level+':');
  msgArr.push(this.objectToString(meta));
  var message = msgArr.join(' ');
  var buf = new Buffer(message);
  var client = dgram.createSocket('udp4');
  client.send(buf, 0, buf.length, this.options.port, this.options.host);
  client.close();
};
