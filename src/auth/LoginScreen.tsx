import React, { FormEvent, useState } from 'react';
import { getShopLoginConfig, supabase } from '../lib/supabase';

type LoginScreenProps = {
  onSignedIn: () => void;
};

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function resolveLoginEmail(loginName: string) {
    const trimmed = loginName.trim();
    if (!trimmed) throw new Error('Enter your username.');

    const config = getShopLoginConfig();
    const expectedUsername = String(config.username || 'Gadgetboyz').trim();
    const loginEmail = String(config.email || '').trim();
    if (expectedUsername && trimmed.toLowerCase() === expectedUsername.toLowerCase()) {
      if (!loginEmail) throw new Error('Shop login email is not configured.');
      return loginEmail;
    }
    throw new Error('Invalid username or PIN.');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const email = await resolveLoginEmail(username);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pin,
      });

      if (error) {
        setErrorMessage('Invalid username or PIN.');
        setLoading(false);
        return;
      }

      onSignedIn();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Invalid username or PIN.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <h1 className="text-2xl font-semibold">GadgetBoy POS</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to access shop data.</p>

        <label className="mt-6 block text-sm font-medium text-slate-200">
          Username
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="Gadgetboyz"
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-200">
          PIN
          <input
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            autoComplete="current-password"
            inputMode="numeric"
            required
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
          />
        </label>

        {errorMessage ? (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
