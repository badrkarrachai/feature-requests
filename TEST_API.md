# API Testing Guide

This guide provides step-by-step instructions to test all the newly implemented API endpoints for the feature detail page.

## Prerequisites

1. Ensure your database is set up with the schema in `schema.sql`
2. Ensure Supabase environment variables are configured
3. Run `npm run dev` to start the development server

## Test Data Setup

First, create a test feature request through the main UI at `/features?email=test@example.com&name=Test User`

## API Endpoints Testing

### 1. Get Single Feature

```bash
curl "http://localhost:3000/api/features/YOUR_FEATURE_ID?email=test@example.com&name=Test%20User"
```

**Expected Response:**

```json
{
  "id": "uuid",
  "title": "Feature title",
  "description": "Feature description",
  "status": "under_review",
  "votes_count": 1,
  "comments_count": 0,
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "author_name": "Test User",
  "author_email": "test@example.com",
  "votedByMe": true
}
```

### 2. Get Feature Comments (Empty initially)

```bash
curl "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments?email=test@example.com&name=Test%20User&sort=newest"
```

**Expected Response:**

```json
{
  "comments": [],
  "sort": "newest"
}
```

### 3. Add a Comment

```bash
curl -X POST "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "content": "This is a test comment!"
  }'
```

**Expected Response:**

```json
{
  "comment": {
    "id": "uuid",
    "content": "This is a test comment!",
    "created_at": "timestamp",
    "author_name": "Test User",
    "author_email": "test@example.com",
    "feature_id": "uuid",
    "parent_id": null,
    "is_deleted": false,
    "likes_count": 0,
    "replies_count": 0,
    "edited_at": null
  },
  "success": true
}
```

### 4. Add a Reply Comment

```bash
curl -X POST "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reply@example.com",
    "name": "Reply User",
    "content": "This is a reply!",
    "parent_comment_id": "YOUR_COMMENT_ID"
  }'
```

### 5. Like a Comment

```bash
curl -X POST "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments/YOUR_COMMENT_ID/like" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User"
  }'
```

**Expected Response:**

```json
{
  "liked": true,
  "likes_count": 1,
  "action": "added"
}
```

### 6. Unlike a Comment (Toggle)

```bash
curl -X POST "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments/YOUR_COMMENT_ID/like" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User"
  }'
```

**Expected Response:**

```json
{
  "liked": false,
  "likes_count": 0,
  "action": "removed"
}
```

### 7. Edit a Comment

```bash
curl -X PATCH "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments/YOUR_COMMENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "content": "This is an edited comment!"
  }'
```

### 8. Soft Delete a Comment

```bash
curl -X DELETE "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments/YOUR_COMMENT_ID?email=test@example.com"
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Comment deleted successfully"
}
```

### 9. Verify Comments After Operations

```bash
curl "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments?email=test@example.com&name=Test%20User"
```

Should show the soft-deleted comment with `is_deleted: true` and `content: null`.

## UI Testing

### Feature Detail Page

1. Navigate to `/features/YOUR_FEATURE_ID?email=test@example.com&name=Test%20User`
2. Verify feature details load correctly
3. Test vote toggle functionality
4. Add comments using the form
5. Test like button on comments
6. Verify activity feed updates in real-time

### Error Scenarios

1. Try accessing non-existent feature ID
2. Try adding empty comment
3. Try adding comment longer than 500 characters
4. Try accessing without email/name parameters
5. Try replying to a reply (should fail)

## Database Verification

After testing, verify in your database:

```sql
-- Check features table
SELECT * FROM features_public WHERE id = 'YOUR_FEATURE_ID';

-- Check comments
SELECT * FROM comments_public WHERE feature_id = 'YOUR_FEATURE_ID';

-- Check votes
SELECT * FROM votes WHERE feature_id = 'YOUR_FEATURE_ID';

-- Check comment reactions
SELECT * FROM comment_reactions;
```

## Performance Testing

For load testing, you can use tools like:

- Apache Bench: `ab -n 100 -c 10 "http://localhost:3000/api/features/YOUR_FEATURE_ID/comments?email=test@example.com&name=Test%20User"`
- curl with `--parallel` for concurrent requests

## Common Issues

1. **"Feature not found"**: Ensure feature ID exists in database
2. **"User not found"**: Email must match exactly with existing user
3. **RPC function errors**: Check Supabase logs for database function issues
4. **CORS errors**: Ensure development server is running on correct port

## Success Criteria

All endpoints should:

- ✅ Return proper HTTP status codes
- ✅ Handle errors gracefully with descriptive messages
- ✅ Validate input parameters correctly
- ✅ Use RPC functions from schema properly
- ✅ Maintain data consistency
- ✅ Support real-time UI updates
