const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatMemberSchema = new Schema({
  chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  isMuted: { type: Boolean, default: false },
  lastReadMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
  lastReadAt: { type: Date, default: Date.now }
}, { timestamps: true });

chatMemberSchema.index({ userId: 1, chatId: 1 }, { unique: true }); // One membership per chat
chatMemberSchema.index({ chatId: 1 });

const ChatMember = mongoose.model('ChatMember', chatMemberSchema);
module.exports = ChatMember;
