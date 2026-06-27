import React, { useEffect, useRef, useState } from 'react';

interface SmsMessage {
  id: number;
  customerId: number;
  to: string;
  body: string;
  sentAt: string;
  direction: 'out' | 'in';
  twilioSid?: string | null;
}

interface Props {
  customerId: number;
  customerName: string;
  customerPhone: string;
  onClose: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    ) {
      return 'Today';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const ClientSmsChat: React.FC<Props> = ({ customerId, customerName, customerPhone, onClose }) => {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twilioReady, setTwilioReady] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const api = (window as any).api;

  const loadMessages = async () => {
    try {
      const res = await api.twilioGetMessages(customerId);
      if (res?.ok && Array.isArray(res.messages)) {
        setMessages(res.messages);
      }
    } catch {}
  };

  useEffect(() => {
    loadMessages();
    // Check Twilio config
    (async () => {
      try {
        const cfg = await api.twilioGetConfig();
        setTwilioReady(!!(cfg?.ok && cfg.accountSid && cfg.fromNumber && cfg.hasAuthToken));
      } catch {
        setTwilioReady(false);
      }
    })();
  }, [customerId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = body.trim();
    if (!text || !customerPhone) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.twilioSendSms({ to: customerPhone, body: text });
      if (res?.ok) {
        await api.twilioLogMessage({
          customerId,
          to: customerPhone,
          body: text,
          sentAt: new Date().toISOString(),
          direction: 'out',
          twilioSid: res.sid || null,
        });
        setBody('');
        await loadMessages();
        textareaRef.current?.focus();
      } else {
        setError(res?.error || 'Failed to send message.');
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  // Group messages by date
  let lastDateLabel = '';

  return (
    <div
      className="fixed bottom-4 right-4 z-[300] flex flex-col bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
      style={{ width: 320, maxHeight: 440 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-950 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">💬</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-zinc-100 leading-tight truncate">{customerName}</div>
            <div className="text-[10px] text-zinc-500">{customerPhone || 'No phone on file'}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 text-xs shrink-0 ml-2"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* No phone warning */}
      {!customerPhone && (
        <div className="px-3 py-2 text-xs text-amber-400 bg-amber-900/30 border-b border-zinc-800 shrink-0">
          ⚠️ No phone number on file for this client.
        </div>
      )}

      {/* Twilio not configured warning */}
      {twilioReady === false && (
        <div className="px-3 py-2 text-xs text-amber-400 bg-amber-900/30 border-b border-zinc-800 shrink-0">
          ⚠️ Twilio not configured. Go to Admin → Integrations → SMS to set up.
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 bg-zinc-900"
        style={{ minHeight: 180 }}
      >
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-xs mt-10">No messages yet</div>
        )}
        {messages.map(msg => {
          const dateLabel = formatDate(msg.sentAt);
          const showDate = dateLabel !== lastDateLabel;
          lastDateLabel = dateLabel;
          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="text-center text-[10px] text-zinc-600 py-1.5">{dateLabel}</div>
              )}
              <div className={`flex mb-1 ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] px-3 py-1.5 rounded-2xl text-sm leading-snug ${
                    msg.direction === 'out'
                      ? 'bg-[#39FF14] text-zinc-900 rounded-br-sm'
                      : 'bg-zinc-700 text-zinc-100 rounded-bl-sm'
                  }`}
                >
                  <div style={{ wordBreak: 'break-word' }}>{msg.body}</div>
                  <div
                    className={`text-[9px] mt-0.5 text-right ${
                      msg.direction === 'out' ? 'text-zinc-700' : 'text-zinc-500'
                    }`}
                  >
                    {formatTime(msg.sentAt)}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Send error */}
      {error && (
        <div className="px-3 py-1.5 text-xs text-red-400 bg-red-900/30 border-t border-zinc-800 shrink-0">
          ❌ {error}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-950 shrink-0 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 resize-none focus:outline-none focus:border-[#39FF14] placeholder-zinc-500"
          placeholder="Type a message…"
          rows={2}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!customerPhone}
        />
        <button
          onClick={send}
          disabled={sending || !body.trim() || !customerPhone}
          className="px-3 py-2 bg-[#39FF14] text-zinc-900 font-bold rounded-lg text-sm hover:brightness-110 disabled:opacity-40 shrink-0"
          title="Send (Enter)"
        >
          {sending ? '…' : '→'}
        </button>
      </div>
    </div>
  );
};

export default ClientSmsChat;
