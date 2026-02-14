'use client';

import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { VoteType } from '@/hooks/useVote';

interface VoteButtonProps {
  reviewId: string;
  initialVoteType?: VoteType;
  initialVoteCount?: number;
  onVote?: (reviewId: string, voteType: VoteType) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function VoteButton({
  reviewId,
  initialVoteType = null,
  initialVoteCount = 0,
  onVote,
  size = 'md',
}: VoteButtonProps) {
  const [currentVote, setCurrentVote] = useState<VoteType>(initialVoteType);
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [isLoading, setIsLoading] = useState(false);

  // Update state when props change (important for late-loading vote data)
  useEffect(() => {
    setCurrentVote(initialVoteType);
  }, [initialVoteType]);

  useEffect(() => {
    setVoteCount(initialVoteCount);
  }, [initialVoteCount]);

  // Size variants (Reddit-style vertical layout)
  const sizes = {
    sm: {
      container: 'gap-0',
      icon: 'w-3.5 h-3.5',
      text: 'text-[10px]',
      padding: 'p-0.5',
    },
    md: {
      container: 'gap-1',
      icon: 'w-5 h-5',
      text: 'text-sm',
      padding: 'p-1',
    },
    lg: {
      container: 'gap-1.5',
      icon: 'w-6 h-6',
      text: 'text-base',
      padding: 'p-1.5',
    },
  };

  const handleVote = async (voteType: 'helpful' | 'unhelpful') => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      const oldVote = currentVote;
      const oldCount = voteCount;

      // Optimistic update
      let newVote: VoteType;
      let newCount = voteCount;

      if (currentVote === voteType) {
        // Toggle off - remove vote
        newVote = null;
        if (voteType === 'helpful') newCount--;
        else newCount++;
      } else {
        // Switch vote or add new vote
        newVote = voteType;
        
        // Remove old vote effect
        if (oldVote === 'helpful') newCount--;
        else if (oldVote === 'unhelpful') newCount++;
        
        // Add new vote effect
        if (voteType === 'helpful') newCount++;
        else newCount--;
      }

      setCurrentVote(newVote);
      setVoteCount(newCount);

      // API call
      const response = await fetch('/api/ratings/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, vote_type: voteType }),
      });

      if (!response.ok) {
        throw new Error('Failed to vote');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to vote');
      }

      // Update with server response
      setCurrentVote(data.vote_type);

      // Callback
      if (onVote) {
        onVote(reviewId, data.vote_type);
      }

    } catch (error) {
      console.error('Error voting:', error);
      // Rollback on error
      setCurrentVote(currentVote);
      setVoteCount(voteCount);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className={`
        flex flex-col items-center
        bg-gray-50 dark:bg-gray-800/50 
        rounded-md
        ${sizes[size].container}
        ${isLoading ? 'opacity-50' : ''}
      `}
    >
      {/* Upvote button */}
      <button
        onClick={() => handleVote('helpful')}
        disabled={isLoading}
        className={`
          rounded transition-colors
          ${sizes[size].padding}
          ${
            currentVote === 'helpful'
              ? 'text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950'
              : 'text-gray-400 hover:text-orange-500 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
          ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
        aria-label="Upvote"
      >
        <ChevronUp 
          className={`${sizes[size].icon}`}
          strokeWidth={2.5}
        />
      </button>

      {/* Vote count display */}
      <span
        className={`
          font-bold select-none
          ${sizes[size].text}
          ${
            currentVote === 'helpful' 
              ? 'text-orange-500' 
              : currentVote === 'unhelpful'
              ? 'text-blue-500'
              : voteCount > 0 
              ? 'text-gray-700 dark:text-gray-300' 
              : voteCount < 0
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-500 dark:text-gray-400'
          }
        `}
      >
        {voteCount > 0 && '+'}{voteCount}
      </span>

      {/* Downvote button */}
      <button
        onClick={() => handleVote('unhelpful')}
        disabled={isLoading}
        className={`
          rounded transition-colors
          ${sizes[size].padding}
          ${
            currentVote === 'unhelpful'
              ? 'text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950'
              : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
          ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
        aria-label="Downvote"
      >
        <ChevronDown 
          className={`${sizes[size].icon}`}
          strokeWidth={2.5}
        />
      </button>
    </div>
  );
}