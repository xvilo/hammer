'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const send = require('koa-send');

/**
 * This class handles all outgoing request
 * the response class also gives a developer
 * the plausibilty to easily send a file or
 * json back to the client without setting all the
 * nessesary variables. Response is extended by the
 * HTTP class.
 *
 * @class Response
 */
class Response {
  /**
   * responseHandle is handling all outgoing request
   * to check if all the nessesary values are set.
   *
   * @method   Response@responseHandle
   * @return {Generator} The returned generator can be used by koa
   */
  responseHandle() {
    return function *(next) {
      var startTime = Date.now();

      yield *next;

      var delta = Math.ceil(Date.now() - startTime);
      this.set('X-Response-Time', `${delta} ms`);
    };
  }

  /**
   * Send is a alias to koa-send.
   * This function apply's all arguments to
   * koa-send.
   * @method   Response@send
   * @param    {Object} koa  The current koa session
   * @param    {String} path Full path to the file that you are wanting to send
   * @param    {Object} opts Optional options that can be set. See koa-send documentation.
   * @return   {Function} Send returns a generator function that can be used by koa.
   */
  send(...args) {
    return send.apply(this, args);
  }

  /**
   * Static sends static files back that are found
   * in the given root folder.
   * @method   Response@static
   * @param    {String} url The base url
   * @param    {String} root Root path to the base folder
   */
  static(url, root) {
    url = new RegExp(`^${url}`);
    this.router.use(function *(next) {
      if(!url.test(this.url)) {
        return yield *next;
      }

      root = root;
      if(_.isFunction(root)) {
        root = yield root;
      }

      let file = this.url.replace(url, '');
      if(_.pathExists(path.join(root, file), 'isFile')) {
        return yield send(this, file, {root: root});
      }

      yield *next;
    });
  }
}

module.exports = Response;
