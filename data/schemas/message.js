var mongoose = require('mongoose');

var MessageSchema = mongoose.Schema({
        //username
        from : { type: String, required: true },
        //username
        to : { type: String, required: true },
        content: { type: String, required: true },
        time: { type: Date, required: true },
        unread: {type: Boolean, required: true}
    },
    {
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
    });

MessageSchema
    .virtual('couple')
    .get(function () {
        var f = this.from.toLowerCase();
        var t = this.to.toLowerCase();
        return f > t ? t + "_" + f : f + "_" + t;
    });

module.exports = MessageSchema;