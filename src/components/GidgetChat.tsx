import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeSpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { publicAsset } from '../lib/publicAsset';
import { supabase } from '../lib/supabase';
import { cancelGidgetWork, generateWithGidget, gidgetLocalStatus, resetGidgetModel, setupGidgetModel, subscribeGidgetProgress, type GidgetModelProgress } from '../lib/gidgetLocalEngine';
import GidgetVoiceSphere from './GidgetVoiceSphere';
import './GidgetChat.css';

type Citation = { title: string; url?: string; fileId?: string; kind: 'web' | 'file' };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: boolean;
  source?: 'text' | 'voice';
};
type Conversation = { id: string; title: string; last_message_at: string; created_at: string };
type Props = { open: boolean; onClose: () => void };

const STARTERS = [
  'How many PS5s did we check in this week?',
  'Walk me through a safe no-power diagnostic process.',
  'Show open work orders waiting on parts.',
  'What should I check before probing a motherboard?',
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const POS_CONTEXT_COLLECTIONS = ['workOrders', 'sales', 'calendarEvents', 'products', 'quotes', 'technicians'] as const;
const QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'check', 'checked', 'data', 'did', 'do', 'find', 'for', 'from', 'how', 'i', 'in', 'is',
  'many', 'me', 'month', 'of', 'on', 'order', 'orders', 'our', 'record', 'records', 'show', 'the', 'this', 'ticket',
  'tickets', 'to', 'today', 'we', 'week', 'what', 'when', 'with', 'yesterday',
]);

function compactPosRecord(collection: string, record: any) {
  const base: Record<string, any> = { collection, id: record?.id };
  const fields = [
    'invoice', 'invoiceNumber', 'type', 'status', 'repairStatus', 'partsStatus', 'title', 'name', 'description',
    'deviceType', 'device', 'deviceName', 'category', 'assignedTo', 'technician', 'technicianName', 'customerName',
    'activityAt', 'createdAt', 'updatedAt', 'date', 'start', 'startDate', 'endDate', 'checkoutDate', 'completedAt',
    'consultationType', 'consultationHours', 'task', 'taskCompleted', 'quantity', 'stock', 'cost', 'price', 'total', 'amountPaid',
  ];
  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined && value !== null && value !== '') base[field] = value;
  }
  const lines = Array.isArray(record?.items) ? record.items : Array.isArray(record?.repairs) ? record.repairs : [];
  if (lines.length) {
    base.items = lines.slice(0, 20).map((item: any) => ({
      title: item?.title || item?.name || item?.description || item?.repair || '',
      quantity: item?.quantity,
      status: item?.status,
      partCost: item?.partCost ?? item?.cost,
      charged: item?.charged ?? item?.price ?? item?.total,
    }));
  }
  return base;
}

async function buildReadOnlyPosContext(query: string) {
  if (typeof window.api?.dbGet !== 'function') return { available: false, reason: 'POS data bridge unavailable.' };
  const settled = await Promise.allSettled(POS_CONTEXT_COLLECTIONS.map(collection => window.api.dbGet(collection)));
  const terms = query.toLowerCase().match(/[a-z0-9#-]{2,}/g)
    ?.filter(term => !QUERY_STOP_WORDS.has(term))
    .map(term => term.endsWith('s') && term.length > 3 ? term.slice(0, -1) : term) || [];
  const totals: Record<string, number> = {};
  const periods: Record<string, any> = {};
  const matchedPeriods: Record<string, any> = {};
  const matches: any[] = [];
  const recent: any[] = [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const timestamp = (record: any) => new Date(record.activityAt || record.checkoutDate || record.start || record.date || record.updatedAt || record.createdAt || 0).getTime() || 0;
  const periodCounts = (records: any[]) => records.reduce((counts, record) => {
    const time = timestamp(record);
    if (time >= todayStart) counts.today += 1;
    if (time >= weekStart) counts.thisWeek += 1;
    if (time >= monthStart) counts.thisMonth += 1;
    return counts;
  }, { today: 0, thisWeek: 0, thisMonth: 0 });
  settled.forEach((result, index) => {
    const collection = POS_CONTEXT_COLLECTIONS[index];
    const rows = result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];
    totals[collection] = rows.length;
    const collectionRecords: any[] = [];
    const collectionMatches: any[] = [];
    for (const row of rows) {
      const compact = compactPosRecord(collection, row);
      collectionRecords.push(compact);
      const haystack = JSON.stringify(compact).toLowerCase();
      if (terms.length && terms.every(term => haystack.includes(term))) {
        matches.push(compact);
        collectionMatches.push(compact);
      }
      recent.push(compact);
    }
    periods[collection] = periodCounts(collectionRecords);
    matchedPeriods[collection] = periodCounts(collectionMatches);
  });
  const candidates = (matches.length ? matches : recent).sort((left, right) => timestamp(right) - timestamp(left));
  const selected: any[] = [];
  let contextCharacters = 0;
  for (const record of candidates) {
    const size = JSON.stringify(record).length;
    if (selected.length >= 80 || contextCharacters + size > 12000) break;
    selected.push(record);
    contextCharacters += size;
  }
  return { available: true, generatedAt: new Date().toISOString(), query, totals, periods, matched: matches.length, matchedPeriods, records: selected, recordsTruncated: selected.length < candidates.length };
}

function titleFrom(content: string) {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 58 ? `${clean.slice(0, 57)}...` : clean || 'New conversation';
}

function friendlyError(error: any) {
  const raw = String(error?.message || '')
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
  if (/local model|node-llama|llama/i.test(raw)) return `${raw} Try "Retry model startup" first. Use "Repair local model" only if retrying does not work.`;
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Gidget could not load authenticated shop context. Check the connection and try again.';
  if (/gidget_memories|gidget_conversations|schema cache/i.test(raw)) return 'Gidget history is waiting for its secure database migration. Chat remains available for this session.';
  return raw || 'Gidget could not connect. Check the connection and try again.';
}

export default function GidgetChat({ open, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [shopContext, setShopContext] = useState<{ shopId: string; userId: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Ready');
  const [modelState, setModelState] = useState<(GidgetModelProgress & { ready?: boolean; supported?: boolean })>({ status: 'idle', progress: 0 });
  const [settingUpModel, setSettingUpModel] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const voiceOpenRef = useRef(false);
  const sendRef = useRef<(text: string, source?: 'text' | 'voice') => Promise<void>>(async () => {});
  const abortRef = useRef<AbortController | null>(null);
  const nativeListenerRefs = useRef<PluginListenerHandle[]>([]);
  const nativeVoice = useMemo(() => Capacitor.isNativePlatform(), []);
  const speechSupported = useMemo(() => nativeVoice || (typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)), [nativeVoice]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const unsubscribe = subscribeGidgetProgress((progress) => { if (!cancelled) setModelState((current) => ({ ...current, ...progress, ready: progress.status === 'ready' })); });
    void gidgetLocalStatus().then((status) => { if (!cancelled) setModelState(status); }).catch((error) => {
      if (!cancelled) setModelState({ status: 'error', progress: 0, error: friendlyError(error), supported: false, ready: false });
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [open]);

  const recheckModelStatus = useCallback(async () => {
    setSettingUpModel(true);
    try {
      const status = await gidgetLocalStatus();
      setModelState(status);
    } catch (error: any) {
      setModelState((current) => ({ ...current, status: 'error', error: friendlyError(error), supported: false, ready: false }));
    } finally {
      setSettingUpModel(false);
    }
  }, []);

  const installModel = useCallback(async () => {
    setSettingUpModel(true);
    setModelState((current) => ({ ...current, status: 'downloading', error: undefined }));
    try {
      await setupGidgetModel((progress) => setModelState((current) => ({ ...current, ...progress, ready: progress.status === 'ready' })));
      setModelState((current) => ({ ...current, status: 'ready', progress: 100, ready: true }));
    } catch (error: any) {
      setModelState((current) => ({ ...current, status: 'error', error: friendlyError(error), ready: false }));
    } finally {
      setSettingUpModel(false);
    }
  }, []);

  const repairModel = useCallback(async () => {
    setSettingUpModel(true);
    setModelState((current) => ({ ...current, status: 'downloading', progress: 0, error: undefined, ready: false }));
    try {
      await resetGidgetModel((progress) => setModelState((current) => ({ ...current, ...progress, ready: progress.status === 'ready' })));
      setModelState((current) => ({ ...current, status: 'ready', progress: 100, ready: true, error: undefined }));
    } catch (error: any) {
      setModelState((current) => ({ ...current, status: 'error', error: friendlyError(error), ready: false }));
    } finally {
      setSettingUpModel(false);
    }
  }, []);

  useEffect(() => {
    const localPreview = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      && new URLSearchParams(window.location.search).get('gidgetVoicePreview') === '1';
    if (open && localPreview) {
      voiceOpenRef.current = true;
      setVoiceOpen(true);
      setListening(true);
      setVoiceStatus('Listening');
    }
  }, [open]);

  const refreshHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('gidget_conversations')
      .select('id,title,last_message_at,created_at')
      .order('last_message_at', { ascending: false })
      .limit(1000);
    if (error) return;
    const rows = (data || []) as Conversation[];
    setConversations(rows.slice(0, 30));
    if (rows.length > 30) {
      await supabase.from('gidget_conversations').delete().in('id', rows.slice(30).map((row) => row.id));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;
      const { data: profiles } = await supabase
        .from('staff_profiles')
        .select('shop_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1);
      if (!cancelled && profiles?.[0]?.shop_id) {
        setShopContext({ shopId: profiles[0].shop_id, userId });
        await refreshHistory();
      }
    })();
    return () => { cancelled = true; };
  }, [open, refreshHistory]);

  const persistMessage = useCallback(async (id: string, message: ChatMessage, context = shopContext) => {
    if (!context || message.error) return;
    await supabase.from('gidget_messages').insert({
      conversation_id: id,
      shop_id: context.shopId,
      user_id: context.userId,
      role: message.role,
      source: message.source || 'text',
      content: message.content,
      citations: message.citations || [],
    });
    await supabase.from('gidget_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', id);
  }, [shopContext]);

  const ensureConversation = useCallback(async (firstText: string) => {
    if (conversationId) return conversationId;
    if (!shopContext) return null;
    const { data, error } = await supabase.from('gidget_conversations').insert({
      shop_id: shopContext.shopId,
      user_id: shopContext.userId,
      title: titleFrom(firstText),
    }).select('id').single();
    if (error || !data?.id) return null;
    setConversationId(data.id);
    return data.id as string;
  }, [conversationId, shopContext]);

  const speak = useCallback((content: string) => {
    if (!voiceOpenRef.current) return;
    if (nativeVoice) {
      setSpeaking(true);
      setVoiceStatus('Speaking');
      void TextToSpeech.stop().catch(() => undefined).then(() => TextToSpeech.speak({
        text: content,
        lang: 'en-US',
        rate: 1.02,
        pitch: 1,
        volume: 1,
      })).then(() => {
        if (voiceOpenRef.current) setVoiceStatus('Listening');
      }).catch(() => {
        if (voiceOpenRef.current) setVoiceStatus('Listening');
      }).finally(() => setSpeaking(false));
      return;
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => { setSpeaking(true); setVoiceStatus('Speaking'); };
    utterance.onend = () => { setSpeaking(false); setVoiceStatus('Listening'); };
    utterance.onerror = () => { setSpeaking(false); setVoiceStatus('Listening'); };
    window.speechSynthesis.speak(utterance);
  }, [nativeVoice]);

  const send = useCallback(async (text = draft, source: 'text' | 'voice' = 'text') => {
    const content = text.trim();
    if (!content) return;
    if (sending) {
      abortRef.current?.abort();
      await cancelGidgetWork().catch(() => undefined);
      setSending(false);
    }
    const userMessage: ChatMessage = { id: messageId(), role: 'user', content, source };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    setSending(true);
    setVoiceStatus(source === 'voice' ? 'Thinking' : voiceStatus);
    const activeConversationId = await ensureConversation(content);
    if (activeConversationId) await persistMessage(activeConversationId, userMessage);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!modelState.ready) throw new Error('Finish Gidget\'s one-time local model setup before chatting.');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your shop session expired. Sign in again to use Gidget.');
      const records = await buildReadOnlyPosContext(content);
      const { data: memories } = await supabase.from('gidget_memories')
        .select('content,updated_at')
        .eq('shop_id', shopContext?.shopId || '')
        .eq('user_id', shopContext?.userId || '')
        .order('updated_at', { ascending: false })
        .limit(40);
      const remember = content.match(/^\s*(?:please\s+)?remember(?:\s+that)?\s+(.{2,1000})\s*$/is)?.[1]?.trim();
      let memoryResult: any = { memories: memories || [] };
      if (remember && shopContext) {
        const saved = await supabase.from('gidget_memories').insert({
          shop_id: shopContext.shopId,
          user_id: shopContext.userId,
          content: remember,
          source_conversation_id: activeConversationId,
        }).select('id,content,updated_at').single();
        memoryResult = { ...memoryResult, saved: saved.data || null, saveError: saved.error?.message };
      }
      const context: any = { records, memory_result: memoryResult };
      const body = await generateWithGidget({
        ...context,
        messages: nextMessages.slice(-14).map(({ role, content: bodyContent }) => ({ role, content: bodyContent })),
      });
      if (!body?.ok || !body?.answer) throw new Error(body?.error || 'The local model did not return a usable answer.');
      const assistantMessage: ChatMessage = {
        id: messageId(), role: 'assistant', content: String(body.answer || 'I could not produce an answer.'),
        citations: [], source,
      };
      setMessages((current) => [...current, assistantMessage]);
      if (activeConversationId) await persistMessage(activeConversationId, assistantMessage);
      if (source === 'voice') speak(assistantMessage.content);
      await refreshHistory();
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (/local model|node-llama|llama/i.test(String(error?.message || ''))) {
        void gidgetLocalStatus().then((status) => setModelState(status)).catch(() => undefined);
      }
      const errorMessage: ChatMessage = { id: messageId(), role: 'assistant', content: friendlyError(error), error: true, source };
      setMessages((current) => [...current, errorMessage]);
      if (source === 'voice') speak(errorMessage.content);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
      if (source === 'voice' && !window.speechSynthesis?.speaking) setVoiceStatus('Listening');
    }
  }, [draft, ensureConversation, messages, modelState.ready, persistMessage, refreshHistory, sending, shopContext, speak, voiceStatus]);
  sendRef.current = send;

  const stopVoice = useCallback(() => {
    voiceOpenRef.current = false;
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    if (nativeVoice) {
      void NativeSpeechRecognition.forceStop({ timeout: 800 }).catch(() => NativeSpeechRecognition.stop()).catch(() => undefined);
      void TextToSpeech.stop().catch(() => undefined);
      nativeListenerRefs.current.forEach((listener) => void listener.remove());
      nativeListenerRefs.current = [];
    }
    window.speechSynthesis?.cancel();
    setVoiceOpen(false);
    setListening(false);
    setSpeaking(false);
    setVoiceStatus('Ready');
    void cancelGidgetWork().catch(() => undefined);
  }, [nativeVoice]);

  const startVoice = useCallback(() => {
    setVoiceOpen(true);
    voiceOpenRef.current = true;
    if (!speechSupported) {
      setVoiceStatus('Voice recognition is unavailable on this device');
      return;
    }
    if (nativeVoice) {
      void (async () => {
        try {
          const available = await NativeSpeechRecognition.available();
          if (!available.available) throw new Error('Speech recognition is unavailable.');
          const permission = await NativeSpeechRecognition.checkPermissions();
          if (permission.speechRecognition !== 'granted') {
            const requested = await NativeSpeechRecognition.requestPermissions();
            if (requested.speechRecognition !== 'granted') {
              setVoiceStatus('Microphone permission is required');
              return;
            }
          }
          nativeListenerRefs.current.forEach((listener) => void listener.remove());
          nativeListenerRefs.current = [];
          nativeListenerRefs.current.push(await NativeSpeechRecognition.addListener('listeningState', (event) => {
            const active = event.status === 'started' || event.state === 'started';
            setListening(active);
            if (active) setVoiceStatus('Listening');
          }));
          nativeListenerRefs.current.push(await NativeSpeechRecognition.addListener('segmentResults', (event) => {
            const transcript = String(event.matches?.[0] || '').trim();
            if (!transcript) return;
            void TextToSpeech.stop().catch(() => undefined);
            setSpeaking(false);
            abortRef.current?.abort();
            void cancelGidgetWork().catch(() => undefined);
            void sendRef.current(transcript, 'voice');
          }));
          nativeListenerRefs.current.push(await NativeSpeechRecognition.addListener('error', (event) => {
            if (event.code?.toLowerCase().includes('permission')) setVoiceStatus('Microphone permission is required');
            else setVoiceStatus('Listening paused');
          }));
          await NativeSpeechRecognition.start({
            language: 'en-US',
            maxResults: 1,
            popup: false,
            partialResults: true,
            addPunctuation: true,
            continuousPTT: true,
            allowForSilence: 1200,
            muteRecognizerBeep: true,
          });
          setListening(true);
          setVoiceStatus('Listening');
        } catch (error: any) {
          setListening(false);
          setVoiceStatus(String(error?.message || 'Voice recognition could not start'));
        }
      })();
      return;
    }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setVoiceStatus('Listening'); };
    recognition.onspeechstart = () => {
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
      abortRef.current?.abort();
      void cancelGidgetWork().catch(() => undefined);
      setVoiceStatus('Listening');
    };
    recognition.onresult = (event: any) => {
      const result = event.results?.[event.results.length - 1];
      if (!result?.isFinal) return;
      const transcript = String(result?.[0]?.transcript || '').trim();
      if (transcript) void sendRef.current(transcript, 'voice');
    };
    recognition.onerror = (event: any) => {
      if (event?.error === 'not-allowed') setVoiceStatus('Microphone permission is required');
      else if (event?.error !== 'no-speech') setVoiceStatus('Listening paused');
    };
    recognition.onend = () => {
      setListening(false);
      if (voiceOpenRef.current) {
        window.setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 300);
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setVoiceStatus('Voice recognition could not start'); }
  }, [nativeVoice, speechSupported]);

  const loadConversation = async (conversation: Conversation) => {
    const { data, error } = await supabase.from('gidget_messages')
      .select('id,role,content,citations,source')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    if (error) return;
    stopVoice();
    setConversationId(conversation.id);
    setMessages((data || []) as ChatMessage[]);
    setHistoryOpen(false);
  };

  const newConversation = () => {
    stopVoice();
    setConversationId(null);
    setMessages([]);
    setDraft('');
    setHistoryOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') voiceOpen ? stopVoice() : historyOpen ? setHistoryOpen(false) : onClose();
    };
    window.addEventListener('keydown', onKey);
    if (!voiceOpen && !historyOpen) window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyOpen, onClose, open, stopVoice, voiceOpen]);

  useEffect(() => {
    if (open && (messages.length > 0 || sending)) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, sending]);

  useEffect(() => () => stopVoice(), [stopVoice]);
  if (!open) return null;

  return (
    <div className="gidget-layer" role="presentation">
      <button type="button" className="gidget-scrim" onClick={onClose} aria-label="Close Gidget" />
      <section className="gidget-window" role="dialog" aria-modal="true" aria-labelledby="gidget-title">
        <header className="gidget-header">
          <img src={publicAsset('logo.png')} alt="" />
          <div><h2 id="gidget-title">Gidget</h2><span>Private repair + POS assistant</span></div>
          <span className="gidget-readonly">POS read-only</span>
          <button type="button" className="gidget-history-button" onClick={() => setHistoryOpen(true)} title="Conversation history">History</button>
          <button type="button" className="gidget-close" onClick={onClose} aria-label="Close Gidget">x</button>
        </header>

        {!modelState.ready ? (
          <div className="gidget-model-setup">
            <div className="gidget-model-mark">LOCAL AI</div>
            <h3>Set up Gidget on this device</h3>
            <p>Gidget runs privately inside GadgetBoy POS. The one-time model download is stored on this device and does not require Ollama or a paid AI account.</p>
            <div className="gidget-model-details"><strong>{modelState.model?.name || 'Gidget local model'}</strong><span>{modelState.model?.sizeLabel || 'Device-optimized download'}</span></div>
            {settingUpModel || ['downloading', 'verifying', 'loading'].includes(modelState.status) ? (
              <div className="gidget-model-progress"><div><span style={{ width: `${Math.max(2, modelState.progress || 0)}%` }} /></div><p>{modelState.status === 'verifying' ? 'Verifying download...' : modelState.status === 'loading' ? 'Starting Gidget...' : `Downloading... ${modelState.progress || 0}%`}</p></div>
            ) : null}
            {modelState.error ? <p className="gidget-model-error">{modelState.error}</p> : null}
            {modelState.supported === false ? (
              <>
                <p className="gidget-model-note">Gidget could not detect the local AI bridge for this window. This usually clears up after a retry or a restart of the app.</p>
                <button type="button" className="gidget-model-install" onClick={() => void recheckModelStatus()} disabled={settingUpModel}>Check again</button>
              </>
            ) : (
              <div className="gidget-model-actions">
                <button type="button" className="gidget-model-install" onClick={() => void installModel()} disabled={settingUpModel}>{modelState.status === 'error' ? 'Retry model startup' : 'Download and set up Gidget'}</button>
                {modelState.status === 'error' ? <button type="button" className="gidget-model-repair" onClick={() => void repairModel()} disabled={settingUpModel}>Repair local model</button> : null}
              </div>
            )}
          </div>
        ) : historyOpen ? (
          <div className="gidget-history" aria-label="Gidget conversation history">
            <div className="gidget-history-title"><div><strong>Conversation history</strong><span>Newest 30 chats</span></div><button type="button" onClick={newConversation}>New chat</button></div>
            <div className="gidget-history-list">
              {conversations.length ? conversations.map((conversation) => (
                <button key={conversation.id} type="button" className={conversation.id === conversationId ? 'active' : ''} onClick={() => void loadConversation(conversation)}>
                  <strong>{conversation.title}</strong><span>{new Date(conversation.last_message_at).toLocaleString()}</span>
                </button>
              )) : <p>No saved conversations yet.</p>}
            </div>
            <button type="button" className="gidget-history-back" onClick={() => setHistoryOpen(false)}>Back to chat</button>
          </div>
        ) : voiceOpen ? (
          <div className="gidget-voice-room">
            <GidgetVoiceSphere active={listening || sending} speaking={speaking} />
            <div className="gidget-voice-state"><strong>{voiceStatus}</strong><span>{speechSupported ? 'Speak naturally. Start talking to interrupt Gidget.' : 'Use text chat on this device.'}</span></div>
            <button type="button" onClick={stopVoice}>End voice conversation</button>
          </div>
        ) : (
          <>
            <div className="gidget-messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="gidget-welcome"><strong>What are we working on?</strong><p>Ask about repairs, search live shop activity, or explicitly tell Gidget to remember durable repair knowledge.</p><div className="gidget-starters">{STARTERS.map((starter) => <button key={starter} type="button" onClick={() => void send(starter)}>{starter}</button>)}</div></div>
              ) : null}
              {messages.map((message) => (
                <article key={message.id} className={`gidget-message ${message.role}${message.error ? ' error' : ''}`}><span>{message.role === 'assistant' ? 'Gidget' : 'You'}</span><p>{message.content}</p>{message.citations?.length ? <div className="gidget-citations" aria-label="Sources">{message.citations.map((citation, index) => citation.url ? <a key={`${citation.url}-${index}`} href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a> : <span key={`${citation.fileId}-${index}`}>{citation.title}</span>)}</div> : null}</article>
              ))}
              {sending ? <div className="gidget-thinking"><i /><i /><i /><span>Gidget is checking...</span></div> : null}<div ref={endRef} />
            </div>
            <form className="gidget-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} maxLength={5000} placeholder="Ask Gidget or say 'remember that...'" />
              <button type="button" className="gidget-voice" onClick={startVoice} title="Start continuous voice conversation">Voice</button>
              <button type="submit" className="gidget-send" disabled={sending || !draft.trim()}>Send</button>
            </form>
            <footer>Gidget never writes to POS records. Verify safety-critical board procedures against the exact model and board revision.</footer>
          </>
        )}
      </section>
    </div>
  );
}
