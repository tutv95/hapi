'use strict';

const _ = require('lodash');
const Boom = require('boom');
const Model = global.Model;
const bcrypt = require('bcrypt');

/***
 * Login POST
 */
module.exports.loginPost = {
    handler: function (request, reply) {
        const post = request.payload;
        let email = post.email;
        let password = post.password;

        new Model.User({
            email: email
        }).fetch().then(function (user) {
            if (_.isEmpty(user)) {//Email doesn't exist
                return reply(Boom.unauthorized('Email doesn\'t exist!'));
            }

            bcrypt.compare(password, user.get('password'), function (err, res) {
                if (!res) {//Password invalid
                    console.log(err);
                    return reply(Boom.unauthorized('Invalid password!'));
                }

                // Password valid
                user.generateSession().then(function (user_changed) {
                    reply({
                        error: false,
                        msg: 'Login success!',
                        token: user_changed.getToken()
                    });
                });
            });
        });
    },
    auth: false,
    description: 'Login',
    notes: 'Returns a todo item by the id passed in the path',
    tags: ['api', 'register']
};

/**
 * Register POST
 */
module.exports.registerPost = {
    handler: function (request, reply) {
        return reply({result: 'Register!'});
    },
    auth: false,
    description: 'Register',
    notes: 'Returns a todo item by the id passed in the path',
    tags: ['api', 'register']
};

/**
 * Logout
 */
module.exports.logout = {
    handler: function (request, reply) {
        let user_data = request.auth.credentials;
        let _id = _.get(user_data, 'id', '');
        let _session = _.get(user_data, 'session', '');

        new Model.User({
            id: _id
        }).fetch().then(function (user) {
            if (_session != user.get('session')) {
                return reply(Boom.badRequest('Some thing went wrong!'));
            }

            user.destroyToken().then(function (user_changed) {

                return reply({
                    error: false,
                    msg: 'Logout success!'
                });
            });
        });
    },
    auth: {
        mode: 'required',
        strategies: ['jwt']
    },
    description: 'Logout',
    notes: 'Logout',
    tags: ['api', 'logout']
};