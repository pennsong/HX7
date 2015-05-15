var jwt = require('jwt-simple');
var express = require('express');
var moment = require('moment');
var router = express.Router();
var async = require("async");
var http = require("http");

var User = require('../data/models/user');
var Meet = require('../data/models/meet');
var Friend = require('../data/models/friend');
var Message = require('../data/models/message');

var JPush = require("jpush-sdk");
var client = JPush.buildClient('de9c785ecdd4b0a348ed49a0', '2205b96b52b2382c000f0b46');

var Firebase = require("firebase");
var hxbaseMeets = new Firebase("https://hxbase.firebaseio.com/meets");
var hxbaseFriends = new Firebase("https://hxbase.firebaseio.com/friends");
var hxbaseMessages = new Firebase("https://hxbase.firebaseio.com/messages");

function parseError(errors){
  var result = {
    errors: {},
    message: "Validation failed",
    name: "ValidationError"
  };
  for (var i in errors)
  {
    var tmpStr = errors[i].path;
    result.errors[tmpStr] = {
      message: errors[i].msg,
      path: errors[i].path,
      type: errors[i].msg,
      name: "ValidatorError"
    }
  }
  return result;
}

function requireAuthentication(req, res, next){
  //console.log(req);
  req.assert('token', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少令牌!"});
    return;
  }
  else
  {
    User.findOne({token: req.body.token}).exec(function(err, doc){
      if (err)
      {
        res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
      }
      else
      {
        if (doc == null)
        {
          res.status(400).json({ ppResult: 'err', ppMsg: "认证错误!"});
        }
        else
        {
          var tmpSex = doc.specialInfo.sex;
          if (!(doc.specialInfoTime) || doc.specialInfoTime < moment().startOf('day').add(-8, 'hours'))
          {
            doc.specialInfo = {sex: tmpSex};
          }
          req.user = doc;
          next();
        }
      }
    });
  }
}

function searchLoc(keyword, lng, lat, callback){
  async.waterfall([
        function(next)
        {
          var ak = "F9266a6c6607e33fb7c3d8da0637ce0b";
          var data = "ak=" + ak;
          data += "&coords=" + lng + "," + lat;

          var options = {
            host: 'api.map.baidu.com',
            port: 80,
            path: '/geoconv/v1/?' + data
          };
          http.get(options, function(res, data) {
            res.setEncoding('utf8');
            result = "";
            res.on("data", function(chunk) {
              result += chunk;
            });
            res.on('end', function () {
              next(null, JSON.parse(result));
            });

          }).on('error', function(err) {
            next(err, null);
          });
        },
        function(result, next)
        {
          var ak = "F9266a6c6607e33fb7c3d8da0637ce0b";
          var output = "json";
          var radius = "2000";
          var scope = "1";
          var data = "query=" + encodeURIComponent(keyword);
          data += "&ak=" + ak;
          data += "&output=" + output;
          data += "&radius=" + radius;
          data += "&scope=" + scope;
          //data += "&location=" + "31.209335300000003" + "," + "121.59487019999999";
          data += "&location=" + result.result[0].y + "," + result.result[0].x;
          data += "&filter=sort_name:distance";

          var options = {
            host: 'api.map.baidu.com',
            port: 80,
            path: '/place/v2/search?' + data
          };

          http.get(options, function(res, data) {
            res.setEncoding('utf8');
            result = "";
            res.on("data", function(chunk) {
              result += chunk;
            });
            res.on('end', function () {
              callback(null, JSON.parse(result));
            });
          }).on('error', function(e) {
            callback(e);
          });
        }
      ],
      callback
  );
}

router.post('/register', function(req, res) {
  req.assert('username', 'required').notEmpty();
  req.assert('password', 'required').notEmpty();
  req.assert('nickname', 'required').notEmpty();
  req.assert('sex', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).send({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  User.create(
      {
        username: req.body.username,
        password: req.body.password,
        nickname: req.body.nickname,
        'specialInfo.sex': req.body.sex
      },
      function(err, doc){
        if (err)
        {
          if (err.code == 11000)
          {
            res.status(400).json({ ppResult: 'err', ppMsg: '用户名已存在!', err: err });
          }
          else
          {
            res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : '注册失败!', err: err });
          }
        }
        else
        {
          res.json({ ppResult: 'ok', ppData: {username: doc.username, password: doc.password}});
        }
      }
  );
});

router.post('/login', function(req, res) {
  req.assert('username', 'required').notEmpty();
  req.assert('password', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).send({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  User.login(req.body.username, req.body.password, function(err, result){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
    }
    else
    {
      res.json({ ppResult: 'ok', ppData: result});
    }
  });
});

//auth
router.all('*', requireAuthentication);

//router.post('/readMeet', function(req, res) {
//  req.assert('meetId', 'required').notEmpty();
//  var errors = req.validationErrors();
//  if (errors) {
//    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
//    return;
//  }
//
//  req.user.readMeet(req.body.meetId, function(err, result){
//    if (err)
//    {
//      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
//    }
//    else
//    {
//      if (!result.creater && !result.target)
//      {
//        res.status(400).json({ ppResult: 'err', ppMsg: '没找到符合条件的meet!' });
//      }
//      else
//      {
//        //上传到hxbase
//        try{
//          //hxbaseMeets.push(JSON.parse(JSON.stringify(result.creater || result.target)));
//          var record = result.creater || result.target;
//          hxbaseMeets.child(record.id).set(JSON.parse(JSON.stringify(record)));
//        }
//        catch(e)
//        {
//          console.log(e);
//        }
//        res.json({ppResult: 'ok', ppData: result});
//      }
//    }
//  });
//});

router.post('/updateLocation', function(req, res) {
  req.assert('lng', 'required').notEmpty();
  req.assert('lat', 'required').notEmpty();
  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "更新位置失败!", err: parseError(errors)});
    return;
  }

  req.user.updateLocation(req.body.lng, req.body.lat, function(err, doc){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : err, err: err });
    }
    else
    {
      res.json({ppResult: 'ok', ppData: {lastLocation: doc.lastLocation, lastLocationTime: doc.lastLocationTime}});
    }
  });
});

router.post('/getLastLocation', function(req, res) {
  res.json({ppResult: 'ok', ppData: { lastLocation: req.user.lastLocation, lastLocationTime: req.user.lastLocationTime}});
});

router.post('/sendMeetCheck', function(req, res) {
  var tmpStr = req.user.sendMeetCheck();
  if (tmpStr == 'ok')
  {
    res.json({ppResult: 'ok'});
  }
  else
  {
    res.status(400).json({ ppResult: 'err', ppMsg: tmpStr});
  }
});

//router.post('/searchLoc', function(req, res) {
//  req.assert('keyword', 'required').notEmpty();
//
//  var errors = req.validationErrors();
//  if (errors) {
//    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
//    return;
//  }
//
//  searchLoc(req.body.keyword, req.user.lastLocation[0], req.user.lastLocation[1], function(err, result){
//    if (err)
//    {
//      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
//    }
//    else
//    {
//      res.json({ppResult: 'ok', ppData: result });
//    }
//  });
//});

router.post('/createMeetSearchTarget', function(req, res) {
  req.assert('sex', 'required').notEmpty();
  req.assert('hair', 'required').notEmpty();
  req.assert('glasses', 'required').notEmpty();
  req.assert('clothesType', 'required').notEmpty();
  req.assert('clothesColor', 'required').notEmpty();
  req.assert('clothesStyle', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  var targets1=[];
  var targets2=[];
  var targets3=[];

  function finalCallback(err){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
      return;
    }
    else
    {
      res.json({ppResult: 'ok', ppData: targets3 });
    }
  }

  async.series([
        function(callback){
          //找本人发送待回复的meet中的目标
          req.user.getMeetTargets(function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else
            {
              targets1 = docs.map(function(item){
                return item.targetUsername;
              });
              callback(null, null);
            }
          });
        },
        function(callback){
          //找本人朋友
          req.user.getFriends(function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else {
              targets2 = docs.map(function(item){
                return (item.username1 == req.user.username ? item.username2 : item.username1);
              });
              callback(null, null);
            }
          });
        },
        function(callback){
          //找符合条件的对象
          req.user.getTargets(req.body.sex, req.body.hair, req.body.glasses, req.body.clothesType, req.body.clothesColor, req.body.clothesStyle, targets1.concat(targets2), function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else {
              targets3 = docs;
              callback(null, null);
            }
          });
        }
      ],
      finalCallback
  );
});

router.post('/confirmMeetSearchTarget', function(req, res) {
  req.assert('meetId', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  var targets1=[];
  var targets2=[];
  var targets3=[];

  function finalCallback(err){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
      return;
    }
    else
    {
      res.json({ppResult: 'ok', ppData: targets3 });
    }
  }

  async.parallel([
        function(callback){
          //找本人发送待回复的meet中的目标
          req.user.getMeetTargets(function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else
            {
              targets1 = docs.map(function(item){
                return item.targetUsername;
              });
              callback(null, null);
            }
          });
        },
        function(callback){
          //找本人朋友
          req.user.getFriends(function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else
            {
              targets2 = docs.main.map(function(item){
                return (item.username1 == req.user.username ? item.username2 : item.username1);
              });
              callback(null, null);
            }
          });
        },
        function(callback){
          //找对应meet
          Meet.findOne({_id: req.body.meetId, createrUsername: req.user.username, status: '待确认'}).exec(function(err, doc){
                if (err)
                {
                  callback(err, null);
                }
                else
                {
                  if (doc == null)
                  {
                    callback({ppMsg: "没有对应meet!"}, null);
                  }
                  else
                  {
                    //找符合条件的对象
                    req.user.getTargets(
                        doc.specialInfo.sex,
                        doc.specialInfo.hair,
                        doc.specialInfo.glasses,
                        doc.specialInfo.clothesType,
                        doc.specialInfo.clothesColor,
                        doc.specialInfo.clothesStyle,
                        targets1.concat(targets2),
                        function(err, docs){
                          if (err)
                          {
                            callback(err, null);
                          }
                          else
                          {
                            targets3 = docs;
                            callback(null, null);
                          }
                        }
                    );
                  }
                }
              }
          );
        }
      ],
      finalCallback
  );
});

router.post('/createMeetNo', function(req, res) {
  req.assert('mapLocName', 'required').notEmpty();
  req.assert('mapLocUid', 'required').notEmpty();
  req.assert('sex', 'required').notEmpty();
  req.assert('hair', 'required').notEmpty();
  req.assert('glasses', 'required').notEmpty();
  req.assert('clothesType', 'required').notEmpty();
  req.assert('clothesColor', 'required').notEmpty();
  req.assert('clothesStyle', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  req.user.createMeetNo(
      req.body.mapLocName,
      req.body.mapLocUid,
      req.body.mapLocAddress,
      req.body.sex,
      req.body.hair,
      req.body.glasses,
      req.body.clothesType,
      req.body.clothesColor,
      req.body.clothesStyle,
      function(err, result)
      {
        if (err)
        {
          res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
        }
        else
        {
          res.json({ ppResult: 'ok', ppData: result.meet});
        }
      }
  );
});

router.post('/selectFake', function(req, res) {
  req.user.selectFake(function(err, result){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
    }
    else
    {
      res.json({ ppResult: 'ok'});
    }
  });
});

router.post('/createMeetClickTarget', function(req, res) {
  req.assert('username', 'required').notEmpty();
  req.assert('mapLocName', 'required').notEmpty();
  req.assert('mapLocUid', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  var ppMsg = req.user.sendMeetCheck();
  if (ppMsg != 'ok')
  {
    res.status(400).json({ ppResult: 'err', ppMsg: ppMsg });
    return;
  }

  async.parallel([
        function(callback){
          //找本人发送待回复的meet中的目标
          req.user.getMeetTargets(function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else
            {
              for(var i = 0; i < docs.length; i++)
              {
                if (docs[i].targetUsername == req.body.username)
                {
                  //已对此人发过邀请
                  callback({ppMsg: '已对此人发过邀请!'}, null);
                  return;
                }
              }
              callback(null, null);
            }
          });
        },
        function(callback){
          //找本人朋友
          req.user.getFriends(function(err, docs){
            if (err)
            {
              callback(err, null);
            }
            else
            {
              for(var i = 0; i < docs.length; i++)
              {
                if (docs[i].username1 == req.body.username || docs[i].username2 == req.body.username)
                {
                  //此人已是你好友
                  callback({ppMsg: '此人已是你好友!'}, null);
                  return;
                }
              }
              callback(null, null);
            }
          });
        }
      ],
      finalCallback
  );

  function finalCallback(err){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
    }
    else
    {
      Meet.findOne(
          {
            createrUsername: req.body.username,
            targetUsername: req.user.username,
            status: '待回复'
          },
          function(err, doc){
            if (err)
            {
              res.status(400).json({ ppResult: 'err', ppMsg: "创建邀请失败!", err: err });
            }
            else{
              if (doc == null)
              {
                //不是互发,生成meet,记录最近发送meet时间,清空最近选择fake时间
                req.user.createMeet(
                    req.body.mapLocName,
                    req.body.mapLocUid,
                    req.body.mapLocAddress,
                    req.body.username,
                    function(err, doc){
                      if (err)
                      {
                        res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : "创建邀请失败!", err: err });
                      }
                      else
                      {
                        res.json({ ppResult: 'ok' });
                      }
                    });
              }
              else
              {
                //互发,生成朋友并修改对方meet状态为成功
                req.user.createFriend(req.body.username, function(err, result){
                  if (err)
                  {
                    res.status(400).json({ ppResult: 'err', ppMsg: "创建邀请失败!", err: err });
                  }
                  else
                  {
                    doc.status='成功';
                    doc.save(function(err){
                      if (err)
                      {
                        res.status(400).json({ ppResult: 'err', ppMsg: "创建邀请失败!", err: err });
                      }
                      else
                      {
                        //上传到hxbase
                        try{
                          hxbaseMeets.child(doc.id).set(JSON.parse(JSON.stringify(doc)));
                        }
                        catch(e)
                        {
                          console.log(e);
                        }
                        res.json({ ppResult: 'ok'});
                      }
                    });
                  }
                });
              }
            }
          }
      );
    }
  }
});

router.post('/confirmMeetClickTarget', function(req, res) {
  req.assert('username', 'required').notEmpty();
  req.assert('meetId', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  if ((req.user.specialInfoTime && req.user.specialInfoTime < moment(moment().format('YYYY-MM-DD')).valueOf())){
    res.status(400).json({ ppResult: 'err', ppMsg: "请更新特征信息!"});
  }
  else
  {
    async.series({
          //判断是否是本人发送待回复的meet中的目标
          one: function(callback)
          {
            req.user.getMeetTargets(function(err, docs){
              if (err)
              {
                callback(err, null);
              }
              else
              {
                for (var i = 0; i < docs.length; i++){
                  if (docs[i].targetUsername == req.body.username)
                  {
                    callback({ppMsg: '你已对此人发出过邀请!'}, null);
                    break;
                  }
                }
                callback(null, null);
              }
            });
          },
          //判断是否是已有朋友
          two: function(callback){
            req.user.getFriends(function(err, docs){
              if (err)
              {
                callback(err, null);
              }
              else
              {
                for (var i = 0; i < docs.length; i++){
                  if (docs[i].username1 == req.body.username || docs[i].username2 == req.body.username)
                  {
                    callback({ppMsg: '此人已是你好友!'}, null);
                    break;
                  }
                }
                callback(null, null);
              }
            });
          },
          //判断是否互发
          three: function(callback){
            Meet.findOne(
                {
                  createrUsername: req.body.username,
                  targetUsername: req.user.username,
                  status: '待回复'
                },
                function(err, doc){
                  if (err)
                  {
                    callback(err, null);
                  }
                  else{
                    if (doc == null)
                    {
                      //不是互发,更新meet的target
                      req.user.confirmMeet(
                          req.body.username,
                          req.body.meetId,
                          function(err, doc){
                            if (err)
                            {
                              res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
                            }
                            else
                            {
                              res.json({ ppResult: 'ok', ppData: doc });
                            }
                          }
                      );
                    }
                    else
                    {
                      //互发
                      req.user.confirmEachOtherMeet(
                          req.body.username,
                          req.body.meetId,
                          doc,
                          function(err, doc){
                            if (err)
                            {
                              res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
                            }
                            else
                            {
                              res.json({ ppResult: 'ok' });
                            }
                          }
                      );
                    }
                  }
                }
            );
          }
        },
        function(err, result){
          if (err)
          {
            res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
          }
          else
          {
            res.json({ ppResult: 'ok' });
          }
        }
    );
  }
});

router.post('/updateSpecialInfo', function(req, res) {
  req.assert('hair', 'required').notEmpty();
  req.assert('glasses', 'required').notEmpty();
  req.assert('clothesType', 'required').notEmpty();
  req.assert('clothesColor', 'required').notEmpty();
  req.assert('clothesStyle', 'required').notEmpty();
  req.assert('specialPic', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  req.user.specialInfo.hair = req.body.hair;
  req.user.specialInfo.glasses = req.body.glasses;
  req.user.specialInfo.clothesType = req.body.clothesType;
  req.user.specialInfo.clothesColor = req.body.clothesColor;
  req.user.specialInfo.clothesStyle = req.body.clothesStyle;
  req.user.specialPic = req.body.specialPic;
  req.user.specialInfoTime = moment().valueOf();

  req.user.save(function(err){
    if (err)
    {
      res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
    }
    else
    {
      //通知附近有发送待确认meet中条件匹配的创建者
      //todo
      res.json({ ppResult: 'ok', ppData: req.user.specialInfoTime});
    }
  });
});

router.post('/getSpecialInfo', function(req, res) {
  if (req.user.specialInfo.hair)
  {
    res.json({ppResult: 'ok', ppData: {specialInfo: req.user.specialInfo, specialPic: req.user.specialPic}});
  }
  else
  {
    res.json({ppResult: 'ok'});
  }
});

router.post('/uploadSpecialPic', function(req, res) {
  if (!(req.files && req.files.specialPic))
  {
    res.status(400).json({ ppResult: 'err', ppMsg: "没有指定上传文件!" });
  }
  else
  {
    res.json({ppResult: 'ok', ppData: req.files.specialPic.name});
  }
});

router.post('/replyMeetSearchTarget', function(req, res) {
  req.assert('sex', 'required').notEmpty();
  req.assert('hair', 'required').notEmpty();
  req.assert('glasses', 'required').notEmpty();
  req.assert('clothesType', 'required').notEmpty();
  req.assert('clothesColor', 'required').notEmpty();
  req.assert('clothesStyle', 'required').notEmpty();
  req.assert('meetId', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  async.waterfall([
        function(next){
          //根据meetId检查是否当前用户是此meet的target
          Meet.findOne({_id: req.body.meetId}).exec(function(err, doc){
            if (err)
            {
              next(err, null);
            }
            else
            {
              if (doc == null)
              {
                next({ppMsg: '没有对应meet!'}, null);
              }
              else
              {
                if (doc.targetUsername != req.user.username)
                {
                  next({ppMsg: '没有对应meet!'}, null);
                }
                else
                {
                  if (doc.replyLeft <= 0)
                  {
                    next({ppMsg: '无回复次数!'}, null);
                  }
                  else
                  {
                    doc.replyLeft--;
                    doc.save(function(err, doc, num){
                      if (err)
                      {
                        next(err, null);
                      }
                      else
                      {
                        //上传到hxbase
                        try{
                          hxbaseMeets.child(doc.id).set(JSON.parse(JSON.stringify(doc)));
                        }
                        catch(e)
                        {
                          console.log(e);
                        }

                        //取得meet creater信息
                        User.findOne({username: doc.createrUsername}).exec(next);
                      }
                    });
                  }
                }
              }
            }
          });
        },
        //看meet creater中的特征信息和提供的回复特征信息是否匹配
        function(result, next){
          var score = 0;
          if (result.specialInfo.hair == req.body.hair)
          {
            score++;
          }
          if (result.specialInfo.glasses == req.body.glasses)
          {
            score++;
          }
          if (result.specialInfo.clothesType == req.body.clothesType)
          {
            score++;
          }
          if (result.specialInfo.clothesColor == req.body.clothesColor)
          {
            score++;
          }
          if (result.specialInfo.clothesStyle == req.body.clothesStyle)
          {
            score++;
          }
          if (result.specialInfo.sex != req.body.sex)
          {
            score = 0;
          }
          if (score < 4){
            res.json({ ppResult: 'ok', ppMsg: '特征信息不匹配!' });
            return;
          }
          //找到creater的SpecialPic, 并加上3张fake图片
          else
          {
            var tmpResult = [{username: result.username, specialPic: result.specialPic}];
            for (var i = 0; i < 4; i++)
            {
              tmpResult.push({username: "fake", specialPic: "fake.png"});
            }
            next(null, tmpResult);
          }
        }
      ],
      function(err, result)
      {
        if (err)
        {
          res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
        }
        else
        {
          res.json({ ppResult: 'ok', ppData: result });
        }
      }
  );
});

//router.post('/sendMsg', function(req, res){
//  req.assert('friendUsername', 'required').notEmpty();
//  req.assert('content', 'required').notEmpty();
//
//  var errors = req.validationErrors();
//  if (errors) {
//    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
//    return;
//  }
//
//  req.user.sendMsg(
//      req.body.friendUsername,
//      req.body.content,
//      function(err, result){
//        if (err)
//        {
//          res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
//        }
//        else
//        {
//          //上传到hxbase
//          try{
//            hxbaseMessages.child(result.id).set(JSON.parse(JSON.stringify(result)));
//          }
//          catch(e)
//          {
//            console.log(e);
//          }
//
//          client.push().setPlatform('ios', 'android')
//              .setAudience(JPush.alias(req.body.friendUsername))
//              .setNotification('Hi, JPush', JPush.ios(req.user.username + "," + req.user.nickname + ":发来一条消息" ), JPush.android(req.user.username + "," + req.user.nickname + ":发来一条消息", null, 1))
//            //.setMessage(result.meet.id)
//              .setOptions(null, 60)
//              .send(function(err, res) {
//                if (err) {
//                  console.log(err.message);
//                } else {
//                  console.log('Sendno: ' + res.sendno);
//                  console.log('Msg_id: ' + res.msg_id);
//                }
//              });
//          res.json({ ppResult: 'ok', ppData: result });
//        }
//      }
//  );
//});

//router.post('/getMsg', function(req, res){
//  req.assert('friendUsername', 'required').notEmpty();
//
//  var errors = req.validationErrors();
//  if (errors) {
//    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
//    return;
//  }
//  req.user.getMsg(
//      req.body.friendUsername,
//      function(err, result){
//        if (err)
//        {
//          res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
//        }
//        else
//        {
//          res.json({ ppResult: 'ok', ppData: result });
//        }
//      }
//  );
//});

//router.post('/readMsg', function(req, res){
//  req.assert('friendUsername', 'required').notEmpty();
//
//  var errors = req.validationErrors();
//  if (errors) {
//    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
//    return;
//  }
//
//  req.user.readMsg(
//      req.body.friendUsername,
//      function(err, result){
//        if (err)
//        {
//          res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
//        }
//        else
//        {
//          res.json({ ppResult: 'ok', ppData: result });
//        }
//      }
//  );
//});

router.post('/replyMeetClickTarget', function(req, res) {
  req.assert('username', 'required').notEmpty();
  req.assert('meetId', 'required').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    res.status(400).json({ ppResult: 'err', ppMsg: "缺少必填项!", err: parseError(errors)});
    return;
  }

  req.user.replyMeetClickTarget(
      req.body.username,
      req.body.meetId,
      function(err, result){
        console.log(err);
        if (err)
        {
          res.status(400).json({ ppResult: 'err', ppMsg: err.ppMsg ? err.ppMsg : null, err: err });
        }
        else
        {
          res.json({ ppResult: 'ok' });
        }
      }
  );
});

module.exports = router;
