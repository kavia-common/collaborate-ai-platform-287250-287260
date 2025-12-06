const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Project Schema
 * Represents a collaborative project within a company.
 */
const projectSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: {
      values: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED', 'planning', 'active', 'completed', 'on_hold', 'archived'],
      message: '{VALUE} is not a supported status. Supported values are: PLANNED, IN_PROGRESS, COMPLETED, ON_HOLD, ARCHIVED'
    },
    default: 'PLANNED'
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Indexes for company isolation and filtering
projectSchema.index({ companyId: 1 });
projectSchema.index({ ownerId: 1 });
projectSchema.index({ status: 1 });

// PUBLIC_INTERFACE
/**
 * Project Model
 * @type {mongoose.Model}
 */
const Project = mongoose.model('Project', projectSchema);

module.exports = Project;
