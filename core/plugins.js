'use strict';

//TODO: Make plausibility to check/add dependencies

const _ = require('lodash');
const log = require('./log');
const path = require('path');
const async = require('async');
const fs = require('fs-extra');
const http = require('./http');
const semver = require('semver');
const render = require('./render');
const config = require('./config');
const urljoin = require('url-join');
const pk = require('../package.json');
const intercom = require('./intercom');
const debug = require('debug')('plugins');

class Plugins {
  constructor() {
    this._plugins = {};
  }

  initialize() {
    let deferred = Promise.defer(),
        promise = deferred.promise;

    let plugins = [],
        push = Array.prototype.push;

    this.mkdirsPluginFolders();

    if(config.get.plugins.corePlugins) {
      push.apply(plugins, this.collectPlugins(config.get.plugins.corePlugins, true));
    }

    if(config.get.plugins.pluginFolders) {
      push.apply(plugins, this.collectPlugins(config.get.plugins.pluginFolders));
    }

    if(plugins.length <= 0) {
      return deferred.resolve();
    }

    this.runCollectedPlugins(plugins).then(()=> {
      deferred.resolve();
      log('plugins.running');
      intercom.emit('plugins running', this._plugins);

      for(let key in this._plugins) {
        if(this._plugins.hasOwnProperty(key) && this._plugins[key]) {
          let plugin = this._plugins[key];
          if(plugin.initialize) {
            plugin.initialize();
          }
        }
      }
    }).catch(()=> {
      deferred.reject();
    });

    return promise;
  }

  mkdirsPluginFolders() {
    let pluginFolders = config.get.plugins.pluginFolders;

    for(let i=0;i<pluginFolders.length;i++) {
      fs.mkdirsSync(pluginFolders[i]);
    }

    return pluginFolders;
  }

  deactivatePlugin(plugin) {
    //TODO: create error logs
    if(!this._plugins[plugin]) {
      return;
    }

    let p = this._plugins[plugin];

    if(!p.deactivate) {
      return;
    }

    p.deactivate();
    delete this._plugins[plugin];
  }

  collectPlugins(folders, core = false) {
    if(!folders) {
      return new Error('no folder defined');
    }

    if(!Array.isArray(folders)) {
      folders = [folders];
    }

    let _plugins = [];
    for(let i=0;i<folders.length;i++) {
      let folder = folders[i];
      let plugins = fs.readdirSync(folder);

      for(let i=0;i<plugins.length;i++) {
        let plugin = path.join(folder, plugins[i]);
        if(_.pathExists(plugin, 'isDirectory')) {
          _plugins.push({"folder": plugin, "core": core});
        }
      }
    }

    return _plugins;
  }

  runCollectedPlugins(plugins) {
    let deferred = Promise.defer(),
        promise = deferred.promise;

    let promises = [];
    for(let i=0;i<plugins.length;i++) {
      let plugin = plugins[i];
      promises.push(this.runPlugin(plugin.folder, plugin.core));
    }

    Promise.all(promises).then(()=> {
      deferred.resolve();
    }).catch(()=> {
      deferred.reject();
    });

    return promise;
  }

  runPlugin(folder, core) {
    let deferred = Promise.defer(),
        promise = deferred.promise;

    let configPath = path.join(folder, config.get.plugins.configJSON);
    fs.readJson(configPath, (err, pluginConfig)=> {
      if(err) {
        let message = log('plugin.config.not.json', {"config": configPath});
        return deferred.reject(new Error(message));
      }

      if(!pluginConfig.name) {
        let message = log('no.plugin.name', {"config": configPath});
        return deferred.reject(new Error(message));
      }

      if(this._plugins[pluginConfig.name]) {
        let message = log('plugin.name.already.in.use', {"name": pluginConfig.name});
        return deferred.reject(new Error(message));
      }

      if(!pluginConfig.hammer) {
        let message = log('plugin.no.compatible.hammer.version.defined', {"config": pluginConfig});
        return deferred.reject(new Error(message));
      }

      let mainFile = path.join(folder, pluginConfig.main);
      if(!_.pathExists(mainFile, 'isFile')) {
        let message = log('no.plugin.main.file', {"config": configPath});
        return deferred.reject(new Error(message));
      }

      let plugin = require(mainFile);
      if(!_.isFunction(plugin)) {
        let message = log('plugin.is.not.class', {"plugin": mainFile});
        return deferred.reject(new Error(message));
      }

      if(!semver.satisfies(pk.version, pluginConfig.hammer)) {
        log('plugin.not.compatible.with.current.hammer.version', {"name": pluginConfig.name, "version": pluginConfig.version});
      }

      let _plugin = new plugin();

      promise.then((...args)=> {
        this._plugins[pluginConfig.name] = _plugin;
        this.initRoutes(_plugin);
        this.initHelpers(_plugin);

        debug('%s running', pluginConfig.name);
      });

      if(!_.isFunction(_plugin.then)) {
        deferred.resolve();
        return;
      }

      _plugin.then((plugin)=> {
        _plugin = plugin;
        deferred.resolve();
      }).catch(()=> {
        deferred.reject();
      });
    });

    return promise;
  }

  initRoutes(plugin) {
    if(!plugin.routes) {
      return;
    }

    let routes = plugin.routes;
    if(_.isFunction(routes)) {
      routes = routes();
    }

    //TODO: add error logs
    if(!_.isArray(routes)) {
      return;
    }

    for(let i=0;i<routes.length;i++) {
      let route = routes[i];

      if(!route.fn && !route.cb) {
        continue;
      }

      if(!route.method) {
        continue;
      }

      if(!route.url) {
        continue;
      }

      let url = _.joinUrl(config.get.plugins.baseUrl, route.url);
      if(route.baseUrl) {
        url = _.joinUrl(route.baseUrl, route.url);
      }

      if(route.noBaseUrl) {
        url = route.url;
      }

      http.route[route.method](url, (route.fn || route.cb));
      //TODO: add routes to a collection that they can be deleted when a plugin get's deactivated
    }
  }

  initHelpers(plugin) {
    if(!plugin.helpers) {
      return;
    }

    let helpers = plugin.helpers;
    if(_.isFunction(helpers)) {
      helpers = helpers();
    }

    //TODO: add error logs
    if(!_.isArray(helpers)) {
      return;
    }

    for(let i=0;i<helpers.length;i++) {
      let helper = helpers[i];

      if(!helper.fn && !helper.cb) {
        continue;
      }

      if(!helper.name) {
        continue;
      }

      let name = [helper.name];
      if(helper.alias) {
        name.push(...helper.alias);
      }

      render.helper(name, (helper.fn || helper.cb));
    }
  }

  get get() {
    return this._plugins;
  }
}

module.exports = new Plugins();
