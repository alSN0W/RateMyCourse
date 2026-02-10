'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function SignIn() {
  const { signIn, signInWithGoogle, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({
        text: 'Please enter your email address.',
        type: 'error',
      });
      return;
    }

    try {
      const { error } = await signIn(email);

      if (error) {
        console.error('Sign in error:', error);
        setMessage({
          text: `Failed to send magic link: ${error.message}`,
          type: 'error',
        });
        return;
      }

      setMessage({
        text: 'Magic link sent! Check your email for a login link.',
        type: 'success',
      });
      setEmail('');
    } catch (err) {
      console.error('Unexpected sign in error:', err);
      setMessage({
        text: 'An unexpected error occurred. Please try again.',
        type: 'error',
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">Sign In</h1>

        {/* ✅ FIX: Replaced nested button */}
        <button
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <img src="/google-tile.svg" alt="Google" className="h-5 w-5" />
          Continue with Google
        </button>

        {/* Magic link form (optional) */}
        
        <div className="relative mb-4 text-center text-sm text-gray-500">
          <span className="relative z-10 bg-white px-2">or</span>
          <div className="absolute left-0 top-1/2 w-full -translate-y-1/2 border-t border-gray-300"></div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={isLoading}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-400"
            >
              {isLoading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </div>
        </form>

        {message && (
          <div
            className={`mt-4 rounded-md p-4 text-sm ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}
          >
            {message.text}
          </div>
        )}
        

        <div className="mt-8 border-t border-gray-200 pt-6 text-center text-sm text-gray-600">
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
