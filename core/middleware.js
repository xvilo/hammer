'use strict';

const async = require('async');

class Middleware {
  constructor() {
    this._events = {};
  }

  on(name, fn) {
    if(!this._events[name]) {
      this._events[name] = [];
    }
    this._events[name].push(fn);
  }

  call(name, args, cb = ()=>{}) {
    let i = -1;
    async.whilst(()=> {
      i++; return i < this._events[name].length;
    }, (done)=> {
      this._events[name][i].apply(null, [done].concat(args));
    }, cb);
  }
}

module.exports = new Middleware();