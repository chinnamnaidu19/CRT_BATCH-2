import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getConversations, getMessages, sendMessage, markConversationRead } from '../services/flowService.js';
import { useNotifications } from '../context/NotificationContext.jsx';
import useLatest from '../hooks/useLatest.js';

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const latest = useLatest();
  const [convs, setConvs] = useState(null);
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const bottom = useRef(null);
  const lastCount = useRef(0);

  const loadList = useCallback(() => getConversations().then(setConvs).catch(() => {}), []);
  const loadThread = useCallback(async () => {
    if (!id) return;
    try {
      const t = await latest(getMessages(id));
      setThread(t); setError('');
      if (t.messages.some((m) => !m.mine && !m.isRead)) { await markConversationRead(id); loadList(); refresh(); }
    } catch (e) { setError(e.message); setThread(null); }
  }, [id, loadList, refresh]);

  useEffect(() => { loadList(); const t = setInterval(loadList, 10000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => { setThread(null); lastCount.current = 0; loadThread(); const t = setInterval(loadThread, 5000); return () => clearInterval(t); }, [loadThread]);
  useEffect(() => {
    if (thread && thread.messages.length !== lastCount.current) { lastCount.current = thread.messages.length; bottom.current?.scrollIntoView({ block: 'end' }); }
  }, [thread]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    try { await sendMessage(id, body); await loadThread(); loadList(); } catch (err) { setError(err.message); setText(body); }
  };

  return (
    <div className="chat">
      <aside className="chat-list card">
        <h3>Messages</h3>
        {!convs ? <p className="muted">Loading…</p> : convs.length === 0 ? <p className="muted small">No conversations yet. Open a listing and choose “Message seller”.</p> : convs.map((c) => (
          <Link key={c.id} to={`/messages/${c.id}`} className={`conv ${String(c.id) === id ? 'on' : ''}`}>
            <span className="avatar sm">{c.other.profileImage ? <img src={c.other.profileImage} alt="" /> : c.other.fullName[0]}</span>
            <span className="conv-text">
              <strong>{c.other.fullName}</strong>{c.unread > 0 && <span className="count">{c.unread}</span>}
              <small className="muted">{c.itemTitle ? `Re: ${c.itemTitle}` : 'Direct message'}</small>
              <small className="muted trunc">{c.lastMessage || 'No messages yet'}</small>
            </span>
          </Link>
        ))}
      </aside>

      <section className="chat-thread card">
        {!id && <p className="muted center-note">Select a conversation.</p>}
        {id && error && <div className="alert alert-error">{error} <button className="link-btn" onClick={() => navigate('/messages')}>Back</button></div>}
        {id && thread && (
          <>
            <header className="thread-head">
              <Link to={`/users/${thread.conversation.other.id}`}><strong>{thread.conversation.other.fullName}</strong></Link>
              {thread.conversation.item && <Link to={`/items/${thread.conversation.item.id}`} className="muted small"> · {thread.conversation.item.title}</Link>}
            </header>
            <div className="bubbles">
              {thread.messages.length === 0 && <p className="muted center-note">Say hello 👋</p>}
              {thread.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.mine ? 'mine' : ''}`}>
                  <span>{m.body}</span>
                  <small>{new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form className="composer" onSubmit={send}>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Type a message…" aria-label="Message" />
              <button className="btn btn-primary" disabled={!text.trim()}>Send</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
