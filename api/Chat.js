const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: { type: String, required: true, enum: ['user', 'model'] },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, default: 'New Operation' },
    messages: [messageSchema],
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Chat || mongoose.model('Chat', chatSchema);