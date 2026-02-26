-- Migration script for Anonymous Course Rating Platform
-- This script creates all required tables with appropriate relationships and RLS policies

-- Enable necessary extensions
-- Make sure to enable these in the 'extensions' schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Drop tables if they exist (for clean migrations)
DROP TABLE IF EXISTS flags;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS professors_courses;
DROP TABLE IF EXISTS professors;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;

-- Create the users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID NOT NULL UNIQUE,
  anonymous_id UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  verification_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the courses table
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  credits INTEGER NOT NULL,
  overall_rating NUMERIC(3,2) DEFAULT 0,
  difficulty_rating NUMERIC(3,2) DEFAULT 0,
  workload_rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the professors table
CREATE TABLE professors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  post TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  avatar_url TEXT,
  website TEXT,
  overall_rating NUMERIC(3,2) DEFAULT 0,
  knowledge_rating NUMERIC(3,2) DEFAULT 0,
  teaching_rating NUMERIC(3,2) DEFAULT 0,
  approachability_rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  research_interests TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create junction table for professors and courses (many-to-many)
CREATE TABLE professors_courses (
  professor_id UUID REFERENCES professors(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (professor_id, course_id)
);

-- Create the reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  anonymous_id UUID NOT NULL,
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('course', 'professor')),
  rating_value INTEGER NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
  comment TEXT,
  votes INTEGER DEFAULT 0,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Add specialized ratings based on target type
  difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
  workload_rating INTEGER CHECK (workload_rating BETWEEN 1 AND 5),
  knowledge_rating INTEGER CHECK (knowledge_rating BETWEEN 1 AND 5),
  teaching_rating INTEGER CHECK (teaching_rating BETWEEN 1 AND 5),
  approachability_rating INTEGER CHECK (approachability_rating BETWEEN 1 AND 5),
  
  -- Ensure a user can only review each target once
  UNIQUE (anonymous_id, target_id, target_type)
);

-- Create the votes table
-- UPDATED: Now tracks auth_id to prevent duplicate votes from same user
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  anonymous_id UUID NOT NULL,
  auth_id UUID NOT NULL, -- Track real user to prevent duplicates
  vote_type TEXT NOT NULL CHECK (vote_type IN ('helpful', 'unhelpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure a user can only vote once per review (using anonymous_id for backward compatibility)
  UNIQUE (review_id, anonymous_id),
  -- NEW: Prevent same real user from voting twice (even with different anonymous_ids)
  UNIQUE (review_id, auth_id)
);

-- Create the flags table
CREATE TABLE flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  anonymous_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure a user can only flag each review once
  UNIQUE (review_id, anonymous_id)
);

-- Create indexes for performance
CREATE INDEX idx_reviews_target ON reviews(target_id, target_type);
CREATE INDEX idx_reviews_anonymous_id ON reviews(anonymous_id);
CREATE INDEX idx_votes_review_id ON votes(review_id);
CREATE INDEX idx_votes_auth_id ON votes(auth_id); -- NEW: Index for auth_id lookups
CREATE INDEX idx_flags_review_id ON flags(review_id);
CREATE INDEX idx_flags_status ON flags(status);

-- Create function to update course ratings
CREATE OR REPLACE FUNCTION update_course_ratings() 
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.target_type = 'course' THEN
    UPDATE courses
    SET 
      overall_rating = (
        SELECT COALESCE(AVG(rating_value), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'course'
      ),
      difficulty_rating = (
        SELECT COALESCE(AVG(difficulty_rating), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'course'
      ),
      workload_rating = (
        SELECT COALESCE(AVG(workload_rating), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'course'
      ),
      review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'course'
      ),
      updated_at = NOW()
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' AND OLD.target_type = 'course' THEN
    UPDATE courses
    SET 
      overall_rating = (
        SELECT COALESCE(AVG(rating_value), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'course'
      ),
      difficulty_rating = (
        SELECT COALESCE(AVG(difficulty_rating), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'course'
      ),
      workload_rating = (
        SELECT COALESCE(AVG(workload_rating), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'course'
      ),
      review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'course'
      ),
      updated_at = NOW()
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to update professor ratings
CREATE OR REPLACE FUNCTION update_professor_ratings() 
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.target_type = 'professor' THEN
    UPDATE professors
    SET 
      overall_rating = (
        SELECT COALESCE(AVG(rating_value), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'professor'
      ),
      knowledge_rating = (
        SELECT COALESCE(AVG(knowledge_rating), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'professor'
      ),
      teaching_rating = (
        SELECT COALESCE(AVG(teaching_rating), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'professor'
      ),
      approachability_rating = (
        SELECT COALESCE(AVG(approachability_rating), 0) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'professor'
      ),
      review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE target_id = NEW.target_id AND target_type = 'professor'
      ),
      updated_at = NOW()
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' AND OLD.target_type = 'professor' THEN
    UPDATE professors
    SET 
      overall_rating = (
        SELECT COALESCE(AVG(rating_value), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'professor'
      ),
      knowledge_rating = (
        SELECT COALESCE(AVG(knowledge_rating), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'professor'
      ),
      teaching_rating = (
        SELECT COALESCE(AVG(teaching_rating), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'professor'
      ),
      approachability_rating = (
        SELECT COALESCE(AVG(approachability_rating), 0) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'professor'
      ),
      review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE target_id = OLD.target_id AND target_type = 'professor'
      ),
      updated_at = NOW()
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to update review votes
-- IMPORTANT: SECURITY DEFINER allows this function to bypass RLS policies
-- This is necessary so the trigger can update the reviews table
CREATE OR REPLACE FUNCTION update_review_votes() 
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE reviews
    SET 
      votes = (
        SELECT 
          COUNT(CASE WHEN vote_type = 'helpful' THEN 1 END) - 
          COUNT(CASE WHEN vote_type = 'unhelpful' THEN 1 END)
        FROM votes 
        WHERE review_id = NEW.review_id
      ),
      updated_at = NOW()
    WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reviews
    SET 
      votes = (
        SELECT 
          COUNT(CASE WHEN vote_type = 'helpful' THEN 1 END) - 
          COUNT(CASE WHEN vote_type = 'unhelpful' THEN 1 END)
        FROM votes 
        WHERE review_id = OLD.review_id
      ),
      updated_at = NOW()
    WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to update review flag status
CREATE OR REPLACE FUNCTION update_review_flag_status() 
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Flag the review when a new flag is added
    UPDATE reviews
    SET 
      is_flagged = TRUE,
      updated_at = NOW()
    WHERE id = NEW.review_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_course_ratings_trigger
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_course_ratings();

CREATE TRIGGER update_professor_ratings_trigger
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_professor_ratings();

CREATE TRIGGER update_review_votes_trigger
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW
EXECUTE FUNCTION update_review_votes();

CREATE TRIGGER update_review_flag_status_trigger
AFTER INSERT ON flags
FOR EACH ROW
EXECUTE FUNCTION update_review_flag_status();

-- Function to sanitize PII from comments before insertion
CREATE OR REPLACE FUNCTION sanitize_review_comment()
RETURNS TRIGGER AS $$
BEGIN
  -- Basic sanitization: strip out email patterns
  NEW.comment = REGEXP_REPLACE(NEW.comment, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[email redacted]', 'g');
  
  -- Remove phone number patterns
  NEW.comment = REGEXP_REPLACE(NEW.comment, '\b(\+\d{1,3}[\s-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b', '[phone redacted]', 'g');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sanitize comments before insertion
CREATE TRIGGER sanitize_review_comment_trigger
BEFORE INSERT OR UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION sanitize_review_comment();

-- Add Row-Level Security (RLS) policies
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE professors ENABLE ROW LEVEL SECURITY;
ALTER TABLE professors_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

-- Create a function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get the anonymous ID for the current user
CREATE OR REPLACE FUNCTION get_anonymous_id()
RETURNS UUID AS $$
DECLARE
  anon_id UUID;
BEGIN
  SELECT anonymous_id INTO anon_id FROM users WHERE auth_id = auth.uid();
  RETURN anon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User policies
CREATE POLICY user_select ON users 
  FOR SELECT USING (auth_id = auth.uid() OR is_admin());

CREATE POLICY user_insert ON users 
  FOR INSERT WITH CHECK (auth_id = auth.uid());

CREATE POLICY user_update ON users 
  FOR UPDATE USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

-- Course policies (public read, admin write, but allow trigger updates)
CREATE POLICY course_select ON courses 
  FOR SELECT USING (true);

CREATE POLICY course_insert ON courses 
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY course_update ON courses 
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY course_delete ON courses 
  FOR DELETE USING (is_admin());

-- Professor policies (public read, admin write, but allow trigger updates)
CREATE POLICY professor_select ON professors 
  FOR SELECT USING (true);

CREATE POLICY professor_insert ON professors 
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY professor_update ON professors 
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY professor_delete ON professors 
  FOR DELETE USING (is_admin());

-- Professor_Course junction policies
CREATE POLICY professor_course_select ON professors_courses 
  FOR SELECT USING (true);

CREATE POLICY professor_course_insert ON professors_courses 
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY professor_course_delete ON professors_courses 
  FOR DELETE USING (is_admin());

-- Review policies
CREATE POLICY review_select ON reviews 
  FOR SELECT USING (true);

CREATE POLICY review_insert ON reviews 
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    anonymous_id = get_anonymous_id()
  );

CREATE POLICY review_update ON reviews 
  FOR UPDATE USING (
    anonymous_id = get_anonymous_id() OR is_admin()
  ) WITH CHECK (
    anonymous_id = get_anonymous_id() OR is_admin()
  );

CREATE POLICY review_delete ON reviews 
  FOR DELETE USING (
    anonymous_id = get_anonymous_id() OR is_admin()
  );

-- Vote policies
CREATE POLICY "Allow public to read votes" 
ON votes FOR SELECT 
USING (true);

-- Authenticated users can insert votes with their own auth_id
CREATE POLICY "Authenticated users can insert their own votes" 
ON votes FOR INSERT 
TO authenticated
WITH CHECK (auth_id = auth.uid());

-- Users can update their own votes
CREATE POLICY "Users can update their own votes" 
ON votes FOR UPDATE 
TO authenticated
USING (auth_id = auth.uid())
WITH CHECK (auth_id = auth.uid());

-- Users can delete their own votes
CREATE POLICY "Users can delete their own votes" 
ON votes FOR DELETE 
TO authenticated
USING (auth_id = auth.uid());

-- Flag policies
CREATE POLICY flag_select ON flags 
  FOR SELECT USING (is_admin() OR anonymous_id = get_anonymous_id());

CREATE POLICY flag_insert ON flags 
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    anonymous_id = get_anonymous_id()
  );

CREATE POLICY flag_update ON flags 
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY flag_delete ON flags 
  FOR DELETE USING (is_admin());

-- Create function to create an anonymous user on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_salt TEXT;
  new_hash TEXT;
  existing_user_count INT;
BEGIN
  -- Check if user already exists in our users table
  SELECT COUNT(*) INTO existing_user_count 
  FROM public.users 
  WHERE auth_id = NEW.id;
  
  -- Only create if doesn't exist
  IF existing_user_count = 0 THEN
    -- Generate a salt
    new_salt := encode(extensions.gen_random_bytes(16), 'hex');
    
    -- Create verification hash
    new_hash := encode(extensions.digest(NEW.email || new_salt, 'sha256'), 'hex');
    
    -- Insert new user
    INSERT INTO public.users (auth_id, verification_hash, salt)
    VALUES (NEW.id, new_hash, new_salt);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
