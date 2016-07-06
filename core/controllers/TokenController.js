'use strict';

let config = global.config;
let key = config.key;

module.exports.getToken = {
    handler: function (request, reply) {
        var jwt = require('jsonwebtoken');
        var token = jwt.sign({}, key);
        reply({token: token});
    },
    auth: false,
    description: 'Get Token',
    notes: 'Returns a todo item by the id passed in the path',
    tags: ['api', 'token']
};