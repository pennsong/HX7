var mongoose = require('mongoose');
var moment = require('moment');
var async = require("async");
var jwt = require('jwt-simple');

var UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: { type: String, required: true },
    token: { type: String, unique: true, sparse: true },
    specialInfo: {
        sex: { type: String, enum: ['男', '女'], required: true },
        hair  : String,
        glasses : String,
        clothesType : String,
        clothesColor : String,
        clothesStyle : String
    },
    specialPic : String,
    specialInfoTime : Date,
    lastLocation : {
        type: [Number],//lng, lat
        index: '2dsphere'
    },
    lastLocationTime : Date,
    lastMeetCreateTime : Date,
    lastFakeTime : Date
});

UserSchema.statics.login = function(username, password, callback){
    var tmpUser;
    var loginResult = {};
    var self = this;

    async.waterfall([
            function(next){
                //验证用户名密码
                self.findOne(
                    {
                        username: username,
                        password: password
                    },
                    next
                );
            },
            function(result, next)
            {
                if (result == null) {
                    next({
                        ppMsg: '用户名或密码错误!'
                    }, null);
                }
                //用户名密码正确
                else {
                    tmpUser = result;
                    loginResult.user = {
                        username: tmpUser.username,
                        nickname: tmpUser.nickname,
                        specialInfo: tmpUser.specialInfo,
                        specialPic: tmpUser.specialPic,
                        specialPicDisplay: tmpUser.specialPic,
                        specialInfoTime: tmpUser.specialInfoTime,
                        lastLocation: tmpUser.lastLocation,
                        lastLocationTime: tmpUser.lastLocationTime
                    };

                    //更新token
                    var expires = moment().add(100, 'year').valueOf();
                    var token = jwt.encode({
                            iss: tmpUser.id,
                            exp: expires
                        },
                        'ppToken'
                    );
                    self.update(
                        {
                            _id: tmpUser._id
                        },
                        {
                            $set:
                            {
                                token: token
                            }
                        },
                        function (err, numberAffected, raw)
                        {
                            loginResult.token = token;
                            next(err, loginResult);
                        }
                    );
                }

            }
        ],
        callback
    );
}

//发送meet检查
UserSchema.methods.sendMeetCheck = function() {
    var tmpNow =  moment();

    if (!(this.specialInfoTime && this.specialInfoTime > moment(moment().format('YYYY-MM-DD')).valueOf())){
        return '请更新特征信息!';
    }
    else if (!(this.lastLocationTime > moment(tmpNow).add(-1, 'd').valueOf()))
    {
        return '无法定位最新位置!';
    }
    else if (this.lastMeetCreateTime && !(this.lastMeetCreateTime < moment(tmpNow).add(-30, 's').valueOf())){
        return '距离允许发送新邀请还有:' + (this.lastMeetCreateTime - moment(tmpNow).add(-30, 's').valueOf())/1000 + '秒';
    }
    else
    {
        return 'ok';
    }
};

//找本人发送待回复的meet中的目标
UserSchema.methods.getMeetTargets = function(callback) {
    this.model('Meet')
        .find({
            'createrUsername': this.username,
            status: "待回复"
        })
        .select('targetUsername')
        .exec(callback);
};

//找符合条件的对象
UserSchema.methods.getTargets = function(sex, hair, glasses, clothesType, clothesColor, clothesStyle, exclusiveArray, callback) {
    this.model('User')
        .aggregate(
        [
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [ this.lastLocation[0], this.lastLocation[1] ] },
                    distanceField: "lastLocation",
                    maxDistance: 500,
                    query: {
                        specialInfoTime: {$gt: new Date(moment().startOf('day'))},
                        lastLocationTime: {$gt: new Date(moment().add(-1, 'd'))},
                        "specialInfo.sex": sex,
                        username: {$ne: this.username},
                        username: {$nin: exclusiveArray}
                    },
                    spherical: true
                }
            },
            {
                $project:
                {
                    username: 1,
                    specialPic: 1,
                    score:
                    {
                        $add:
                            [
                                {
                                    $cond:
                                        [
                                            {
                                                $eq: [ "$specialInfo.hair", hair ]
                                            },
                                            1,
                                            0
                                        ]
                                },
                                {
                                    $cond:
                                        [
                                            {
                                                $eq: [ "$specialInfo.glasses", glasses ]
                                            },
                                            1,
                                            0
                                        ]
                                },
                                {
                                    $cond:
                                        [
                                            {
                                                $eq: [ "$specialInfo.clothesType", clothesType ]
                                            },
                                            1,
                                            0
                                        ]
                                },
                                {
                                    $cond:
                                        [
                                            {
                                                $eq: [ "$specialInfo.clothesColor", clothesColor ]
                                            },
                                            1,
                                            0
                                        ]
                                },
                                {
                                    $cond:
                                        [
                                            {
                                                $eq: [ "$specialInfo.clothesStyle", clothesStyle ]
                                            },
                                            1,
                                            0
                                        ]
                                }
                            ]
                    }
                }
            },
            {
                $match :
                {
                    score : { $gte : 4 }
                }
            }
        ]
    ).exec(callback);
};

//生成朋友
UserSchema.methods.createFriend = function(targetUsername, callback) {
    var self = this;

    this.model('User').findOne(
        {
            username: targetUsername
        }
    ).exec(
        function(err, doc)
        {
            if (err)
            {
                callback(err, null);
            }
            else if (!doc)
            {
                callback({ppMsg: '没找到对应目标!'}, null);
            }
            else
            {
                self.model('Friend')
                    .create({
                        username1: self.username,
                        nickname1: self.nickname,
                        friendLogo1: self.specialPic,
                        username1: doc.username,
                        nickname1: doc.nickname,
                        friendLogo1: doc.specialPic
                    },
                    callback
                );
            }
        }
    );
};

//更新位置
UserSchema.methods.updateLocation = function(lng, lat, callback){
    this.lastLocation = [lng, lat];
    this.lastLocationTime = moment().valueOf();
    this.save(callback);
};

//创建meet不在其中
UserSchema.methods.createMeetNo = function(
    mapLocName,
    mapLocUid,
    mapLocAddress,
    sex,
    hair,
    glasses,
    clothesType,
    clothesColor,
    clothesStyle, callback){

    var self = this;
    async.series({
            lastMeetCreateTime: function(callback)
            {
                //修改最后发送meet时间
                self.lastMeetCreateTime = moment().valueOf();
                self.save(callback);
            },
            meet: function(callback){
                //创建待确认meet
                self.model('Meet').create(
                    {
                        createrUsername: self.username,
                        createrNickname: self.username,
                        createrSpecialPic: self.specialPic,
                        createrUnread: true,
                        status: '待确认',
                        replyLeft: 2,
                        mapLoc: {
                            name: mapLocName,
                            address: mapLocAddress,
                            uid: mapLocUid
                        },
                        personLoc: [self.lastLocation[0], self.lastLocation[1]],
                        specialInfo: {
                            sex: sex,
                            hair: hair,
                            glasses: glasses,
                            clothesType: clothesType,
                            clothesColor: clothesColor,
                            clothesStyle: clothesStyle
                        }
                    },
                    callback
                );
            }
        },
        callback
    );
};

UserSchema.methods.selectFake = function(callback){
    //确定此用户是否是30s内有点击fake
    var tmpNow = moment().valueOf();
    if (this.lastFakeTime > moment(tmpNow).add(-30, 's').valueOf())
    {
        //如果是则把meet最后发送时间改为now
        this.lastMeetCreateTime = tmpNow;
        this.lastFakeTime = undefined;
    }
    else
    {
        this.lastFakeTime = tmpNow;
    }
    this.save(callback);
};

//创建meet
UserSchema.methods.createMeet = function(mapLocName, mapLocUid, mapLocAddress, username, callback){
    var self = this;
    async.waterfall([
            function(next)
            {
                //更新最近发送meet时间,清空最近选择fake时间
                self.lastMeetCreateTime = moment().valueOf();
                self.lastFakeTime = undefined;
                self.save(next);
            },
            function(result, num, next)
            {
                //查找target
                self.model('User').findOne({username: username}, next);
            },
            function(result, next){
                if (result == null)
                {
                    next({ppMsg: '没有找到对应目标!'}, null);
                }
                else
                {
                    //创建meet
                    self.model('Meet').create(
                        {
                            createrUsername: self.username,
                            createrNickname: self.nickname,
                            createrSpecialPic: self.specialPic,
                            createrUnread: false,
                            targetUsername: result.username,
                            targetNickname: result.nickname,
                            targetSpecialPic: result.specialPic,
                            targetUnread: true,
                            status: '待回复',
                            replyLeft: 2,
                            mapLoc: {
                                name: mapLocName,
                                address: mapLocAddress,
                                uid: mapLocUid
                            },
                            personLoc: [self.lastLocation[0], self.lastLocation[1]],
                            specialInfo: {
                                sex: result.specialInfo.sex,
                                hair: result.specialInfo.hair,
                                glasses: result.specialInfo.glasses,
                                clothesType: result.specialInfo.clothesType,
                                clothesColor: result.specialInfo.clothesColor,
                                clothesStyle: result.specialInfo.clothesStyle
                            }
                        },
                        next
                    );
                }
            }
        ],
        callback
    );
};

//确认meet
UserSchema.methods.confirmMeet = function(username, meetId, callback){
    var self = this;

    async.waterfall([
            function(next)
            {
                //清空最近选择fake时间
                self.lastFakeTime = undefined;
                self.save(next);
            },
            function(result, num, next)
            {
                //查找target
                self.model('User').findOne({username: username}, next);
            },
            function(result, next){
                if (result == null)
                {
                    next({ppMsg: '没有找到对应目标!'}, null);
                }
                else
                {
                    //更新meet target
                    self.model('Meet').findOneAndUpdate(
                        {
                            _id: meetId
                        },
                        {
                            $set:{
                                targetUsername: result.username,
                                targetNickname: result.username,
                                targetSpecialPic: result.specialPic,
                                targetUnread: false,
                                status: '待回复'
                            }
                        },
                        next
                    );
                }
            }
        ],
        callback
    );
};

//确认互发meet
UserSchema.methods.confirmEachOtherMeet = function(username, meetId, anotherMeet, callback){
    var self = this;
    async.waterfall([
            //清空最近选择fake时间
            function(next)
            {
                self.lastFakeTime = undefined;
                self.save(next);
            },
            function(result, num, next)
            {
                //查找target
                self.model('User').findOne({username: username}, next);
            },
            //己方meet添加target为对方并修改状态为'成功'
            function(result, next){
                if (result == null)
                {
                    next({ppMsg: '没有找到对应目标!'}, null);
                }
                else
                {
                    //更新meet target
                    self.model('Meet').findOneAndUpdate(
                        {
                            _id: meetId
                        },
                        {
                            $set:{
                                targetUsername: result.username,
                                targetNickname: result.username,
                                targetSpecialPic: result.specialPic,
                                targetUnread: false,
                                status: '成功'
                            }
                        },
                        next
                    );
                }
            },
            //生成朋友
            function(result, next)
            {
                this.createFriend(username, next);
            },
            //修改对方meet状态为成功
            function(result, next)
            {
                doc.status = '成功';
                doc.save(next);
            }
        ],
        callback
    );
};

//回复meet点击真人
UserSchema.methods.replyMeetClickTarget = function(username, meetId, callback){
    var self = this;

    async.waterfall([
            function(next)
            {
                self.model('Meet').findOneAndUpdate(
                    {
                        _id: meetId,
                        targetUsername: self.username,
                        status: '待回复',
                        createrUsername: username
                    },
                    {
                        $set:{
                            status: '成功'
                        }
                    },
                    next);
            },
            //己方meet添加target并修改状态为'成功'
            function(result, next){
                if (result == null)
                {
                    next({ppMsg: '没有对应meet!'}, null);
                }
                //生成朋友
                else
                {
                    self.createFriend(username, next);
                }
            },
            function(result, next)
            {
                //清空最近选择fake时间
                self.lastFakeTime = undefined;
                self.save(next);
            }
        ],
        callback
    );
};

UserSchema.methods.readMeet = function(meetId, callback) {
    var self = this;
    async.parallel({
            creater: function(callback)
            {
                self.model('Meet').findOneAndUpdate(
                    {
                        _id: meetId,
                        createrUsername: self.username,
                        createrUnread: true
                    },
                    {
                        $set:{
                            createrUnread: false
                        }
                    },
                    callback
                );
            },
            target: function(callback){
                self.model('Meet').findOneAndUpdate(
                    {
                        _id: meetId,
                        targetUsername: self.username,
                        targetUnread: true
                    },
                    {
                        $set:{
                            targetUnread: false
                        }
                    },
                    callback
                );
            }
        },
        callback
    );
};

UserSchema.methods.sendMsg = function(friendUsername, content, callback) {
    this.model('Message')
        .create({
            from: this.username,
            to: friendUsername,
            content: content,
            time: moment().valueOf(),
            unread: true
        },
        callback
    );
};

UserSchema.methods.readMsg = function(friendUsername, callback) {
    this.model('Message').update(
        {from: friendUsername, to: this.username, unread: true},
        {unread: false},
        {multi: true},
        callback
    );
};

//找本人朋友
UserSchema.methods.getFriends = function(callback) {
    this.model('Friend')
        .find({
            $or: [
                {username1: this.username},
                {username2: this.username}
            ]
        })
        .exec(callback);
};

module.exports = UserSchema;
