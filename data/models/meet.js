var mongoose = require('mongoose');
var MeetSchema = require('../schemas/meet');
var Meet = mongoose.model('Meet', MeetSchema);

module.exports = Meet;