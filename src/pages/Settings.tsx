import { useEffect, useState } from 'react';
import { ExternalLink, Key, Save, Sparkles } from 'lucide-react';
import { isValidGeminiApiKey } from '@lib/storage';
import { testGeminiConnection } from '@/features/ai/ragPipeline.service';
import { resetGeminiRateLimit } from '@/features/ai/geminiRateLimit';
import { useSettingsStore } from '@/store/settings.store';

export function SettingsPanel() {
  const { geminiApiKey, chatMode, defaultNoteType, loaded, load, update } = useSettingsStore();
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loaded) setKey(geminiApiKey);
  }, [loaded, geminiApiKey]);

  const save = async () => {
    await update({ geminiApiKey: key.trim() });
    resetGeminiRateLimit();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setTestStatus('idle');
    setTestMessage('');
  };

  const testConnection = async () => {
    const trimmed = key.trim();
    if (!trimmed || !isValidGeminiApiKey(trimmed)) return;
    resetGeminiRateLimit();
    setTestStatus('testing');
    setTestMessage('');
    const result = await testGeminiConnection(trimmed);
    if (result.ok) {
      setTestStatus('ok');
      setTestMessage('Gemini connected — try Chat (one feature at a time).');
    } else {
      setTestStatus('fail');
      setTestMessage(result.error ?? 'Connection failed');
    }
  };

  const keyLooksInvalid = key.trim().length > 0 && !isValidGeminiApiKey(key);

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-white">
          <Key className="h-4 w-4 text-indigo-300" />
          <h3 className="text-sm font-semibold">Gemini API Key</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/50">
          Use one AI feature at a time (Chat, Notes, etc.) to avoid rate limits. Free tier has
          daily caps — check{' '}
          <a
            href="https://aistudio.google.com/usage"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-300 hover:text-indigo-200"
          >
            usage
          </a>
          .
        </p>
        {keyLooksInvalid && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            This does not look like a Google AI Studio key. Copy it from the link below.
          </p>
        )}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
        >
          Get a free API key
          <ExternalLink className="h-3 w-3" />
        </a>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza… or AQ.…"
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/40 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-2 rounded-xl bg-indigo-500/25 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500/35"
          >
            <Save className="h-4 w-4" />
            {saved ? 'Saved' : 'Save key'}
          </button>
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={!key.trim() || testStatus === 'testing'}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/8 disabled:opacity-40"
          >
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {testStatus === 'testing' && (
          <p className="mt-2 text-xs text-white/50">Testing Gemini connection…</p>
        )}
        {testStatus === 'ok' && (
          <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {testMessage}
          </p>
        )}
        {testStatus === 'fail' && (
          <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {testMessage}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-300" />
          <h3 className="text-sm font-semibold text-white">Preferences</h3>
        </div>

        <label className="block text-xs text-white/55">
          Default chat mode
          <select
            value={chatMode}
            onChange={(e) => update({ chatMode: e.target.value as typeof chatMode })}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-indigo-400/40 focus:outline-none"
          >
            <option value="concise">Concise</option>
            <option value="deep">Deep</option>
            <option value="interview">Interview</option>
          </select>
        </label>

        <label className="block text-xs text-white/55">
          Default note type
          <select
            value={defaultNoteType}
            onChange={(e) => update({ defaultNoteType: e.target.value as typeof defaultNoteType })}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-indigo-400/40 focus:outline-none"
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
            <option value="interview">Interview</option>
            <option value="revision">Revision</option>
          </select>
        </label>
      </section>
    </div>
  );
}
