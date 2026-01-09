'use client';

import { useState } from 'react';

export default function ReflectionFlowTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState('whatsapp');
  const [participants, setParticipants] = useState('Mohsin, Joel Gonsalves');

  const [conversationId, setConversationId] = useState<string>('');
  const [segmentId, setSegmentId] = useState<string>('');
  const [log, setLog] = useState<any>(null);

  async function upload() {
    if (!file) return alert('Pick a .txt file first');

    const fd = new FormData();
    fd.append('file', file);
    fd.append('platform', platform);
    fd.append('participants', participants);

    const res = await fetch('/api/reflection/conversations/upload', {
      method: 'POST',
      body: fd
    });

    const json = await res.json();
    setLog(json);

    if (!res.ok) {
      alert('Upload failed. See log below.');
      return;
    }

    setConversationId(json.data.id);
    alert('Uploaded. Conversation ID captured.');
  }

  async function segment() {
    if (!conversationId) return alert('Upload first to get conversationId');

    const res = await fetch(`/api/reflection/conversations/${conversationId}/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_window_days: 90, message_cap: 1000 })
    });

    const json = await res.json();
    setLog(json);

    if (!res.ok) {
      alert('Segment failed. See log below.');
      return;
    }

    const first = json?.data?.segments?.[0];
    if (first?.segment_id) setSegmentId(first.segment_id);

    alert('Segmenting complete. Segment ID captured (if returned).');
  }

  async function extract() {
    if (!segmentId) return alert('Run segment first to get segmentId');

    const res = await fetch(`/api/reflection/segments/${segmentId}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4' })
    });

    const json = await res.json();
    setLog(json);

    if (!res.ok) {
      alert('Extract failed. See log below.');
      return;
    }

    alert('Extract complete (stubbed v0). Check log.');
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Reflection Engine v0 — End-to-End Test</h1>

      <div style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Platform:
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="whatsapp">whatsapp</option>
              <option value="linkedin">linkedin</option>
              <option value="email">email</option>
              <option value="other">other</option>
            </select>
          </label>

          <label>
            Participants (comma separated):
            <input
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Upload .txt file:
            <input type="file" accept=".txt" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginLeft: 8 }} />
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={upload} style={{ padding: '8px 12px' }}>1) Upload</button>
            <button onClick={segment} style={{ padding: '8px 12px' }}>2) Segment</button>
            <button onClick={extract} style={{ padding: '8px 12px' }}>3) Extract</button>
          </div>

          <div style={{ fontSize: 13, opacity: 0.8 }}>
            <div><b>conversationId:</b> {conversationId || '—'}</div>
            <div><b>segmentId:</b> {segmentId || '—'}</div>
          </div>
        </div>
      </div>

      <pre style={{ marginTop: 16, padding: 16, background: '#111', color: '#0f0', borderRadius: 8, overflow: 'auto' }}>
        {JSON.stringify(log, null, 2)}
      </pre>
    </div>
  );
}
