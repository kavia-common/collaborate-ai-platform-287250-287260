const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * User Schema
 * Represents a user within a company.
 */
const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'member'],
    default: 'member'
  },
  avatarUrl: {
    type: String
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance and lookups
userSchema.index({ email: 1 });
userSchema.index({ companyId: 1 });

// PUBLIC_INTERFACE
/**
 * User Model
 * @type {mongoose.Model}
 */
const User = mongoose.model('User', userSchema);

module.exports = User;
