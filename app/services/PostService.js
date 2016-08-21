'use strict';

const _ = require('lodash');
const async = require("async");
const request = require('request');
const jwt = require('jsonwebtoken');
const mkdirp = require('mkdirp');
const fs = require('fs');
const Models = global.Models;
const helpers = global.helpers;
const config = helpers.config;

const API_FIREBASE_KEY = config('API_FIREBASE_KEY', '');
const SERVER_KEY = config('SERVER_KEY', 'server_key');

module.exports.getPostInPage = function (pageNumber, pageSize, class_id, user_id, cb) {
    new Models.Post()
        .query(function (qb) {
            qb.where('class_id', '=', class_id);
        })
        .fetchPage({
            page: pageNumber,
            pageSize: pageSize,
            withRelated: ['user', 'comments', 'votes']
        })
        .then(function (result) {
            let pagination = _.get(result, 'pagination', '');
            result = result.toJSON();
            let posts = result;

            for (var i = 0; i < posts.length; i++) {
                let post = posts[i];
                posts[i].author = posts[i].user;
                delete posts[i].user;
                delete posts[i].author.password;

                let cmts = post.comments;
                post.comment_count = cmts.length;
                post.is_solve = 0;
                for (let j = 0; j < cmts.length; j++) {
                    let cmt = cmts[j];
                    if (cmt.is_solve == true) {
                        post.is_solve = 1;
                        break;
                    }
                }
                delete post.comments;

                let votes = post.votes;
                let vote_count = 0;
                for (let j = 0; j < votes.length; j++) {
                    if (votes[j].up == true) {
                        vote_count++;
                    } else {
                        vote_count--;
                    }
                }

                post.vote_count = vote_count;
                delete post.votes;

                // console.log(post);

                if (post.is_incognito == true) {
                    delete post.author;
                }
            }

            checkUserSeen(result, user_id, function (posts) {
                // result = posts;
                let res = {
                    class_id: class_id,
                    posts: posts,
                    pagination: pagination
                };
                // rep(ResponseJSON('', res));
                cb(false, res);
            });
        }).catch(function (err) {
        // console.log(err);
        // rep(Boom.badData('Something went wrong!'));
        cb(true);
    });
}

module.exports.getVotePost = getVotePost;
function getVotePost(post_id, callback) {
    new Models.Post({
        id: post_id
    }).fetch({withRelated: 'votes'}).then(function (post) {
        if (_.isEmpty(post)) {
            callback(0);
        }
        post = post.toJSON();
        let votes = post.votes;

        let vote_count = 0;
        for (var i = 0; i < votes.length; i++) {
            let vote = votes[i];
            if (vote.up == true) {
                vote_count++;
            } else {
                vote_count--;
            }
        }

        callback(vote_count);
    });
}

module.exports.getSolveCount = function (user_id, cb) {
    let res = {
        solve_count: 0,
        vote_count: 0
    };
    let solveCount = 0;
    let voteCount = 0;
    new Models.User({
        id: user_id
    }).fetch({withRelated: ['comments', 'posts']}).then(function (user) {
        user = user.toJSON();
        let cmts = user.comments;
        for (let i = 0; i < cmts.length; i++) {
            let cmt = cmts[i];
            if (cmt.is_solve == true) {
                solveCount++;
            }
        }

        let posts = user.posts;
        async.each(posts,
            function (post, callback) {
                getVotePost(post.id, function (tempVoteCount) {
                    voteCount += tempVoteCount;
                    callback();
                });
            },
            function (err) {
                // when done, call back to rep
                res.solve_count = solveCount;
                res.vote_count = voteCount;
                cb(res);
            })
    });
};

module.exports.checkUserSeen = checkUserSeen;
function checkUserSeen(posts, user_id, cb) {
    if (_.isEmpty(posts)) {
        return cb(posts);
    }

    async.each(posts,
        function (post, callback) {
            let is_seen = 0;
            new Models.Post({
                id: post.id
            }).fetch({withRelated: 'seens'}).then(function (postSql) {
                if (!_.isEmpty(postSql)) {
                    postSql = postSql.toJSON();
                    let seens = postSql.seens;
                    for (var i = 0; i < seens.length; i++) {
                        let seen = seens[i];
                        if (seen.user_id == user_id) {
                            is_seen = 1;
                        }
                    }
                }
                post.is_seen = is_seen;

                callback();
            }).catch(function (err) {
                console.log(err);
                callback();
            });
        },

        function (err) {
            // when done, call back to rep
            cb(posts);
        });
};

module.exports.pushNotiToStudent = function (classId, data) {
    new Models.Class({
        id: classId
    }).fetch({withRelated: 'users.firebase_tokens'}).then(function (classSql) {
        classSql = classSql.toJSON();
        let users = classSql.users;
        for (var i = 0; i < users.length; i++) {
            let user = users[i];
            if (user.capability == 'student') {
                let firebaseTokens = user.firebase_tokens;
                for (var j = 0; j < firebaseTokens.length; j++) {
                    let firebaseToken = firebaseTokens[j];
                    if (firebaseToken.type == 'android') {
                        pushFirebaseNoti(API_FIREBASE_KEY, firebaseToken.token, data);
                    }
                }
            }
        }

    }).catch(function (err) {
        console.log(err);
    });
};

function pushFirebaseNoti(apiKey, deviceToken, data) {
    console.log('api key: ' + apiKey);
    console.log('device: ' + deviceToken);

    let urlReq = 'https://fcm.googleapis.com/fcm/send';

    let form = {
        to: deviceToken,
        // "notification": {
        //     "body": "This week's edition is now available.",
        //     "title": "NewsMagazine.com",
        //     "icon": "new"
        // },
        data: data
    };

    let authorHeader = 'key=' + apiKey;
    let param_post = {
        url: urlReq,
        headers: {
            'Authorization': authorHeader,
            'Content-Type': 'application/json'
        },
        form: form
    };

    request.post(param_post, function (err, response, body) {
        console.log(err);
        console.log(response);
    });
}

module.exports.saveImgAndGetStaticURL = function (file, user_code, cb) {
    let name = file.hapi.filename;
    var savePath = config('PATH_IMG_UPLOAD', '/');
    let serverName = config('SERVER_NAME', '');
    let timeNow = new Date(Date.now());
    let zenPath = user_code + '/' + timeNow.getTime();
    savePath = savePath + '/' + zenPath;
    var path = savePath + '/' + name;

    mkdirp(savePath, function (err) {
        if (err) {
            console.error(err);
            // rep(Boom.badData('Something went wrong!'));
            cb(true);
        } else {
            var newFile = fs.createWriteStream(path);

            newFile.on('error', function (err) {
                console.error(err);
                // rep(Boom.badData('Something went wrong!'));
                cb(true);
            });

            file.pipe(newFile);

            file.on('end', function (err) {
                var res = {
                    filename: file.hapi.filename,
                    headers: file.hapi.headers,
                    path: path,
                    url: (serverName + '/' + zenPath + '/' + encodeURI(name))
                };
                // rep(ResponseJSON('Upload success!', res));
                cb(false, res);
            })
        }
    });
};










