const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Message Schema
 * Represents a chat message in a project or event context.
 */
const messageSchema = new Schema({
  content: {
    type: String,
    required: true
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
  // Context: Can be linked to a Project OR an Event (or both/neither depending on implementation, but usually one context)
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
messageSchema.index({ projectId: 1, createdAt: 1 });
messageSchema.index({ eventId: 1, createdAt: 1 });

// PUBLIC_INTERFACE
/**
 * Message Model
 * @type {mongoose.Model}
 */
const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
