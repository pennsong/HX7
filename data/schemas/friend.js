var mongoose = require('mongoose');

var FriendSchema = mongoose.Schema({
    username1: { type: String, required: true },
    nickname1: { type: String, required: true },
    friendLogo1: {type: String, required: true},
    username2: { type: String, required: true },
    nickname2: { type: String, required: true },
    friendLogo2: {type: String, required: true}
});

module.exports = FriendSchema;