/**
 * Created by max on 04/7/2016.
 */

'use strict';

const Hapi = require('hapi');
const _ = require('lodash');
var config = require('./../config/server');
console.log(config);

const server = new Hapi.Server();
server.connection({port: config.port});

_register_plugins();

/**
 * Start server
 */
server.start((err) => {
    if (err) {
        console.error(err);
    }

    console.log('Server running at:', server.info.uri);
});

/**
 * Register plugins
 * @private
 */
function _register_plugins() {
    var plugins = require('./plugins');

    if (!_.isArray(plugins)) {
        return;
    }

    server.register(plugins, (err) => {
        if (err) {
            console.log('Fail to load plugins.');
            console.error(err);
        }
    });
}