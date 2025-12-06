const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  type: { 
    type: String, 
    enum: ['DIRECT', 'GROUP', 'PROJECT', 'EVENT'], 
    required: true 
  },
  name: { type: String }, // For groups/projects/events. Null for 1:1 (derived from participants)
  contextId: { type: Schema.Types.ObjectId }, // Ref to Project or Event if type is PROJECT/EVENT
  lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' }, // Optimization for list view
  lastMessageAt: { type: Date, default: Date.now }, // For sorting
  creatorId: { type: Schema.Types.ObjectId, ref: 'User' },
  isArchived: { type: Boolean, default: false }
}, { timestamps: true });

// Compound index for efficient user chat list retrieval is handled via ChatMember, 
// but we index companyId for safety.
chatSchema.index({ companyId: 1 });

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;
