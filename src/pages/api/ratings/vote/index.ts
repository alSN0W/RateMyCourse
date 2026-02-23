import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/utils/supabase/server-pages';

/**
 * Vote API Route - UPDATED to prevent duplicate votes using auth_id
 * Handles helpful/unhelpful functionality for course and professor reviews
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);

  // Handle POST - Cast or update vote
  if (req.method === 'POST') {
    try {
      const { review_id, vote_type } = req.body;

      // Validate input
      if (!review_id || !vote_type) {
        return res.status(400).json({ error: 'review_id and vote_type are required' });
      }

      if (!['helpful', 'unhelpful'].includes(vote_type)) {
        return res.status(400).json({ error: 'vote_type must be "helpful" or "unhelpful"' });
      }

      // Get user session
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get anonymous ID
      const { data: anonData, error: anonError } = await supabase.rpc('get_anonymous_id');
      
      if (anonError || !anonData) {
        console.error('Error getting anonymous ID:', anonError);
        return res.status(500).json({ error: 'Failed to get user identifier' });
      }

      const anonymous_id = anonData;
      const auth_id = user.id; // Track real user to prevent duplicates

      // Check if user already voted (by auth_id to prevent duplicate anonymous_ids)
      const { data: existingVote, error: checkError } = await supabase
        .from('votes')
        .select('id, vote_type')
        .eq('review_id', review_id)
        .eq('auth_id', auth_id) // ← Check by real user, not anonymous_id
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing vote:', checkError);
        return res.status(500).json({ error: 'Failed to check existing vote' });
      }

      // Case 1: Same vote type - remove vote (toggle off)
      if (existingVote && existingVote.vote_type === vote_type) {
        const { error: deleteError } = await supabase
          .from('votes')
          .delete()
          .eq('id', existingVote.id);

        if (deleteError) {
          console.error('Error deleting vote:', deleteError);
          return res.status(500).json({ error: 'Failed to remove vote' });
        }

        return res.status(200).json({
          success: true,
          action: 'removed',
          vote_type: null,
        });
      }

      // Case 2: Different vote type - update vote
      if (existingVote && existingVote.vote_type !== vote_type) {
        const { error: updateError } = await supabase
          .from('votes')
          .update({ 
            vote_type, 
            anonymous_id, // Update anonymous_id in case it changed
            created_at: new Date().toISOString() 
          })
          .eq('id', existingVote.id);

        if (updateError) {
          console.error('Error updating vote:', updateError);
          return res.status(500).json({ error: 'Failed to update vote' });
        }

        return res.status(200).json({
          success: true,
          action: 'updated',
          vote_type,
        });
      }

      // Case 3: New vote - insert
      const { error: insertError } = await supabase
        .from('votes')
        .insert({
          review_id,
          anonymous_id,
          auth_id, // ← Add auth_id to track real user
          vote_type,
        });

      if (insertError) {
        console.error('Error inserting vote:', insertError);
        return res.status(500).json({ error: 'Failed to cast vote' });
      }

      return res.status(200).json({
        success: true,
        action: 'created',
        vote_type,
      });

    } catch (error) {
      console.error('Unexpected error in vote route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handle GET - Fetch user votes
  else if (req.method === 'GET') {
    try {
      const { review_ids } = req.query;

      if (!review_ids || typeof review_ids !== 'string') {
        return res.status(400).json({ error: 'review_ids parameter is required' });
      }

      // Get user session
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // If not logged in, return empty votes
        return res.status(200).json({
          success: true,
          votes: {},
        });
      }

      const auth_id = user.id;
      const reviewIdArray = review_ids.split(',').map(id => id.trim());

      // Batch fetch votes by auth_id
      const { data: votes, error: fetchError } = await supabase
        .from('votes')
        .select('review_id, vote_type')
        .eq('auth_id', auth_id) // ← Fetch by real user
        .in('review_id', reviewIdArray);

      if (fetchError) {
        console.error('Error fetching votes:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch votes' });
      }

      // Transform to object map
      const votesMap = (votes || []).reduce((acc, vote) => {
        acc[vote.review_id] = vote.vote_type;
        return acc;
      }, {} as Record<string, string>);

      return res.status(200).json({
        success: true,
        votes: votesMap,
      });

    } catch (error) {
      console.error('Unexpected error in vote GET route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handle DELETE - Remove vote
  else if (req.method === 'DELETE') {
    try {
      const { review_id } = req.body;

      if (!review_id) {
        return res.status(400).json({ error: 'review_id is required' });
      }

      // Get user session
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const auth_id = user.id;

      // Delete the vote by auth_id
      const { error: deleteError } = await supabase
        .from('votes')
        .delete()
        .eq('review_id', review_id)
        .eq('auth_id', auth_id); // ← Delete by real user

      if (deleteError) {
        console.error('Error deleting vote:', deleteError);
        return res.status(500).json({ error: 'Failed to delete vote' });
      }

      return res.status(200).json({
        success: true,
        action: 'deleted',
      });

    } catch (error) {
      console.error('Unexpected error in vote DELETE route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Method not allowed
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}