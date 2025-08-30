# Feature Requests App - Features Overview

This document outlines all the core features implemented in the feature requests application.

## Authentication & Authorization

### Admin Authentication
- JWT-based authentication system with access, refresh, and session tokens
- Admin role verification for protected routes
- Session management with token blacklisting support
- CSRF protection for login endpoints
- Rate limiting on authentication endpoints

### User Authentication
- Login/logout functionality
- Password change capability
- Token refresh mechanism
- User profile information retrieval

## Admin Management

### Admin Users
- Create new admin users
- Retrieve list of all admins
- Verify admin credentials
- Change admin passwords
- Admin user data management

### Admin Dashboard
- Dashboard with statistics (total features, votes, comments, admins)
- Tab navigation between dashboard, features, and admins sections
- Admin-specific UI components

## Feature Requests Management

### Feature Creation & Editing
- Create new feature requests
- Edit existing feature requests
- Delete feature requests (admin-only)
- Set feature status (under_review, planned, in_progress, done)
- Add descriptions and titles to features

### Feature Status Management
- Status tracking with four possible states
- Status change functionality for admins
- Status-based filtering and sorting

### Feature Comments
- Add comments to feature requests
- Reply to existing comments
- Delete comments (admin-only)
- Edit comments (admin-only)
- Comment likes functionality
- Nested comment replies

### Feature Voting
- Users can vote on features
- Vote tracking per feature
- Vote-based sorting and trending features

## Applications & Context

### Multi-app Support
- Support for multiple applications within the system
- App-specific feature requests and comments
- App selection in UI components
- App-based filtering and organization

## Notifications

### Notification System
- Create notifications for users
- Mark notifications as read/unread
- Get unread notification counts
- Mark all notifications as read
- Retrieve notification history

## Analytics & Trends

### Trend Tracking
- Calculate and store trending features
- Refresh trend data manually
- Retrieve latest trends from database
- Trend metrics with percentage changes

## API Endpoints

### Admin Management API
- GET /api/admins - Get list of admins
- POST /api/admins - Create new admin
- PATCH /api/admins/[id] - Update admin details
- POST /api/admins/change-password - Change password
- POST /api/admins/verify-token - Verify token
- POST /api/admins/verify - Verify admin credentials

### Feature Management API
- GET /api/features - Get list of features
- POST /api/features - Create new feature
- GET /api/features/[id] - Get specific feature
- PATCH /api/features/[id] - Update feature
- DELETE /api/features/[id] - Delete feature
- POST /api/features/[id]/vote - Vote on feature
- GET /api/features/[id]/comments - Get comments for feature
- POST /api/features/[id]/comments - Add comment to feature

### Comment Management API
- GET /api/features/[id]/comments/[comment_id] - Get specific comment
- PATCH /api/features/[id]/comments/[comment_id] - Update comment
- DELETE /api/features/[id]/comments/[comment_id] - Delete comment
- POST /api/features/[id]/comments/[comment_id]/like - Like a comment

### Application Management API
- GET /api/apps - Get list of applications
- POST /api/apps - Create new application
- DELETE /api/apps/[id] - Delete application

### Authentication API
- GET /api/auth/csrf - Get CSRF token
- POST /api/auth/logout - Logout user
- GET /api/auth/me - Get current user info
- POST /api/auth/refresh - Refresh access token

## UI Components

### Admin Panel
- Loading fallback for admin panel
- Change password modal
- Admin dashboard with statistics
- Feature management interface
- Admin user management

### Feature Pages
- Feature detail page
- Feature list page with filtering and sorting
- Voting functionality
- Commenting system

### Authentication Pages
- Login form
- Password change form
- Registration (admin creation)

## Technical Features

### Caching & Performance
- Request deduplication
- Caching with TTL for API responses
- Database query optimization

### Security
- JWT token verification and validation
- Token blacklisting support
- Rate limiting on sensitive endpoints
- CSRF protection
- Admin-only route protection

### Data Management
- Supabase integration for database operations
- RPC function calls for complex database operations
- Proper error handling and logging
- Data validation and sanitization

## User Experience

### Responsive Design
- Mobile-friendly UI components
- Accessible interface elements
- Intuitive navigation

### Feedback & Interaction
- Loading states for API requests
- Success/error notifications
- Real-time updates where applicable
