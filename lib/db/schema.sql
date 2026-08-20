-- =============================================
-- USERS TABLE
-- Stores user information from Google OAuth
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT NULL,
    created_at DATETIME NOT NULL
);

-- =============================================
-- SESSIONS TABLE
-- Stores user sessions for authentication
-- =============================================
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX sessions_user_idx (user_id)
);

-- =============================================
-- BATCHES TABLE
-- Groups multiple emails into campaigns
-- =============================================
CREATE TABLE IF NOT EXISTS batches (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX batches_user_idx (user_id)
);

-- =============================================
-- EMAIL_JOBS TABLE
-- Stores all email jobs with scheduling info
-- =============================================
CREATE TABLE IF NOT EXISTS email_jobs (
    -- Primary Key
    id VARCHAR(64) PRIMARY KEY,
    
    -- Foreign Keys
    user_id VARCHAR(64) NOT NULL,
    batch_id VARCHAR(64) NOT NULL,
    
    -- Email Details
    recipient VARCHAR(320) NOT NULL,
    subject VARCHAR(998) NOT NULL,
    body TEXT NOT NULL,
    
    -- Scheduling
    scheduled_at DATETIME NOT NULL,
    
    -- Status & Tracking
    status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    sent_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    
    -- Indexes for performance
    INDEX jobs_user_status_idx (user_id, status),
    INDEX jobs_due_idx (status, scheduled_at),
    
    -- Prevent duplicate emails to same recipient at same time
    UNIQUE KEY jobs_idempotency_idx (user_id, recipient, scheduled_at)
);