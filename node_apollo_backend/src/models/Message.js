const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Message Schema
 * Represents a chat message in a project or event context.
 */
const messageSchema = new Schema({
  content: {
    type: String
    // Not required anymore as message can be just an attachment
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  
  // New Chat Fields
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'Chat',
    index: true
  },
  attachments: [{
    url: String,
    filename: String,
    mimeType: String,
    size: Number
  }],
  metadata: {
    type: Map,
    of: String
  },

  // Context: Can be linked to a Project OR an Event (or both/neither depending on implementation, but usually one context)
  // These are kept for backward compatibility but should be derived from Chat.contextId in future
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project'
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  },
  // Support for AI generated messages
  isAiGenerated: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for fast retrieval of chat history in specific contexts
messageSchema.index({ companyId: 1 });
messageSchema.index({ chatId: 1, createdAt: -1 }); // Optimized for latest messages in chat
messageSchema.index({ projectId: 1, createdAt: 1 });
messageSchema.index({ eventId: 1, createdAt: 1 });

// PUBLIC_INTERFACE
/**
 * Message Model
 * @type {mongoose.Model}
 */
const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
