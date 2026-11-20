/**
 * src/pages/Chat.jsx
 * ──────────────────
 * Business Intelligence AI Advisor Chat Interface (Module 13.5).
 *
 * Capabilities:
 *  - ChatGPT-style conversation view with chronological message history.
 *  - Full markdown formatting (bolding, bullet points, numbers, clean line breaks).
 *  - Responsive across desktop, tablet, and mobile displays.
 *  - Grounded in live PostgreSQL analytics & verified intelligence reports.
 *  - Quick prompt recommendations & follow-ups.
 *  - Typing animation indicator while agent computes data tools.
 */

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  sendChatMessageApi,
  getChatHistoryApi,
  clearChatHistoryApi,
} from '@/api/chat';
import { getAnalysisHistoryApi } from '@/api/analysis';

const SUGGESTED_QUESTIONS = [
  'What were the primary drivers of the gross margin dip in Q3?',
  'Which product categories exhibited the highest return rates and why?',
  'How do our repeat purchase rates compare between Champions and At-Risk customer tiers?',
  'What are our top 3 stockout risk areas, and what reorder adjustments are recommended?',
  'Explain our operating cost-to-revenue ratio and major expense categories.',
];

/**
 * Lightweight inline markdown renderer for ChatGPT-like formatting.
 */
function renderInlineStyles(str) {
  if (!str) return '';
  const parts = str.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function FormattedMessage({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  return (
    <div className="chat-markdown">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="chat-md-spacer" />;
        }

        // Bullet item
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const content = trimmed.substring(2);
          return (
            <div key={idx} className="chat-md-bullet">
              <span className="chat-bullet-dot">•</span>
              <span>{renderInlineStyles(content)}</span>
            </div>
          );
        }

        // Numbered list item
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="chat-md-bullet">
              <span className="chat-bullet-num">{numMatch[1]}.</span>
              <span>{renderInlineStyles(numMatch[2])}</span>
            </div>
          );
        }

        // Header style
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="chat-md-h4">
              {renderInlineStyles(trimmed.substring(4))}
            </h4>
          );
        }

        return (
          <p key={idx} className="chat-md-p">
            {renderInlineStyles(line)}
          </p>
        );
      })}
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [historyRuns, setHistoryRuns] = useState([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // ── 1. Load Initial History ────────────────────────────────────────────────
  const loadChat = async () => {
    setLoading(true);
    try {
      const [histRes, runsRes] = await Promise.all([
        getChatHistoryApi().catch(() => ({ messages: [] })),
        getAnalysisHistoryApi().catch(() => []),
      ]);
      const fetched = Array.isArray(histRes) ? histRes : (histRes?.messages || []);
      setMessages(fetched);
      setHistoryRuns(runsRes || []);
    } catch {
      toast.error('Failed to load conversation history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChat();
  }, []);

  // ── 2. Auto-scroll on new message ──────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // ── 3. Auto-grow textarea height ───────────────────────────────────────────
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  // ── 4. Send Message ────────────────────────────────────────────────────────
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || sending) return;

    // Optimistically push user message to UI
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSending(true);

    try {
      const result = await sendChatMessageApi({
        message: text,
        analysis_id: selectedAnalysisId || null,
      });

      const userMsg = result?.user_message;
      const assistantMsg = result?.assistant_message;

      // Replace optimistic message and append assistant response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
        const nextList = [...filtered];
        if (userMsg) nextList.push(userMsg);
        else nextList.push(tempUserMsg);
        if (assistantMsg) nextList.push(assistantMsg);
        return nextList;
      });
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Failed to send message to AI advisor.';
      toast.error(msg);
      // Remove failed optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── 5. Clear Conversation History ──────────────────────────────────────────
  const handleClearHistory = async () => {
    const confirmed = window.confirm('Are you sure you want to clear your conversation history?');
    if (!confirmed) return;

    try {
      await clearChatHistoryApi();
      setMessages([]);
      toast.success('Conversation history cleared.');
    } catch {
      toast.error('Failed to clear chat history.');
    }
  };

  return (
    <div className="page-wrapper chat-page">
      {/* ── Top Bar ── */}
      <div className="dashboard-header chat-header">
        <div>
          <h2 className="page-header__title">Grounded Business AI Advisor</h2>
          <p className="page-header__sub">
            Inquire directly with your retail data. The advisor verifies metrics with Pandas tools and refuses to hallucinate.
          </p>
        </div>

        <div className="chat-header-actions">
          {/* Analysis Context Selector */}
          <div className="dataset-selector-box">
            <label htmlFor="chat-context-select" className="dataset-selector-label">
              Context:
            </label>
            <select
              id="chat-context-select"
              className="form-input dataset-select-input"
              value={selectedAnalysisId}
              onChange={(e) => setSelectedAnalysisId(e.target.value)}
              disabled={sending}
            >
              <option value="">Latest Store Intelligence (Default)</option>
              {historyRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  Analysis {r.id.slice(0, 8)} ({new Date(r.started_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleClearHistory}
            disabled={messages.length === 0 || sending}
            title="Clear Chat Logs"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* ── Chat Messages Container ── */}
      <div className="card chat-container-card">
        <div className="chat-messages-scroll">
          {loading ? (
            <div className="loading-card" style={{ height: '350px' }}>
              <div className="spinner spinner--lg" />
              <p className="loading-text">Loading conversation transcript...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-welcome-box">
              <span className="chat-welcome-icon">💬</span>
              <h3 className="chat-welcome-title">Ask Your Retail Intelligence Advisor</h3>
              <p className="chat-welcome-sub">
                Answers are backed directly by Pandas analytics tools and verified report findings.
                Try one of the suggested inquiries below:
              </p>

              <div className="chat-suggestions-grid">
                {SUGGESTED_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="chat-suggestion-card"
                    onClick={() => handleSendMessage(q)}
                  >
                    <span className="chat-suggestion-icon">💡</span>
                    <p className="chat-suggestion-text">{q}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-stream">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user' || msg.sender === 'user';
                const messageText = msg.content || msg.message || '';

                return (
                  <div
                    key={msg.id || index}
                    className={`chat-bubble-row ${isUser ? 'chat-bubble-row--user' : 'chat-bubble-row--assistant'}`}
                  >
                    {!isUser && (
                      <div className="chat-avatar" title="AI Retail Advisor">
                        🤖
                      </div>
                    )}

                    <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'}`}>
                      <div className="chat-bubble__content">
                        {isUser ? (
                          <p className="chat-user-text">{messageText}</p>
                        ) : (
                          <FormattedMessage text={messageText} />
                        )}
                      </div>
                      <span className="chat-bubble__time">
                        {new Date(msg.created_at || Date.now()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {isUser && (
                      <div className="chat-avatar chat-avatar--user" title="You">
                        👤
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Typing Indicator */}
              {sending && (
                <div className="chat-bubble-row chat-bubble-row--assistant">
                  <div className="chat-avatar">🤖</div>
                  <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">
                    <div className="typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="typing-label">Querying database &amp; computing grounded insights...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Suggested Questions Strip (When chat active) ── */}
        {messages.length > 0 && !sending && (
          <div className="chat-quick-strip">
            <span className="chat-quick-label">Suggestions:</span>
            <div className="chat-quick-scroll">
              {SUGGESTED_QUESTIONS.slice(0, 3).map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="chip chip--suggestion"
                  onClick={() => handleSendMessage(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Input Box ── */}
        <div className="chat-input-bar">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            rows={1}
            placeholder="Ask about sales, inventory health, profit margins, anomalies..."
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            type="button"
            className="btn btn--primary btn--send"
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || sending}
            aria-label="Send message"
            title="Send"
          >
            {sending ? <span className="spinner spinner--sm" /> : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}
