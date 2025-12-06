const Company = require('./Company');
const User = require('./User');
const Project = require('./Project');
const Event = require('./Event');
const Message = require('./Message');
const Chat = require('./Chat');
const ChatMember = require('./ChatMember');

// PUBLIC_INTERFACE
/**
 * Exporting all Mongoose models from a central location.
 */
module.exports = {
  Company,
  User,
  Project,
  Event,
  Message,
  Chat,
  ChatMember
};
