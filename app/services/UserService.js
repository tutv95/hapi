'use strict';

const _ = require('lodash');
const bcrypt = require('bcrypt');
const knex = require('../../config/bookshelft').knex;
const Models = global.Models;
const commons = global.helpers.commons;
const jwt = require('jsonwebtoken');
const postService = require('./PostService');

let config = global.helpers.config;
const SERVER_KEY = config('SERVER_KEY', '');

module.exports.getUserInfo = function (user_id, cb) {
    new Models.User({
        id: user_id
    }).fetch().then(function (userSql) {
        userSql = userSql.toJSON();

        delete userSql.password;

        addUserDetail(userSql, user_id, function (userDetail) {
            postService.getSolveCount(user_id, function (solveVoteInfo) {
                let solve_count = solveVoteInfo.solve_count;
                let vote_count = solveVoteInfo.vote_count;

                let pointCount = (solve_count * 40) + (vote_count * 5);

                userDetail.point_count = pointCount;
                cb(userDetail);
            });
        });
    });
};

function addUserDetail(userInfo, user_id, cb) {
    userInfo.description = '';
    userInfo.favorite = '';
    new Models.UserDetail({
        user_id: user_id
    }).fetch().then(function (user_detail) {
        if (_.isEmpty(user_detail)) {
            return cb(userInfo);
        } else {
            user_detail = user_detail.toJSON();
            if (!_.isEmpty(user_detail.description)) {
                userInfo.description = user_detail.description;
            }
            if (!_.isEmpty(user_detail.favorite)) {
                userInfo.favorite = user_detail.favorite;
            }

            return cb(userInfo);
        }
    }).catch(function (err) {
        return cb(userInfo);
    });
}

module.exports.updateUserProfile = function (user_id, favorite, description, cb) {
    let dataUpdate = {};
    if (!_.isEmpty(favorite)) {
        dataUpdate.favorite = favorite;
    }
    if (!_.isEmpty(description)) {
        dataUpdate.description = description;
    }

    new Models.UserDetail({
        user_id: user_id
    }).fetch().then(function (user) {
        if (!_.isEmpty(user)) {
            user = user.toJSON();
            new Models.UserDetail({
                id: user.id,
            }).save(dataUpdate, {method: 'update', patch: true})
                .then(function (userDetail) {
                    cb(userDetail);
                })
        } else {
            new Models.UserDetail({
                user_id: user_id,
                favorite: favorite,
                description: description
            }).save().then(function (userSave) {
                cb(userSave);
            })
        }
    })
};

module.exports.updateToken = function (tokenId) {
    // console.log(tokenId);
    new Models.Token({
        id: tokenId
    }).save(
        {time_expire: (Date.now() + commons.timeExtension)},
        {method: 'update', patch: true})
};

module.exports.getTokenUser = getTokenUser;

function getTokenUser(user, callback) {
    let tokenUser = jwt.sign(user, SERVER_KEY);
    callback(tokenUser);
}

module.exports.saveNewToken = saveNewToken;

function saveNewToken(userData, cb) {
    new Models.Token({
        user_id: userData.id,
        time_expire: (Date.now() + commons.timeExtension)
    }).save().then(function (tokenSql) {
        let tokenId = tokenSql.get('id');
        userData.token_id = tokenId;

        getTokenUser(userData, function (tokenUser) {
            delete userData.password;

            return cb(false, {token: tokenUser, user: userData});
        });

    }).catch(function () {
        return cb(true);
    });
}

function deleteAllUserToken(user_id, cb) {
    knex('tokens').where('user_id', user_id).del()
        .then(function () {
            knex('firebase_tokens').where('user_id', user_id).del()
                .then(function () {
                    cb(false);
                });
        })
        .catch(function () {
            cb(true);
        });
}

module.exports.changePassword = function (user_id, old_password, new_password, cb) {
    new Models.User({
        id: user_id
    }).fetch().then(function (userSql) {
        userSql = userSql.toJSON();

        // check old password
        bcrypt.compare(old_password, userSql.password, function (err, res) {
            if (!res) {//Password invalid
                return cb(true, 'Invalid password!');
            }

            // hash password
            bcrypt.hash(new_password, 10, function (err, hashPassword) {
                if (!err){
                    // change password to db
                    new Models.User({
                        id: user_id
                    }).save(
                        {password: hashPassword},
                        {method: 'update', patch: true})
                        .then(function () {
                            userSql.password = hashPassword;

                            // delete all user token & firebase token
                            deleteAllUserToken(user_id, function (err) {
                                if (!err){
                                    // save token
                                    saveNewToken(userSql, function (err, responseData) {
                                        if (!err) {
                                            return cb(false, responseData);
                                        } else {
                                            return cb(true, 'Something went wrong!');
                                        }
                                    });
                                } else {
                                    throw new Error();
                                }
                            });
                        })
                        .catch(function () {
                            return cb(true, 'Something went wrong!');
                        });
                } else {
                    return cb(true, 'Something went wrong!');
                }
            });
        });
    });
};