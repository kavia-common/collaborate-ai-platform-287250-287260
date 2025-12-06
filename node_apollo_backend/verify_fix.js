require('dotenv').config();
const mongoose = require('mongoose');
const resolvers = require('./src/graphql/resolvers');
const { User, Company, Event } = require('./src/models');

const runVerification = async () => {
  console.log('Starting verification...');
  
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not found in environment.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Setup dummy data
    const company = await Company.create({ name: 'Test Corp Verification ' + Date.now() });
    const user = await User.create({
      username: 'tester',
      email: `verify${Date.now()}@example.com`,
      password: 'hashedpassword',
      companyId: company._id,
      role: 'admin'
    });

    const context = {
      user: {
        id: user._id,
        companyId: company._id.toString(),
        role: user.role,
        email: user.email
      }
    };

    // Test createEvent
    console.log('Testing createEvent...');
    const eventInput = {
      title: 'Fix Verification Event',
      description: 'Verifying populate removal',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      location: 'Virtual',
      isVirtual: true,
      attendeeIds: []
    };

    // Execute mutation - this should NOT throw StrictPopulateError now
    const createdEvent = await resolvers.Mutation.createEvent(null, { input: eventInput }, context);
    console.log('Event created successfully:', createdEvent._id);

    if (createdEvent.title !== eventInput.title) {
        throw new Error('Event title mismatch');
    }
    
    // Clean up
    await Event.deleteOne({ _id: createdEvent._id });
    await User.deleteOne({ _id: user._id });
    await Company.deleteOne({ _id: company._id });
    
    console.log('Verification successful!');
    process.exit(0);

  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
};

runVerification();
