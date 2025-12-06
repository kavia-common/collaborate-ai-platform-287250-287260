const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Event Schema
 * Represents an event or meeting, optionally linked to a project.
 */
const eventSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    trim: true
  },
  meetingUrl: {
    type: String,
    trim: true
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project'
  },
  organizerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Indexes for company isolation and time-based queries
eventSchema.index({ companyId: 1 });
eventSchema.index({ startTime: 1 });
eventSchema.index({ projectId: 1 });

// PUBLIC_INTERFACE
/**
 * Event Model
 * @type {mongoose.Model}
 */
const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
