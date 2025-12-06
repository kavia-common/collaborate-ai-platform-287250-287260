const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Company Schema
 * Represents a tenant in the multi-tenant system.
 */
const companySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  domain: {
    type: String,
    trim: true,
    lowercase: true
  },
  settings: {
    type: Map,
    of: String,
    default: {}
  }
}, {
  timestamps: true
});

// PUBLIC_INTERFACE
/**
 * Company Model
 * @type {mongoose.Model}
 */
const Company = mongoose.model('Company', companySchema);

module.exports = Company;
