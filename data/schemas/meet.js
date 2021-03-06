var mongoose = require('mongoose');
var async = require("async");

var MeetSchema = new mongoose.Schema({
    createrUsername: {
        type: String,
        required: true
    },
    createrNickname: String,
    createrSpecialPic: String,
    targetUsername: String,
    targetNickname: String,
    targetSpecialPic: String,
    targetUnread: Boolean,
    confirmTime: Date,
    status: {
        type: String,
        enum: ['待确认', '待回复', '成功'],
        required: true
    },
    replyLeft: {
        type: Number,
        default: 2,
        required: true
    },
    mapLoc: {
        name: {
            type: String,
            required: true
        },
        address: {
            type: String
        },
        uid: {
            type: String,
            required: true
        }
    },
    personLoc: {
        type: [Number],
        required: true,
        index: '2dsphere'
    },
    specialInfo: {
        sex: {
            type: String,
            enum: ['男', '女']
        },
        hair: {
            type: String
        },
        glasses: {
            type: String
        },
        clothesType: {
            type: String
        },
        clothesColor: {
            type: String
        },
        clothesStyle: {
            type: String
        }
    }
});

MeetSchema.virtual('created')
    .get(function () {
        if (this.confirmTime) {
            return this.confirmTime;
        } else {
            return this._id.getTimestamp();
        }
    });

module.exports = MeetSchema;
