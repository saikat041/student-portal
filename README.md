# Student Management Portal

A full-stack student management system built with React, Node.js, and MongoDB with JWT authentication.

## Prerequisites
- Node.js (v14+)
- MongoDB Community Edition

## MongoDB Setup

### Install MongoDB (macOS)
```bash
# Add MongoDB tap
brew tap mongodb/brew

# Install MongoDB Community Edition
brew install mongodb-community
```

### MongoDB Commands
```bash
# Start MongoDB manually
mongod --config /opt/homebrew/etc/mongod.conf

# Start MongoDB with custom data directory
mongod --dbpath /opt/homebrew/var/mongodb

# Start MongoDB in background
mongod --config /opt/homebrew/etc/mongod.conf --fork

# Stop MongoDB (if running in foreground, use Ctrl+C)
# If running in background, find process and kill:
ps aux | grep mongod
kill <process_id>

# Connect to MongoDB shell
mongosh

# Connect to specific database
mongosh student-portal

# Check if MongoDB is running
lsof -i :27017

# View MongoDB logs
tail -f /opt/homebrew/var/log/mongodb/mongo.log
```

### MongoDB Configuration
- **Port**: 27017 (default)
- **Database**: student-portal
- **Data Path**: `/opt/homebrew/var/mongodb`
- **Log Path**: `/opt/homebrew/var/log/mongodb/mongo.log`
- **Config File**: `/opt/homebrew/etc/mongod.conf`

## Setup Instructions

### 1. Start MongoDB
```bash
mongod --config /opt/homebrew/etc/mongod.conf --fork
```

### 2. Backend Setup
```bash
cd backend
npm install
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm start
```

## Features
- **Authentication & Authorization**
  - User registration/login with JWT tokens
  - Role-based access control (Admin, Teacher, Student)
  - Password reset functionality
  - Secure password hashing with bcrypt

- **Student Management**
  - Add new students
  - View all students
  - Edit student information
  - Delete students (Admin only)
  - Responsive design

## API Endpoints

### Authentication
- POST /api/auth/register - Register new user
- POST /api/auth/login - User login
- POST /api/auth/forgot-password - Request password reset
- POST /api/auth/reset-password - Reset password
- GET /api/profile - Get user profile (protected)

### Students
- GET /api/students - Get all students (protected)
- POST /api/students - Create new student (Admin/Teacher only)
- PUT /api/students/:id - Update student (Admin/Teacher only)
- DELETE /api/students/:id - Delete student (Admin only)

## User Roles & Permissions
- **Admin**: Full access (CRUD students, manage users)
- **Teacher**: Can create/edit students, view all data
- **Student**: Read-only access to student data

## Sample Users
```
Admin: admin@school.com / admin123
Teacher: john.teacher@school.com / teacher123
Teacher: sarah.wilson@school.com / teacher123
Student: alice.johnson@student.com / student123
Student: bob.smith@student.com / student123
```

## Database Schema

### User Schema
- email (required, unique)
- password (required, hashed)
- firstName (required)
- lastName (required)
- role (admin/teacher/student)
- isActive (boolean)
- lastLogin (date)
- resetToken (string)
- resetTokenExpiry (date)

### Student Schema
- name (required)
- email (required, unique)
- studentId (required, unique)
- course
- year
- user (reference to User)
- createdAt (auto-generated)
