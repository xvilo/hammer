'use strict';

const path = require('path');
const render = require('./render');

class Config {
  constructor() {
    this._defaultConfig = {
      "port": 8080,
      "database": {
        "client": "sqlite3",
        "connection": {
          "filename": path.join(process.cwd(), 'database')
        }
      },
      "hammerRoot": __dirname,
      "hashRounds": 10,
      "plugins": {
        "corePlugins": path.join(__dirname, '../plugins'),
        "pluginFolders": [path.join(process.cwd(), 'plugins')],
        "configJSON": "config.json",
        "baseUrl": "/hammer/"
      },
      "logging": true,
      "requirePrefix": { //TODO: improve the regex? (i am not a regex jedi)
        "base": /^@hammer/,
        "module": /(?!\/)\w+/g
      }
    };

    this._inputConfig = {};
  }

  set set(json) {
    this._inputConfig = Object.assign(this._inputConfig, json);
  }

  get set() {
    return this._inputConfig;
  }

  get get() {
    return Object.assign(this._defaultConfig, this._inputConfig);
  }

  expandDefault(json) {
    this._defaultConfig = Object.assign(this._defaultConfig, json);
  }
}

module.exports = new Config();
