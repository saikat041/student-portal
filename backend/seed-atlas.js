const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const User = mongoose.model('User', userSchema);

async function createUsers() {
  try {
    console.log('Connecting to Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
    
    const users = [
      { firstName: 'Admin', lastName: 'User', email: 'admin@school.com', password: 'admin123', role: 'admin' },
      { firstName: 'John', lastName: 'Teacher', email: 'john.teacher@school.com', password: 'teacher123', role: 'teacher' },
      { firstName: 'Sarah', lastName: 'Wilson', email: 'sarah.wilson@school.com', password: 'teacher123', role: 'teacher' },
      { firstName: 'Alice', lastName: 'Johnson', email: 'alice.johnson@student.com', password: 'student123', role: 'student' },
      { firstName: 'Bob', lastName: 'Smith', email: 'bob.smith@student.com', password: 'student123', role: 'student' }
    ];
    
    console.log('Creating users...');
    
    for (const userData of users) {
      try {
        const existingUser = await User.findOne({ email: userData.email });
        if (!existingUser) {
          const user = new User(userData);
          await user.save();
          console.log('✅ Created:', userData.email, '(' + userData.role + ')');
        } else {
          console.log('⚠️  Already exists:', userData.email);
        }
      } catch (error) {
        console.log('❌ Error creating', userData.email, ':', error.message);
      }
    }
    
    console.log('\n🎉 Sample users added to Atlas database!');
    
    // Verify users were created
    const userCount = await User.countDocuments();
    console.log('📊 Total users in database:', userCount);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createUsers();
