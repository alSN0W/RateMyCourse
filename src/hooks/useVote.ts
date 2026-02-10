import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export type VoteType = 'helpful' | 'unhelpful' | null;

interface VoteState {
  [reviewId: string]: VoteType;
}

interface VoteCounts {
  [reviewId: string]: {
    helpful: number;
    unhelpful: number;
  };
}

interface UseVotesOptions {
  reviewIds?: string[];
  initialCounts?: VoteCounts;
  onVoteSuccess?: (reviewId: string, voteType: VoteType) => void;
  onVoteError?: (error: Error) => void;
}

interface UseVotesReturn {
  votes: VoteState;
  voteCounts: VoteCounts;
  isLoading: boolean;
  castVote: (reviewId: string, voteType: 'helpful' | 'unhelpful') => Promise<void>;
  removeVote: (reviewId: string) => Promise<void>;
  toggleVote: (reviewId: string, voteType: 'helpful' | 'unhelpful') => Promise<void>;
  getUserVote: (reviewId: string) => VoteType;
  refreshVotes: (reviewIds?: string[]) => Promise<void>;
}

export function useVotes(options: UseVotesOptions = {}): UseVotesReturn {
  const { reviewIds = [], initialCounts = {}, onVoteSuccess, onVoteError } = options;

  const [votes, setVotes] = useState<VoteState>({});
  const [voteCounts, setVoteCounts] = useState<VoteCounts>(initialCounts);
  const [isLoading, setIsLoading] = useState(false);
  
  // Track pending operations to prevent race conditions
  const pendingOperations = useRef<Set<string>>(new Set());
  
  // Cache to store previous states for rollback
  const rollbackCache = useRef<Map<string, {
    vote: VoteType;
    counts: { helpful: number; unhelpful: number };
  }>>(new Map());

  /**
   * Fetch user votes for specified review IDs
   */
  const fetchUserVotes = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/ratings/vote?review_ids=${ids.join(',')}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch votes');
      }

      const data = await response.json();
      
      if (data.success) {
        setVotes(prev => ({
          ...prev,
          ...data.votes,
        }));
      }
    } catch (error) {
      console.error('Error fetching votes:', error);
      if (onVoteError) {
        onVoteError(error instanceof Error ? error : new Error('Failed to fetch votes'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [onVoteError]);

  /**
   * Initial fetch on mount or when reviewIds change
   */
  useEffect(() => {
    if (reviewIds.length > 0) {
      fetchUserVotes(reviewIds);
    }
  }, [reviewIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Update vote counts optimistically
   */
  const updateVoteCountsOptimistically = useCallback(
    (reviewId: string, oldVote: VoteType, newVote: VoteType) => {
      setVoteCounts(prev => {
        const current = prev[reviewId] || { helpful: 0, unhelpful: 0 };
        let helpful = current.helpful;
        let unhelpful = current.unhelpful;

        // Remove old vote
        if (oldVote === 'helpful') helpful--;
        if (oldVote === 'unhelpful') unhelpful--;

        // Add new vote
        if (newVote === 'helpful') helpful++;
        if (newVote === 'unhelpful') unhelpful++;

        return {
          ...prev,
          [reviewId]: { helpful, unhelpful },
        };
      });
    },
    []
  );

  /**
   * Rollback optimistic updates on error
   */
  const rollbackVote = useCallback((reviewId: string) => {
    const cached = rollbackCache.current.get(reviewId);
    if (cached) {
      setVotes(prev => ({
        ...prev,
        [reviewId]: cached.vote,
      }));
      setVoteCounts(prev => ({
        ...prev,
        [reviewId]: cached.counts,
      }));
      rollbackCache.current.delete(reviewId);
    }
  }, []);

  /**
   * Cast or update a vote
   */
  const castVote = useCallback(
    async (reviewId: string, voteType: 'helpful' | 'unhelpful') => {
      // Prevent concurrent operations on the same review
      if (pendingOperations.current.has(reviewId)) {
        return;
      }

      pendingOperations.current.add(reviewId);

      try {
        const oldVote = votes[reviewId] || null;
        const oldCounts = voteCounts[reviewId] || { helpful: 0, unhelpful: 0 };

        // Save state for potential rollback
        rollbackCache.current.set(reviewId, {
          vote: oldVote,
          counts: oldCounts,
        });

        // Optimistic update
        setVotes(prev => ({
          ...prev,
          [reviewId]: voteType,
        }));
        updateVoteCountsOptimistically(reviewId, oldVote, voteType);

        // API call
        const response = await fetch('/api/ratings/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_id: reviewId, vote_type: voteType }),
        });

        if (!response.ok) {
          throw new Error('Failed to cast vote');
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to cast vote');
        }

        // Update state based on server response
        setVotes(prev => ({
          ...prev,
          [reviewId]: data.vote_type,
        }));

        // Clear rollback cache on success
        rollbackCache.current.delete(reviewId);

        if (onVoteSuccess) {
          onVoteSuccess(reviewId, data.vote_type);
        }

      } catch (error) {
        console.error('Error casting vote:', error);
        
        // Rollback on error
        rollbackVote(reviewId);
        
        toast.error('Failed to cast vote. Please try again.');
        
        if (onVoteError) {
          onVoteError(error instanceof Error ? error : new Error('Failed to cast vote'));
        }
      } finally {
        pendingOperations.current.delete(reviewId);
      }
    },
    [votes, voteCounts, updateVoteCountsOptimistically, rollbackVote, onVoteSuccess, onVoteError]
  );

  /**
   * Remove a vote
   */
  const removeVote = useCallback(
    async (reviewId: string) => {
      if (pendingOperations.current.has(reviewId)) {
        return;
      }

      pendingOperations.current.add(reviewId);

      try {
        const oldVote = votes[reviewId] || null;
        const oldCounts = voteCounts[reviewId] || { helpful: 0, unhelpful: 0 };

        // Save state for rollback
        rollbackCache.current.set(reviewId, {
          vote: oldVote,
          counts: oldCounts,
        });

        // Optimistic update
        setVotes(prev => ({
          ...prev,
          [reviewId]: null,
        }));
        updateVoteCountsOptimistically(reviewId, oldVote, null);

        // API call
        const response = await fetch('/api/ratings/vote', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_id: reviewId }),
        });

        if (!response.ok) {
          throw new Error('Failed to remove vote');
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to remove vote');
        }

        // Clear rollback cache
        rollbackCache.current.delete(reviewId);

        if (onVoteSuccess) {
          onVoteSuccess(reviewId, null);
        }

      } catch (error) {
        console.error('Error removing vote:', error);
        
        // Rollback
        rollbackVote(reviewId);
        
        toast.error('Failed to remove vote. Please try again.');
        
        if (onVoteError) {
          onVoteError(error instanceof Error ? error : new Error('Failed to remove vote'));
        }
      } finally {
        pendingOperations.current.delete(reviewId);
      }
    },
    [votes, voteCounts, updateVoteCountsOptimistically, rollbackVote, onVoteSuccess, onVoteError]
  );

  /**
   * Toggle vote - if same type, remove; otherwise update
   */
  const toggleVote = useCallback(
    async (reviewId: string, voteType: 'helpful' | 'unhelpful') => {
      const currentVote = votes[reviewId];
      
      if (currentVote === voteType) {
        // Same vote - remove it
        await removeVote(reviewId);
      } else {
        // Different vote or no vote - cast it
        await castVote(reviewId, voteType);
      }
    },
    [votes, castVote, removeVote]
  );

  /**
   * Get user's vote for a specific review
   */
  const getUserVote = useCallback(
    (reviewId: string): VoteType => {
      return votes[reviewId] || null;
    },
    [votes]
  );

  /**
   * Manually refresh votes
   */
  const refreshVotes = useCallback(
    async (ids?: string[]) => {
      const idsToFetch = ids || reviewIds;
      if (idsToFetch.length > 0) {
        await fetchUserVotes(idsToFetch);
      }
    },
    [reviewIds, fetchUserVotes]
  );

  return {
    votes,
    voteCounts,
    isLoading,
    castVote,
    removeVote,
    toggleVote,
    getUserVote,
    refreshVotes,
  };
}