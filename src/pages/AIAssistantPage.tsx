import React, { useState, useEffect, useRef } from 'react'
import Avatar from '../components/Avatar'
import { useAuth } from '../contexts/AuthContext'
import { formatMessageTime } from '../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const MOCK_ANSWERS: Record<string, string> = {
  fee: "WorldFirst typically charges no monthly fees. Transfer fees are based on currency pair and amount. For exact fees, visit your account dashboard.",
  rate: "Exchange rates are updated in real-time and are highly competitive. Lock in a rate using our forward contracts feature.",
  transfer: "Transfers are usually processed within 1-2 business days, with many same-day options for major currencies.",
  account: "To open a WorldFirst account, you need to provide business registration documents and ID verification. The process takes 1-3 business days.",
  limit: "Transfer limits vary by account type and verification level. Standard accounts can send up to $250,000 per transfer.",
}

function getMockAnswer(query: string): string {
  const q = query.toLowerCase()
  for (const [key, answer] of Object.entries(MOCK_ANSWERS)) {
    if (q.includes(key)) return answer
  }
  return "I can help with WorldFirst payment questions about fees, exchange rates, transfers, account setup, and more. What would you like to know?"
}

export default function AIAssistantPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm the WorldFirst AI Assistant. I can help you with international transfers, exchange rates, fees, and account management. What can I help you with today?",
      timestamp: new Date(),
    }
  ])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!text.trim() || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setText('')
    setLoading(true)

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY

    if (!apiKey) {
      // Mock fallback
      await new Promise(r => setTimeout(r, 1500))
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getMockAnswer(userMsg.content),
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, reply])
      setLoading(false)
      return
    }

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }))

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: "You are a helpful AI assistant for WorldFirst, an international payments platform by Ant International. Help merchants with: international transfers, exchange rates, fees, account management, compliance, and payment solutions. Be concise, friendly, and professional. If asked about something outside WorldFirst's scope, politely redirect.",
            },
            ...history,
          ],
        }),
      })

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content ?? 'Sorry, I could not process your request.'

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again shortly.",
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const QUICK_TOPICS = ['What are the transfer fees?', 'How do exchange rates work?', 'How long do transfers take?', 'How to open an account?']

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-border">
        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h1 className="font-semibold text-foreground">AI Assistant</h1>
          <p className="text-xs text-muted-foreground">Powered by WorldFirst</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-2 flex-shrink-0 self-end">
                <span className="text-sm">🤖</span>
              </div>
            )}
            <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-xs lg:max-w-lg`}>
              <div className={msg.role === 'user' ? 'bubble-self' : 'bubble-other whitespace-pre-wrap'}>
                {msg.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {formatMessageTime(msg.timestamp)}
              </span>
            </div>
            {msg.role === 'user' && (
              <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="ml-2 flex-shrink-0 self-end" />
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-2 flex-shrink-0 self-end">
              <span className="text-sm">🤖</span>
            </div>
            <div className="bubble-other">
              <div className="flex gap-1 py-1">
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick topics */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {QUICK_TOPICS.map(topic => (
            <button
              key={topic}
              onClick={() => { setText(topic); }}
              className="text-xs px-3 py-1.5 rounded-full border border-primary/30 text-primary hover:bg-primary/5 transition"
            >
              {topic}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 bg-white border-t border-border">
        <div className="flex items-end gap-2">
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="sm" className="flex-shrink-0 mb-1" />
          <div className="flex-1 flex items-end gap-2 bg-surface rounded-xl border border-border px-3 py-2">
            <textarea
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about WorldFirst…"
              className="flex-1 resize-none bg-transparent text-sm outline-none max-h-32"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button onClick={sendMessage} disabled={!text.trim() || loading} className="btn-primary px-3 py-2 mb-1">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
